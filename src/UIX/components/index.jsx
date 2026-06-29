// ── components/index.jsx ──────────────────────────────────────────────────────
// All small reusable UI components in one file for simplicity

import { useState } from 'react';

const C = {
  coral: '#D85A30', coralLight: '#FAECE7', ink: '#1a1a1a',
  sand: '#f7f4ee', muted: '#888', border: '#e5e5e5',
  green: '#3B6D11', greenBg: '#EAF3DE',
};

// ── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, hint, color }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: color || C.ink, letterSpacing: -0.5 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ── ParamSlider ───────────────────────────────────────────────────────────────
export function ParamSlider({ label, value, min, max, step = 0.01, onChange, description }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
          {typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: C.coral, cursor: 'pointer' }} />
      {description && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{description}</div>}
    </div>
  );
}

// ── StarRating ────────────────────────────────────────────────────────────────
export function StarRating({ value, onChange, size = 32 }) {
  const [hover, setHover] = useState(null);
  const display = hover ?? value ?? 0;

  const LABELS = { 1: 'Wrong direction', 2: 'Off track', 3: 'Needs work', 4: 'Good', 5: 'Perfect' };

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onChange(n)}
            style={{
              fontSize: size, background: 'none', border: 'none', cursor: 'pointer',
              color: n <= display ? '#F5A623' : '#ddd',
              transform: n <= display ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.1s',
              lineHeight: 1,
              padding: 2,
            }}>★</button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: C.muted, minHeight: 20 }}>
        {LABELS[display] || 'Click to rate'}
      </div>
    </div>
  );
}

// ── TagSelector ───────────────────────────────────────────────────────────────
export function TagSelector({ categories, selected, onChange, objectType = 'all' }) {
  const [expanded, setExpanded] = useState(new Set([categories[0]?.id]));

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleTag = (tagId) => {
    const next = new Set(selected);
    next.has(tagId) ? next.delete(tagId) : next.add(tagId);
    onChange(Array.from(next));
  };

  // Filter categories for object type
  const relevantCats = categories.filter(c =>
    !c.objectTypes || c.objectTypes.includes('all') || c.objectTypes.includes(objectType)
  );

  return (
    <div>
      {relevantCats.map(cat => (
        <div key={cat.id} style={{ marginBottom: 6, border: `0.5px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggle(cat.id)} style={{
            width: '100%', textAlign: 'left', padding: '8px 12px',
            background: expanded.has(cat.id) ? C.coralLight : '#fff',
            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            color: expanded.has(cat.id) ? C.coral : C.ink, fontFamily: 'inherit',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{cat.label}</span>
            <span style={{ fontSize: 10 }}>{expanded.has(cat.id) ? '▲' : '▼'}</span>
          </button>
          {expanded.has(cat.id) && (
            <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, background: '#fafafa' }}>
              {cat.tags.map(tag => (
                <button key={tag.id} onClick={() => toggleTag(tag.id)} style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                  border: `0.5px solid ${selected.includes(tag.id) ? C.coral : C.border}`,
                  background: selected.includes(tag.id) ? C.coralLight : '#fff',
                  color: selected.includes(tag.id) ? C.coral : C.muted, fontFamily: 'inherit',
                  transition: 'all 0.1s',
                }}>{tag.label}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── DistanceSlider ────────────────────────────────────────────────────────────
export function DistanceSlider({ value, onChange }) {
  const labels = ['Slightly off', 'Somewhat off', 'Quite wrong', 'Very wrong', 'Completely wrong'];
  const idx    = Math.round(value * 4);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>How far from desired?</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: C.coral }}>{labels[idx] || ''}</span>
      </div>
      <input type="range" min={0} max={1} step={0.25} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: C.coral }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 10, color: '#bbb' }}>Slightly off</span>
        <span style={{ fontSize: 10, color: '#bbb' }}>Completely wrong</span>
      </div>
    </div>
  );
}

// ── STLDownloadBtn ────────────────────────────────────────────────────────────
export function STLDownloadBtn({ geometry, label, repairReport, disabled }) {
  const [showDialog, setShowDialog] = useState(false);
  const [realSize, setRealSize]     = useState('');
  const [units, setUnits]           = useState('mm');
  const [exporting, setExporting]   = useState(false);

  if (!geometry) return null;

  const triCount = geometry.indices ? (geometry.indices.length / 3) | 0 : 0;

  const handleExport = async () => {
    if (!realSize || isNaN(parseFloat(realSize))) return;
    setExporting(true);
    try {
      const { computeScaleFactor, exportSTL, makeFilename } = await import('../Modules/STLExporter.js');
      const scale = computeScaleFactor(geometry.positions, geometry.indices, parseFloat(realSize), units);
      exportSTL(geometry.positions, geometry.indices, geometry.normals, {
        scaleFactor: scale,
        filename: makeFilename(label),
      });
      setShowDialog(false);
    } catch (err) {
      console.error('Export failed', err);
    }
    setExporting(false);
  };

  return (
    <>
      <button onClick={() => setShowDialog(true)} disabled={disabled || !geometry}
        style={{
          background: C.coral, color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          fontFamily: 'inherit', opacity: disabled ? 0.5 : 1, width: '100%',
        }}>
        ⬇ Download STL
      </button>

      {showDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '1.5rem', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Export STL</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: '1rem' }}>Enter the longest real-world dimension of your object to set print scale.</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
              <input type="number" placeholder="e.g. 42.5" value={realSize}
                onChange={e => setRealSize(e.target.value)}
                style={{ flex: 1, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }} />
              <select value={units} onChange={e => setUnits(e.target.value)}
                style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>

            <div style={{ background: C.sand, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: C.muted, marginBottom: '1rem' }}>
              <div>Triangles: {triCount.toLocaleString()}</div>
              <div>Watertight: {repairReport?.isWatertight ? '✓ Yes' : repairReport ? '⚠ Holes remain' : '—'}</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowDialog(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
              <button onClick={handleExport} disabled={exporting || !realSize}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: C.coral, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, opacity: !realSize ? 0.5 : 1 }}>
                {exporting ? 'Exporting…' : 'Download STL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── ViewSlot ──────────────────────────────────────────────────────────────────
export function ViewSlot({ label, required, value, onChange }) {
  const readImg = (file) => {
    const r = new FileReader();
    r.onload = e => {
      const src = e.target.result;
      onChange({ src, b64: src.split(',')[1], mime: file.type, file });
    };
    r.readAsDataURL(file);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999,
          background: required ? C.coralLight : '#f0f0f0',
          color: required ? C.coral : C.muted, fontWeight: 500 }}>
          {required ? 'Required' : 'Optional'}
        </span>
      </div>
      <div
        onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.onchange = e => e.target.files[0] && readImg(e.target.files[0]); el.click(); }}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readImg(f); }}
        onDragOver={e => e.preventDefault()}
        style={{
          border: `1.5px dashed ${value ? C.coral : C.border}`, borderRadius: 10,
          aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', background: value ? '#fff' : C.sand,
          overflow: 'hidden', position: 'relative',
        }}>
        {value
          ? <img src={value.src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt={label} />
          : <div style={{ textAlign: 'center', padding: '0.5rem' }}>
              <div style={{ fontSize: 22, color: C.muted, marginBottom: 3 }}>+</div>
              <div style={{ fontSize: 10, color: C.muted }}>Drop or click</div>
            </div>
        }
        {value && (
          <button onClick={e => { e.stopPropagation(); onChange(null); }} style={{
            position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%',
            border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 10,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        )}
      </div>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ children, color = C.coral, bg = C.coralLight }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 500, background: bg, color }}>
      {children}
    </span>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
export function SectionHeading({ children }) {
  return (
    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.5px', color: C.muted, marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '1.25rem', ...style }}>
      {children}
    </div>
  );
}

// ── Primary button ────────────────────────────────────────────────────────────
export function PrimaryBtn({ children, onClick, disabled, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: C.coral, color: '#fff', border: 'none', borderRadius: 8,
      padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
      fontFamily: 'inherit', opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
      ...style,
    }}>{children}</button>
  );
}

export function SecondaryBtn({ children, onClick, disabled, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: '#fff', color: C.ink, border: `0.5px solid ${C.border}`, borderRadius: 8,
      padding: '9px 16px', fontSize: 13, cursor: 'pointer',
      fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
      ...style,
    }}>{children}</button>
  );
}
