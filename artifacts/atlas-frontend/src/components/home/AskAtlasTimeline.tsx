import { useMemo } from "react";

type Msg = { createdAt?: string };

function dayLabel(t: number, now: number): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const weekStart = today - 6 * 86_400_000;
  if (t >= today) return "TODAY";
  if (t >= yesterday) return "YESTERDAY";
  if (t >= weekStart)
    return new Date(t).toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  return new Date(t)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();
}

export function AskAtlasTimeline({ messages }: { messages: Msg[] }) {
  const dots = useMemo(() => {
    const now = Date.now();
    const key = (ms: number) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const seen = new Map<string, string>();
    messages.forEach((m) => {
      const t = m.createdAt ? new Date(m.createdAt).getTime() : now;
      const k = key(t);
      if (!seen.has(k)) seen.set(k, dayLabel(t, now));
    });
    return Array.from(seen.entries()).map(([k, label]) => ({ k, label }));
  }, [messages]);

  if (dots.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "calc(var(--atlas-header-height, 56px) + 12px)",
        bottom: "calc(var(--atlas-dock-height, 64px) + 12px)",
        right: 0,
        width: 56,
        zIndex: 9000,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      {/* Gold thread */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 10,
          width: 1,
          background:
            "linear-gradient(to bottom, transparent, rgba(201,162,76,0.4) 8%, rgba(201,162,76,0.4) 92%, transparent)",
        }}
      />

      {/* Day labels */}
      <div
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: dots.length <= 3 ? "space-around" : "space-between",
          padding: "8px 0",
        }}
      >
        {dots.map(({ k, label }) => (
          <div
            key={k}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 5,
              paddingRight: 6,
            }}
          >
            <span
              style={{
                fontFamily: "var(--app-font-mono, monospace)",
                fontSize: 8,
                fontWeight: 500,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                padding: "2px 5px",
                borderRadius: 3,
                border: "1px solid rgba(201,162,76,0.5)",
                background: "rgba(8,8,12,0.9)",
                color: "rgba(201,162,76,0.9)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "rgba(201,162,76,0.8)",
                border: "1px solid rgba(201,162,76,1)",
                boxShadow: "0 0 8px rgba(201,162,76,0.55)",
                flexShrink: 0,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
