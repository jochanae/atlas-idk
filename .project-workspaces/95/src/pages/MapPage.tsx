import { useNavigate } from 'react-router-dom';
import { useFunnelStore } from '../hooks/useFunnelStore';

const STEP_COLORS = ['#F59E0B', '#D97706', '#92400E'];

export default function MapPage() {
  const { funnels } = useFunnelStore();
  const navigate = useNavigate();
  const active = funnels.filter((f) => !f.archived);

  return (
    <div className="px-4 pt-5 pb-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white tracking-tight">Map</h1>
        <p className="text-xs text-white/40 mt-0.5">Visual flow of your active funnels</p>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-white/30 text-sm text-center">No active funnels to map.</p>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-amber-400 underline underline-offset-2"
          >
            Create one →
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {active.map((funnel) => (
            <div
              key={funnel.id}
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <p className="text-sm font-semibold text-white">{funnel.name}</p>
              <div className="space-y-2">
                {funnel.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    {/* Step indicator */}
                    <div
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black mt-0.5"
                      style={{ background: STEP_COLORS[i] ?? STEP_COLORS[2] }}
                    >
                      {i + 1}
                    </div>
                    {/* Connector + content */}
                    <div className="flex-1">
                      <div
                        className="rounded-xl p-3"
                        style={{
                          background: `rgba(245,158,11,${0.06 - i * 0.015})`,
                          border: `1px solid rgba(245,158,11,${0.15 - i * 0.04})`,
                        }}
                      >
                        <p className="text-xs font-medium text-amber-400 uppercase tracking-wide mb-1">
                          {step.stage}
                        </p>
                        <p className="text-xs text-white/70 leading-relaxed">{step.action}</p>
                        {step.cta && (
                          <p className="text-[11px] text-white/40 mt-1.5 italic">CTA: {step.cta}</p>
                        )}
                      </div>
                      {/* Connector line */}
                      {i < funnel.steps.length - 1 && (
                        <div
                          className="w-px h-3 ml-2.5"
                          style={{ background: 'rgba(245,158,11,0.2)' }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}