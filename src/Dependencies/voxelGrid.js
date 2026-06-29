// ── voxelGrid.js ─────────────────────────────────────────────────────────────
// Spatial hash grid for fast neighbor queries.
// Used by BallPivoting.js and chunkManager.js

export class VoxelGrid {
  constructor(cellSize = 0.05) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.pointCount = 0;
  }

  _key(x, y, z) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }

  _cellCoords(x, y, z) {
    return [
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
      Math.floor(z / this.cellSize),
    ];
  }

  insert(point) {
    const key = this._key(point.x, point.y, point.z);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(point);
    this.pointCount++;
    return key;
  }

  insertAll(points) {
    for (const p of points) this.insert(p);
    return this;
  }

  getCell(x, y, z) {
    return this.cells.get(this._key(x, y, z)) || [];
  }

  // Returns all points within a sphere of given radius around point p
  getNeighbors(p, radius) {
    const r = radius;
    const cs = this.cellSize;
    const span = Math.ceil(r / cs);
    const [cx, cy, cz] = this._cellCoords(p.x, p.y, p.z);
    const result = [];
    const r2 = r * r;

    for (let dx = -span; dx <= span; dx++) {
      for (let dy = -span; dy <= span; dy++) {
        for (let dz = -span; dz <= span; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.cells.get(key);
          if (!cell) continue;
          for (const pt of cell) {
            const ddx = pt.x - p.x;
            const ddy = pt.y - p.y;
            const ddz = pt.z - p.z;
            if (ddx * ddx + ddy * ddy + ddz * ddz <= r2) {
              result.push(pt);
            }
          }
        }
      }
    }
    return result;
  }

  // Returns k nearest neighbors using expanding search
  getKNearest(p, k, maxRadius = Infinity) {
    let radius = this.cellSize;
    let neighbors = [];
    while (neighbors.length < k && radius <= maxRadius) {
      neighbors = this.getNeighbors(p, radius);
      radius *= 2;
    }
    neighbors.sort((a, b) => {
      const da = (a.x - p.x) ** 2 + (a.y - p.y) ** 2 + (a.z - p.z) ** 2;
      const db = (b.x - p.x) ** 2 + (b.y - p.y) ** 2 + (b.z - p.z) ** 2;
      return da - db;
    });
    return neighbors.slice(0, k);
  }

  // Voxel-grid downsampling: one point per cell (centroid)
  static downsample(points, cellSize) {
    const grid = new VoxelGrid(cellSize);
    const map = new Map();

    for (const p of points) {
      const key = grid._key(p.x, p.y, p.z);
      if (!map.has(key)) map.set(key, { sum: { x: 0, y: 0, z: 0 }, count: 0 });
      const entry = map.get(key);
      entry.sum.x += p.x;
      entry.sum.y += p.y;
      entry.sum.z += p.z;
      entry.count++;
    }

    return Array.from(map.values()).map(({ sum, count }) => ({
      x: sum.x / count,
      y: sum.y / count,
      z: sum.z / count,
    }));
  }

  get size() { return this.pointCount; }
}
