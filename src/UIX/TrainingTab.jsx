// ── TrainingTab.jsx ───────────────────────────────────────────────────────────
// Three sub-tabs: Queue | Train | Models
// Includes the complete RatingModal (4-step flow inline)

import { useState, useCallback, useEffect } from 'react';
import { StarRating, TagSelector, DistanceSlider, PrimaryBtn, SecondaryBtn, Card, SectionHeading, Badge, StatCard } from './components/index.jsx';
import { useTraining, C } from './App.jsx';
import { TAG_CATEGORIES, NEGATIVE_TAG_CATEGORIES } from '../Dependencies/helpContent.js';

// ── 4-step Rating Modal ───────────────────────────────────────────────────────

function RatingModal({ item, onSave, onClose }) {
  const [step,     setStep]     = useState(1);
  const [rating,   setRating]   = useState(item?.rating   || null);
  const [posTags,  setPosTags]  = useState(item?.positiveTags || []);
  const [negTags,  setNegTags]  = useState(item?.negativeTags || []);
  const [distance, setDistance] = useState(item?.distanceFromDesired ?? 0.5);
  const [saving,   setSaving]   = useState(false);

  // totalSteps = actual number of steps shown for the chosen rating
  // 5★ / 4★: Rate → Pos Tags → Confirm (3 steps)
  // 1–3★:    Rate → Pos Tags → Neg Tags → Confirm (4 steps)
  const totalSteps  = !rating ? 3 : rating >= 4 ? 3 : 4;
  // displayStep maps internal step number (1,2,3,4) to a 1-based display step
  const displayStep = step === 4 ? totalSteps : step;
  const stepLabel   = { 1: 'Rate', 2: 'What was right', 3: 'What was wrong', 4: 'Confirm' };

  const canAdvance = step === 1 ? rating !== null : step === 2 ? posTags.length > 0 : true;

  const handleNext = () => {
    if (!canAdvance) return;
    let nextStep = step + 1;
    // Skip step 3 for 4★ and 5★
    if (nextStep === 3 && rating >= 4) nextStep = 4;
    if (nextStep > 4) return;
    setStep(nextStep);
  };

  const handleBack = () => {
    let prev = step - 1;
    if (prev === 3 && rating >= 4) prev = 2;
    if (prev < 1) return;
    setStep(prev);
  };

  const handleSave = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      const { buildEntry, addEntry } = await import('../Modules/TrainingStore.js');
      const entry = buildEntry({
        label:               item.label,
        features:            item.features || new Float32Array(1280),
        generatedParams:     item.params   || {},
        rating,
        positiveTags:        posTags,
        negativeTags:        negTags,
        distanceFromDesired: distance,
        viewsUsed:           item.viewsUsed || [],
      });
      await addEntry(entry);
      onSave({ rating, positiveTags: posTags, negativeTags: negTags, distanceFromDesired: distance });
    } catch (err) {
      console.error('Save entry failed', err);
    }
    setSaving(false);
  };

  const ratingColors = { 1: '#c0392b', 2: '#e67e22', 3: '#f39c12', 4: '#27ae60', 5: '#27ae60' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '1rem' }}>
      <div style={{ background: C.white, borderRadius: 16, width: '100%', maxWidth: 500, boxShadow: '0 12px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '1.2rem 1.5rem 1rem', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Rate: {item.label}</div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: C.muted, padding: '0 4px' }}>✕</button>
          </div>
          {/* Step dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} style={{ width: i + 1 === displayStep ? 20 : 8, height: 8, borderRadius: 4, background: i + 1 <= displayStep ? C.coral : '#eee', transition: 'all 0.2s' }} />
            ))}
            <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>Step {displayStep} of {totalSteps} — {stepLabel[step]}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* Step 1 — Star rating */}
          {step === 1 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: '1.25rem' }}>
                How well does this mesh match the actual object?
              </div>
              <StarRating value={rating} onChange={setRating} size={40} />
              {rating && (
                <div style={{ marginTop: '1rem', padding: '8px 12px', background: C.sand, borderRadius: 8, fontSize: 12, color: C.muted }}>
                  {rating === 5 && 'Perfect — this mesh can go straight to export'}
                  {rating === 4 && 'Good — a few minor tweaks needed'}
                  {rating === 3 && 'Needs work — roughly right but noticeable issues'}
                  {rating === 2 && 'Off track — significant problems with form or proportions'}
                  {rating === 1 && 'Wrong direction — the model missed completely'}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Positive tags */}
          {step === 2 && (
            <>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: '1rem' }}>
                {rating === 5
                  ? 'What made this mesh great? Tag what to keep doing.'
                  : 'What did the mesh get right? Select all that apply.'}
              </div>
              <TagSelector
                categories={TAG_CATEGORIES}
                selected={posTags}
                onChange={setPosTags}
              />
              {posTags.length === 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#e67e22' }}>Select at least one tag to continue</div>
              )}
            </>
          )}

          {/* Step 3 — Negative tags + distance (1–3★ only) */}
          {step === 3 && (
            <>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: '1rem' }}>
                What was wrong with this result? Tag all problems.
              </div>
              <TagSelector
                categories={NEGATIVE_TAG_CATEGORIES}
                selected={negTags}
                onChange={setNegTags}
              />
              <div style={{ marginTop: '1.25rem' }}>
                <DistanceSlider value={distance} onChange={setDistance} />
              </div>
            </>
          )}

          {/* Step 4 — Confirm */}
          {step === 4 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: '1rem' }}>Confirm and save this entry</div>
              <div style={{ background: C.sand, borderRadius: 10, padding: '1rem', marginBottom: '1rem', fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: C.muted }}>Rating:</span>
                  <span style={{ fontWeight: 600, color: ratingColors[rating] }}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)} {rating}/5</span>
                </div>
                {posTags.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: C.muted }}>Positive tags: </span>
                    <span style={{ fontSize: 11 }}>{posTags.slice(0, 5).join(', ')}{posTags.length > 5 ? ` +${posTags.length - 5}` : ''}</span>
                  </div>
                )}
                {negTags.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: C.muted }}>Negative tags: </span>
                    <span style={{ fontSize: 11 }}>{negTags.slice(0, 5).join(', ')}{negTags.length > 5 ? ` +${negTags.length - 5}` : ''}</span>
                  </div>
                )}
                {negTags.length > 0 && (
                  <div>
                    <span style={{ color: C.muted }}>Distance from desired: </span>
                    <span style={{ fontSize: 11 }}>{Math.round(distance * 100)}%</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                This entry will be saved immediately to your local database. Training uses all saved entries.
              </div>
            </>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {step > 1 && (
            <SecondaryBtn onClick={handleBack} style={{ minWidth: 80 }}>Back</SecondaryBtn>
          )}
          {step < 4 && (
            <PrimaryBtn onClick={handleNext} disabled={!canAdvance} style={{ minWidth: 80 }}>
              Next
            </PrimaryBtn>
          )}
          {step === 4 && (
            <PrimaryBtn onClick={handleSave} disabled={saving} style={{ minWidth: 120 }}>
              {saving ? 'Saving…' : 'Save Entry'}
            </PrimaryBtn>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Queue sub-tab ─────────────────────────────────────────────────────────────

function QueueSubTab() {
  const training = useTraining();

  return (
    <div style={{ padding: '1.5rem' }}>
      {training.queue.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>☐</div>
          <div style={{ fontSize: 14, marginBottom: 6, fontWeight: 500 }}>Queue is empty</div>
          <div style={{ fontSize: 12 }}>Generate a model in the Generate tab, then click<br />"Add to Training Queue" to start a session.</div>
        </div>
      ) : (
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{training.queue.length} object{training.queue.length !== 1 ? 's' : ''} in queue</div>
            <div style={{ fontSize: 11, color: C.muted }}>Rate each to add training data</div>
          </div>

          {training.queue.map((item) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: C.white, borderRadius: 10, padding: '10px 14px',
              border: `0.5px solid ${C.border}`, marginBottom: 8,
            }}>
              {/* Thumbnail */}
              <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', background: C.sand, flexShrink: 0 }}>
                {item.thumbnailSrc
                  ? <img src={item.thumbnailSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 18 }}>◻</div>
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {item.isRouteB ? 'Route B — point cloud' : `Route A — ${(item.viewsUsed || []).join(', ')}`}
                </div>
              </div>

              {/* Status */}
              <div>
                {item.status === 'pending' && (
                  <PrimaryBtn onClick={() => training.openRatingModal(item)} style={{ fontSize: 11, padding: '6px 12px' }}>
                    Rate
                  </PrimaryBtn>
                )}
                {item.status === 'rated' && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: '#F5A623', fontSize: 14 }}>{'★'.repeat(item.rating)}</span>
                    <button onClick={() => training.openRatingModal(item)} style={{ fontSize: 10, color: C.muted, border: `0.5px solid ${C.border}`, background: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>Re-rate</button>
                  </div>
                )}
                {item.status === 'saved' && <Badge color={C.green} bg={C.greenBg}>✓ Saved</Badge>}
              </div>

              {/* Remove */}
              <button onClick={() => training.removeFromQueue(item.id)} style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Rating modal */}
      {training.ratingItem && (
        <RatingModal
          item={training.ratingItem}
          onSave={async ({ rating, positiveTags, negativeTags, distanceFromDesired }) => {
            training.updateQueueItem(training.ratingItem.id, { status: 'rated', rating, positiveTags, negativeTags, distanceFromDesired });
            training.closeRatingModal();
            await training.refreshCount();

            // Auto-train check
            const { fbCount } = await import('../Dependencies/tfUtils.js');
            const count = await fbCount();
            if (training.autoTrain && count >= training.autoThreshold) {
              const { getBatch } = await import('../Modules/TrainingStore.js');
              const batch = await getBatch(32);
              await training.startManualTraining(batch, { epochs: training.prefs.defaultEpochs });
            }
          }}
          onClose={training.closeRatingModal}
        />
      )}
    </div>
  );
}

// ── Train sub-tab ─────────────────────────────────────────────────────────────

function TrainSubTab() {
  const training  = useTraining();
  const [lossLog, setLossLog] = useState([]);
  const [vLabel,  setVLabel]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const handleTrain = async () => {
    const { getBatch } = await import('../Modules/TrainingStore.js');
    const batch = await getBatch(32);
    if (batch.length === 0) return;
    const result = await training.startManualTraining(batch, { epochs: training.prefs.defaultEpochs || 10 });
    if (result) setLossLog(prev => [...prev, result]);
  };

  const handleSaveVersion = async () => {
    if (!vLabel.trim()) return;
    setSaving(true);
    try {
      const { saveNewVersion } = await import('../Modules/TrainingStore.js');
      const { train: trainFn, saveVersion } = await import('../Modules/ParamNetwork.js');

      // Build a lightweight adapter that satisfies saveNewVersion's paramNetwork param
      const paramNetworkAdapter = { train: trainFn, saveVersion };
      const result = await saveNewVersion(vLabel.trim(), paramNetworkAdapter);
      setSaveMsg(`✓ Saved as "${vLabel}" — ${result.entriesCleared} entries cleared`);
      setVLabel('');
      await training.refreshCount();
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    }
    setSaving(false);
  };

  const p = training.trainProgress;

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640, margin: '0 auto' }}>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1.5rem' }}>
        <StatCard label="Feedback entries" value={training.entryCount} hint="In local DB" />
        <StatCard label="Status"   value={training.trainStatus === 'idle' ? 'Idle' : training.trainStatus === 'running' ? 'Training…' : training.trainStatus === 'done' ? 'Done' : 'Error'} />
        <StatCard label="Auto-train" value={training.autoTrain ? `Every ${training.autoThreshold}` : 'Off'} />
      </div>

      {/* Training controls */}
      <Card style={{ marginBottom: '1rem' }}>
        <SectionHeading>Training Controls</SectionHeading>

        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
          <PrimaryBtn onClick={handleTrain} disabled={training.trainStatus === 'running' || training.entryCount === 0}>
            {training.trainStatus === 'running' ? '⏳ Training…' : 'Train Now'}
          </PrimaryBtn>
          <span style={{ fontSize: 11, color: C.muted }}>
            Uses all {training.entryCount} saved {training.entryCount === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Progress bar */}
        {training.trainStatus === 'running' && p && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ height: 4, background: '#eee', borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: C.coral, borderRadius: 2, width: `${p.percentComplete || 0}%`, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>{p.message}</div>
            {p.loss !== undefined && (
              <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: C.coral }}>Loss: {p.loss.toFixed(5)}</div>
            )}
          </div>
        )}

        {training.trainResult && (
          <div style={{ fontSize: 11, marginBottom: '1rem', padding: '8px 12px', background: C.greenBg, borderRadius: 6, color: C.green }}>
            ✓ Training complete — Loss {training.trainResult.lossStart?.toFixed(4)} → {training.trainResult.lossEnd?.toFixed(4)} over {training.trainResult.epochs} epochs
          </div>
        )}

        {/* Auto-train toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={training.autoTrain} onChange={e => training.setAutoTrain(e.target.checked)} />
            Auto-train every
          </label>
          <input type="number" min={2} max={100} value={training.autoThreshold}
            onChange={e => training.setAutoThreshold(Math.max(2, parseInt(e.target.value) || 10))}
            style={{ width: 50, border: `0.5px solid ${C.border}`, borderRadius: 6, padding: '3px 6px', fontSize: 12, fontFamily: 'inherit' }} />
          <span style={{ fontSize: 12, color: C.muted }}>entries</span>
        </div>
      </Card>

      {/* Save version */}
      <Card>
        <SectionHeading>Save New Version</SectionHeading>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: '0.75rem' }}>
          Runs a final training pass then saves weights as a new version. Clears all feedback entries.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={vLabel} onChange={e => setVLabel(e.target.value)}
            placeholder="Version label, e.g. Ceramics v2"
            style={{ flex: 1, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit' }} />
          <PrimaryBtn onClick={handleSaveVersion} disabled={saving || !vLabel.trim() || training.entryCount === 0} style={{ whiteSpace: 'nowrap' }}>
            {saving ? 'Saving…' : 'Save Version'}
          </PrimaryBtn>
        </div>
        {saveMsg && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.green }}>{saveMsg}</div>
        )}
        {training.entryCount === 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>Rate at least one model to enable version save</div>
        )}
      </Card>
    </div>
  );
}

// ── Models sub-tab ────────────────────────────────────────────────────────────

function ModelsSubTab() {
  const [models,    setModels]    = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [editId,    setEditId]    = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [msg,       setMsg]       = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { listModels, getActiveModelKey } = await import('../Dependencies/tfUtils.js');
    const list = await listModels('param-network');
    const key  = getActiveModelKey('param-network');
    setModels(list.sort((a, b) => b.savedAt - a.savedAt));
    setActiveKey(key);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUse = async (key) => {
    const { loadVersion } = await import('../Modules/ParamNetwork.js');
    const ok = await loadVersion(key);
    if (ok) { setActiveKey(key); setMsg(`✓ Now using: ${models.find(m=>m.key===key)?.label}`); }
  };

  const handleDelete = async (key) => {
    if (!window.confirm('Delete this version? This cannot be undone.')) return;
    const { deleteModel } = await import('../Dependencies/tfUtils.js');
    await deleteModel(key);
    setMsg('Version deleted');
    refresh();
  };

  const handleRename = async (key) => {
    if (!editLabel.trim()) return;
    const { renameModel } = await import('../Dependencies/tfUtils.js');
    await renameModel(key, editLabel.trim());
    setEditId(null); setEditLabel('');
    refresh();
  };

  const handleExportJSON = async () => {
    const { exportJSON, downloadJSON } = await import('../Modules/TrainingStore.js');
    const json = await exportJSON();
    downloadJSON(json);
  };

  if (loading) return <div style={{ padding: '2rem', color: C.muted, fontSize: 12 }}>Loading models…</div>;

  return (
    <div style={{ padding: '1.5rem', maxWidth: 640, margin: '0 auto' }}>
      {msg && (
        <div style={{ background: C.greenBg, color: C.green, borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: '1rem' }}>
          {msg}
          <button onClick={() => setMsg('')} style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer', color: C.green, fontSize: 14 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{models.length} saved version{models.length !== 1 ? 's' : ''}</div>
        <SecondaryBtn onClick={handleExportJSON} style={{ fontSize: 11, padding: '5px 12px' }}>Export training data JSON</SecondaryBtn>
      </div>

      {models.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: C.muted }}>
          <div style={{ fontSize: 12 }}>No versions saved yet. Rate some models and save a version in the Train tab.</div>
        </div>
      ) : (
        models.map(m => (
          <div key={m.key} style={{
            background: C.white, borderRadius: 10, padding: '12px 14px',
            border: `0.5px solid ${m.key === activeKey ? C.coral : C.border}`,
            marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                {editId === m.key ? (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <input value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus
                      style={{ flex: 1, border: `0.5px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, fontFamily: 'inherit' }} />
                    <button onClick={() => handleRename(m.key)} style={{ fontSize: 11, color: C.coral, border: `0.5px solid ${C.coral}`, background: C.coralLight, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                    <button onClick={() => setEditId(null)} style={{ fontSize: 11, color: C.muted, border: `0.5px solid ${C.border}`, background: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>
                    {m.label}
                    {m.key === activeKey && <Badge color={C.coral} bg={C.coralLight} style={{ marginLeft: 6 }}> Active</Badge>}
                  </div>
                )}
                <div style={{ fontSize: 10, color: C.muted }}>
                  {new Date(m.savedAt).toLocaleDateString()} · {m.size || '—'}
                  {m.lastLoss != null && ` · Loss: ${m.lastLoss.toFixed(4)}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {m.key !== activeKey && (
                  <button onClick={() => handleUse(m.key)} style={{ fontSize: 11, padding: '4px 10px', border: `0.5px solid ${C.coral}`, color: C.coral, background: C.coralLight, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Use</button>
                )}
                <button onClick={() => { setEditId(m.key); setEditLabel(m.label); }} style={{ fontSize: 11, padding: '4px 10px', border: `0.5px solid ${C.border}`, color: C.muted, background: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Rename</button>
                <button onClick={() => handleDelete(m.key)} disabled={m.key === activeKey} style={{ fontSize: 11, padding: '4px 10px', border: `0.5px solid ${C.border}`, color: '#c0392b', background: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', opacity: m.key === activeKey ? 0.3 : 1 }}>Delete</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── TrainingTab root ──────────────────────────────────────────────────────────

const SUB_TABS = [
  { id: 'queue',  label: 'Queue' },
  { id: 'train',  label: 'Train' },
  { id: 'models', label: 'Models' },
];

export default function TrainingTab() {
  const training = useTraining();
  const [sub, setSub] = useState('queue');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.white, flexShrink: 0, padding: '0 1.5rem' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 12, fontFamily: 'inherit', fontWeight: sub === t.id ? 600 : 400,
            color: sub === t.id ? C.coral : C.muted,
            borderBottom: sub === t.id ? `2px solid ${C.coral}` : '2px solid transparent',
          }}>
            {t.label}
            {t.id === 'queue' && training.queue.length > 0 && (
              <span style={{ marginLeft: 6, background: C.coral, color: '#fff', borderRadius: 999, fontSize: 9, padding: '1px 6px', fontWeight: 700 }}>
                {training.queue.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sub === 'queue'  && <QueueSubTab />}
        {sub === 'train'  && <TrainSubTab />}
        {sub === 'models' && <ModelsSubTab />}
      </div>
    </div>
  );
}
