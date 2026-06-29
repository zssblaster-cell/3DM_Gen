// ── workerBridge.js ───────────────────────────────────────────────────────────
// Single interface for all Web Worker communication.
// UIX components only ever call this file — never interact with workers directly.
// Message protocol: { type: 'START'|'CANCEL', payload } in both directions.

const STL_WORKER_THRESHOLD = 500_000; // triangles above this → use export worker

let _bpaWorker    = null;
let _exportWorker = null;

function createWorker(url) {
  return new Worker(new URL(url, import.meta.url), { type: 'module' });
}

function runWorker(worker, payload, onProgress) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const { type, payload: p } = e.data;
      if (type === 'PROGRESS') { onProgress?.(p); }
      else if (type === 'COMPLETE') { resolve(p); }
      else if (type === 'ERROR')    { reject(new Error(p.message)); }
    };
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage({ type: 'START', payload });
  });
}

// ── BPA + Repair ──────────────────────────────────────────────────────────────

export function startBPA(points, options = {}, onProgress = null) {
  if (_bpaWorker) _bpaWorker.terminate();
  _bpaWorker = createWorker('./bpaWorker.js');
  return runWorker(_bpaWorker, { points, options }, onProgress);
}

export function cancelBPA() {
  if (_bpaWorker) {
    _bpaWorker.postMessage({ type: 'CANCEL' });
    _bpaWorker.terminate();
    _bpaWorker = null;
  }
}

// ── STL Export ────────────────────────────────────────────────────────────────

export async function startExport(positions, indices, normals, options = {}, onProgress = null) {
  const { buildBinarySTL, triggerDownload, makeFilename } = await import('../Modules/STLExporter.js');
  const triCount = (indices.length / 3) | 0;

  if (triCount < STL_WORKER_THRESHOLD) {
    // Small mesh — run on main thread directly
    const buffer   = buildBinarySTL(positions, indices, options.scaleFactor || 1);
    const filename = options.filename || makeFilename(options.label);
    triggerDownload(buffer, filename);
    return { buffer, filename };
  }

  // Large mesh — offload to worker
  if (_exportWorker) _exportWorker.terminate();
  _exportWorker = createWorker('./exportWorker.js');

  const result = await runWorker(
    _exportWorker,
    { positions, indices, normals, scaleFactor: options.scaleFactor || 1 },
    onProgress
  );
  const filename = options.filename || makeFilename(options.label);
  triggerDownload(result.buffer, filename);
  return { buffer: result.buffer, filename };
}

// ── Training (runs on main thread — model is too small to need a worker) ──────
// Training in a worker would require serializing weights back to main thread.
// At 11 output params the model is tiny — main-thread training with yields is fast.

export async function startTraining(batch, options = {}, onProgress = null) {
  const { train } = await import('../Modules/ParamNetwork.js');
  const { epochs = 10 } = options;

  onProgress?.({ stage: 'start', percentComplete: 0, message: 'Starting training…' });

  const result = await train(batch, {
    epochs,
    onEpochEnd: ({ epoch, totalEpochs, loss }) => {
      const pct = Math.round(10 + (epoch / totalEpochs) * 85);
      onProgress?.({ stage: 'training', percentComplete: pct, epoch, totalEpochs, loss,
        message: `Epoch ${epoch} / ${totalEpochs}  —  Loss: ${loss.toFixed(4)}` });
    },
  });

  onProgress?.({ stage: 'complete', percentComplete: 100, message: 'Training complete' });
  return result;
}

// ── Point cloud file parser (main thread) ─────────────────────────────────────

export function parsePointCloudFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text   = e.target.result;
        const header = text.slice(0, 2000);
        const ext    = file.name.split('.').pop().toLowerCase();
        const { parseUnitMetadata } = await import('../Dependencies/imageUtils.js');
        const unitMeta = parseUnitMetadata(header, ext);
        const points   = parsePoints(text, ext);
        resolve({ points, unitMeta, filename: file.name, rawSize: text.length });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsText(file);
  });
}

function parsePoints(text, ext) {
  const points = [];

  if (ext === 'xyz' || ext === 'txt') {
    for (const line of text.split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p.length >= 3) {
        const [x, y, z] = p.map(Number);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) points.push({ x, y, z });
      }
    }
  } else if (ext === 'ply') {
    const lines   = text.split('\n');
    let inHeader  = true;
    let vertCount = 0;
    for (const line of lines) {
      if (inHeader) {
        if (line.startsWith('element vertex')) vertCount = parseInt(line.split(' ')[2]);
        if (line.trim() === 'end_header') { inHeader = false; continue; }
      } else if (points.length < vertCount) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 3) {
          const [x, y, z] = p.map(Number);
          if (!isNaN(x)) points.push({ x, y, z });
        }
      }
    }
  } else if (ext === 'obj') {
    for (const line of text.split('\n')) {
      if (line.startsWith('v ')) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 4) {
          const [, x, y, z] = p.map(Number);
          if (!isNaN(x)) points.push({ x, y, z });
        }
      }
    }
  }

  return points;
}
