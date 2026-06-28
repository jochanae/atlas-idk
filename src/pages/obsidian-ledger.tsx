import { useState, useEffect, useCallback } from "react";

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function fmt(cents: number): string {
    const val = cents / 100;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
  }

  function authFetch(path: string, opts: RequestInit = {}) {
    const token = (() => { try { return localStorage.getItem("atlas-auth-token") ?? ""; } catch { return ""; } })();
    return fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
  }

  interface CatSummary { category: string; count: number; total_cents: string | number }
  interface SparkPoint  { hour: string; delta_cents: string | number }
  interface Summary     { totalCents: number; assetCount: number; byCategory: CatSummary[]; sparkline: SparkPoint[] }
  interface Asset       { id: number; name: string; category: string; value_cents: number; notes: string | null; created_at: string }
  interface Txn         { id: number; asset_id: number | null; action: string; amount_cents: number; note: string | null; created_at: string; asset_name: string | null; asset_category: string | null }

  function Sparkline({ data, width = 140, height = 44, positive = true }: {
    data: SparkPoint[]; width?: number; height?: number; positive?: boolean;
  }) {
    if (!data || data.length < 2) return <svg width={width} height={height} />;
    const vals = data.map(d => Number(d.delta_cents));
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * width;
      const y = height - ((v - min) / range) * (height * 0.8) - height * 0.1;
      return `${x},${y}`;
    });
    const pathD = "M " + pts.join(" L ");
    const color = positive ? "#7ec87e" : "#c87e7e";
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${pathD} L ${width},${height} L 0,${height} Z`} fill="url(#spark-fill)" />
        <path d={pathD} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const CAT_COLORS: Record<string, string> = {
    Cash: "#d4a017", Equity: "#7ec8c8", "Real Estate": "#c87ec8",
    Collectibles: "#c8a07e", Crypto: "#7e9cc8", Other: "#8ba8a0",
  };
  function catColor(c: string) { return CAT_COLORS[c] ?? "#8ba8a0"; }

  function DistributionRing({ cats, activeId, onSelect }: {
    cats: CatSummary[]; activeId: string | null; onSelect: (id: string | null) => void;
  }) {
    const size = 180, cx = 90, cy = 90, outerR = 80, innerR = 52, gap = 0.04;
    const total = cats.reduce((s, c) => s + Number(c.total_cents), 0) || 1;
    let cumAngle = -Math.PI / 2;
    const segs = cats.map(cat => {
      const pct = Number(cat.total_cents) / total;
      const angle = pct * 2 * Math.PI - gap;
      const start = cumAngle + gap / 2, end = start + angle;
      cumAngle += pct * 2 * Math.PI;
      const x1 = cx + outerR * Math.cos(start), y1 = cy + outerR * Math.sin(start);
      const x2 = cx + outerR * Math.cos(end),   y2 = cy + outerR * Math.sin(end);
      const x3 = cx + innerR * Math.cos(end),   y3 = cy + innerR * Math.sin(end);
      const x4 = cx + innerR * Math.cos(start), y4 = cy + innerR * Math.sin(start);
      const large = angle > Math.PI ? 1 : 0;
      const pathD = [`M ${x1} ${y1}`, `A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`, `A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4}`, "Z"].join(" ");
      return { ...cat, pathD, color: catColor(cat.category) };
    });
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible", flexShrink: 0 }}>
        {segs.map(seg => {
          const isActive = activeId === seg.category;
          return (
            <g key={seg.category} onClick={() => onSelect(isActive ? null : seg.category)}
              style={{ cursor: "pointer", transform: isActive ? "scale(1.04)" : "scale(1)", transformOrigin: `${cx}px ${cy}px`, transition: "transform 0.2s ease, opacity 0.2s ease", opacity: activeId && !isActive ? 0.35 : 1 }}>
              <path d={seg.pathD} fill={`${seg.color}22`} stroke={seg.color} strokeWidth={isActive ? 1.5 : 0.8}
                style={{ filter: isActive ? `drop-shadow(0 0 8px ${seg.color})` : undefined }} />
            </g>
          );
        })}
        <text x={cx} y={cy - 7} textAnchor="middle" style={{ fill: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Cormorant Garamond, Georgia, serif", letterSpacing: "0.1em" }}>PORTFOLIO</text>
        <text x={cx} y={cy + 9} textAnchor="middle" style={{ fill: "#d4a017", fontSize: 9, fontFamily: "Inter, sans-serif" }}>{cats.length} CLASSES</text>
      </svg>
    );
  }

  const CATEGORIES = ["Cash", "Equity", "Real Estate", "Collectibles", "Crypto", "Other"];

  function AddAssetModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [name, setName]         = useState("");
    const [category, setCategory] = useState("Other");
    const [valueStr, setValueStr] = useState("");
    const [notes, setNotes]       = useState("");
    const [saving, setSaving]     = useState(false);
    const [err, setErr]           = useState("");

    async function handleSave() {
      if (!name.trim()) { setErr("Name is required."); return; }
      const dollars = parseFloat(valueStr.replace(/[$,]/g, ""));
      if (isNaN(dollars) || dollars < 0) { setErr("Enter a valid dollar value."); return; }
      setSaving(true);
      try {
        const res = await authFetch("/api/ledger/assets", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), category, valueCents: Math.round(dollars * 100), notes: notes.trim() || null }),
        });
        if (!res.ok) throw new Error(await res.text());
        onSaved(); onClose();
      } catch (e) { setErr(e instanceof Error ? e.message : "Failed to save"); setSaving(false); }
    }

    const inp: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "rgba(255,255,255,0.85)", padding: "10px 12px", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" };
    const lbl: React.CSSProperties = { fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 6 };

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div style={{ background: "#0e0f1e", border: "1px solid rgba(212,160,23,0.2)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "28px 20px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <span style={{ fontFamily: "Cormorant Garamond, Georgia, serif", fontSize: "1.25rem", color: "rgba(255,255,255,0.85)" }}>Add Asset</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div><span style={lbl}>Asset Name</span><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rolex Submariner ref. 126610" /></div>
            <div>
              <span style={lbl}>Category</span>
              <select style={{ ...inp, appearance: "none" as const }} value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><span style={lbl}>Current Value</span><input style={inp} value={valueStr} onChange={e => setValueStr(e.target.value)} placeholder="$0" inputMode="decimal" /></div>
            <div><span style={lbl}>Notes (optional)</span><input style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Condition, provenance, etc." /></div>
            {err && <p style={{ color: "#c87e7e", fontSize: "0.8rem", margin: 0 }}>{err}</p>}
            <button onClick={handleSave} disabled={saving} style={{ marginTop: 4, padding: "14px", borderRadius: 12, cursor: saving ? "not-allowed" : "pointer", background: "linear-gradient(180deg, #D4AF37 0%, #B8942A 100%)", border: "1px solid rgba(212,175,55,0.4)", color: "#0C0A09", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Add to Portfolio"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  export default function ObsidianLedger() {
    const [tab, setTab]             = useState<"overview" | "holdings" | "activity">("overview");
    const [summary, setSummary]     = useState<Summary | null>(null);
    const [assets, setAssets]       = useState<Asset[]>([]);
    const [txns, setTxns]           = useState<Txn[]>([]);
    const [loading, setLoading]     = useState(true);
    const [activeCat, setActiveCat] = useState<string | null>(null);
    const [showAdd, setShowAdd]     = useState(false);

    useEffect(() => {
      if (!document.getElementById("cg-font")) {
        const link = document.createElement("link");
        link.id = "cg-font"; link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&display=swap";
        document.head.appendChild(link);
      }
    }, []);

    const loadAll = useCallback(async () => {
      setLoading(true);
      try {
        const [sumRes, assRes, txnRes] = await Promise.all([
          authFetch("/api/ledger/summary"),
          authFetch("/api/ledger/assets"),
          authFetch("/api/ledger/transactions?limit=50"),
        ]);
        if (sumRes.ok) setSummary(await sumRes.json());
        if (assRes.ok) setAssets(await assRes.json());
        if (txnRes.ok) setTxns(await txnRes.json());
      } catch { /* silent */ }
      setLoading(false);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const totalCents = summary?.totalCents ?? 0;
    const assetCount = summary?.assetCount ?? 0;
    const cats       = summary?.byCategory ?? [];
    const sparkData  = summary?.sparkline  ?? [];
    const delta24h   = sparkData.reduce((s, d) => s + Number(d.delta_cents), 0);
    const isPositive = delta24h >= 0;
    const filteredAssets = activeCat ? assets.filter(a => a.category === activeCat) : assets;

    const ACTION_COLORS: Record<string, string> = {
      acquired: "#7ec87e", appreciated: "#7ec87e", depreciated: "#c87e7e", divested: "#c8a07e",
    };
    const goldGrad = "linear-gradient(135deg, #e8bc5a 0%, #d4a017 50%, #b8860b 100%)";
    const cgFont   = "Cormorant Garamond, Georgia, serif";

    return (
      <div style={{ minHeight: "100dvh", background: "radial-gradient(ellipse 120% 80% at 50% -10%, #0d0e1f 0%, #070709 50%, #050508 100%)", position: "relative", overflowX: "hidden" }}>
        <div aria-hidden style={{ position: "fixed", top: "-20%", left: "-10%", width: "60%", height: "50%", background: "radial-gradient(circle, rgba(212,160,23,0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
        <div aria-hidden style={{ position: "fixed", bottom: "10%", right: "-15%", width: "50%", height: "40%", background: "radial-gradient(circle, rgba(139,167,199,0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

        <header style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "48px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div>
            <p style={{ fontFamily: cgFont, fontSize: "1.05rem", fontWeight: 400, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>The Obsidian</p>
            <span style={{ fontFamily: cgFont, fontSize: "1.5rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", background: goldGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", display: "block", lineHeight: 1 }}>Ledger</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7ec87e", boxShadow: "0 0 6px #7ec87e", display: "inline-block" }} />
              <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.25)" }}>Live</span>
            </div>
            <button onClick={() => setShowAdd(true)} style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.25)", cursor: "pointer", color: "#d4a017", fontSize: 20, lineHeight: 1 }}>+</button>
          </div>
        </header>

        <div style={{ position: "relative", zIndex: 10, display: "flex", gap: 4, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          {(["overview", "holdings", "activity"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: 8, borderRadius: 10, fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s", background: tab === t ? "rgba(212,160,23,0.1)" : "transparent", border: tab === t ? "1px solid rgba(212,160,23,0.25)" : "1px solid transparent", color: tab === t ? "#d4a017" : "rgba(255,255,255,0.3)" }}>{t}</button>
          ))}
        </div>

        <main style={{ position: "relative", zIndex: 10, padding: "20px 20px 80px", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

          {tab === "overview" && (
            <>
              <div style={{ background: "rgba(212,160,23,0.05)", border: "1px solid rgba(212,160,23,0.2)", borderRadius: 16, padding: 24, boxShadow: "0 0 40px rgba(212,160,23,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(232,188,90,0.6)" }}>Total Portfolio Value</span>
                  <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.2)" }}>{assetCount} assets</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", margin: "12px 0 16px" }}>
                  <div>
                    <h1 style={{ fontFamily: cgFont, fontSize: "clamp(2.4rem,10vw,3.5rem)", letterSpacing: "-0.02em", background: goldGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1, margin: 0 }}>{loading ? "—" : fmt(totalCents)}</h1>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 500, color: isPositive ? "#7ec87e" : "#c87e7e" }}>{isPositive ? "▲" : "▼"} {fmt(Math.abs(delta24h))}</span>
                      <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 999, background: isPositive ? "rgba(126,200,126,0.1)" : "rgba(200,126,126,0.1)", border: `1px solid ${isPositive ? "rgba(126,200,126,0.25)" : "rgba(200,126,126,0.25)"}`, color: isPositive ? "#7ec87e" : "#c87e7e" }}>24h</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <Sparkline data={sparkData} positive={isPositive} />
                    <span style={{ fontSize: "0.65rem", color: "rgba(212,160,23,0.4)" }}>24hr trend</span>
                  </div>
                </div>
                <div style={{ height: 1, background: "linear-gradient(90deg, rgba(212,160,23,0.25), rgba(212,160,23,0.05))", marginBottom: 16 }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  {[{ label: "Assets", value: String(assetCount) }, { label: "Categories", value: String(cats.length) }, { label: "Holdings", value: fmt(totalCents) }].map(s => (
                    <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>{s.label}</span>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              {cats.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(232,188,90,0.6)", marginBottom: 12, marginTop: 0 }}>By Category</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {cats.map(cat => {
                      const color = catColor(cat.category);
                      const pct = totalCents ? Math.round((Number(cat.total_cents) / totalCents) * 100) : 0;
                      return (
                        <div key={cat.category} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${color}22`, borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, display: "inline-block" }} />
                              <span style={{ fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>{cat.category}</span>
                            </div>
                            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#d4a017" }}>{fmt(Number(cat.total_cents))}</span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 1 }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                            <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)" }}>{cat.count} items</span>
                            <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)" }}>{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!loading && assetCount === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <p style={{ fontFamily: cgFont, fontSize: "1.25rem", color: "rgba(255,255,255,0.3)" }}>Your portfolio awaits.</p>
                  <button onClick={() => setShowAdd(true)} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 12, background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.25)", color: "#d4a017", fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Add First Asset</button>
                </div>
              )}
            </>
          )}

          {tab === "holdings" && (
            <>
              {cats.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <DistributionRing cats={cats} activeId={activeCat} onSelect={setActiveCat} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
                      {cats.map(cat => {
                        const color = catColor(cat.category);
                        const isActive = activeCat === cat.category;
                        const pct = totalCents ? Math.round((Number(cat.total_cents) / totalCents) * 100) : 0;
                        return (
                          <button key={cat.category} onClick={() => setActiveCat(isActive ? null : cat.category)} style={{ textAlign: "left", borderRadius: 10, padding: "10px 12px", cursor: "pointer", transition: "all 0.2s", background: isActive ? `${color}12` : "rgba(255,255,255,0.02)", border: isActive ? `1px solid ${color}55` : "1px solid rgba(255,255,255,0.05)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, display: "inline-block" }} />
                                <span style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: isActive ? color : "rgba(255,255,255,0.4)" }}>{cat.category}</span>
                              </div>
                              <span style={{ fontSize: "0.65rem", color: isActive ? color : "rgba(255,255,255,0.3)" }}>{pct}%</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                              <span style={{ fontFamily: cgFont, fontSize: "1.1rem", color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)" }}>{fmt(Number(cat.total_cents))}</span>
                              <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.2)" }}>{cat.count}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>{activeCat ? `${activeCat} Holdings` : "All Holdings"}</span>
                  <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)" }}>{filteredAssets.length} items</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {loading && <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", fontSize: "0.85rem" }}>Loading…</p>}
                  {!loading && filteredAssets.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 0" }}>
                      <button onClick={() => setShowAdd(true)} style={{ padding: "12px 24px", borderRadius: 12, background: "rgba(212,160,23,0.1)", border: "1px solid rgba(212,160,23,0.25)", color: "#d4a017", fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Add Asset</button>
                    </div>
                  )}
                  {filteredAssets.map(asset => {
                    const color = catColor(asset.category);
                    return (
                      <div key={asset.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${color}22`, borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: cgFont, fontSize: "1rem", color: "rgba(255,255,255,0.85)", margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</p>
                            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", margin: 0 }}>{asset.category}{asset.notes ? ` · ${asset.notes}` : ""}</p>
                          </div>
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#d4a017", display: "block" }}>{fmt(asset.value_cents)}</span>
                            <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)" }}>{new Date(asset.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "activity" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(232,188,90,0.6)" }}>Transaction History</span>
                <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)" }}>{txns.length} entries</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {loading && <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", fontSize: "0.85rem" }}>Loading…</p>}
                {!loading && txns.length === 0 && <p style={{ color: "rgba(255,255,255,0.2)", textAlign: "center", fontSize: "0.85rem", padding: "32px 0" }}>No transactions yet.</p>}
                {txns.map(txn => {
                  const color = ACTION_COLORS[txn.action] ?? "rgba(255,255,255,0.4)";
                  return (
                    <div key={txn.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, display: "inline-block", flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 2px", fontSize: "0.875rem", color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{txn.note ?? txn.action}</p>
                        <p style={{ margin: 0, fontSize: "0.65rem", color: "rgba(255,255,255,0.25)" }}>{txn.asset_name ?? "—"} · {new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color, flexShrink: 0 }}>{fmt(txn.amount_cents)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 16 }}>
            <span style={{ color: "rgba(255,255,255,0.1)", fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: cgFont }}>✶ Private Portfolio Intelligence ✶</span>
          </div>
        </main>

        {showAdd && <AddAssetModal onClose={() => setShowAdd(false)} onSaved={loadAll} />}
      </div>
    );
  }
  