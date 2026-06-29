// ── MeshRepair.js ─────────────────────────────────────────────────────────────
// 3-pass mesh repair: degenerate removal → normal correction → hole filling
// Depends on: vectorMath.js, bufferUtils.js

import { centroid, sub, cross, dot, normalize } from '../Dependencies/vectorMath.js';
import { computeNormals, removeDegenerates, compactVertices,
         findBoundaryEdges, buildEdgeMap }                         from '../Dependencies/bufferUtils.js';

// ── Pass 1: Degenerate triangle removal ──────────────────────────────────────

export function removeDegenerate(positions, indices) {
  const { indices: cleanIdx, degeneratesRemoved } = removeDegenerates(positions, indices);
  const { positions: cleanPos, indices: finalIdx, verticesRemoved } = compactVertices(positions, cleanIdx);

  return {
    positions: cleanPos,
    indices:   finalIdx,
    normals:   computeNormals(cleanPos, finalIdx),
    report: { degeneratesRemoved, verticesRemoved },
  };
}

// ── Pass 2: Normal orientation correction ────────────────────────────────────

export function fixNormals(positions, indices) {
  const triCount = indices.length / 3;
  let flipped    = 0;

  // Compute mesh centroid
  const pts = [];
  for (let i = 0; i < positions.length; i += 3) {
    pts.push({ x: positions[i], y: positions[i+1], z: positions[i+2] });
  }
  const meshCentroid = centroid(pts);

  const newIndices = new Uint32Array(indices);

  // Phase 1: centroid-based detection
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3]     * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;

    const pa = { x: positions[ia],   y: positions[ia+1],   z: positions[ia+2] };
    const pb = { x: positions[ib],   y: positions[ib+1],   z: positions[ib+2] };
    const pc = { x: positions[ic],   y: positions[ic+1],   z: positions[ic+2] };

    const faceCenter = {
      x: (pa.x + pb.x + pc.x) / 3,
      y: (pa.y + pb.y + pc.y) / 3,
      z: (pa.z + pb.z + pc.z) / 3,
    };

    const outward  = sub(faceCenter, meshCentroid);
    const faceNorm = cross(sub(pb, pa), sub(pc, pa));

    if (dot(faceNorm, outward) < 0) {
      // Flip winding
      const tmp = newIndices[t * 3 + 1];
      newIndices[t * 3 + 1] = newIndices[t * 3 + 2];
      newIndices[t * 3 + 2] = tmp;
      flipped++;
    }
  }

  // Phase 2: flood-fill consistency check
  const edgeMap      = buildEdgeMap(newIndices);
  const triNormals   = [];

  for (let t = 0; t < triCount; t++) {
    const ia = newIndices[t * 3] * 3;
    const ib = newIndices[t * 3 + 1] * 3;
    const ic = newIndices[t * 3 + 2] * 3;
    const pa = { x: positions[ia], y: positions[ia+1], z: positions[ia+2] };
    const pb = { x: positions[ib], y: positions[ib+1], z: positions[ib+2] };
    const pc = { x: positions[ic], y: positions[ic+1], z: positions[ic+2] };
    triNormals.push(normalize(cross(sub(pb, pa), sub(pc, pa))));
  }

  // Pre-build triangle adjacency list (O(E)) so BFS is O(E+T) not O(E×T)
  const triAdj = Array.from({ length: triCount }, () => []);
  for (const [, edge] of edgeMap) {
    if (edge.tris.length === 2) {
      triAdj[edge.tris[0]].push(edge.tris[1]);
      triAdj[edge.tris[1]].push(edge.tris[0]);
    }
  }

  let consistencyFlips = 0;
  if (triCount === 0) {
    const normals = computeNormals(positions, newIndices);
    return { positions, indices: newIndices, normals, report: { normalsFlipped: flipped, consistencyPassFlips: 0 } };
  }
  const visited = new Set();
  const queue   = [0];
  visited.add(0);

  while (queue.length > 0) {
    const t = queue.shift();
    for (const neighbor of triAdj[t]) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      if (dot(triNormals[t], triNormals[neighbor]) < 0) {
        const tmp = newIndices[neighbor * 3 + 1];
        newIndices[neighbor * 3 + 1] = newIndices[neighbor * 3 + 2];
        newIndices[neighbor * 3 + 2] = tmp;
        triNormals[neighbor] = {
          x: -triNormals[neighbor].x,
          y: -triNormals[neighbor].y,
          z: -triNormals[neighbor].z,
        };
        consistencyFlips++;
      }
      queue.push(neighbor);
    }
  }

  const normals = computeNormals(positions, newIndices);
  return {
    positions,
    indices: newIndices,
    normals,
    report: { normalsFlipped: flipped, consistencyPassFlips: consistencyFlips },
  };
}

// ── Pass 3: Hole filling ──────────────────────────────────────────────────────

export function fillHoles(positions, indices, maxHoleSize = 50) {
  const boundary = findBoundaryEdges(indices);
  if (boundary.length === 0) {
    const normals = computeNormals(positions, indices);
    return {
      positions, indices, normals,
      report: { holesFilled: 0, smallHolesFilled: 0, largeHolesFilled: 0, newVerticesAdded: 0, isWatertight: true },
    };
  }

  // Group boundary edges into loops
  const loops    = groupBoundaryLoops(boundary);
  const posArr   = Array.from(positions);
  const idxArr   = Array.from(indices);
  let smallFilled = 0, largeFilled = 0, newVerts = 0;

  for (const loop of loops) {
    if (loop.length === 0) continue;

    if (loop.length <= 8) {
      // Fan triangulation from centroid
      const loopPts = loop.map(vi => ({
        x: posArr[vi * 3], y: posArr[vi * 3 + 1], z: posArr[vi * 3 + 2]
      }));
      const c = centroid(loopPts);
      const ci = posArr.length / 3;
      posArr.push(c.x, c.y, c.z);
      newVerts++;

      for (let i = 0; i < loop.length; i++) {
        const v0 = loop[i];
        const v1 = loop[(i + 1) % loop.length];
        idxArr.push(v0, v1, ci);
      }
      smallFilled++;
    } else if (loop.length <= maxHoleSize) {
      // Advancing front fill
      let remaining = [...loop];
      let attempts  = 0;
      const maxAttempts = remaining.length * 3;

      while (remaining.length >= 3 && attempts < maxAttempts) {
        attempts++;
        // Find vertex with smallest interior angle
        let bestIdx = 0, bestAngle = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const prev = remaining[(i - 1 + remaining.length) % remaining.length];
          const curr = remaining[i];
          const next = remaining[(i + 1) % remaining.length];

          const pPrev = { x: posArr[prev*3], y: posArr[prev*3+1], z: posArr[prev*3+2] };
          const pCurr = { x: posArr[curr*3], y: posArr[curr*3+1], z: posArr[curr*3+2] };
          const pNext = { x: posArr[next*3], y: posArr[next*3+1], z: posArr[next*3+2] };

          const ba = normalize(sub(pPrev, pCurr));
          const bc = normalize(sub(pNext, pCurr));
          const angle = Math.acos(Math.max(-1, Math.min(1, dot(ba, bc))));

          if (angle < bestAngle) { bestAngle = angle; bestIdx = i; }
        }

        const prev = remaining[(bestIdx - 1 + remaining.length) % remaining.length];
        const curr = remaining[bestIdx];
        const next = remaining[(bestIdx + 1) % remaining.length];

        idxArr.push(prev, curr, next);
        remaining.splice(bestIdx, 1);
      }
      largeFilled++;
    }
  }

  const finalPos = new Float32Array(posArr);
  const finalIdx = new Uint32Array(idxArr);
  const normals  = computeNormals(finalPos, finalIdx);
  const remaining = findBoundaryEdges(finalIdx);

  return {
    positions: finalPos,
    indices:   finalIdx,
    normals,
    report: {
      holesFilled:     smallFilled + largeFilled,
      smallHolesFilled: smallFilled,
      largeHolesFilled: largeFilled,
      newVerticesAdded: newVerts,
      isWatertight:    remaining.length === 0,
    },
  };
}

// Group boundary edges into closed loops
function groupBoundaryLoops(boundaryEdges) {
  const adjMap = new Map();
  for (const edge of boundaryEdges) {
    if (!adjMap.has(edge.v0)) adjMap.set(edge.v0, []);
    if (!adjMap.has(edge.v1)) adjMap.set(edge.v1, []);
    adjMap.get(edge.v0).push(edge.v1);
    adjMap.get(edge.v1).push(edge.v0);
  }

  const visited = new Set();
  const loops   = [];

  for (const [start] of adjMap) {
    if (visited.has(start)) continue;
    const loop    = [];
    let   current = start;
    let   prev    = null;

    while (!visited.has(current)) {
      visited.add(current);
      loop.push(current);
      const neighbors = adjMap.get(current) || [];
      const next      = neighbors.find(n => n !== prev && !visited.has(n));
      if (next === undefined) break;
      prev    = current;
      current = next;
    }

    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}

// ── Full 3-pass repair pipeline ───────────────────────────────────────────────

export function repair(positions, indices, options = {}) {
  const { maxHoleSize = 50 } = options;
  const t0 = performance.now();

  // Pass 1
  const p1Start = performance.now();
  const r1 = removeDegenerate(positions, indices);
  const p1End = performance.now();

  // Pass 2
  const p2Start = performance.now();
  const r2 = fixNormals(r1.positions, r1.indices);
  const p2End = performance.now();

  // Pass 3
  const p3Start = performance.now();
  const r3 = fillHoles(r2.positions, r2.indices, maxHoleSize);
  const p3End = performance.now();

  return {
    positions: r3.positions,
    indices:   r3.indices,
    normals:   r3.normals,
    report: {
      ...r1.report,
      ...r2.report,
      ...r3.report,
      passTimings: {
        pass1Ms: p1End - p1Start,
        pass2Ms: p2End - p2Start,
        pass3Ms: p3End - p3Start,
        totalMs: p3End - t0,
      },
    },
  };
}
