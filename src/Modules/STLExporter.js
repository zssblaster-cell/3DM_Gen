// ── STLExporter.js ────────────────────────────────────────────────────────────
// Binary STL serialization + browser download trigger.
// Scale factor applied at export time — geometry unchanged.
// Depends on: bufferUtils.js

import { flattenToUnindexed, computeNormals } from '../Dependencies/bufferUtils.js';

// Binary STL format:
//   [80 bytes] header
//   [4 bytes]  triangle count (uint32 LE)
//   per triangle (50 bytes each):
//     [12 bytes] face normal (3× float32)
//     [12 bytes] vertex 1   (3× float32)
//     [12 bytes] vertex 2   (3× float32)
//     [12 bytes] vertex 3   (3× float32)
//     [2 bytes]  attribute byte count (uint16, always 0)

const HEADER_TEXT = 'VI Dimensions Mesh Engine v1 — viDimensions.com                      ';

export function estimateFileSize(triangleCount) {
  const bytes = 80 + 4 + (50 * triangleCount);
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024**3)       return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024**3).toFixed(2)} GB`;
}

export function computeScaleFactor(positions, indices, realWorldSize, units) {
  // Find bounding box longest dimension in normalized units
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i+1], z = positions[i+2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const meshLongest = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (meshLongest === 0) return 1;

  // Convert real world size to mm
  let sizeInMM = realWorldSize;
  if (units === 'cm') sizeInMM = realWorldSize * 10;
  if (units === 'in') sizeInMM = realWorldSize * 25.4;

  return sizeInMM / meshLongest;
}

export function getExportMetadata(positions, indices, repairReport = null) {
  const triangleCount = (indices.length / 3) | 0;
  return {
    triangleCount,
    vertexCount:   (positions.length / 3) | 0,
    estimatedSize: estimateFileSize(triangleCount),
    isWatertight:  repairReport?.isWatertight ?? null,
  };
}

export function buildBinarySTL(positions, indices, scaleFactor = 1) {
  const triCount  = (indices.length / 3) | 0;
  const flatPos   = flattenToUnindexed(positions, indices);
  const flatNorms = computeNormals(flatPos, new Uint32Array(Array.from({ length: flatPos.length / 3 }, (_, i) => i)));

  const bufferSize = 80 + 4 + (50 * triCount);
  const buffer     = new ArrayBuffer(bufferSize);
  const view       = new DataView(buffer);

  // Header — 80 bytes ASCII
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(HEADER_TEXT.slice(0, 80).padEnd(80, ' '));
  for (let i = 0; i < 80; i++) view.setUint8(i, headerBytes[i] || 0x20);

  // Triangle count
  view.setUint32(80, triCount, true);

  // Per-triangle data
  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const ni = t * 9; // flat normal index (one per vertex, we use tri normal)
    const nx = (flatNorms[ni] + flatNorms[ni+3] + flatNorms[ni+6]) / 3;
    const ny = (flatNorms[ni+1] + flatNorms[ni+4] + flatNorms[ni+7]) / 3;
    const nz = (flatNorms[ni+2] + flatNorms[ni+5] + flatNorms[ni+8]) / 3;

    // Face normal
    view.setFloat32(offset,      nx, true); offset += 4;
    view.setFloat32(offset,      ny, true); offset += 4;
    view.setFloat32(offset,      nz, true); offset += 4;

    // 3 vertices
    for (let v = 0; v < 3; v++) {
      const pi = (t * 3 + v) * 3;
      view.setFloat32(offset, flatPos[pi]     * scaleFactor, true); offset += 4;
      view.setFloat32(offset, flatPos[pi + 1] * scaleFactor, true); offset += 4;
      view.setFloat32(offset, flatPos[pi + 2] * scaleFactor, true); offset += 4;
    }

    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

export function exportSTL(positions, indices, normals, options = {}) {
  const {
    filename    = 'VIDimensions_Model.stl',
    scaleFactor = 1,
    useWorker   = false, // set by workerBridge if triangle count > threshold
  } = options;

  const buffer = buildBinarySTL(positions, indices, scaleFactor);
  triggerDownload(buffer, filename);
}

export function triggerDownload(arrayBuffer, filename) {
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function makeFilename(label) {
  const clean = (label || 'Model').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
  const date  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `VIDimensions_${clean}_${date}.stl`;
}
