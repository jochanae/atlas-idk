import { useEffect, useMemo, useRef, useState } from "react";

type RailMessage = {
  role: "user" | "assistant";
  createdAt?: string;
  hasSurfacedMemory?: boolean;
};

type Bucket = {
  label: string;
  firstIdx: number;
  count: number;
};

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
  if (t >= weekStart) {
    return new Date(t).toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  }
  // Older — use MMM D
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
}

function bucketize(messages: RailMessage[]): Bucket[] {
  const now = Date.now();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date(now));
  const yesterday = today - 86_400_000;
  const weekStart = today - 6 * 86_400_000;

  const buckets: Record<string, Bucket> = {};
  const order = ["Today", "Yesterday", "This week", "Older"];

  messages.forEach((m, i) => {
    if (m.role !== "assistant") return;
    const t = m.createdAt ? new Date(m.createdAt).getTime() : now;
    let label = "Older";
    if (t >= today) label = "Today";
    else if (t >= yesterday) label = "Yesterday";
    else if (t >= weekStart) label = "This week";
    if (!buckets[label]) buckets[label] = { label, firstIdx: i, count: 0 };
    buckets[label].count += 1;
  });

  return order.filter((l) => buckets[l]).map((l) => buckets[l]);
}

export function TimelineRail({
  messages,
  topOffset = 92,
  bottomOffset = 90,
}: {
  messages: RailMessage[];
  topOffset?: number;
  bottomOffset?: number;
}) {
  const [showOverlay, setShowOverlay] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  // Each tick carries the day label of its message + a boolean for "first of this day".
  const ticks = useMemo(() => {
    const now = Date.now();
    const out: {
      idx: number;
      role: "user" | "assistant";
      label: string;
      isNewDay: boolean;
      hasMemory: boolean;
    }[] = [];
    let prevLabel: string | null = null;
    messages.forEach((m, i) => {
      if (m.role !== "assistant") return;
      const t = m.createdAt ? new Date(m.createdAt).getTime() : now;
      const label = dayLabel(t, now);
      out.push({
        idx: i,
        role: m.role,
        label,
        isNewDay: label !== prevLabel,
        hasMemory: !!m.hasSurfacedMemory,
      });
      prevLabel = label;
    });
    return out;
  }, [messages]);

  const buckets = useMemo(() => bucketize(messages), [messages]);

  useEffect(
    () => () => {
      if (longPressRef.current) window.clearTimeout(longPressRef.current);
    },
    [],
  );

  if (ticks.length === 0) return null;

  const scrollTo = (idx: number) => {
    const el = document.querySelector<HTMLElement>(`[data-msg-idx="${idx}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const startPress = () => {
    didLongPressRef.current = false;
    longPressRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      setShowOverlay(true);
    }, 480);
  };
  const endPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };

  return (
    <>
      <div
        aria-label="Conversation timeline"
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        style={{
          position: "fixed",
          top: topOffset,
          bottom: bottomOffset,
          right: 0,
          // Widen the hit/render column so inline day chips have room to the left of the spine.
          width: 72,
          zIndex: 18,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-evenly",
          padding: "8px 0",
          pointerEvents: "auto",
          opacity: 0.95,
        }}
      >
        {/* spine */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            right: 6,
            width: 1,
            background:
              "linear-gradient(180deg, transparent 0%, rgba(201,162,76,0.25) 12%, rgba(201,162,76,0.35) 50%, rgba(201,162,76,0.25) 88%, transparent 100%)",
            pointerEvents: "none",
          }}
        />
        {ticks.map((t) => (
          <div
            key={t.idx}
            style={{
              position: "relative",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
              padding: "2px 0",
            }}
          >
            {/* Day chip — only on the first tick of a new day, inline to the LEFT of the spine */}
            {t.isNewDay && (
              <span
                aria-hidden
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "rgba(201,162,76,0.55)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: "1px solid rgba(201,162,76,0.18)",
                  background: "rgba(20,17,14,0.55)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                  pointerEvents: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </span>
            )}

            {/* Memory recall marker — shown when this assistant message surfaced a ledger memory */}
            {t.hasMemory && (
              <span
                aria-label="Memory surfaced"
                style={{
                  fontSize: 10,
                  lineHeight: 1,
                  color: "rgba(201,162,76,0.85)",
                  pointerEvents: "none",
                  userSelect: "none",
                  textShadow: "0 0 6px rgba(201,162,76,0.5)",
                }}
              >
                ✦
              </span>
            )}

            {/* The interactive tick itself, sitting on the spine */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (didLongPressRef.current) return;
                scrollTo(t.idx);
              }}
              title={`Jump to message ${t.idx + 1}`}
              aria-label={`Jump to message ${t.idx + 1}`}
              style={{
                position: "relative",
                zIndex: 1,
                background: "transparent",
                border: "none",
                padding: "4px 4px",
                margin: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 6,
                  height: 2,
                  background: "rgba(201,162,76,0.7)",
                  borderRadius: 1,
                  transition: "width 140ms ease, background 140ms ease",
                }}
              />
            </button>
          </div>
        ))}
      </div>

      {showOverlay && (
        <div
          role="dialog"
          aria-label="Jump to timeframe"
          onClick={() => setShowOverlay(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 28px 0 0",
            animation: "fadeIn 160ms ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(20,17,14,0.96)",
              border: "1px solid rgba(201,162,76,0.28)",
              borderRadius: 10,
              padding: "10px 6px",
              minWidth: 180,
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(201,162,76,0.6)",
                padding: "4px 12px 8px",
              }}
            >
              Jump to
            </div>
            {buckets.length === 0 ? (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--atlas-muted)" }}>
                No history yet.
              </div>
            ) : (
              buckets.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => {
                    setShowOverlay(false);
                    scrollTo(b.firstIdx);
                  }}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "8px 12px",
                    background: "transparent",
                    border: "none",
                    color: "var(--atlas-fg)",
                    fontFamily: "var(--app-font-sans)",
                    fontSize: 13,
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(201,162,76,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span>{b.label}</span>
                  <span style={{ fontSize: 10, color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)" }}>
                    {b.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
