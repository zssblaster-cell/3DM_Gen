// ── vectorMath.js ─────────────────────────────────────────────────────────────
// Pure vec3 math. All functions take/return plain {x, y, z} objects.
// No external dependencies.

export const add      = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub      = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale    = (v, s) => ({ x: v.x * s,   y: v.y * s,   z: v.z * s   });
export const negate   = (v)    => ({ x: -v.x,       y: -v.y,      z: -v.z      });

export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const lengthSq = (v) => v.x * v.x + v.y * v.y + v.z * v.z;
export const length   = (v) => Math.sqrt(lengthSq(v));

export const normalize = (v) => {
  const l = length(v);
  if (l < 1e-12) return { x: 0, y: 1, z: 0 };
  return scale(v, 1 / l);
};

export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const midpoint = (a, b) => lerp(a, b, 0.5);

export const distanceSq = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

export const distance = (a, b) => Math.sqrt(distanceSq(a, b));

export const centroid = (points) => {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0, z: 0 };
  let sx = 0, sy = 0, sz = 0;
  for (const p of points) { sx += p.x; sy += p.y; sz += p.z; }
  return { x: sx / n, y: sy / n, z: sz / n };
};

export const triangleNormal = (a, b, c) => {
  const ab = sub(b, a);
  const ac = sub(c, a);
  return normalize(cross(ab, ac));
};

export const triangleArea = (a, b, c) => {
  const ab = sub(b, a);
  const ac = sub(c, a);
  return length(cross(ab, ac)) * 0.5;
};

// Angle at vertex b in triangle abc
export const angleAt = (a, b, c) => {
  const ba = normalize(sub(a, b));
  const bc = normalize(sub(c, b));
  return Math.acos(Math.max(-1, Math.min(1, dot(ba, bc))));
};

// Reflect vector v around normal n
export const reflect = (v, n) => sub(v, scale(n, 2 * dot(v, n)));

// Project v onto plane with normal n
export const projectOnPlane = (v, n) => sub(v, scale(n, dot(v, n)));

// Bounding box of points
export const boundingBox = (points) => {
  if (points.length === 0) return { min: { x:0,y:0,z:0 }, max: { x:0,y:0,z:0 } };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
};

export const bbSize = (bb) => sub(bb.max, bb.min);
export const bbCenter = (bb) => midpoint(bb.min, bb.max);
export const bbDiagonal = (bb) => length(bbSize(bb));

// Normalize points to unit cube [0,1]
export const normalizePoints = (points) => {
  const bb = boundingBox(points);
  const size = bbSize(bb);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  return {
    points: points.map(p => ({
      x: (p.x - bb.min.x) / maxDim,
      y: (p.y - bb.min.y) / maxDim,
      z: (p.z - bb.min.z) / maxDim,
      ...(p.nx !== undefined ? { nx: p.nx, ny: p.ny, nz: p.nz } : {}),
    })),
    scale: maxDim,
    offset: bb.min,
    bbox: bb,
  };
};

// Re-apply original scale/offset after normalization
export const denormalizePoints = (points, offset, scale) =>
  points.map(p => ({
    x: p.x * scale + offset.x,
    y: p.y * scale + offset.y,
    z: p.z * scale + offset.z,
  }));
