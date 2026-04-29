import { Link, useRouterState } from "@tanstack/react-router";

const ITEMS = [
  {
    to: "/" as const,
    label: "Workspace",
    icon: (
      <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.4}>
        <path d="M3.5 4.5h13v11h-13z" />
        <path d="M7.5 4.5v11M3.5 8h13" />
      </svg>
    ),
  },
  {
    to: "/ledger" as const,
    label: "Ledger",
    icon: (
      <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.4}>
        <path d="M5 3.5h10v13H5z" />
        <path d="M7.5 6.5h5M7.5 9.5h5M7.5 12.5h3" />
      </svg>
    ),
  },
  {
    to: "/think-freely" as const,
    label: "Think Freely",
    icon: (
      <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.4}>
        <path d="M10 3v14M3 10h14" />
        <circle cx="10" cy="10" r="6.5" />
      </svg>
    ),
  },
];

export function AtlasNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      {/* Bottom tabs (mobile <768) */}
      <nav
        aria-label="Atlas"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around"
        style={{
          background: "rgba(12, 10, 9, 0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "0.5px solid #2C2926",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {ITEMS.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className="flex flex-col items-center gap-1 py-2 px-4"
              style={{ color: active ? "#EA580C" : "#78716C" }}
            >
              {item.icon}
              <span className="font-mono text-[9px] uppercase tracking-[0.1em]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Left rail (desktop ≥768) */}
      <nav
        aria-label="Atlas"
        className="hidden md:flex fixed top-0 left-0 bottom-0 z-40 w-14 flex-col items-center py-4 gap-2"
        style={{
          background: "#0C0A09",
          borderRight: "0.5px solid #2C2926",
        }}
      >
        {ITEMS.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.label}
              className="flex h-10 w-10 items-center justify-center rounded-md transition-colors"
              style={{
                color: active ? "#EA580C" : "#78716C",
                background: active ? "#1C1917" : "transparent",
              }}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
