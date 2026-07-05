export default function Header() {
  return (
    <header className="sticky top-0 z-50 px-5 py-4 flex items-center justify-between"
      style={{
        background: 'linear-gradient(180deg, rgba(10,10,15,0.98) 0%, rgba(10,10,15,0.85) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L9 5H13L10 8L11 12L7 10L3 12L4 8L1 5H5L7 1Z" fill="white" />
          </svg>
        </div>
        <span className="text-sm font-semibold tracking-wide text-white">FunnelOS</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
        <span className="text-xs text-white/40 tracking-wide">Live</span>
      </div>
    </header>
  );
}