import { useState } from 'react';
import { Funnel } from '../types';

interface Props {
  funnel: Funnel;
  onArchive: () => void;
  onDuplicate: () => void;
  onUpdate: (updates: Partial<Funnel>) => void;
}

const STAGE_COLORS: Record<string, string> = {
  Awareness: '#F59E0B',
  Engagement: '#D97706',
  Interest: '#D97706',
  Consideration: '#B45309',
  Conversion: '#92400E',
};

export default function FunnelCard({ funnel, onArchive, onDuplicate, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(funnel.name);
  const [menuOpen, setMenuOpen] = useState(false);

  const saveEdit = () => {
    if (nameInput.trim()) onUpdate({ name: nameInput.trim() });
    setEditing(false);
  };

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${funnel.archived ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'}`,
      }}
    >
      {/* Card header */}
      <div className="px-4 py-3.5 flex items-center gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3h10M3.5 6h7M5 9h4M6.5 12h1" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                className="text-sm font-medium bg-transparent text-white outline-none border-b border-amber-400/50 w-full"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="text-sm font-medium text-white truncate">{funnel.name}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-white/30">{funnel.steps.length} steps</span>
              <span className="text-[11px] text-white/20">·</span>
              <span className="text-[11px] text-white/30">{funnel.metrics.leads} leads</span>
              <span className="text-[11px] text-white/20">·</span>
              <span className="text-[11px]" style={{ color: '#F59E0B' }}>{funnel.metrics.conversionRate}% CVR</span>
            </div>
          </div>
        </button>

        {/* Chevron */}
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className="transition-transform duration-200 flex-shrink-0"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          onClick={() => setExpanded((v) => !v)}
        >
          <path d="M4 6l4 4 4-4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors duration-150"
            style={{ background: menuOpen ? 'rgba(255,255,255,0.08)' : 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="3" r="1.2" fill="rgba(255,255,255,0.4)" />
              <circle cx="7" cy="7" r="1.2" fill="rgba(255,255,255,0.4)" />
              <circle cx="7" cy="11" r="1.2" fill="rgba(255,255,255,0.4)" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-9 z-20 rounded-xl overflow-hidden w-40 py-1"
              style={{
                background: '#1E1E2A',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}
            >
              {[
                { label: 'Rename', action: () => { setEditing(true); setMenuOpen(false); } },
                { label: 'Duplicate', action: () => { onDuplicate(); setMenuOpen(false); } },
                { label: funnel.archived ? 'Unarchive' : 'Archive', action: () => { onArchive(); setMenuOpen(false); } },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors duration-100"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded steps */}
      {expanded && (
        <div
          className="px-4 pb-4 space-y-2 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="pt-3 space-y-2">
            {funnel.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-black mt-0.5"
                  style={{ background: STAGE_COLORS[step.stage] ?? '#F59E0B' }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                    style={{ color: STAGE_COLORS[step.stage] ?? '#F59E0B' }}>
                    {step.stage}
                  </p>
                  <p className="text-xs text-white/65 leading-relaxed">{step.action}</p>
                  {step.cta && (
                    <p className="text-[11px] text-white/35 mt-1 italic">"{step.cta}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}