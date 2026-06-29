// ── TrainingStore.js ──────────────────────────────────────────────────────────
// Manages feedback entries, session log, crash recovery, and version saves.
// All entries written to IndexedDB immediately — survives crashes/power outages.
// Depends on: tfUtils.js, ParamNetwork.js

import { fbAdd, fbGetAll, fbCount, fbClear,
         sessionAdd, sessionGetAll }             from '../Dependencies/tfUtils.js';
import { encodeParams, validateParams,
         applyTagCorrections }                   from '../Modules/GeometryEngine.js';

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_SESSION = 'vid-session';
const LS_PREFS   = 'vid-prefs';
const LS_UI      = 'vid-ui-state';

// ── Session flag (orphan detection) ──────────────────────────────────────────

export function setOrphanedFlag(count) {
  const s = getSessionMeta();
  localStorage.setItem(LS_SESSION, JSON.stringify({
    ...s,
    hasOrphanedEntries: true,
    orphanedEntryCount: count,
    lastEntryWrittenAt: Date.now(),
  }));
}

export function clearOrphanedFlag() {
  const s = getSessionMeta();
  localStorage.setItem(LS_SESSION, JSON.stringify({
    ...s,
    hasOrphanedEntries: false,
    orphanedEntryCount: 0,
  }));
}

export function getSessionMeta() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION) || '{}');
  } catch { return {}; }
}

export async function checkForOrphanedEntries() {
  const count = await fbCount();
  if (count > 0) {
    setOrphanedFlag(count);
    return { hasOrphans: true, count };
  }
  clearOrphanedFlag();
  return { hasOrphans: false, count: 0 };
}

// ── Entry management ──────────────────────────────────────────────────────────

export async function addEntry(entry) {
  const id = await fbAdd(entry);
  const count = await fbCount();
  setOrphanedFlag(count);
  return id;
}

export async function getEntries() {
  return fbGetAll();
}

export async function getEntryCount() {
  return fbCount();
}

export async function clearEntries() {
  await fbClear();
  clearOrphanedFlag();
}

// Returns batch weighted toward low-rated entries so they stay influential
export async function getBatch(size = 32) {
  const all = await fbGetAll();
  if (all.length === 0) return [];
  if (all.length <= size) return all;

  // Weight lower-rated entries more heavily
  const weighted = all.flatMap(e => {
    const w = e.rating <= 2 ? 3 : e.rating <= 3 ? 2 : 1;
    return Array(w).fill(e);
  });

  const shuffled = weighted.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, size);
}

export async function getStats() {
  const entries = await fbGetAll();
  if (entries.length === 0) return { totalRated: 0, averageRating: 0, ratingDistribution: {}, lastTrained: null };

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const e of entries) dist[e.rating] = (dist[e.rating] || 0) + 1;

  const avgRating = entries.reduce((s, e) => s + e.rating, 0) / entries.length;
  const sessions  = await sessionGetAll();
  const lastTrained = sessions.length > 0 ? sessions[sessions.length - 1].timestamp : null;

  return { totalRated: entries.length, averageRating: avgRating, ratingDistribution: dist, lastTrained };
}

// ── Version save (user-triggered only) ───────────────────────────────────────

export async function saveNewVersion(label, paramNetwork) {
  const entries = await fbGetAll();
  if (entries.length === 0) throw new Error('No feedback entries to train on');

  // Final training pass on all entries
  const batch  = await getBatch(entries.length);
  const result = await paramNetwork.train(batch, { epochs: 10 });

  // Save weights as new version
  const versionKey = await paramNetwork.saveVersion(label);

  // Log the session
  const stats = await getStats();
  await sessionAdd({
    versionKey,
    label:            label || `Version — ${new Date().toLocaleDateString()}`,
    entriesTrainedOn: entries.length,
    avgRating:        stats.averageRating,
    lossStart:        result.lossStart,
    lossEnd:          result.lossEnd,
    trainingPasses:   result.epochs,
    completedAt:      Date.now(),
  });

  // Clear entries
  await clearEntries();

  return { versionKey, result, entriesCleared: entries.length };
}

// ── Discard ───────────────────────────────────────────────────────────────────

export async function discardEntries() {
  await clearEntries();
}

// ── Persist / hydrate (UI state + prefs) ─────────────────────────────────────

const _uiTimer = { id: null };

export function getPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LS_PREFS) || '{}');
  } catch { return {}; }
}

export function setPrefs(partial) {
  const current = getPrefs();
  localStorage.setItem(LS_PREFS, JSON.stringify({ ...current, ...partial }));
}

export function resetPrefs() {
  localStorage.removeItem(LS_PREFS);
}

export const DEFAULT_PREFS = {
  autoTrainEnabled:   true,
  autoTrainThreshold: 10,
  defaultUnits:       'mm',
  defaultEpochs:      10,
  wireframeDefault:   false,
  showRepairReport:   true,
  trainingTabDefault: 'queue',
};

export function getUIState() {
  try {
    return JSON.parse(localStorage.getItem(LS_UI) || '{}');
  } catch { return {}; }
}

export function setUIState(partial) {
  clearTimeout(_uiTimer.id);
  _uiTimer.id = setTimeout(() => {
    const current = getUIState();
    localStorage.setItem(LS_UI, JSON.stringify({ ...current, ...partial }));
  }, 300);
}

// ── Build training entry from rating flow output ──────────────────────────────

export function buildEntry({
  label, features, generatedParams, rating,
  positiveTags, negativeTags, distanceFromDesired, viewsUsed,
}) {
  const pWeight = { 5: 1.0, 4: 0.8, 3: 0.5, 2: 0.3, 1: 0.1 }[rating] || 0.5;

  // Positive target
  let posParams = { ...generatedParams };
  if (rating < 5) posParams = applyTagCorrections(posParams, positiveTags, 'positive');
  const positiveTarget = Array.from(encodeParams(validateParams(posParams)));

  // Negative target (only for 1–3 stars)
  let negativeTarget  = null;
  let avoidanceWeights = {};
  if (rating <= 3 && negativeTags.length > 0) {
    negativeTarget = Array.from(encodeParams(validateParams(generatedParams)));

    const tagWeightMap = {
      'neg_wrong_shape':       1.0,
      'neg_completely_wrong':  1.0,
      'neg_blobby':            0.75,
      'neg_rough':             0.75,
      'neg_proportions':       0.75,
      'neg_aspect':            0.75,
      'neg_missing_features':  0.75,
      'neg_smooth':            0.5,
      'neg_texture':           0.5,
      'neg_too_large':         0.5,
      'neg_too_small':         0.5,
      'neg_twist':             0.5,
      'neg_too_many_ridges':   0.25,
      'neg_too_few_ridges':    0.25,
    };

    for (const tag of negativeTags) {
      if (tagWeightMap[tag]) avoidanceWeights[tag] = tagWeightMap[tag];
    }
  }

  return {
    label,
    features:           Array.from(features), // serializable
    generatedParams:    Array.from(encodeParams(validateParams(generatedParams))),
    rating,
    positiveTags,
    positiveTarget,
    positiveWeight:     pWeight,
    negativeTags,
    negativeTarget,
    avoidanceWeights,
    distanceFromDesired: distanceFromDesired || 0,
    viewsUsed:          viewsUsed || [],
    timestamp:          Date.now(),
  };
}

// ── Export training data as JSON ──────────────────────────────────────────────

export async function exportJSON() {
  const entries  = await fbGetAll();
  const sessions = await sessionGetAll();
  return JSON.stringify({ entries, sessions, exportedAt: Date.now() }, null, 2);
}

export function downloadJSON(jsonString, filename = 'vid-training-data.json') {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
