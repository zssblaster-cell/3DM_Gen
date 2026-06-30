// ── tfUtils.js ────────────────────────────────────────────────────────────────
// TF.js tensor utilities + IndexedDB model registry with versioning.
// All model versions are kept. User selects active version.

const DB_NAME    = 'vid-model-registry';
const DB_VERSION = 1;
const META_STORE = 'modelMeta';
const DATA_STORE = 'modelData';

// ── IndexedDB setup ───────────────────────────────────────────────────────────
let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

function txGet(store, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  }));
}

function txPut(store, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

function txDelete(store, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

function txGetAll(store) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  }));
}

// ── Model Registry ────────────────────────────────────────────────────────────

export async function registerModel(meta, weightsJSON) {
  await txPut(META_STORE, { ...meta, key: meta.key });
  await txPut(DATA_STORE, { key: meta.key, weights: weightsJSON });
}

export async function listModels(type = null) {
  const all = await txGetAll(META_STORE);
  return type ? all.filter(m => m.type === type) : all;
}

export async function getModelMeta(key) {
  return txGet(META_STORE, key);
}

export async function getModelWeights(key) {
  const rec = await txGet(DATA_STORE, key);
  return rec ? rec.weights : null;
}

export async function deleteModel(key) {
  await txDelete(META_STORE, key);
  await txDelete(DATA_STORE, key);
}

export async function renameModel(key, newLabel) {
  const meta = await getModelMeta(key);
  if (!meta) throw new Error(`Model ${key} not found`);
  await txPut(META_STORE, { ...meta, label: newLabel });
}

export function getModelSize(weightsJSON) {
  const bytes = new TextEncoder().encode(JSON.stringify(weightsJSON)).length;
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Active model keys stored in localStorage
export function getActiveModelKey(type) {
  return localStorage.getItem(`vid-active-${type}`) || null;
}

export function setActiveModelKey(type, key) {
  localStorage.setItem(`vid-active-${type}`, key);
}

// ── TF.js Tensor Utilities ────────────────────────────────────────────────────

export function disposeAll(tensors) {
  if (!tensors) return;
  const arr = Array.isArray(tensors) ? tensors : [tensors];
  for (const t of arr) {
    if (t && typeof t.dispose === 'function' && !t.isDisposed) {
      try { t.dispose(); } catch (_) { /* ignore */ }
    }
  }
}

export function meanAbsoluteError(pred, target) {
  return pred.sub(target).abs().mean();
}

export function clipParamTensor(tf, paramTensor) {
  // Clamp all 11 outputs to [0, 1] (sigmoid already does this but belt-and-suspenders)
  return tf.clipByValue(paramTensor, 0, 1);
}

// Serialize TF.js model weights to a plain JSON object
export async function serializeWeights(model) {
  const weights = model.getWeights();
  const serialized = await Promise.all(
    weights.map(async (w) => ({
      name:  w.name,
      shape: w.shape,
      data:  Array.from(await w.data()),
    }))
  );
  // Do NOT dispose `weights` — these are references to the model's live
  // variable tensors, not copies. Disposing them here breaks the model:
  // every predict()/train() call afterward throws "already disposed" until
  // a fresh loadVersion() overwrites the weights. The model owns these
  // tensors' lifecycle, not this function. Verified via real execution.
  return serialized;
}

// Restore TF.js model weights from serialized JSON
export function deserializeWeights(tf, model, serialized) {
  const tensors = serialized.map(w => tf.tensor(w.data, w.shape));
  model.setWeights(tensors);
  disposeAll(tensors);
}

// Generate a unique version key
export function makeVersionKey(type) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Feedback Entry Store (separate DB) ───────────────────────────────────────
const FB_DB_NAME    = 'vid-feedback';
const FB_DB_VERSION = 1;
const FB_STORE      = 'entries';
const SESSION_STORE = 'sessions';

let _fbDb = null;

export function openFeedbackDB() {
  if (_fbDb) return Promise.resolve(_fbDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FB_DB_NAME, FB_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(FB_STORE)) {
        const s = db.createObjectStore(FB_STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => { _fbDb = e.target.result; resolve(_fbDb); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

export function fbAdd(entry) {
  return openFeedbackDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(FB_STORE, 'readwrite');
    const req = tx.objectStore(FB_STORE).add({ ...entry, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

export function fbGetAll() {
  return openFeedbackDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(FB_STORE, 'readonly').objectStore(FB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  }));
}

export function fbCount() {
  return openFeedbackDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(FB_STORE, 'readonly').objectStore(FB_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

export function fbClear() {
  return openFeedbackDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(FB_STORE, 'readwrite').objectStore(FB_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

export function sessionAdd(session) {
  return openFeedbackDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(SESSION_STORE, 'readwrite');
    const req = tx.objectStore(SESSION_STORE).add({ ...session, timestamp: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

export function sessionGetAll() {
  return openFeedbackDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  }));
}
