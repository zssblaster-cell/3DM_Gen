// ── chunkManager.js ───────────────────────────────────────────────────────────
// Spatial partitioning and chunk stitching for million-point cloud processing.
// Depends on: vectorMath.js, bufferUtils.js

import { boundingBox, bbSize } from './vectorMath.js';
import { findBoundaryEdges }   from './bufferUtils.js';

// Determine grid resolution based on point count and available memory
export function estimateChunkGrid(pointCount) {
  const mem = (navigator.deviceMemory || 4) * 1024; // MB estimate
  if (pointCount < 500_000)   return 3; // 3×3×3 = 27 chunks
  if (pointCount < 2_000_000) return 4; // 4×4×4 = 64 chunks
  if (pointCount < 5_000_000) return 5; // 5×5×5 = 125 chunks
  return 6;                              // 6×6×6 = 216 chunks
}

// Partition points into spatial chunks with overlap
export function partitionPoints(points, gridN, overlapFactor = 0.1) {
  const bb   = boundingBox(points);
  const size = bbSize(bb);

  const cx = size.x / gridN;
  const cy = size.y / gridN;
  const cz = size.z / gridN;

  const ox = cx * overlapFactor;
  const oy = cy * overlapFactor;
  const oz = cz * overlapFactor;

  const chunks = [];

  for (let ix = 0; ix < gridN; ix++) {
    for (let iy = 0; iy < gridN; iy++) {
      for (let iz = 0; iz < gridN; iz++) {
        const minX = bb.min.x + ix * cx - ox;
        const minY = bb.min.y + iy * cy - oy;
        const minZ = bb.min.z + iz * cz - oz;
        const maxX = bb.min.x + (ix + 1) * cx + ox;
        const maxY = bb.min.y + (iy + 1) * cy + oy;
        const maxZ = bb.min.z + (iz + 1) * cz + oz;

        chunks.push({
          id: `${ix}-${iy}-${iz}`,
          bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
          points: [],
          mesh: null,
        });
      }
    }
  }

  // Assign points to chunks (a point can belong to multiple due to overlap)
  for (const p of points) {
    for (const chunk of chunks) {
      const { min, max } = chunk.bounds;
      if (p.x >= min.x && p.x <= max.x &&
          p.y >= min.y && p.y <= max.y &&
          p.z >= min.z && p.z <= max.z) {
        chunk.points.push(p);
      }
    }
  }

  // Filter empty chunks
  return chunks.filter(c => c.points.length >= 4);
}

// Merge multiple chunk meshes into one unified mesh
export function mergeChunkMeshes(chunkMeshes) {
  let totalVerts = 0;
  const allPos  = [];
  const allIdx  = [];
  const allNorm = [];

  for (const mesh of chunkMeshes) {
    if (!mesh || !mesh.positions || !mesh.indices) continue;

    const offset = totalVerts;
    const vCount = mesh.positions.length / 3;

    for (let i = 0; i < mesh.positions.length; i++) allPos.push(mesh.positions[i]);
    for (let i = 0; i < mesh.indices.length;   i++) allIdx.push(mesh.indices[i] + offset);
    for (let i = 0; i < (mesh.normals?.length || 0); i++) allNorm.push(mesh.normals[i]);

    totalVerts += vCount;
  }

  return {
    positions: new Float32Array(allPos),
    indices:   new Uint32Array(allIdx),
    normals:   allNorm.length > 0 ? new Float32Array(allNorm) : null,
  };
}

// Stitch boundary edges across chunk seams
// Matches boundary edges from adjacent chunks by vertex proximity
export function stitchChunkBoundaries(mergedPositions, mergedIndices, tolerance = 0.001) {
  const boundary = findBoundaryEdges(mergedIndices);
  const newTriangles = [];

  // Group boundary vertices
  const boundaryVerts = new Set();
  for (const edge of boundary) {
    boundaryVerts.add(edge.v0);
    boundaryVerts.add(edge.v1);
  }

  // Find pairs of boundary vertices that are very close (seam vertices)
  const vertArr = Array.from(boundaryVerts);
  const matched = new Map();
  const tol2    = tolerance * tolerance;

  for (let i = 0; i < vertArr.length; i++) {
    for (let j = i + 1; j < vertArr.length; j++) {
      const vi = vertArr[i], vj = vertArr[j];
      const pi = vi * 3, pj = vj * 3;
      const dx = mergedPositions[pi]     - mergedPositions[pj];
      const dy = mergedPositions[pi + 1] - mergedPositions[pj + 1];
      const dz = mergedPositions[pi + 2] - mergedPositions[pj + 2];
      if (dx*dx + dy*dy + dz*dz < tol2) {
        matched.set(vi, vj);
        matched.set(vj, vi);
      }
    }
  }

  // Try to form triangles across matched boundary edges
  for (const edge of boundary) {
    const matchV0 = matched.get(edge.v0);
    const matchV1 = matched.get(edge.v1);
    if (matchV0 !== undefined && matchV1 !== undefined) {
      newTriangles.push(edge.v0, edge.v1, matchV0);
      newTriangles.push(edge.v1, matchV1, matchV0);
    }
  }

  if (newTriangles.length === 0) return { positions: mergedPositions, indices: mergedIndices };

  const combined = new Uint32Array(mergedIndices.length + newTriangles.length);
  combined.set(mergedIndices);
  combined.set(newTriangles, mergedIndices.length);

  return { positions: mergedPositions, indices: combined };
}

// Estimate progress percentage given chunk index and total
export function chunkProgress(chunkIndex, totalChunks, baseStart = 5, baseEnd = 85) {
  const range = baseEnd - baseStart;
  return Math.round(baseStart + (chunkIndex / totalChunks) * range);
}
