import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Funnels',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M3 4h14M5 8h10M7 12h6M9 16h2"
          stroke={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    path: '/metrics',
    label: 'Metrics',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="11" width="3" height="6" rx="1" fill={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'} />
        <rect x="8.5" y="7" width="3" height="10" rx="1" fill={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'} />
        <rect x="14" y="3" width="3" height="14" rx="1" fill={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'} />
      </svg>
    ),
  },
  {
    path: '/links',
    label: 'Links',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M8 12a4 4 0 005.657 0l2-2a4 4 0 00-5.657-5.657l-1 1"
          stroke={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M12 8a4 4 0 00-5.657 0l-2 2a4 4 0 005.657 5.657l1-1"
          stroke={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    path: '/insights',
    label: 'Insights',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'} strokeWidth="1.75" />
        <path
          d="M10 6v4l3 2"
          stroke={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    path: '/map',
    label: 'Map',
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M2 5l5-2 6 3 5-2v12l-5 2-6-3-5 2V5z"
          stroke={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7 3v12M13 6v12" stroke={active ? '#F59E0B' : 'rgba(255,255,255,0.35)'} strokeWidth="1.75" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-2"
      style={{
        background: 'rgba(10,10,15,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-150 min-w-[56px]"
            style={{
              background: active ? 'rgba(245,158,11,0.1)' : 'transparent',
            }}
          >
            {item.icon(active)}
            <span
              className="text-[10px] font-medium tracking-wide"
              style={{ color: active ? '#F59E0B' : 'rgba(255,255,255,0.35)' }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}