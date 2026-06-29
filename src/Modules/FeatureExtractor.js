// ── FeatureExtractor.js ───────────────────────────────────────────────────────
// MobileNet feature extraction with IndexedDB persistent caching.
// Model loads once, stored locally, never re-downloads.
// Depends on: imageUtils.js, tfUtils.js

import { resizeCanvas, loadImageToCanvas, loadDataURLToCanvas } from '../Dependencies/imageUtils.js';
import { registerModel, getModelWeights,
         setActiveModelKey } from '../Dependencies/tfUtils.js';

const MODEL_KEY     = 'mobilenet-v1';
const MODEL_TYPE    = 'feature-extractor';
// View contribution weights
const VIEW_WEIGHTS = [0.40, 0.35, 0.15, 0.10]; // front, side, top, bottom

let _model     = null;
let _tf        = null;
let _ready     = false;
let _loading   = false;
let _onReadyCbs = []; // array so concurrent callers all get resolved

export function isReady() { return _ready; }

// Returns a Promise that resolves when the model is ready
export function whenReady() {
  if (_ready) return Promise.resolve();
  return new Promise((resolve) => { _onReadyCbs.push(resolve); });
}

// Load MobileNet — checks IndexedDB first, falls back to CDN
export async function loadModel(onProgress = null) {
  if (_ready) return;
  if (_loading) return whenReady();
  _loading = true;

  try {
    _tf = await import('@tensorflow/tfjs');

    // Try loading from IndexedDB first
    const saved = await getModelWeights(MODEL_KEY);
    if (saved) {
      onProgress?.({ stage: 'cache', message: 'Loading from local storage…', pct: 20 });
      try {
        _model = await _tf.loadGraphModel(`indexeddb://${MODEL_KEY}`);
        _ready = true;
        _loading = false;
        _onReadyCbs.forEach(r => r()); _onReadyCbs = [];
        return;
      } catch (_) {
        // Cache miss or corrupt — fall through to CDN
      }
    }

    // Download from CDN
    onProgress?.({ stage: 'download', message: 'Downloading vision model (~10MB, once only)…', pct: 10 });
    const mobilenet = await import('@tensorflow-models/mobilenet');
    onProgress?.({ stage: 'download', message: 'Loading model weights…', pct: 40 });

    _model = await mobilenet.load({ version: 2, alpha: 0.5 });
    onProgress?.({ stage: 'cache', message: 'Saving to local storage…', pct: 80 });

    // Save to IndexedDB for future use
    try {
      await _model.model?.save(`indexeddb://${MODEL_KEY}`);
      const meta = {
        key:     MODEL_KEY,
        label:   'MobileNet V2 — Base Feature Extractor',
        type:    MODEL_TYPE,
        source:  'cdn',
        savedAt: Date.now(),
        size:    '~9.8MB',
        notes:   'Initial load — downloaded from TF Hub',
        active:  true,
      };
      await registerModel(meta, { indexeddb: MODEL_KEY });
      setActiveModelKey(MODEL_TYPE, MODEL_KEY);
    } catch (_) {
      // Storage failed — model still works in memory this session
    }

    onProgress?.({ stage: 'ready', message: 'Vision model ready', pct: 100 });
    _ready = true;
    _loading = false;
    _onReadyCbs.forEach(r => r()); _onReadyCbs = [];

  } catch (err) {
    _loading = false;
    throw new Error(`FeatureExtractor: failed to load model — ${err.message}`);
  }
}

// Extract a 1280-dim feature vector from a single canvas
export async function extractFeatures(canvas) {
  if (!_ready || !_model || !_tf) throw new Error('Model not loaded');

  const resized = resizeCanvas(canvas, 224, 224);
  let tensor, embedding;

  try {
    tensor = _tf.browser.fromPixels(resized);
    // MobileNet expects [1, 224, 224, 3] float32 in [-1, 1]
    // Use tidy to clean intermediate tensors (expandDims, toFloat, div)
    const batched = _tf.tidy(() => tensor.expandDims(0).toFloat().div(127.5).sub(1));

    if (_model.infer) {
      // @tensorflow-models/mobilenet API
      embedding = _model.infer(batched, true);
    } else {
      // TF.js SavedModel API
      embedding = _model.predict(batched);
    }

    const data = await embedding.data();
    return new Float32Array(data);
  } finally {
    tensor?.dispose();
    embedding?.dispose();
  }
}

// Extract and fuse features from multiple views
// views: array of up to 4 items — each is { canvas?, dataURL?, file? } or null
export async function extractMultiView(views) {
  if (!_ready) throw new Error('Model not loaded');

  const embeddings = [];
  const weights    = [];
  const viewsUsed  = [];

  for (let i = 0; i < 4; i++) {
    const view = views[i];
    if (!view) continue;

    try {
      let canvas;
      if (view.canvas) {
        canvas = view.canvas;
      } else if (view.dataURL) {
        canvas = await loadDataURLToCanvas(view.dataURL);
      } else if (view.file) {
        canvas = await loadImageToCanvas(view.file);
      } else continue;

      const features = await extractFeatures(canvas);
      embeddings.push(features);
      weights.push(VIEW_WEIGHTS[i]);
      viewsUsed.push(['front','side','top','bottom'][i]);
    } catch (err) {
      console.warn(`FeatureExtractor: view ${i} failed —`, err);
    }
  }

  if (embeddings.length === 0) throw new Error('No views could be processed');

  // Normalize weights to sum to 1
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normWeights = weights.map(w => w / totalWeight);

  // Weighted sum of embeddings
  const dim    = embeddings[0].length;
  const fused  = new Float32Array(dim);
  for (let i = 0; i < embeddings.length; i++) {
    const w = normWeights[i];
    for (let d = 0; d < dim; d++) fused[d] += embeddings[i][d] * w;
  }

  return {
    embedding: fused,
    viewsUsed,
    weights: normWeights,
  };
}

// Fallback silhouette-based feature extraction (when MobileNet is not available)
export async function extractSilhouetteFallback(views) {
  const { extractSilhouette } = await import('../Dependencies/imageUtils.js');

  // Produce a simple 80-dim descriptor from silhouette profiles
  const descriptor = new Float32Array(80);
  let offset = 0;

  for (let i = 0; i < 4; i++) {
    const view = views[i];
    if (!view || offset >= 80) continue;
    try {
      let canvas;
      if (view.file) canvas = await loadImageToCanvas(view.file);
      else if (view.dataURL) canvas = await loadDataURLToCanvas(view.dataURL);
      else continue;

      const profile = extractSilhouette(canvas, 20);
      for (let j = 0; j < Math.min(20, 80 - offset); j++) {
        descriptor[offset + j] = profile[j];
      }
      offset += 20;
    } catch (_) { /* skip */ }
  }

  return { embedding: descriptor, viewsUsed: [], weights: [], isFallback: true };
}
