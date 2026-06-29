// ── RouteB.jsx ────────────────────────────────────────────────────────────────
// Route B: Point cloud (.xyz/.ply/.obj) → BPA reconstruction → repair → STL
// Parses file for unit metadata; falls back to user-entered real-world size.

import { useState, useRef } from 'react';
import Viewer from './Viewer.jsx';
import { PrimaryBtn, SecondaryBtn, STLDownloadBtn, StatCard, Card, SectionHeading, Badge } from './components/index.jsx';
import { useSession, useTraining, C } from './App.jsx';

export default function RouteB() {
  const session  = useSession();
  const training = useTraining();
  const viewerRef = useRef(null);

  const [file,         setFile]         = useState(null);
  const [parsing,      setParsing]      = useState(false);
  const [parseError,   setParseError]   = useState('');
  const [rebuilding,   setRebuilding]   = useState(false);
  const [bpaProgress,  setBpaProgress]  = useState(null);
  const [showPoints,   setShowPoints]   = useState(false);
  const [showWire,     setShowWire]     = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const cancelRef = useRef({ cancelled: false });

  const hasCloud  = !!session.pointCloud;
  const hasMesh   = !!session.geometry;
  const unitDetected = session.unitMeta?.detected;

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileChange = async (f) => {
    if (!f) return;
    setFile(f);
    setParsing(true);
    setParseError('');
    session.setGeometry(null);
    session.setPointCloud(null);
    session.setUnitMeta(null);
    setBpaProgress(null);
    setAddedToQueue(false);

    try {
      const { parsePointCloudFile } = await import('../Workers/workerBridge.js');
      const { points, unitMeta, filename } = await parsePointCloudFile(f);

      if (points.length < 4) throw new Error('Too few points — need at least 4. Check file format.');

      session.setPointCloud(points);
      session.setUnitMeta(unitMeta);
      session.setModelLabel(filename.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setParseError(err.message || 'Parse failed');
      session.setPointCloud(null);
    }
    setParsing(false);
  };

  const dropFile = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /\.(xyz|ply|obj|txt)$/i.test(f.name)) handleFileChange(f);
  };

  // ── Reconstruct ───────────────────────────────────────────────────────────
  const handleReconstruct = async () => {
    if (!session.pointCloud) return;
    cancelRef.current.cancelled = false;
    setRebuilding(true);
    setBpaProgress({ stage: 'start', percentComplete: 0, message: 'Preparing…' });
    session.setGeometry(null);
    setAddedToQueue(false);

    try {
      const { startBPA } = await import('../Workers/workerBridge.js');
      const result = await startBPA(
        session.pointCloud,
        { maxHoleSize: 50 },
        p => setBpaProgress(p),
      );

      session.setGeometry({ positions: result.positions, indices: result.indices, normals: result.normals });
      session.setRepairReport(result.repairReport);
      setBpaProgress({ stage: 'complete', percentComplete: 100, message: 'Done' });
      setShowPoints(false);
    } catch (err) {
      setBpaProgress({ stage: 'error', percentComplete: 0, message: err.message || 'Reconstruction failed' });
    }
    setRebuilding(false);
  };

  const handleCancel = async () => {
    cancelRef.current.cancelled = true;
    setRebuilding(false);
    setBpaProgress(prev => prev ? { ...prev, stage: 'cancelled', message: 'Cancelled — partial mesh may be available' } : null);
    // Actually terminate the worker so it stops processing
    const { cancelBPA: doCancelBPA } = await import('../Workers/workerBridge.js');
    doCancelBPA();
  };

  // ── Repair report ─────────────────────────────────────────────────────────
  const R = session.repairReport;

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: '1.25rem', background: C.white }}>

        <SectionHeading>Point Cloud File</SectionHeading>

        {/* Drop zone */}
        <div
          onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = '.xyz,.ply,.obj,.txt'; el.onchange = e => e.target.files[0] && handleFileChange(e.target.files[0]); el.click(); }}
          onDrop={dropFile}
          onDragOver={e => e.preventDefault()}
          style={{
            border: `1.5px dashed ${file ? C.coral : C.border}`, borderRadius: 10,
            padding: '1.25rem', textAlign: 'center', cursor: 'pointer',
            background: file ? C.coralLight : C.sand, marginBottom: 10,
          }}
        >
          {parsing
            ? <span style={{ fontSize: 12, color: C.muted }}>⏳ Parsing file…</span>
            : file
              ? <>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.coral, marginBottom: 3 }}>{file.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {session.pointCloud ? `${session.pointCloud.length.toLocaleString()} points` : parseError}
                  </div>
                </>
              : <>
                  <div style={{ fontSize: 20, color: C.muted, marginBottom: 4 }}>☁</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Drop or click to upload</div>
                  <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>.xyz · .ply · .obj</div>
                </>
          }
        </div>

        {parseError && (
          <div style={{ fontSize: 11, color: '#c0392b', padding: '6px 10px', background: '#fdecea', borderRadius: 6, marginBottom: 10 }}>
            {parseError}
          </div>
        )}

        {/* Unit metadata */}
        {session.unitMeta && (
          <div style={{ fontSize: 11, background: unitDetected ? C.greenBg : '#FFF7ED', borderRadius: 8, padding: '8px 12px', marginBottom: '1rem', color: unitDetected ? C.green : '#92400E' }}>
            {unitDetected
              ? `✓ Units detected in file: ${session.unitMeta.units} — scale locked automatically`
              : '⚠ No unit metadata found — enter real-world size below before exporting STL'}
          </div>
        )}

        {/* Cloud stats */}
        {hasCloud && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: '1rem' }}>
              <StatCard label="Points"  value={session.pointCloud.length.toLocaleString()} />
              <StatCard label="Format"  value={file?.name.split('.').pop().toUpperCase() || '—'} />
            </div>
          </>
        )}

        {/* Reconstruct */}
        {hasCloud && !rebuilding && (
          <PrimaryBtn onClick={handleReconstruct} style={{ width: '100%', marginBottom: 8 }}>
            ⚙ Reconstruct Mesh
          </PrimaryBtn>
        )}

        {/* Progress */}
        {bpaProgress && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ height: 4, background: '#eee', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: C.coral, borderRadius: 2, width: `${bpaProgress.percentComplete || 0}%`, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{bpaProgress.message}</div>
            {rebuilding && (
              <button onClick={handleCancel} style={{ marginTop: 6, fontSize: 10, color: '#c0392b', border: '0.5px solid #c0392b', background: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel (use partial)
              </button>
            )}
          </div>
        )}

        {/* Repair report */}
        {R && (
          <>
            <SectionHeading>Repair Report</SectionHeading>
            <Card style={{ marginBottom: '1rem', padding: '10px 14px' }}>
              <div style={{ fontSize: 11, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <div style={{ color: C.muted }}>Degenerates removed</div>
                <div style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{R.degeneratesRemoved ?? 0}</div>
                <div style={{ color: C.muted }}>Normals fixed</div>
                <div style={{ textAlign: 'right' }}>{R.normalsFlipped ?? 0}</div>
                <div style={{ color: C.muted }}>Holes filled</div>
                <div style={{ textAlign: 'right' }}>{R.holesFilled ?? 0}</div>
                <div style={{ color: C.muted }}>Triangles</div>
                <div style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  {session.geometry ? ((session.geometry.indices?.length || 0) / 3).toLocaleString() : '—'}
                </div>
                <div style={{ color: C.muted }}>Watertight</div>
                <div style={{ textAlign: 'right' }}>
                  {R.isWatertight
                    ? <Badge color={C.green} bg={C.greenBg}>✓ Yes</Badge>
                    : <Badge color="#92400E" bg="#FFF7ED">⚠ No</Badge>}
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Viewer controls */}
        {(hasCloud || hasMesh) && (
          <>
            <SectionHeading>View</SectionHeading>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
              {hasMesh && (
                <button onClick={() => { setShowPoints(false); setShowWire(false); }}
                  style={{ fontSize: 10, padding: '4px 10px', borderRadius: 999, border: `0.5px solid ${!showPoints && !showWire ? C.coral : C.border}`, background: !showPoints && !showWire ? C.coralLight : '#fff', color: !showPoints && !showWire ? C.coral : C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Mesh
                </button>
              )}
              {hasMesh && (
                <button onClick={() => { setShowWire(w => !w); setShowPoints(false); }}
                  style={{ fontSize: 10, padding: '4px 10px', borderRadius: 999, border: `0.5px solid ${showWire ? C.coral : C.border}`, background: showWire ? C.coralLight : '#fff', color: showWire ? C.coral : C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Wireframe
                </button>
              )}
              {hasCloud && (
                <button onClick={() => { setShowPoints(p => !p); setShowWire(false); }}
                  style={{ fontSize: 10, padding: '4px 10px', borderRadius: 999, border: `0.5px solid ${showPoints ? '#2563EB' : C.border}`, background: showPoints ? '#EFF6FF' : '#fff', color: showPoints ? '#2563EB' : C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Points
                </button>
              )}
            </div>
          </>
        )}

        {/* Export */}
        {hasMesh && (
          <>
            <div style={{ marginBottom: 8 }}>
              <STLDownloadBtn
                geometry={session.geometry}
                label={session.modelLabel}
                repairReport={session.repairReport}
              />
            </div>
            {!addedToQueue
              ? <SecondaryBtn onClick={() => {
                  training.addToQueue({
                    label:    session.modelLabel || 'Point Cloud Model',
                    geometry: session.geometry,
                    params:   null,
                    features: null,
                    viewsUsed: [],
                    isRouteB: true,
                  });
                  setAddedToQueue(true);
                }} style={{ width: '100%', fontSize: 12 }}>
                  ＋ Add to Training Queue
                </SecondaryBtn>
              : <div style={{ textAlign: 'center', fontSize: 12, color: C.green, padding: '8px 0' }}>✓ Added to queue</div>
            }
          </>
        )}
      </div>

      {/* ── Right panel: viewer ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.25rem', gap: 10, overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Viewer
            ref={viewerRef}
            geometry={hasMesh ? session.geometry : null}
            pointCloud={session.pointCloud}
            showWireframe={showWire}
            showPoints={showPoints}
            style={{ height: '100%', borderRadius: 12, border: `0.5px solid ${C.border}` }}
          />
        </div>
        {(hasMesh || hasCloud) && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
            <SecondaryBtn onClick={() => viewerRef.current?.resetCamera()} style={{ fontSize: 11, padding: '5px 12px' }}>Reset camera</SecondaryBtn>
            <SecondaryBtn onClick={() => viewerRef.current?.fitToGeometry()} style={{ fontSize: 11, padding: '5px 12px' }}>Fit to model</SecondaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}
