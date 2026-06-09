import { useEffect, useMemo, useRef, useState } from "react";

type RailMessage = {
  role: "user" | "assistant";
  createdAt?: string;
  hasSurfacedMemory?: boolean;
  text?: string;
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
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const longPressRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Sorted list of message indices that contain the query.
  const matchList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    const out: number[] = [];
    messages.forEach((m, i) => {
      if (m.text && m.text.toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }, [messages, query]);
  const matchingIdx = useMemo(() => new Set(matchList), [matchList]);

  useEffect(() => {
    if (showSearch) {
      const t = window.setTimeout(() => searchInputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [showSearch]);

  // ── DOM highlight effect: wrap query matches inside every chat bubble with a
  // <mark class="atlas-search-hit"> span; tear down cleanly when query clears.
  useEffect(() => {
    const HIT_CLASS = "atlas-search-hit";
    const HIT_ACTIVE = "atlas-search-hit--active";

    const unwrapAll = () => {
      document.querySelectorAll<HTMLElement>(`.${HIT_CLASS}`).forEach((el) => {
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        (parent as HTMLElement).normalize?.();
      });
    };

    unwrapAll();
    const q = query.trim();
    if (!q) return;

    const lower = q.toLowerCase();
    const roots = document.querySelectorAll<HTMLElement>("[data-msg-idx]");
    roots.forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest("script,style,textarea,input")) return NodeFilter.FILTER_REJECT;
          if (parent.classList.contains(HIT_CLASS)) return NodeFilter.FILTER_REJECT;
          return node.nodeValue.toLowerCase().includes(lower) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const targets: Text[] = [];
      let n: Node | null = walker.nextNode();
      while (n) { targets.push(n as Text); n = walker.nextNode(); }

      targets.forEach((textNode) => {
        const text = textNode.nodeValue ?? "";
        const lowerText = text.toLowerCase();
        const frag = document.createDocumentFragment();
        let i = 0;
        while (i < text.length) {
          const found = lowerText.indexOf(lower, i);
          if (found === -1) {
            frag.appendChild(document.createTextNode(text.slice(i)));
            break;
          }
          if (found > i) frag.appendChild(document.createTextNode(text.slice(i, found)));
          const mark = document.createElement("mark");
          mark.className = HIT_CLASS;
          mark.textContent = text.slice(found, found + lower.length);
          frag.appendChild(mark);
          i = found + lower.length;
        }
        textNode.parentNode?.replaceChild(frag, textNode);
      });
    });

    // Tag the active match for distinct styling.
    document.querySelectorAll(`.${HIT_ACTIVE}`).forEach((el) => el.classList.remove(HIT_ACTIVE));
    const activeMsgIdx = matchList[cursor];
    if (activeMsgIdx !== undefined) {
      const el = document.querySelector<HTMLElement>(`[data-msg-idx="${activeMsgIdx}"]`);
      el?.querySelector(`.${HIT_CLASS}`)?.classList.add(HIT_ACTIVE);
    }

    return () => { unwrapAll(); };
  }, [query, matchList, cursor]);

  // Reset cursor when the match set changes.
  useEffect(() => { setCursor(0); }, [query]);



  // Track which message is closest to vertical viewport center.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const compute = () => {
      const centerY = window.innerHeight / 2;
      let best = -1;
      let bestDist = Infinity;
      const nodes = document.querySelectorAll<HTMLElement>("[data-msg-idx]");
      nodes.forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const mid = (r.top + r.bottom) / 2;
        const d = Math.abs(mid - centerY);
        if (d < bestDist) {
          bestDist = d;
          best = Number(n.getAttribute("data-msg-idx"));
        }
      });
      setFocusIdx(best);
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => { raf = 0; compute(); });
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true } as any);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [messages.length]);


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
          width: 96,
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
          className="atlas-rail-spine"
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            right: 10,
            width: 1,
            pointerEvents: "none",
          }}
        />
        {/* Search affordance — minimalist trigger pinned at the top of the rail */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowSearch((v) => !v);
          }}
          title="Search this thread"
          aria-label="Search this thread"
          style={{
            position: "absolute",
            top: -2,
            right: 0,
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "var(--atlas-search-btn-bg, rgba(20,17,14,0.72))",
            border: "1px solid var(--atlas-search-btn-border, rgba(201,162,76,0.45))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(6px)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
            zIndex: 2,
            padding: 0,
            color: "var(--atlas-search-btn-fg, rgba(201,162,76,0.95))",
            transition: "transform 140ms ease, background 140ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.2" y2="16.2" />
          </svg>
        </button>

        {ticks.map((t) => {
          const isMatch = matchingIdx.has(t.idx);
          // Accordion: distance from currently-focused message governs presence.
          const dist = focusIdx < 0 ? 99 : Math.abs(focusIdx - t.idx);
          const isExactFocus = dist === 0;
          const isNearFocus = dist <= 2;
          const tickWidth = isMatch ? 12 : isExactFocus ? 14 : isNearFocus ? 8 : 4;
          const tickHeight = isExactFocus ? 3 : 2;
          const tickOpacity = isMatch ? 1 : isExactFocus ? 1 : isNearFocus ? 0.65 : 0.22;
          const rowPaddingY = isExactFocus ? 4 : isNearFocus ? 2 : 0;
          const chipOpacity = isExactFocus ? 1 : isNearFocus ? 0.55 : 0.18;
          const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
          return (
          <div
            key={t.idx}
            style={{
              position: "relative",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
              padding: `${rowPaddingY}px 0`,
              opacity: tickOpacity,
              transform: isMatch ? "scale(1.2)" : "scale(1)",
              transition: `padding 280ms ${ease}, opacity 280ms ${ease}, transform 220ms ${ease}`,
            }}
          >
            {/* Day chip — only on the first tick of a new day, inline to the LEFT of the spine */}
            {t.isNewDay && (
              <span
                aria-hidden
                className="atlas-rail-daychip"
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: "1px solid var(--atlas-border)",
                  background: "var(--atlas-surface)",
                  color: "var(--atlas-fg)",
                  backdropFilter: "blur(6px)",
                  pointerEvents: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  opacity: chipOpacity,
                  transform: isExactFocus ? "translateX(0)" : "translateX(-4px)",
                  transition: `opacity 240ms ${ease}, transform 240ms ${ease}`,
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
                  opacity: isNearFocus ? 1 : 0.4,
                  transition: `opacity 240ms ${ease}`,
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
                  width: tickWidth,
                  height: tickHeight,
                  background: isMatch
                    ? "rgba(245,200,110,1)"
                    : isExactFocus
                      ? "var(--atlas-gold, rgba(217,160,80,1))"
                      : "rgba(201,162,76,0.7)",
                  borderRadius: 1,
                  boxShadow: isMatch
                    ? "0 0 10px rgba(245,200,110,0.7)"
                    : isExactFocus
                      ? "0 0 8px rgba(217,160,80,0.5)"
                      : "none",
                  transition: `width 280ms ${ease}, height 280ms ${ease}, background 220ms ${ease}, box-shadow 220ms ${ease}`,
                }}
              />
            </button>
          </div>
          );
        })}
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
              background: "var(--atlas-bg)",
              border: "1px solid var(--atlas-border)",
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

      {showSearch && (
        <div
          style={{
            position: "fixed",
            top: topOffset - 6,
            right: 40,
            zIndex: 210,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            background: "var(--atlas-bg)",
            border: "1px solid var(--atlas-border)",
            borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            minWidth: 280,
            animation: "fadeIn 140ms ease",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,76,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.2" y2="16.2" />
          </svg>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowSearch(false);
                setQuery("");
              } else if (e.key === "Enter") {
                if (matchList.length === 0) return;
                const dir = e.shiftKey ? -1 : 1;
                const next = (cursor + dir + matchList.length) % matchList.length;
                setCursor(next);
                scrollTo(matchList[next]);
              }
            }}
            placeholder="Search this thread"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--atlas-fg)",
              fontFamily: "var(--app-font-sans)",
              fontSize: 13,
            }}
          />
          <span
            style={{
              fontFamily: "var(--app-font-mono)",
              fontSize: 10,
              color: matchList.length ? "rgba(201,162,76,0.85)" : "rgba(201,162,76,0.4)",
              minWidth: 36,
              textAlign: "right",
              whiteSpace: "nowrap",
            }}
          >
            {query.trim() ? (matchList.length ? `${cursor + 1} / ${matchList.length}` : "0 / 0") : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              if (matchList.length === 0) return;
              const next = (cursor - 1 + matchList.length) % matchList.length;
              setCursor(next);
              scrollTo(matchList[next]);
            }}
            aria-label="Previous match"
            disabled={matchList.length === 0}
            style={{ background: "transparent", border: "none", color: "var(--atlas-muted)", cursor: matchList.length ? "pointer" : "not-allowed", padding: "0 2px", opacity: matchList.length ? 1 : 0.4 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 8L6 5 3 8" /></svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (matchList.length === 0) return;
              const next = (cursor + 1) % matchList.length;
              setCursor(next);
              scrollTo(matchList[next]);
            }}
            aria-label="Next match"
            disabled={matchList.length === 0}
            style={{ background: "transparent", border: "none", color: "var(--atlas-muted)", cursor: matchList.length ? "pointer" : "not-allowed", padding: "0 2px", opacity: matchList.length ? 1 : 0.4 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4l3 3 3-3" /></svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              setQuery("");
            }}
            aria-label="Close search"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--atlas-muted)",
              cursor: "pointer",
              fontSize: 14,
              padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>
      )}

    </>
  );
}
