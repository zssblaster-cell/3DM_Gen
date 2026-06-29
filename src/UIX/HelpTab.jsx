// ── HelpTab.jsx ───────────────────────────────────────────────────────────────
// 4 sections: Getting Started · Tags & Parameters · Algorithm Reference · Troubleshooting
// Searchable by keyword across all content. Accordion panels for tag categories.

import { useState } from 'react';
import {
  GETTING_STARTED,
  PARAM_SCHEMA,
  TAG_CATEGORIES,
  NEGATIVE_TAG_CATEGORIES,
  ALGORITHM_REFERENCE,
  TROUBLESHOOTING,
} from '../Dependencies/helpContent.js';
import { C } from './App.jsx';
import { Card } from './components/index.jsx';

// ── Search bar ────────────────────────────────────────────────────────────────
function SearchBar({ value, onChange }) {
  return (
    <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }}>⌕</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search tags, parameters, steps, FAQs…"
        style={{
          width: '100%', border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: '10px 12px 10px 34px', fontSize: 13, fontFamily: 'inherit',
          background: C.white, color: C.ink,
        }}
      />
      {value && (
        <button onClick={() => onChange('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#bbb', fontSize: 16 }}>✕</button>
      )}
    </div>
  );
}

// ── Section tabs ──────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'start',  label: 'Getting Started'     },
  { id: 'tags',   label: 'Tags & Parameters'   },
  { id: 'algo',   label: 'Algorithm Reference' },
  { id: 'trouble',label: 'Troubleshooting'     },
];

// ── Getting Started ───────────────────────────────────────────────────────────
function GettingStartedSection({ search }) {
  const matches = (text) => !search || text.toLowerCase().includes(search.toLowerCase());

  return (
    <div>
      {/* Route A */}
      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: '0.75rem', color: C.coral }}>
          {GETTING_STARTED.routeA.title}
        </div>
        <ol style={{ paddingLeft: '1.25rem', color: C.ink, lineHeight: 1.7, marginBottom: '0.75rem' }}>
          {GETTING_STARTED.routeA.steps.filter(s => matches(s)).map((s, i) => (
            <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{s}</li>
          ))}
        </ol>
        {GETTING_STARTED.routeA.tips.filter(t => matches(t)).length > 0 && (
          <div style={{ background: C.sand, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Tips</div>
            {GETTING_STARTED.routeA.tips.filter(t => matches(t)).map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>• {t}</div>
            ))}
          </div>
        )}
      </Card>

      {/* Route B */}
      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: '0.75rem', color: '#2563EB' }}>
          {GETTING_STARTED.routeB.title}
        </div>
        <ol style={{ paddingLeft: '1.25rem', color: C.ink, lineHeight: 1.7, marginBottom: '0.75rem' }}>
          {GETTING_STARTED.routeB.steps.filter(s => matches(s)).map((s, i) => (
            <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{s}</li>
          ))}
        </ol>
        {GETTING_STARTED.routeB.tips.filter(t => matches(t)).length > 0 && (
          <div style={{ background: C.sand, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Tips</div>
            {GETTING_STARTED.routeB.tips.filter(t => matches(t)).map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>• {t}</div>
            ))}
          </div>
        )}
      </Card>

      {/* Training */}
      <Card>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: '0.75rem', color: C.green }}>
          {GETTING_STARTED.training.title}
        </div>
        <ol style={{ paddingLeft: '1.25rem', color: C.ink, lineHeight: 1.7 }}>
          {GETTING_STARTED.training.steps.filter(s => matches(s)).map((s, i) => (
            <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{s}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

// ── Tags & Parameters ─────────────────────────────────────────────────────────
function TagsSection({ search }) {
  const [openCats, setOpenCats] = useState(new Set(['surface']));
  const q = search.toLowerCase();

  const toggle = (id) => setOpenCats(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const matchTag = (tag) => !q || tag.label.toLowerCase().includes(q) || tag.description?.toLowerCase().includes(q) || tag.affects?.toLowerCase().includes(q);
  const matchCat = (cat) => !q || cat.label.toLowerCase().includes(q) || cat.tags.some(matchTag);

  const filteredCats = TAG_CATEGORIES.filter(matchCat);

  return (
    <div>
      {/* Param reference table */}
      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: '0.75rem' }}>Parameter Reference</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Parameter', 'Range', 'Default', 'Description'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: C.muted, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PARAM_SCHEMA.filter(p => !q || p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)).map(p => (
                <tr key={p.key} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 500 }}>{p.label}</td>
                  <td style={{ padding: '8px 10px', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{p.min} – {p.max}</td>
                  <td style={{ padding: '8px 10px', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{p.default}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Positive tag categories */}
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: '0.75rem' }}>Positive Tags</div>
      {filteredCats.map(cat => {
        const filteredTags = cat.tags.filter(matchTag);
        if (filteredTags.length === 0 && q) return null;
        const isOpen = openCats.has(cat.id) || !!q;

        return (
          <div key={cat.id} style={{ border: `0.5px solid ${C.border}`, borderRadius: 10, marginBottom: 6, overflow: 'hidden' }}>
            <button onClick={() => toggle(cat.id)} style={{
              width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
              background: isOpen ? C.coralLight : C.white, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 500, fontSize: 13, color: isOpen ? C.coral : C.ink }}>{cat.label}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{isOpen ? '▲' : '▼'} {cat.tags.length} tags</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 14px 12px' }}>
                {filteredTags.map(tag => (
                  <div key={tag.id} style={{ padding: '8px 0', borderTop: `0.5px solid ${C.border}` }}>
                    <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 3, color: C.ink }}>
                      {tag.label}
                      <span style={{ fontWeight: 400, color: C.muted, fontSize: 11, marginLeft: 8 }}>→ {tag.affects}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{tag.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Negative tag categories */}
      <div style={{ fontWeight: 600, fontSize: 14, margin: '1.25rem 0 0.75rem' }}>Negative Tags</div>
      {NEGATIVE_TAG_CATEGORIES.filter(cat => !q || cat.label.toLowerCase().includes(q) || cat.tags.some(t => !q || t.label.toLowerCase().includes(q))).map(cat => (
        <div key={cat.id} style={{ border: `0.5px solid ${C.border}`, borderRadius: 10, marginBottom: 6, overflow: 'hidden' }}>
          <button onClick={() => toggle(cat.id)} style={{
            width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
            background: openCats.has(cat.id) || !!q ? '#FFF7ED' : C.white, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 500, fontSize: 13, color: openCats.has(cat.id) || !!q ? '#92400E' : C.ink }}>{cat.label}</span>
            <span style={{ fontSize: 10, color: C.muted }}>{openCats.has(cat.id) || !!q ? '▲' : '▼'} {cat.tags.length} tags</span>
          </button>
          {(openCats.has(cat.id) || !!q) && (
            <div style={{ padding: '0 14px 12px' }}>
              {cat.tags.filter(t => !q || t.label.toLowerCase().includes(q) || t.affects.toLowerCase().includes(q)).map(tag => (
                <div key={tag.id} style={{ padding: '6px 0', borderTop: `0.5px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 500, fontSize: 12, flexShrink: 0 }}>{tag.label}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{tag.affects}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Algorithm Reference ───────────────────────────────────────────────────────
function AlgoSection({ search }) {
  const q = search.toLowerCase();
  const matches = (text) => !q || text?.toLowerCase().includes(q);

  const renderAlgo = (block) => (
    <Card key={block.title} style={{ marginBottom: '1rem' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: '0.75rem' }}>{block.title}</div>
      {block.sections.filter(s => matches(s.heading) || matches(s.body)).map(s => (
        <div key={s.heading} style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: C.coral, marginBottom: 4 }}>{s.heading}</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>{s.body}</div>
        </div>
      ))}
    </Card>
  );

  return (
    <div>
      {renderAlgo(ALGORITHM_REFERENCE.routeA)}
      {renderAlgo(ALGORITHM_REFERENCE.routeB)}
      {renderAlgo(ALGORITHM_REFERENCE.training)}
    </div>
  );
}

// ── Troubleshooting ───────────────────────────────────────────────────────────
function TroubleSection({ search }) {
  const [open, setOpen] = useState(new Set());
  const q = search.toLowerCase();

  const toggle = (key) => setOpen(prev => {
    const s = new Set(prev);
    s.has(key) ? s.delete(key) : s.add(key);
    return s;
  });

  return (
    <div>
      {TROUBLESHOOTING.filter(cat => !q || cat.category.toLowerCase().includes(q) || cat.items.some(i => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q))).map(cat => (
        <div key={cat.category} style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: '0.75rem' }}>{cat.category}</div>
          {cat.items.filter(item => !q || item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)).map((item, i) => {
            const key = `${cat.category}-${i}`;
            const isOpen = open.has(key) || !!q;
            return (
              <div key={key} style={{ border: `0.5px solid ${C.border}`, borderRadius: 10, marginBottom: 6, overflow: 'hidden' }}>
                <button onClick={() => toggle(key)} style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                  background: isOpen ? C.sand : C.white, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{item.q}</span>
                  <span style={{ fontSize: 14, color: C.muted, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 14px 12px', fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── HelpTab root ──────────────────────────────────────────────────────────────

export default function HelpTab() {
  const [section, setSection] = useState('start');
  const [search,  setSearch]  = useState('');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Section tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.white, flexShrink: 0, padding: '0 1.5rem', overflowX: 'auto' }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 12, fontFamily: 'inherit', fontWeight: section === s.id ? 600 : 400, whiteSpace: 'nowrap',
            color: section === s.id ? C.coral : C.muted,
            borderBottom: section === s.id ? `2px solid ${C.coral}` : '2px solid transparent',
          }}>{s.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', maxWidth: 700, width: '100%', margin: '0 auto' }}>
        <SearchBar value={search} onChange={setSearch} />

        {section === 'start'   && <GettingStartedSection search={search} />}
        {section === 'tags'    && <TagsSection    search={search} />}
        {section === 'algo'    && <AlgoSection    search={search} />}
        {section === 'trouble' && <TroubleSection search={search} />}
      </div>
    </div>
  );
}
