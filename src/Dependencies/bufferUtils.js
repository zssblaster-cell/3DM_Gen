// ── bufferUtils.js ────────────────────────────────────────────────────────────
// Typed array helpers for geometry buffers.
// Depends on: vectorMath.js

import { length } from './vectorMath.js';

// Package positions + indices into a standard geometry descriptor
export function buildIndexedBuffer(positionsArr, indicesArr) {
  return {
    positions: new Float32Array(positionsArr),
    indices:   new Uint32Array(indicesArr),
  };
}

// Compute smooth per-vertex normals from indexed geometry
export function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;

    const ax = positions[ia], ay = positions[ia+1], az = positions[ia+2];
    const bx = positions[ib], by = positions[ib+1], bz = positions[ib+2];
    const cx = positions[ic], cy = positions[ic+1], cz = positions[ic+2];

    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = cx - ax, fy = cy - ay, fz = cz - az;

    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;

    for (const j of [ia, ib, ic]) {
      normals[j]     += nx;
      normals[j + 1] += ny;
      normals[j + 2] += nz;
    }
  }

  // Normalize each vertex normal
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.sqrt(normals[i]**2 + normals[i+1]**2 + normals[i+2]**2) || 1;
    normals[i]     /= l;
    normals[i + 1] /= l;
    normals[i + 2] /= l;
  }

  return normals;
}

// Flip all normals (reverse winding for all triangles)
export function flipNormals(normals) {
  const out = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i++) out[i] = -normals[i];
  return out;
}

// Flip winding order of a single triangle
export function flipTriangle(indices, triIndex) {
  const i = triIndex * 3;
  const tmp = indices[i + 1];
  indices[i + 1] = indices[i + 2];
  indices[i + 2] = tmp;
}

// Weld vertices within tolerance — reduces file size, fixes cracks
export function mergeVertices(positions, indices, tolerance = 1e-6) {
  const vertMap = new Map();
  const newPositions = [];
  const newIndices = new Uint32Array(indices.length);
  let newIdx = 0;

  const key = (x, y, z) => {
    const f = 1 / tolerance;
    return `${Math.round(x * f)},${Math.round(y * f)},${Math.round(z * f)}`;
  };

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const k = key(x, y, z);
    if (!vertMap.has(k)) {
      vertMap.set(k, newIdx++);
      newPositions.push(x, y, z);
    }
  }

  for (let i = 0; i < indices.length; i++) {
    const oi = indices[i] * 3;
    const k = key(positions[oi], positions[oi + 1], positions[oi + 2]);
    newIndices[i] = vertMap.get(k);
  }

  return {
    positions: new Float32Array(newPositions),
    indices:   newIndices,
  };
}

// Convert indexed geometry to flat (unindexed) triangle list — required for STL
export function flattenToUnindexed(positions, indices) {
  const flat = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const src = indices[i] * 3;
    const dst = i * 3;
    flat[dst]     = positions[src];
    flat[dst + 1] = positions[src + 1];
    flat[dst + 2] = positions[src + 2];
  }
  return flat;
}

export const countTriangles = (indices) => (indices.length / 3) | 0;

// Remove degenerate triangles (zero area)
export function removeDegenerates(positions, indices, epsilon = 1e-10) {
  const kept = [];
  let removed = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3, ib = indices[i+1] * 3, ic = indices[i+2] * 3;

    const ax = positions[ia], ay = positions[ia+1], az = positions[ia+2];
    const bx = positions[ib], by = positions[ib+1], bz = positions[ib+2];
    const cx = positions[ic], cy = positions[ic+1], cz = positions[ic+2];

    const ex = bx-ax, ey = by-ay, ez = bz-az;
    const fx = cx-ax, fy = cy-ay, fz = cz-az;

    const nx = ey*fz - ez*fy;
    const ny = ez*fx - ex*fz;
    const nz = ex*fy - ey*fx;
    const area = Math.sqrt(nx*nx + ny*ny + nz*nz);

    if (area > epsilon) {
      kept.push(indices[i], indices[i+1], indices[i+2]);
    } else {
      removed++;
    }
  }

  return { indices: new Uint32Array(kept), degeneratesRemoved: removed };
}

// Remove vertices not referenced by any triangle
export function compactVertices(positions, indices) {
  const used = new Set(indices);
  const remap = new Map();
  const newPos = [];
  let ni = 0;

  for (const idx of Array.from(used).sort((a, b) => a - b)) {
    remap.set(idx, ni++);
    newPos.push(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);
  }

  const newIdx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) newIdx[i] = remap.get(indices[i]);

  return {
    positions: new Float32Array(newPos),
    indices: newIdx,
    verticesRemoved: (positions.length / 3) - ni,
  };
}

// Build edge-to-triangle adjacency map
export function buildEdgeMap(indices) {
  const edgeMap = new Map();

  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const triIdx = i / 3;

    for (const [v0, v1] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(v0, v1);
      if (!edgeMap.has(key)) edgeMap.set(key, { v0, v1, tris: [] });
      edgeMap.get(key).tris.push(triIdx);
    }
  }

  return edgeMap;
}

// Find boundary edges (referenced by exactly one triangle)
export function findBoundaryEdges(indices) {
  const edgeMap = buildEdgeMap(indices);
  const boundary = [];
  for (const [, edge] of edgeMap) {
    if (edge.tris.length === 1) boundary.push(edge);
  }
  return boundary;
}
