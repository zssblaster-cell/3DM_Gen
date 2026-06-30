// ── ParamNetwork.js ───────────────────────────────────────────────────────────
// TF.js dense mapping layer: 1280 → 256 → 128 → 64 → 11 params
// Strategy 2.5: dual-target loss (positive pull + negative push)
// Depends on: tfUtils.js

import { registerModel, getModelWeights, getActiveModelKey,
         setActiveModelKey, makeVersionKey, serializeWeights,
         deserializeWeights } from '../Dependencies/tfUtils.js';

const NET_TYPE    = 'param-network';
const EMBED_DIM   = 1280; // MobileNet output dimension
const PARAM_COUNT = 11;

let _tf       = null;
let _model    = null;
let _opt      = null;
let _lastLoss = null;
let _version  = 0;

// ── Network architecture ──────────────────────────────────────────────────────

function buildModel(tf, inputDim = EMBED_DIM) {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    units: 256, activation: 'relu', inputShape: [inputDim],
    kernelInitializer: 'glorotUniform',
  }));
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({
    units: 128, activation: 'relu', kernelInitializer: 'glorotUniform',
  }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({
    units: 64, activation: 'relu', kernelInitializer: 'glorotUniform',
  }));
  model.add(tf.layers.dense({
    units: PARAM_COUNT, activation: 'sigmoid',
    biasInitializer: tf.initializers.constant({ value: 0.5 }),
  }));
  return model;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function initNetwork() {
  _tf   = await import('@tensorflow/tfjs');
  _model = buildModel(_tf);
  _opt   = _tf.train.adam(0.001, 0.9, 0.999);

  const activeKey = getActiveModelKey(NET_TYPE);
  if (activeKey) {
    const loaded = await loadVersion(activeKey);
    if (loaded) return;
  }
  console.log('ParamNetwork: initialized with default weights');
}

export async function loadVersion(key) {
  if (!_tf) _tf = await import('@tensorflow/tfjs');
  try {
    const weights = await getModelWeights(key);
    if (!weights) return false;
    if (!_model) _model = buildModel(_tf);
    deserializeWeights(_tf, _model, weights);
    setActiveModelKey(NET_TYPE, key);
    return true;
  } catch (err) {
    console.warn('ParamNetwork: failed to load version', key, err);
    return false;
  }
}

export async function saveVersion(label = null) {
  if (!_model || !_tf) throw new Error('Network not initialized');
  _version++;
  const key     = makeVersionKey(NET_TYPE);
  const weights = await serializeWeights(_model);
  const meta = {
    key, type: NET_TYPE, source: 'trained', savedAt: Date.now(),
    label:   label || `Mapping Layer v${_version}`,
    size:    `${Math.round(JSON.stringify(weights).length / 1024)}KB`,
    notes:   `Version ${_version}`,
    version: _version,
    lastLoss: _lastLoss,
  };
  await registerModel(meta, weights);
  setActiveModelKey(NET_TYPE, key);
  return key;
}

export function resetWeights() {
  if (!_tf) return;
  _model    = buildModel(_tf);
  _opt      = _tf.train.adam(0.001);
  _lastLoss = null;
}

export function getLoss() { return _lastLoss; }

export function getArchitectureSummary() {
  if (!_model) return 'Not initialized';
  return `${EMBED_DIM} → 256 (ReLU, dropout 0.3) → 128 (ReLU, dropout 0.2) → 64 (ReLU) → ${PARAM_COUNT} (Sigmoid)`;
}

// ── Predict ───────────────────────────────────────────────────────────────────

export function predict(embedding) {
  if (!_model || !_tf) throw new Error('Network not initialized');
  let inputTensor, outputTensor;
  try {
    inputTensor  = _tf.tensor2d([Array.from(embedding)], [1, embedding.length]);
    outputTensor = _model.predict(inputTensor);
    return new Float32Array(outputTensor.dataSync());
  } finally {
    inputTensor?.dispose();
    outputTensor?.dispose();
  }
}

// ── Train — Strategy 2.5 dual-target loss ────────────────────────────────────

export async function train(batch, options = {}) {
  if (!_model || !_tf || !_opt) throw new Error('Network not initialized');

  const { epochs = 10, onEpochEnd = null } = options;
  const tf = _tf;

  const validBatch = batch.filter(e => e.features && e.positiveTarget);
  if (validBatch.length === 0) return { lossStart: _lastLoss, lossEnd: _lastLoss, epochs: 0 };

  let lossStart = null, lossEnd = null;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochLoss = 0, count = 0;

    for (const entry of validBatch) {
      // FIX: minimize() with no varList defaults to ALL registered trainable
      // variables (which includes this model's weights). Passing
      // model.trainableWeights directly is wrong — that returns Keras-style
      // LayerVariable wrappers, not raw tf.Variable, and TF.js's internal
      // assert (v instanceof Variable) rejects every element. Verified fix
      // by running the real train() against real @tensorflow/tfjs in Node.
      const lossValue = _opt.minimize(() => tf.tidy(() => {
        const input     = tf.tensor2d([Array.from(entry.features)], [1, entry.features.length]);
        // apply(..., {training: true}) — not predict() — so dropout layers
        // actually activate during the training pass. predict() always runs
        // inference mode and would silently disable both dropout layers.
        const pred      = _model.apply(input, { training: true });
        const posTarget = tf.tensor2d([Array.from(entry.positiveTarget)], [1, PARAM_COUNT]);
        const posLoss   = pred.sub(posTarget).abs().mean().mul(entry.positiveWeight || 0.5);

        let negLoss = tf.scalar(0);
        if (entry.negativeTarget && entry.rating <= 3) {
          const negTarget   = tf.tensor2d([Array.from(entry.negativeTarget)], [1, PARAM_COUNT]);
          const dist        = pred.sub(negTarget).square().mean().add(1e-8);
          negLoss = tf.scalar(1).div(dist).mul(entry.distanceFromDesired || 0.5).mul(0.3);
        }
        return posLoss.add(negLoss);
      }), true);

      if (lossValue) {
        epochLoss += lossValue.dataSync()[0];
        lossValue.dispose();
      }
      count++;
      if (count % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    const avgLoss = count > 0 ? epochLoss / count : 0;
    if (epoch === 0) lossStart = avgLoss;
    lossEnd   = avgLoss;
    _lastLoss = avgLoss;

    onEpochEnd?.({ epoch: epoch + 1, totalEpochs: epochs, loss: avgLoss });
    await new Promise(r => setTimeout(r, 0));
  }

  return { lossStart, lossEnd, epochs, entriesProcessed: validBatch.length };
}
