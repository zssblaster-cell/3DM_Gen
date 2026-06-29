// ── BallPivoting.js ───────────────────────────────────────────────────────────
// Ball-Pivoting Algorithm for point cloud → mesh reconstruction.
// Supports chunked processing for million-point clouds.
// Depends on: voxelGrid.js, vectorMath.js, bufferUtils.js, chunkManager.js

import { VoxelGrid }          from '../Dependencies/voxelGrid.js';
import { normalizePoints, cross, sub, dot, normalize, length,
         distanceSq, centroid, boundingBox }
                               from '../Dependencies/vectorMath.js';
import { computeNormals }      from '../Dependencies/bufferUtils.js';
import { estimateChunkGrid, partitionPoints,
         mergeChunkMeshes, stitchChunkBoundaries,
         chunkProgress }        from '../Dependencies/chunkManager.js';

// ── Point normal estimation ───────────────────────────────────────────────────

function estimatePointNormals(points, voxelGrid, radius) {
  const normals = [];
  for (const p of points) {
    const neighbors = voxelGrid.getNeighbors(p, radius);
    if (neighbors.length < 3) {
      normals.push({ nx: 0, ny: 1, nz: 0 });
      continue;
    }
    const c  = centroid(neighbors);
    let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
    for (const n of neighbors) {
      const dx = n.x - c.x, dy = n.y - c.y, dz = n.z - c.z;
      cxx += dx*dx; cxy += dx*dy; cxz += dx*dz;
      cyy += dy*dy; cyz += dy*dz; czz += dz*dz;
    }
    let nx = cxy*czz - cxz*cyz;
    let ny = cxz*cxy - cxx*czz;
    let nz = cxx*cyz - cxy*cxy;
    const l = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    normals.push({ nx: nx/l, ny: ny/l, nz: nz/l });
  }
  return normals;
}

// ── Multi-zone radius map ─────────────────────────────────────────────────────

export function buildRadiusMap(points, zoneGridN = 5) {
  const bb = boundingBox(points);
  const sx = (bb.max.x - bb.min.x) / zoneGridN || 1;
  const sy = (bb.max.y - bb.min.y) / zoneGridN || 1;
  const sz = (bb.max.z - bb.min.z) / zoneGridN || 1;

  const zones = new Map();
  let globalSum = 0, globalCount = 0;

  for (let ix = 0; ix < zoneGridN; ix++) {
    for (let iy = 0; iy < zoneGridN; iy++) {
      for (let iz = 0; iz < zoneGridN; iz++) {
        const key  = `${ix},${iy},${iz}`;
        const minX = bb.min.x + ix * sx, minY = bb.min.y + iy * sy, minZ = bb.min.z + iz * sz;

        const zone = points.filter(p =>
          p.x >= minX && p.x < minX + sx &&
          p.y >= minY && p.y < minY + sy &&
          p.z >= minZ && p.z < minZ + sz);
        if (zone.length < 4) continue;

        const sampleSize = Math.min(50, zone.length);
        let sumDist = 0;
        for (let i = 0; i < sampleSize; i++) {
          const p = zone[Math.floor(Math.random() * zone.length)];
          let minD = Infinity;
          for (const q of zone) {
            if (q === p) continue;
            const d = distanceSq(p, q);
            if (d < minD) minD = d;
          }
          sumDist += Math.sqrt(minD);
        }
        const avgDist     = sumDist / sampleSize;
        const localRadius = avgDist * 2.5;
        zones.set(key, { localRadius, pointCount: zone.length, ix, iy, iz });
        globalSum += localRadius; globalCount++;
      }
    }
  }

  const globalFallback = globalCount > 0 ? globalSum / globalCount : 0.05;

  return {
    zones, globalFallback, zoneGridN, bbox: bb,
    getRadius(p) {
      const ix = Math.floor((p.x - bb.min.x) / sx);
      const iy = Math.floor((p.y - bb.min.y) / sy);
      const iz = Math.floor((p.z - bb.min.z) / sz);
      const key = `${Math.max(0,Math.min(zoneGridN-1,ix))},${Math.max(0,Math.min(zoneGridN-1,iy))},${Math.max(0,Math.min(zoneGridN-1,iz))}`;
      return zones.get(key)?.localRadius || globalFallback;
    },
  };
}

export function normalizeCloud(points) { return normalizePoints(points); }

// ── Core BPA — single chunk ───────────────────────────────────────────────────

function bpaSingleChunk(points, radiusMap, onProgress = null) {
  if (points.length < 4) return { positions: new Float32Array(0), indices: new Uint32Array(0), normals: new Float32Array(0) };

  const globalRadius = radiusMap.globalFallback;

  // Build pointsIdx first so grid neighbors always carry .idx
  const pointsIdx = points.map((p, i) => ({ ...p, idx: i }));

  const grid = new VoxelGrid(globalRadius * 2);
  grid.insertAll(pointsIdx); // now cand.idx is always defined

  const normals = estimatePointNormals(points, grid, globalRadius * 3);
  // Attach normals to pointsIdx
  for (let i = 0; i < pointsIdx.length; i++) {
    pointsIdx[i].nx = normals[i].nx;
    pointsIdx[i].ny = normals[i].ny;
    pointsIdx[i].nz = normals[i].nz;
  }

  const posArr   = [];
  const idxArr   = [];

  // vertIdx maps: originalPointIdx → outputVertexIdx
  // revVertIdx maps: outputVertexIdx → originalPointIdx  (for front propagation)
  const vertIdx    = new Map();
  const revVertIdx = new Map();

  const addVert = (pi) => {
    if (vertIdx.has(pi)) return vertIdx.get(pi);
    const p  = points[pi];
    const vi = posArr.length / 3;
    posArr.push(p.x, p.y, p.z);
    vertIdx.set(pi, vi);
    revVertIdx.set(vi, pi);
    return vi;
  };

  const eKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const edgeTris = new Map();

  const addTriangle = (a, b, c) => {
    // a, b, c are original point indices
    if (a === b || a === c || b === c) return;
    const va = addVert(a), vb = addVert(b), vc = addVert(c);
    idxArr.push(va, vb, vc);
    for (const [v0, v1] of [[va,vb],[vb,vc],[vc,va]]) {
      const k = eKey(v0, v1);
      if (!edgeTris.has(k)) edgeTris.set(k, []);
      edgeTris.get(k).push((idxArr.length / 3) - 1);
    }
  };

  // Find seed triangle — start from topmost points
  const sorted = [...pointsIdx].sort((a, b) => b.y - a.y);
  let seeded = false;

  for (const seed of sorted.slice(0, 20)) {
    const r = radiusMap.getRadius(seed);
    const neighbors = grid.getNeighbors(seed, r * 2).filter(n => n.idx !== seed.idx);
    if (neighbors.length < 2) continue;

    for (let i = 0; i < Math.min(neighbors.length - 1, 5); i++) {
      for (let j = i + 1; j < Math.min(neighbors.length, 6); j++) {
        const a = seed.idx, b = neighbors[i].idx, c = neighbors[j].idx;
        if (a === undefined || b === undefined || c === undefined) continue;
        if (a === b || a === c || b === c) continue;

        const pa = points[a], pb = points[b], pc = points[c];
        const n = cross(sub(pb, pa), sub(pc, pa));
        if (length(n) < 1e-10) continue;

        const avgNorm = {
          x: (normals[a].nx + normals[b].nx + normals[c].nx) / 3,
          y: (normals[a].ny + normals[b].ny + normals[c].ny) / 3,
          z: (normals[a].nz + normals[b].nz + normals[c].nz) / 3,
        };
        if (dot(n, avgNorm) < 0) addTriangle(a, c, b);
        else                     addTriangle(a, b, c);
        seeded = true;
        break;
      }
      if (seeded) break;
    }
    if (seeded) break;
  }

  if (!seeded) {
    // Fallback: sequential strip (rough approximation)
    for (let i = 0; i + 2 < Math.min(points.length, 102); i++) {
      addTriangle(i, i+1, i+2);
    }
    const pos = new Float32Array(posArr);
    const idx = new Uint32Array(idxArr);
    return { positions: pos, indices: idx, normals: computeNormals(pos, idx) };
  }

  // Front propagation
  const front = [];
  for (const [k, tris] of edgeTris) {
    if (tris.length === 1) front.push(k);
  }

  let iterations = 0;
  const maxIter  = points.length * 4;

  while (front.length > 0 && iterations < maxIter) {
    iterations++;
    const edgeKey  = front.pop();
    const edgeEntry = edgeTris.get(edgeKey);
    if (!edgeEntry || edgeEntry.length !== 1) continue;

    const [v0Str, v1Str] = edgeKey.split(':');
    const v0 = parseInt(v0Str), v1 = parseInt(v1Str);

    // FIX: use revVertIdx for O(1) lookup instead of O(n) find
    const pi0 = revVertIdx.get(v0);
    const pi1 = revVertIdx.get(v1);
    if (pi0 === undefined || pi1 === undefined) continue;

    const p0   = points[pi0];
    const p1   = points[pi1];
    const midPt = { x: (p0.x+p1.x)/2, y: (p0.y+p1.y)/2, z: (p0.z+p1.z)/2 };

    const r = radiusMap.getRadius(midPt);
    const candidates = grid.getNeighbors(midPt, r * 2.5);

    let bestPi = null, bestScore = -Infinity;

    for (const cand of candidates) {
      const ci = cand.idx;
      if (ci === undefined || ci === pi0 || ci === pi1) continue;

      const pc   = points[ci];
      const triN = cross(sub(p1, p0), sub(pc, p0));
      if (length(triN) < 1e-10) continue;

      const cn = normals[ci];
      if (!cn) continue;
      if (dot(triN, { x: cn.nx, y: cn.ny, z: cn.nz }) < 0) continue;

      const score = dot(normalize(triN), { x: cn.nx, y: cn.ny, z: cn.nz });
      if (score > bestScore) { bestScore = score; bestPi = ci; }
    }

    if (bestPi !== null) {
      addTriangle(pi0, pi1, bestPi);
      const v2 = vertIdx.get(bestPi);
      if (v2 !== undefined) {
        const k0 = eKey(v0, v2), k1 = eKey(v1, v2);
        if (!edgeTris.get(k0) || edgeTris.get(k0).length === 1) front.push(k0);
        if (!edgeTris.get(k1) || edgeTris.get(k1).length === 1) front.push(k1);
      }
    }

    if (iterations % 1000 === 0) onProgress?.({ stage: 'bpa', trianglesFound: idxArr.length / 3 });
  }

  const pos  = new Float32Array(posArr);
  const idx  = new Uint32Array(idxArr);
  return { positions: pos, indices: idx, normals: computeNormals(pos, idx) };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function reconstruct(points, options = {}, onProgress = null, cancelRef = null) {
  onProgress?.({ stage: 'normalizing', percentComplete: 2 });
  const { points: normPts, scale, offset } = normalizeCloud(points);

  const gridN  = estimateChunkGrid(normPts.length);
  const chunks = partitionPoints(normPts, gridN);
  const total  = chunks.length;

  onProgress?.({ stage: 'partitioning', percentComplete: 5, chunksTotal: total });

  const radiusMap = buildRadiusMap(normPts);

  const chunkMeshes = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    if (cancelRef?.cancelled) break;
    const pct = chunkProgress(ci, total);
    onProgress?.({ stage: 'chunk', percentComplete: pct, chunkIndex: ci, chunksTotal: total,
      trianglesFound: chunkMeshes.reduce((s, m) => s + (m?.indices?.length || 0) / 3, 0) });

    const mesh = bpaSingleChunk(chunks[ci].points, radiusMap);
    if (mesh.indices.length > 0) chunkMeshes.push(mesh);
    await new Promise(r => setTimeout(r, 0));
  }

  if (chunkMeshes.length === 0) {
    return { positions: new Float32Array(0), indices: new Uint32Array(0),
             normals: new Float32Array(0), stats: { error: 'No triangles produced' } };
  }

  onProgress?.({ stage: 'merging', percentComplete: 88 });
  const merged = mergeChunkMeshes(chunkMeshes);

  onProgress?.({ stage: 'stitching', percentComplete: 92 });
  const stitched = stitchChunkBoundaries(merged.positions, merged.indices);

  // Denormalize
  const finalPos = new Float32Array(stitched.positions.length);
  for (let i = 0; i < stitched.positions.length; i += 3) {
    finalPos[i]     = stitched.positions[i]     * scale + offset.x;
    finalPos[i + 1] = stitched.positions[i + 1] * scale + offset.y;
    finalPos[i + 2] = stitched.positions[i + 2] * scale + offset.z;
  }

  onProgress?.({ stage: 'normals', percentComplete: 96 });
  const finalNormals = computeNormals(finalPos, stitched.indices);

  return {
    positions: finalPos,
    indices:   stitched.indices,
    normals:   finalNormals,
    stats: { pointsInput: points.length, chunksUsed: chunks.length,
             triangleCount: stitched.indices.length / 3, pivotRadius: radiusMap.globalFallback * scale },
  };
}

export function estimatePivotRadius(points) {
  return buildRadiusMap(points).globalFallback;
}
