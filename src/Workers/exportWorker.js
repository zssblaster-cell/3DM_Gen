// ── exportWorker.js ───────────────────────────────────────────────────────────
// Web Worker: Binary STL serialization for large meshes (> 500K triangles)

import { buildBinarySTL } from '../Modules/STLExporter.js';

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type !== 'START') return;

  const { positions, indices, normals, scaleFactor = 1 } = payload;

  try {
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'serializing', percentComplete: 10, message: 'Building STL buffer…' } });

    const buffer = buildBinarySTL(positions, indices, scaleFactor);

    self.postMessage({ type: 'PROGRESS', payload: { stage: 'complete', percentComplete: 100, message: 'STL ready for download' } });
    self.postMessage({ type: 'COMPLETE', payload: { buffer } }, [buffer]);

  } catch (err) {
    self.postMessage({ type: 'ERROR', payload: { message: err.message } });
  }
};
