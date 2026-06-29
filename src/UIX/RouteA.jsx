// ── RouteA.jsx ────────────────────────────────────────────────────────────────
// Route A: 4 image views → MobileNet features → ParamNetwork → mesh → STL
// Front + side are required. Top + bottom are optional (improve accuracy).

import { useState, useRef } from 'react';
import Viewer from './Viewer.jsx';
import { ViewSlot, PrimaryBtn, SecondaryBtn, STLDownloadBtn, StatCard, SectionHeading } from './components/index.jsx';
import { useModel, useSession, useTraining, C } from './App.jsx';

const VIEW_KEYS    = ['front', 'side', 'top', 'bottom'];
const VIEW_LABELS  = { front: 'Front', side: 'Side', top: 'Top', bottom: 'Bottom' };
const VIEW_REQ     = { front: true, side: true, top: false, bottom: false };

export default function RouteA() {
  const model   = useModel();
  const session = useSession();
  const training = useTraining();
  const viewerRef = useRef(null);

  const [views,       setViews]       = useState({ front: null, side: null, top: null, bottom: null });
  const [hint,        setHint]        = useState('');
  const [generating,  setGenerating]  = useState(false);
  const [genError,    setGenError]    = useState('');
  const [showWire,    setShowWire]    = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);

  const canGenerate = model.feReady && model.pnReady && views.front && views.side;

  const setView = (key, val) => {
    setViews(prev => ({ ...prev, [key]: val }));
    // Clear generated result when inputs change
    session.setGeometry(null);
    setAddedToQueue(false);
    setGenError('');
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setGenError('');
    session.setGeometry(null);
    session.setCurrentParams(null);
    session.setFeatures(null);

    try {
      const { extractMultiView } = await import('../Modules/FeatureExtractor.js');
      const { predict }          = await import('../Modules/ParamNetwork.js');
      const { buildMesh, decodeParams } = await import('../Modules/GeometryEngine.js');

      // Build view list [front, side, top, bottom] — null where not uploaded
      const viewList = VIEW_KEYS.map(k => views[k] ? { file: views[k].file } : null);
      const { embedding, viewsUsed } = await extractMultiView(viewList);

      const rawOutput  = predict(embedding);
      const params     = decodeParams(rawOutput);
      if (hint.trim()) params.label = hint.trim();

      const mesh = buildMesh(params);

      session.setGeometry(mesh);
      session.setCurrentParams(params);
      session.setFeatures(embedding);
      session.setModelLabel(params.label || 'Generated Model');
      setAddedToQueue(false);

    } catch (err) {
      setGenError(err.message || 'Generation failed');
      console.error('RouteA generate error:', err);
    }
    setGenerating(false);
  };

  const handleAddToQueue = () => {
    if (!session.geometry || !session.currentParams || !session.features) return;
    training.addToQueue({
      label:       session.modelLabel || 'Untitled',
      geometry:    session.geometry,
      params:      session.currentParams,
      features:    session.features,
      viewsUsed:   VIEW_KEYS.filter(k => views[k]),
      thumbnailSrc: views.front?.src || null,
    });
    setAddedToQueue(true);
  };

  // Build a descriptive stats list for the current params
  const SHAPE_NAMES = ['Sphere', 'Cylinder', 'Box', 'Torus', 'Cone', 'Organic'];
  const p = session.currentParams;

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: '1.25rem', background: C.white }}>

        <SectionHeading>Views</SectionHeading>

        {/* 2×2 view grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.25rem' }}>
          {VIEW_KEYS.map(k => (
            <ViewSlot
              key={k}
              label={VIEW_LABELS[k]}
              required={VIEW_REQ[k]}
              value={views[k]}
              onChange={val => setView(k, val)}
            />
          ))}
        </div>

        <SectionHeading>Object Hint (optional)</SectionHeading>
        <textarea
          value={hint}
          onChange={e => setHint(e.target.value)}
          placeholder="e.g. coral branch, ceramic pot, mechanical bracket…"
          rows={3}
          style={{
            width: '100%', border: `0.5px solid ${C.border}`, borderRadius: 8,
            padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
            resize: 'vertical', color: C.ink, background: C.sand,
            marginBottom: '1rem',
          }}
        />

        {/* Model status */}
        {!model.feReady && (
          <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#92400E', marginBottom: '1rem' }}>
            {model.feLoading
              ? `⏳ ${model.feProgress?.message || 'Loading vision model…'}`
              : '⬛ Vision model not loaded — launch will begin automatically.'
            }
          </div>
        )}

        <PrimaryBtn
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          style={{ width: '100%', marginBottom: 8 }}
        >
          {generating ? '⏳ Generating…' : '✦ Generate Mesh'}
        </PrimaryBtn>

        {genError && (
          <div style={{ fontSize: 11, color: '#c0392b', padding: '6px 10px', background: '#fdecea', borderRadius: 6, marginBottom: 8 }}>
            {genError}
          </div>
        )}

        {/* Result actions */}
        {session.geometry && (
          <>
            <SecondaryBtn
              onClick={() => setShowWire(w => !w)}
              style={{ width: '100%', marginBottom: 8 }}
            >
              {showWire ? 'Hide wireframe' : 'Show wireframe'}
            </SecondaryBtn>

            <div style={{ marginBottom: 8 }}>
              <STLDownloadBtn
                geometry={session.geometry}
                label={session.modelLabel}
                repairReport={null}
              />
            </div>

            {!addedToQueue
              ? <SecondaryBtn onClick={handleAddToQueue} style={{ width: '100%' }}>
                  ＋ Add to Training Queue
                </SecondaryBtn>
              : <div style={{ textAlign: 'center', fontSize: 12, color: C.green, padding: '8px 0' }}>
                  ✓ Added to queue — go to Train tab to rate
                </div>
            }
          </>
        )}

        {/* Generated param summary */}
        {p && (
          <>
            <div style={{ borderTop: `0.5px solid ${C.border}`, margin: '1rem 0 0.75rem' }} />
            <SectionHeading>Generated Parameters</SectionHeading>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <StatCard label="Base Shape"    value={SHAPE_NAMES[p.baseShape] || 'Sphere'} />
              <StatCard label="Subdivisions"  value={p.subdivisions} />
              <StatCard label="Noise Amp"     value={(p.noiseAmplitude || 0).toFixed(2)} />
              <StatCard label="Twist"         value={(p.twist || 0).toFixed(2)} />
              <StatCard label="Scale X/Y/Z"   value={`${(p.scaleX||1).toFixed(1)} / ${(p.scaleY||1).toFixed(1)} / ${(p.scaleZ||1).toFixed(1)}`} />
              <StatCard label="Ridges"        value={p.ridges || 0} />
            </div>
          </>
        )}
      </div>

      {/* ── Right panel: viewer ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1.25rem', gap: 10 }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Viewer
            ref={viewerRef}
            geometry={session.geometry}
            showWireframe={showWire}
            style={{ height: '100%', borderRadius: 12, border: `0.5px solid ${C.border}` }}
          />
        </div>

        {/* Viewer toolbar */}
        {session.geometry && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
            <SecondaryBtn onClick={() => viewerRef.current?.resetCamera()} style={{ fontSize: 11, padding: '5px 12px' }}>
              Reset camera
            </SecondaryBtn>
            <SecondaryBtn onClick={() => viewerRef.current?.fitToGeometry()} style={{ fontSize: 11, padding: '5px 12px' }}>
              Fit to model
            </SecondaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}
