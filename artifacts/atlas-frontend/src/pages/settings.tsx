import { useState } from "react";
import { useCapacity, type CapacityTier } from "@/hooks/useCapacity";
import { CapacityTranslation } from "@/components/capacity/CapacityTranslation";

/**
 * Settings — split into two tabs.
 *  - Manage Plan: subscription tier, seats, billing portal handoff.
 *  - Capacity:    execution capacity, top-ups, translation, history link.
 *
 * Draft surface. Wired to the mocked useCapacity() hook. No enforcement,
 * no Stripe wiring. All action buttons are stubs until backend + billing land.
 */

type TabKey = "plan" | "capacity";

const TIER_META: Record<CapacityTier, { label: string; price: string; blurb: string }> = {
  explorer: { label: "Explorer", price: "$0",  blurb: "Unlimited thinking. Light execution to try things out." },
  pro:      { label: "Pro",      price: "$29", blurb: "For serious builders. 150 executions / month." },
  studio:   { label: "Studio",   price: "$79", blurb: "For heavy shippers. 600 executions, priority models." },
  teams:    { label: "Teams",    price: "$39/seat", blurb: "Shared pool, SSO, shared ledger. Min 3 seats." },
};

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("plan");

  return (
    <main
      className="min-h-screen px-6 py-10 text-white"
      style={{
        background:
          "radial-gradient(circle at 50% 0%, rgba(201,162,76,0.10), transparent 34%), #0C0A09",
        fontFamily: "var(--app-font-sans)",
      }}
    >
      <div className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.34em] text-[#C9A24C]">
          Settings
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-[#F5ECDD] md:text-4xl">
          Your workspace
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/55">
          Manage your subscription and see how much execution capacity you have this period.
        </p>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="mt-8 inline-flex rounded-xl border border-white/10 bg-black/30 p-1 backdrop-blur"
        >
          <TabButton active={tab === "plan"}     onClick={() => setTab("plan")}>Manage Plan</TabButton>
          <TabButton active={tab === "capacity"} onClick={() => setTab("capacity")}>Capacity</TabButton>
        </div>

        <div className="mt-6">
          {tab === "plan"     && <PlanTab />}
          {tab === "capacity" && <CapacityTab />}
        </div>
      </div>
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-lg transition-colors ${
        active
          ? "bg-[#C9A24C]/15 text-[#F5ECDD] border border-[#C9A24C]/30"
          : "text-white/60 hover:text-white/90 border border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

// ── Manage Plan ──────────────────────────────────────────────────────────────

function PlanTab() {
  const { snapshot } = useCapacity();
  const currentTier = snapshot?.tier ?? "explorer";

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-white/40">Current plan</div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-semibold text-[#F5ECDD]">{TIER_META[currentTier].label}</span>
              <span className="text-sm text-[#C9A24C]">{TIER_META[currentTier].price}</span>
            </div>
            <p className="mt-2 max-w-md text-sm text-white/60">{TIER_META[currentTier].blurb}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StubButton primary>Manage billing</StubButton>
            <StubButton>Change plan</StubButton>
          </div>
        </div>
      </Panel>

      <div>
        <div className="mb-3 text-xs uppercase tracking-[0.28em] text-white/40">All plans</div>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(TIER_META) as CapacityTier[]).map((tier) => (
            <PlanCard key={tier} tier={tier} current={tier === currentTier} />
          ))}
        </div>
      </div>

      <Panel>
        <div className="text-xs uppercase tracking-[0.28em] text-white/40">Billing</div>
        <div className="mt-3 space-y-2 text-sm text-white/70">
          <Row label="Next invoice" value="—" />
          <Row label="Payment method" value="Not connected" />
          <Row label="Billing email" value="—" />
        </div>
        <p className="mt-4 text-xs text-white/40">
          Billing lands in a later phase. Buttons are placeholders until Stripe is wired.
        </p>
      </Panel>

      <ActivationReplayPanel />
    </div>
  );
}

function ActivationReplayPanel() {
  const [status, setStatus] = useState<"idle" | "armed">(() => {
    try {
      return localStorage.getItem("atlas-activation-seen") === "1" ? "idle" : "armed";
    } catch { return "idle"; }
  });

  const replay = () => {
    try {
      localStorage.removeItem("atlas-activation-seen");
      localStorage.removeItem("atlas-last-sign-in");
    } catch {}
    setStatus("armed");
  };

  const preview = () => {
    try { sessionStorage.setItem("atlas-activation-mode", "full"); } catch {}
    window.location.assign("/activate");
  };

  return (
    <Panel>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#F5ECDD]">Sign-in animation</div>
          <p className="mt-1 max-w-md text-xs text-white/55">
            The activation sequence plays on your first sign-in and returns as a short
            welcome-back after 30 days away. You can replay it any time.
          </p>
          {status === "armed" && (
            <p className="mt-2 text-[11px] text-[#C9A24C]">
              Armed — the full sequence will play on your next sign-in.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={preview}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition-colors"
          >
            Preview now
          </button>
          <button
            type="button"
            onClick={replay}
            className="rounded-md border border-[#C9A24C]/40 bg-[#C9A24C]/15 px-3 py-1.5 text-xs text-[#F5ECDD] hover:bg-[#C9A24C]/25 transition-colors"
          >
            Replay on next sign-in
          </button>
        </div>
      </div>
    </Panel>);
}

function PlanCard({ tier, current }: { tier: CapacityTier; current: boolean }) {
  const meta = TIER_META[tier];
  return (
    <div
      className={`rounded-xl border p-4 backdrop-blur ${
        current ? "border-[#C9A24C]/45 bg-[#C9A24C]/[0.06]" : "border-white/10 bg-black/30"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-[#F5ECDD]">{meta.label}</div>
        <div className="text-sm text-[#C9A24C]">{meta.price}</div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/55">{meta.blurb}</p>
      <div className="mt-3">
        {current ? (
          <span className="text-[11px] uppercase tracking-[0.22em] text-[#C9A24C]/80">Current</span>
        ) : (
          <StubButton small>Switch to {meta.label}</StubButton>
        )}
      </div>
    </div>
  );
}

// ── Capacity ─────────────────────────────────────────────────────────────────

function CapacityTab() {
  const { snapshot, percentRemaining } = useCapacity();
  if (!snapshot) return <Panel>Loading capacity…</Panel>;

  const monthlyPct = Math.round((snapshot.remaining / Math.max(1, snapshot.total)) * 100);
  const dailyPct = snapshot.dailyTotal
    ? Math.round((snapshot.dailyRemaining / snapshot.dailyTotal) * 100)
    : 100;

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-[0.28em] text-white/40">This period</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-[#F5ECDD]">{snapshot.remaining}</span>
              <span className="text-sm text-white/50">/ {snapshot.total} execution credits</span>
            </div>
            <Meter value={monthlyPct} />
            <div className="mt-2 text-xs text-white/45">
              Resets {formatDate(snapshot.resetsAt)}
            </div>
          </div>

          {snapshot.dailyTotal > 0 && (
            <div className="w-full md:w-56">
              <div className="text-xs uppercase tracking-[0.28em] text-white/40">Today</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-[#F5ECDD]">
                  {snapshot.dailyRemaining}
                </span>
                <span className="text-sm text-white/50">/ {snapshot.dailyTotal}</span>
              </div>
              <Meter value={dailyPct} tone="muted" />
              <div className="mt-2 text-xs text-white/45">Daily cap resets at 00:00 UTC</div>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-white/8 bg-black/25 p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-white/40 mb-2">
            What this means
          </div>
          <CapacityTranslation credits={snapshot.remaining} className="!text-white/70" />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#F5ECDD]">Top-up balance</div>
            <div className="mt-1 text-xs text-white/50">
              Purchased credits are used only after your monthly allotment runs out.
            </div>
          </div>
          <div className="text-2xl font-semibold text-[#C9A24C]">{snapshot.topupBalance}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StubButton primary>Add 100 credits · $10</StubButton>
          <StubButton>Add 500 credits · $40</StubButton>
        </div>
        <p className="mt-3 text-xs text-white/40">
          Thinking, planning, and deciding never stop — even at zero. Only execution pauses.
        </p>
      </Panel>

      <Panel>
        <div className="text-xs uppercase tracking-[0.28em] text-white/40">Usage history</div>
        <p className="mt-2 text-sm text-white/60">
          Every execution is recorded in the Ledger as a{" "}
          <code className="rounded bg-[hsl(var(--token-bg))] px-1.5 py-0.5 text-[hsl(var(--token-fg))] text-xs">
            capacity_consumed
          </code>{" "}
          entry — no hidden meter.
        </p>
        <div className="mt-3">
          <a
            href="/ledger?filter=capacity"
            className="inline-flex items-center gap-1.5 text-xs text-[#C9A24C] hover:text-[#F5ECDD] transition-colors"
          >
            Open Ledger <span aria-hidden>→</span>
          </a>
        </div>
      </Panel>

      <p className="text-center text-[11px] text-white/25">
        Mocked — real endpoints (<code className="text-white/40">/api/capacity</code>) enable once verified.
      </p>
    </div>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur md:p-6">
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 last:border-b-0">
      <span className="text-white/50">{label}</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}

function Meter({ value, tone = "gold" }: { value: number; tone?: "gold" | "muted" }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = tone === "gold" ? "#C9A24C" : "rgba(255,255,255,0.4)";
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${clamped}%`, background: color, boxShadow: `0 0 12px ${color}55` }}
      />
    </div>
  );
}

function StubButton({
  children,
  primary,
  small,
}: {
  children: React.ReactNode;
  primary?: boolean;
  small?: boolean;
}) {
  const base = small ? "text-[11px] px-2.5 py-1" : "text-xs px-3 py-1.5";
  const style = primary
    ? "bg-[#C9A24C]/15 border-[#C9A24C]/40 text-[#F5ECDD] hover:bg-[#C9A24C]/25"
    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10";
  return (
    <button
      type="button"
      disabled
      title="Available when billing goes live"
      className={`${base} ${style} rounded-md border transition-colors cursor-not-allowed opacity-90`}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
