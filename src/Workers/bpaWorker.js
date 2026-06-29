// ── bpaWorker.js ──────────────────────────────────────────────────────────────
// Web Worker: BPA reconstruction + 3-pass mesh repair
// Runs on a background thread — never blocks the UI

import { reconstruct }  from '../Modules/BallPivoting.js';
import { repair }       from '../Modules/MeshRepair.js';

const cancelRef = { cancelled: false };

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'CANCEL') {
    cancelRef.cancelled = true;
    return;
  }

  if (type !== 'START') return;

  cancelRef.cancelled = false;

  const { points, options = {} } = payload;

  const onProgress = (msg) => {
    self.postMessage({ type: 'PROGRESS', payload: msg });
  };

  try {
    // BPA reconstruction
    onProgress({ stage: 'bpa_start', percentComplete: 1, message: 'Starting Ball-Pivoting Algorithm…' });

    const bpaResult = await reconstruct(points, options, onProgress, cancelRef);

    if (cancelRef.cancelled) {
      self.postMessage({ type: 'PROGRESS', payload: { stage: 'cancelled', percentComplete: 100, message: 'Processing cancelled — partial mesh available', partial: bpaResult } });
      return;
    }

    if (!bpaResult.positions || bpaResult.positions.length === 0) {
      self.postMessage({ type: 'ERROR', payload: { message: 'BPA produced no geometry — check point cloud density' } });
      return;
    }

    // Mesh repair
    onProgress({ stage: 'repair-pass1', percentComplete: 92, message: 'Removing degenerate triangles…' });
    const repaired = repair(bpaResult.positions, bpaResult.indices, options);

    onProgress({ stage: 'complete', percentComplete: 100, message: 'Reconstruction complete' });

    // Transfer buffers (zero-copy)
    const result = {
      positions:   repaired.positions,
      indices:     repaired.indices,
      normals:     repaired.normals,
      repairReport: repaired.report,
      bpaStats:    bpaResult.stats,
    };

    self.postMessage(
      { type: 'COMPLETE', payload: result },
      [result.positions.buffer, result.indices.buffer, result.normals.buffer]
    );

  } catch (err) {
    self.postMessage({ type: 'ERROR', payload: { message: err.message, stack: err.stack } });
  }
};
