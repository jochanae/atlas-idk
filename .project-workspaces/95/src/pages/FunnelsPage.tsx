import { useState } from 'react';
import FunnelPrompt from '../components/FunnelPrompt';
import FunnelCard from '../components/FunnelCard';
import { useFunnelStore } from '../hooks/useFunnelStore';

export default function FunnelsPage() {
  const { funnels, archiveFunnel, duplicateFunnel, updateFunnel } = useFunnelStore();
  const [filter, setFilter] = useState<'active' | 'archived'>('active');

  const visible = funnels.filter((f) =>
    filter === 'active' ? !f.archived : f.archived
  );

  return (
    <div className="px-4 pt-5 pb-6 space-y-5">
      {/* Hero prompt */}
      <FunnelPrompt />

      {/* Filter toggle */}
      <div className="flex gap-2">
        {(['active', 'archived'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className="px-4 py-1.5 rounded-full text-xs font-medium tracking-wide capitalize transition-all duration-150"
            style={{
              background: filter === tab ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              color: filter === tab ? '#F59E0B' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${filter === tab ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            {tab}
            <span className="ml-1.5 opacity-60">
              {filter === tab
                ? visible.length
                : funnels.filter((f) => (tab === 'active' ? !f.archived : f.archived)).length}
            </span>
          </button>
        ))}
      </div>

      {/* Funnel list */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M6 10h12M8 14h8M10 18h4" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-white/40 text-sm text-center">
            {filter === 'active' ? 'No active funnels yet.\nDescribe your offer above.' : 'No archived funnels.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((funnel) => (
            <FunnelCard
              key={funnel.id}
              funnel={funnel}
              onArchive={() => archiveFunnel(funnel.id)}
              onDuplicate={() => duplicateFunnel(funnel.id)}
              onUpdate={(updates) => updateFunnel(funnel.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  );
}