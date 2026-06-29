// ── App.jsx ───────────────────────────────────────────────────────────────────
// Root component. Defines and provides three contexts:
//   ModelContext   — MobileNet + ParamNetwork status, version management
//   SessionContext — active geometry, repair report, point cloud, scale
//   TrainingContext — queue, feedback entries, training status, prefs
// Handles launch sequence: orphan check → model init.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import RouteA      from './RouteA.jsx';
import RouteB      from './RouteB.jsx';
import TrainingTab from './TrainingTab.jsx';
import HelpTab     from './HelpTab.jsx';
import {
  checkForOrphanedEntries,
  getPrefs,
  setPrefs as persistPrefs,
  DEFAULT_PREFS,
} from '../Modules/TrainingStore.js';

// ── Color tokens (shared with components) ─────────────────────────────────────
export const C = {
  coral:       '#D85A30',
  coralLight:  '#FAECE7',
  ink:         '#1a1a1a',
  sand:        '#f7f4ee',
  muted:       '#888',
  border:      '#e2e2e2',
  green:       '#3B6D11',
  greenBg:     '#EAF3DE',
  white:       '#fff',
};

// ── Contexts ──────────────────────────────────────────────────────────────────
export const ModelContext    = createContext(null);
export const SessionContext  = createContext(null);
export const TrainingContext = createContext(null);

export const useModel    = () => useContext(ModelContext);
export const useSession  = () => useContext(SessionContext);
export const useTraining = () => useContext(TrainingContext);

// ── ModelProvider ─────────────────────────────────────────────────────────────
function ModelProvider({ children }) {
  const [feReady,    setFEReady]    = useState(false);
  const [feLoading,  setFELoading]  = useState(false);
  const [feProgress, setFEProgress] = useState(null);
  const [pnReady,    setPNReady]    = useState(false);

  const init = useCallback(async () => {
    // Param network — fast (just JS)
    try {
      const { initNetwork } = await import('../Modules/ParamNetwork.js');
      await initNetwork();
      setPNReady(true);
    } catch (err) { console.warn('ParamNetwork init:', err); }

    // MobileNet — may download ~10MB on first launch
    setFELoading(true);
    try {
      const { loadModel } = await import('../Modules/FeatureExtractor.js');
      await loadModel(p => setFEProgress(p));
      setFEReady(true);
    } catch (err) { console.warn('MobileNet load:', err); }
    setFELoading(false);
  }, []);

  const value = { feReady, feLoading, feProgress, pnReady, init };
  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

// ── SessionProvider ───────────────────────────────────────────────────────────
function SessionProvider({ children }) {
  const [geometry,   setGeometry]   = useState(null); // { positions, indices, normals }
  const [repairReport, setRepairReport] = useState(null);
  const [scaleFactor, setScaleFactor] = useState(null); // mm/unit, locked at calibration
  const [modelLabel,  setModelLabel]  = useState('');
  const [currentParams, setCurrentParams] = useState(null);
  const [features,    setFeatures]    = useState(null);
  const [pointCloud,  setPointCloud]  = useState(null);
  const [unitMeta,    setUnitMeta]    = useState(null); // {units, detected}

  const clearSession = useCallback(() => {
    setGeometry(null);   setRepairReport(null);
    setScaleFactor(null); setCurrentParams(null);
    setFeatures(null);    setPointCloud(null);
    setUnitMeta(null);    setModelLabel('');
  }, []);

  const value = {
    geometry, setGeometry,
    repairReport, setRepairReport,
    scaleFactor, setScaleFactor,
    modelLabel, setModelLabel,
    currentParams, setCurrentParams,
    features, setFeatures,
    pointCloud, setPointCloud,
    unitMeta, setUnitMeta,
    clearSession,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ── TrainingProvider ──────────────────────────────────────────────────────────
function TrainingProvider({ children }) {
  const [queue,          setQueue]       = useState([]);
  const [entryCount,     setEntryCount]  = useState(0);
  const [autoTrain,      setAutoTrain]   = useState(true);
  const [autoThreshold,  setAutoThreshold] = useState(10);
  const [trainStatus,    setTrainStatus] = useState('idle'); // idle | running | done | error
  const [trainProgress,  setTrainProgress] = useState(null);
  const [trainResult,    setTrainResult] = useState(null);
  const [ratingItem,     setRatingItem]  = useState(null); // item open in modal
  const [prefs,          setPrefsState]  = useState({ ...DEFAULT_PREFS, ...getPrefs() });

  const refreshCount = useCallback(async () => {
    const { fbCount } = await import('../Dependencies/tfUtils.js');
    const n = await fbCount().catch(() => 0);
    setEntryCount(n);
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  const addToQueue = useCallback((item) => {
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setQueue(prev => [...prev, { ...item, id, status: 'pending', rating: null, positiveTags: [], negativeTags: [], distanceFromDesired: 0 }]);
  }, []);

  const removeFromQueue = useCallback((id) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  }, []);

  const updateQueueItem = useCallback((id, updates) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  }, []);

  const startManualTraining = useCallback(async (batch, opts = {}) => {
    setTrainStatus('running');
    setTrainProgress(null);
    try {
      const { startTraining } = await import('../Workers/workerBridge.js');
      const result = await startTraining(batch, opts, p => setTrainProgress(p));
      setTrainResult(result);
      setTrainStatus('done');
      return result;
    } catch (err) {
      setTrainStatus('error');
      throw err;
    }
  }, []);

  const setPrefs = useCallback((partial) => {
    setPrefsState(prev => {
      const next = { ...prev, ...partial };
      persistPrefs(next);
      return next;
    });
  }, []);

  const value = {
    queue, addToQueue, removeFromQueue, updateQueueItem,
    entryCount, refreshCount,
    autoTrain, setAutoTrain,
    autoThreshold, setAutoThreshold,
    trainStatus, trainProgress, trainResult, startManualTraining,
    ratingItem, openRatingModal: setRatingItem, closeRatingModal: () => setRatingItem(null),
    prefs, setPrefs,
  };
  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  const model = useModel();
  const train = useTraining();

  const [mainTab,      setMainTab]     = useState('generate');
  const [genSubTab,    setGenSubTab]   = useState('A');
  const [orphanBanner, setOrphanBanner] = useState(null);

  // Launch sequence
  useEffect(() => {
    model.init();

    checkForOrphanedEntries().then(r => {
      if (r.hasOrphans) setOrphanBanner(r.count);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navItems = [
    { id: 'generate', label: 'Generate' },
    { id: 'train',    label: 'Train' },
    { id: 'help',     label: 'Help' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.sand }}>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.5rem', height: 52, background: C.white,
        borderBottom: `1px solid ${C.border}`,
        boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: "'Bebas Neue', 'Impact', sans-serif",
            fontSize: 22, letterSpacing: 2, color: C.coral, lineHeight: 1,
          }}>VI DIMENSIONS</span>
          <span style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 1 }}>Mesh Engine</span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 0 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setMainTab(item.id)} style={{
              padding: '6px 18px', border: 'none', background: 'none',
              fontSize: 13, fontWeight: mainTab === item.id ? 600 : 400,
              color: mainTab === item.id ? C.coral : C.muted,
              cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: mainTab === item.id ? `2px solid ${C.coral}` : '2px solid transparent',
              transition: 'all 0.1s',
            }}>{item.label}</button>
          ))}
        </nav>

        {/* Status indicator */}
        <div style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
            background: model.feReady ? '#3B6D11' : model.feLoading ? '#F5A623' : '#ccc' }} />
          {model.feLoading
            ? (model.feProgress?.message || 'Loading model…')
            : model.feReady
              ? 'Model ready'
              : 'Initializing…'}
          {train.entryCount > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 8px', background: C.coralLight, color: C.coral, borderRadius: 999, fontSize: 10, fontWeight: 600 }}>
              {train.entryCount} entries
            </span>
          )}
        </div>
      </header>

      {/* Orphan recovery banner */}
      {orphanBanner && (
        <div style={{
          background: '#FFF7ED', borderBottom: `1px solid #FCD34D`,
          padding: '8px 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, color: '#92400E', flexShrink: 0,
        }}>
          <span>🔄 <strong>{orphanBanner} feedback {orphanBanner === 1 ? 'entry' : 'entries'}</strong> found from a previous session — still in your database.</span>
          <button onClick={() => setOrphanBanner(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#92400E', fontSize: 16, padding: '0 4px' }}>✕</button>
        </div>
      )}

      {/* Content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {mainTab === 'generate' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Route sub-tabs */}
            <div style={{ display: 'flex', gap: 0, padding: '0 1.5rem', background: C.white, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {[['A', 'From Images'], ['B', 'From Point Cloud']].map(([id, label]) => (
                <button key={id} onClick={() => setGenSubTab(id)} style={{
                  padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: genSubTab === id ? 600 : 400, fontFamily: 'inherit',
                  color: genSubTab === id ? C.coral : C.muted,
                  borderBottom: genSubTab === id ? `2px solid ${C.coral}` : '2px solid transparent',
                }}>Route {id} — {label}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {genSubTab === 'A' ? <RouteA /> : <RouteB />}
            </div>
          </div>
        )}
        {mainTab === 'train' && <TrainingTab />}
        {mainTab === 'help'  && <HelpTab />}
      </main>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ModelProvider>
      <SessionProvider>
        <TrainingProvider>
          <AppShell />
        </TrainingProvider>
      </SessionProvider>
    </ModelProvider>
  );
}
