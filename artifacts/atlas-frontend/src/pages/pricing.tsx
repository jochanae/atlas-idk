import { Link } from "@tanstack/react-router";

/**
 * Pricing page — locked model (2026-07-24).
 *
 * Philosophy: Thinking is unlimited. Execution uses credits.
 * Never show raw credit numbers on this page. Translate to outcomes.
 * See .lovable/plan.md for the full spec.
 */

const GOLD = "#C9A24C";
const OBSIDIAN = "#0C0A09";

// Outcome translations — kept here, sourced from translateCredits() ratios
// (small=1, medium=3, image=8). If those ratios change in useCapacity.ts,
// update these numbers to stay honest.
const FREE_OUTCOMES = {
  monthlyCredits: 20,
  smallEdits: 20,
  mediumBuilds: 6,
  imageGens: 2,
};
const PRO_OUTCOMES = {
  monthlyCredits: 300,
  smallEdits: 300,
  mediumBuilds: 100,
  imageGens: 37,
};

const bg = {
  background:
    "radial-gradient(circle at 50% 0%, rgba(201,162,76,0.12), transparent 34%), radial-gradient(circle at 80% 82%, rgba(196,82,26,0.12), transparent 30%), " +
    OBSIDIAN,
  fontFamily: "var(--app-font-sans)",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-10 text-white sm:px-6 md:py-16" style={bg}>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.42) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.42) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center">
        {/* Hero */}
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.34em]" style={{ color: GOLD }}>
          Axiom pricing
        </p>
        <h1
          className="max-w-3xl text-center text-4xl font-semibold tracking-[-0.035em] text-[#F5ECDD] md:text-6xl"
        >
          Thinking is unlimited.
          <br />
          <span style={{ color: GOLD }}>Execution uses credits.</span>
        </h1>
        <p className="mt-5 max-w-xl text-center text-base leading-7 text-white/62">
          Talk with Joy as long as you want. Only pay when you ask Axiom to build, generate, or run.
        </p>

        {/* Two cards */}
        <section className="mt-12 grid w-full grid-cols-1 gap-5 md:mt-16 md:grid-cols-2">
          <PlanCard
            eyebrow="Free"
            price="$0"
            priceSuffix=""
            summary="Everything you need to think clearly and reach one real outcome."
            outcomes={FREE_OUTCOMES}
            ctaLabel="Start free"
            ctaHref="/auth?intent=signup"
            variant="quiet"
          />
          <PlanCard
            eyebrow="Pro"
            price="$29"
            priceSuffix="/month"
            summary="For builders who ship. Generous execution, top-ups when you need more."
            outcomes={PRO_OUTCOMES}
            ctaLabel="Go Pro"
            ctaHref="/auth?intent=signup&plan=pro"
            variant="feature"
            footnote="Top-ups from $10. Auto-reload available after your first top-up."
          />
        </section>

        {/* Teams strip */}
        <section className="mt-8 w-full">
          <div
            className="flex flex-col items-start justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.02] p-6 md:flex-row md:items-center md:p-7"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/50">Teams</p>
              <p className="mt-2 text-base text-white/78">
                Shared billing, seats, and admin controls — talk to us.
              </p>
            </div>
            <a
              href="mailto:hello@axiom.dev?subject=Axiom%20for%20Teams"
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 bg-white/[0.03] px-5 text-sm font-medium text-white transition hover:bg-white/[0.07]"
            >
              Contact us →
            </a>
          </div>
        </section>

        {/* Fine print */}
        <p className="mt-10 max-w-xl text-center text-xs leading-6 text-white/45">
          Ask Joy, project memory, planning, and the decision ledger are always free — on every plan.
          Execution means Forge codegen, image generation, and agent runs.
        </p>

        <Link
          to="/"
          className="mt-6 text-xs uppercase tracking-[0.28em] text-white/40 transition hover:text-white/70"
        >
          ← Back
        </Link>
      </div>
    </main>
  );
}

interface PlanCardProps {
  eyebrow: string;
  price: string;
  priceSuffix: string;
  summary: string;
  outcomes: { smallEdits: number; mediumBuilds: number; imageGens: number };
  ctaLabel: string;
  ctaHref: string;
  variant: "quiet" | "feature";
  footnote?: string;
}

function PlanCard({
  eyebrow,
  price,
  priceSuffix,
  summary,
  outcomes,
  ctaLabel,
  ctaHref,
  variant,
  footnote,
}: PlanCardProps) {
  const isFeature = variant === "feature";
  return (
    <div
      className={
        "relative flex flex-col rounded-[26px] p-7 shadow-[0_40px_120px_rgba(0,0,0,0.5)] backdrop-blur md:p-9 " +
        (isFeature
          ? "border border-[#C9A24C]/45 bg-gradient-to-b from-[#1a1410]/85 to-black/50"
          : "border border-white/10 bg-black/35")
      }
    >
      {isFeature && (
        <span
          className="absolute -top-3 left-7 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]"
          style={{ borderColor: `${GOLD}66`, background: OBSIDIAN, color: GOLD }}
        >
          Recommended
        </span>
      )}

      <p
        className="text-xs font-semibold uppercase tracking-[0.32em]"
        style={{ color: isFeature ? GOLD : "rgba(255,255,255,0.55)" }}
      >
        {eyebrow}
      </p>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="text-5xl font-semibold tracking-[-0.04em]"
          style={{ color: isFeature ? GOLD : "#F5ECDD" }}
        >
          {price}
        </span>
        {priceSuffix && <span className="text-sm text-white/55">{priceSuffix}</span>}
      </div>

      <p className="mt-4 text-sm leading-6 text-white/70">{summary}</p>

      {/* Think without limits */}
      <Group title="Think without limits" gold={isFeature}>
        <Bullet>Unlimited conversations with Joy</Bullet>
        <Bullet>Unlimited project memory</Bullet>
        <Bullet>Unlimited planning and decision support</Bullet>
      </Group>

      {/* Execute when you're ready */}
      <Group title="Execute when you're ready" gold={isFeature}>
        <li className="text-sm leading-6 text-white/72">
          <span className="opacity-70">Enough monthly execution for approximately:</span>
          <ul className="mt-2 space-y-1.5 pl-1">
            <OutcomeRow n={outcomes.smallEdits} label="small edits" />
            <OutcomeRow n={outcomes.mediumBuilds} label="medium builds" />
            <OutcomeRow n={outcomes.imageGens} label="image generations" />
          </ul>
        </li>
        {isFeature && (
          <>
            <Bullet>Build applications with Forge</Bullet>
            <Bullet>Generate code and push to GitHub</Bullet>
            <Bullet>Run AI agents</Bullet>
          </>
        )}
      </Group>

      <div className="mt-8">
        <a
          href={ctaHref}
          className={
            "flex min-h-12 w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition " +
            (isFeature
              ? "border border-[#C9A24C]/60 bg-[#C9A24C] text-[#0C0A09] hover:bg-[#d7b764]"
              : "border border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]")
          }
        >
          {ctaLabel}
        </a>
        {footnote && <p className="mt-3 text-center text-[11px] text-white/45">{footnote}</p>}
      </div>
    </div>
  );
}

function Group({
  title,
  gold,
  children,
}: {
  title: string;
  gold: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 border-t border-white/8 pt-5">
      <p
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.26em]"
        style={{ color: gold ? GOLD : "rgba(255,255,255,0.55)" }}
      >
        {title}
      </p>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-6 text-white/78">
      <span
        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: GOLD, boxShadow: `0 0 12px ${GOLD}88` }}
      />
      <span>{children}</span>
    </li>
  );
}

function OutcomeRow({ n, label }: { n: number; label: string }) {
  return (
    <li className="flex items-baseline gap-2 text-sm text-white/78">
      <span className="tabular-nums text-white/95">~{n}</span>
      <span className="text-white/60">{label}</span>
    </li>
  );
}
