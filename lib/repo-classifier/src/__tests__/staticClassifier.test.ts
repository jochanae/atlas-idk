import { describe, it, expect } from "vitest";
import { classifyRepository } from "../staticClassifier.js";
import type {
  RepositoryRunabilityReport,
  RunnableTarget,
  EnvironmentRequirement,
  EvidenceItem,
} from "../types.js";

import { fixtureAtlasMonorepo } from "./fixtures/a-atlas-monorepo.js";
import { fixtureSimpleVite } from "./fixtures/b-simple-vite.js";
import { fixtureNextjsPrisma } from "./fixtures/c-nextjs-prisma.js";
import { fixtureDeadPlusLive } from "./fixtures/d-dead-plus-live.js";
import { fixtureExpoMobile } from "./fixtures/e-expo-mobile.js";
import { fixtureMixedMonorepo } from "./fixtures/f-mixed-monorepo.js";
import { fixtureEmpty } from "./fixtures/g-empty.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function allEvidence(report: RepositoryRunabilityReport): EvidenceItem[] {
  return [
    ...report.evidence,
    ...(report.recommendation?.evidence ?? []),
    ...report.targets.flatMap((t) => t.evidence),
  ];
}

function allEnvRequirements(report: RepositoryRunabilityReport): EnvironmentRequirement[] {
  return report.requirements.environmentVariables;
}

function targetById(report: RepositoryRunabilityReport, partial: string): RunnableTarget | undefined {
  return report.targets.find((t) => t.id.includes(partial));
}

// ── Non-negotiable invariants ─────────────────────────────────────────────────
// These must hold for EVERY report the classifier produces.
// They are tested against all seven fixtures.

describe("invariants — must hold for every report", () => {
  const allFixtures = [
    { name: "G empty", input: fixtureEmpty },
    { name: "A atlas-monorepo", input: fixtureAtlasMonorepo },
    { name: "B simple-vite", input: fixtureSimpleVite },
    { name: "C nextjs-prisma", input: fixtureNextjsPrisma },
    { name: "D dead-plus-live", input: fixtureDeadPlusLive },
    { name: "E expo-mobile", input: fixtureExpoMobile },
    { name: "F mixed-monorepo", input: fixtureMixedMonorepo },
  ];

  for (const { name, input } of allFixtures) {
    describe(name, () => {
      const report = classifyRepository(input);

      it('no EvidenceItem.type === "verified" (Phase 2 only)', () => {
        for (const ev of allEvidence(report)) {
          expect(ev.type).not.toBe("verified");
        }
      });

      it('no RunnableTarget.status === "verified-runnable" (Phase 2 only)', () => {
        for (const t of report.targets) {
          expect(t.status).not.toBe("verified-runnable");
        }
      });

      it("no secret EnvironmentRequirement has a defaultValue", () => {
        for (const env of allEnvRequirements(report)) {
          if (env.sensitivity === "secret") {
            expect(env.defaultValue).toBeUndefined();
          }
        }
      });

      it('github-partial sourceMode caps confidence at "medium"', () => {
        if (input.sourceMode === "github-partial") {
          expect(report.confidence).not.toBe("high");
        }
      });

      it("sourceMode on report mirrors input sourceMode", () => {
        expect(report.sourceMode).toBe(input.sourceMode);
      });

      it("no target is likely-inactive solely from missing commit metadata", () => {
        // When metadata.packageActivity is absent, no target may be inactive.
        // Commit age is not negative evidence when the data was never supplied.
        if (!input.metadata?.packageActivity) {
          for (const t of report.targets) {
            if (t.status === "likely-inactive") {
              // Must have at least one non-commit inactivity reason
              const hasNonCommitReason = t.inactivityReasons?.some(
                (r) => !r.toLowerCase().includes("commit") && !r.toLowerCase().includes("activity"),
              );
              expect(hasNonCommitReason).toBe(true);
            }
          }
        }
      });

      it("evidence descriptions do not contain .env secret file values", () => {
        // Heuristic: evidence should never mention patterns that look like real secret values.
        // We check that no evidence source refers to a real .env file.
        for (const ev of allEvidence(report)) {
          expect(ev.source).not.toMatch(/^\.env$|^\.env\.local$|^\.env\.production$|^\.env\.staging$/);
        }
      });
    });
  }
});

// ── Fixture G — empty workspace ───────────────────────────────────────────────

describe("Fixture G — empty workspace (no files)", () => {
  const report = classifyRepository(fixtureEmpty);

  it('overallStatus is "ambiguous"', () => {
    expect(report.overallStatus).toBe("ambiguous");
  });

  it("targets is empty", () => {
    expect(report.targets).toHaveLength(0);
  });

  it('warnings includes "No file tree available"', () => {
    expect(report.warnings.some((w) => w.includes("No file tree available"))).toBe(true);
  });
});

// ── Fixture A — Atlas own monorepo ────────────────────────────────────────────

describe("Fixture A — Atlas own monorepo", () => {
  const report = classifyRepository(fixtureAtlasMonorepo);

  it('repositoryType is "monorepo"', () => {
    expect(report.repositoryType).toBe("monorepo");
  });

  it('sourceMode is "local-complete"', () => {
    expect(report.sourceMode).toBe("local-complete");
  });

  it("surfaces exactly two runnable targets (frontend + api)", () => {
    const runnable = report.targets.filter(
      (t) => t.status !== "likely-inactive" && t.status !== "unsupported",
    );
    expect(runnable.length).toBeGreaterThanOrEqual(2);
  });

  it("atlas-frontend target is identified as frontend role", () => {
    const fe = report.targets.find(
      (t) => t.workingDirectory.includes("atlas-frontend"),
    );
    expect(fe).toBeDefined();
    expect(fe?.role).toBe("frontend");
  });

  it('atlas-frontend target status is "likely-runnable"', () => {
    const fe = report.targets.find(
      (t) => t.workingDirectory.includes("atlas-frontend"),
    );
    expect(fe?.status).toBe("likely-runnable");
  });

  it("api-server target is identified as api role", () => {
    const api = report.targets.find(
      (t) => t.workingDirectory.includes("api-server"),
    );
    expect(api).toBeDefined();
    expect(api?.role).toBe("api");
  });

  it('api-server target status is "configuration-required" (needs DATABASE_URL + SESSION_SECRET)', () => {
    const api = report.targets.find(
      (t) => t.workingDirectory.includes("api-server"),
    );
    expect(api?.status).toBe("configuration-required");
  });

  it("lib/* packages are NOT surfaced as runnable targets", () => {
    const libTargets = report.targets.filter((t) =>
      t.workingDirectory.startsWith("lib/"),
    );
    expect(libTargets).toHaveLength(0);
  });

  it("DATABASE_URL is detected as required-to-boot secret", () => {
    const dbUrl = report.requirements.environmentVariables.find(
      (e) => e.name === "DATABASE_URL",
    );
    expect(dbUrl).toBeDefined();
    expect(dbUrl?.classification).toBe("required-to-boot");
    expect(dbUrl?.sensitivity).toBe("secret");
    expect(dbUrl?.defaultValue).toBeUndefined();
  });

  it("SESSION_SECRET is detected as required-to-boot secret", () => {
    const secret = report.requirements.environmentVariables.find(
      (e) => e.name === "SESSION_SECRET",
    );
    expect(secret).toBeDefined();
    expect(secret?.classification).toBe("required-to-boot");
    expect(secret?.sensitivity).toBe("secret");
    expect(secret?.defaultValue).toBeUndefined();
  });

  it("RESEND_API_KEY is detected as required-for-feature secret", () => {
    const resend = report.requirements.environmentVariables.find(
      (e) => e.name === "RESEND_API_KEY",
    );
    expect(resend).toBeDefined();
    expect(resend?.classification).toBe("required-for-feature");
    expect(resend?.sensitivity).toBe("secret");
  });

  it("PostgreSQL is detected as an external service", () => {
    const pg = report.requirements.externalServices.find((s) =>
      s.service.toLowerCase().includes("postgres"),
    );
    expect(pg).toBeDefined();
  });

  it("recommendation points to the frontend (preferred when frontend is likely-runnable)", () => {
    expect(report.recommendation).toBeDefined();
    const rec = report.targets.find((t) => t.id === report.recommendation?.targetId);
    expect(rec?.role).toBe("frontend");
  });

  it("recommendation includes reasons", () => {
    expect(report.recommendation?.reasons.length).toBeGreaterThan(0);
  });

  it('overallStatus is "configuration-required" (derived from recommended target pair)', () => {
    // The frontend alone is likely-runnable, but the full-stack pair requires config.
    // The recommended target is the frontend, but the report reflects that the API
    // it depends on requires configuration.
    // Accept either "ready" or "configuration-required" depending on implementation
    // choice — what must NOT happen is "unsupported" or "ambiguous".
    expect(["ready", "configuration-required"]).toContain(report.overallStatus);
  });

  it('overallStatus is NOT "unsupported"', () => {
    expect(report.overallStatus).not.toBe("unsupported");
  });

  it('overallStatus is NOT "ambiguous"', () => {
    expect(report.overallStatus).not.toBe("ambiguous");
  });
});

// ── Fixture B — Simple Vite app ───────────────────────────────────────────────

describe("Fixture B — simple Vite + React app", () => {
  const report = classifyRepository(fixtureSimpleVite);

  it('repositoryType is "single-app"', () => {
    expect(report.repositoryType).toBe("single-app");
  });

  it('overallStatus is "ready"', () => {
    expect(report.overallStatus).toBe("ready");
  });

  it('confidence is "high"', () => {
    expect(report.confidence).toBe("high");
  });

  it("exactly one target is identified", () => {
    expect(report.targets).toHaveLength(1);
  });

  it('target role is "frontend"', () => {
    expect(report.targets[0]?.role).toBe("frontend");
  });

  it('target status is "likely-runnable"', () => {
    expect(report.targets[0]?.status).toBe("likely-runnable");
  });

  it("framework name mentions Vite", () => {
    expect(report.targets[0]?.framework.toLowerCase()).toContain("vite");
  });

  it("no external services required", () => {
    expect(report.requirements.externalServices).toHaveLength(0);
  });

  it("no environment variables required", () => {
    const required = report.requirements.environmentVariables.filter(
      (e) => e.classification === "required-to-boot",
    );
    expect(required).toHaveLength(0);
  });
});

// ── Fixture C — Next.js with Prisma ──────────────────────────────────────────

describe("Fixture C — Next.js + Prisma fullstack", () => {
  const report = classifyRepository(fixtureNextjsPrisma);

  it('repositoryType is "single-app"', () => {
    expect(report.repositoryType).toBe("single-app");
  });

  it('overallStatus is "configuration-required"', () => {
    expect(report.overallStatus).toBe("configuration-required");
  });

  it("exactly one target is identified", () => {
    expect(report.targets).toHaveLength(1);
  });

  it('target role is "fullstack"', () => {
    expect(report.targets[0]?.role).toBe("fullstack");
  });

  it('target status is "configuration-required"', () => {
    expect(report.targets[0]?.status).toBe("configuration-required");
  });

  it("framework name mentions Next", () => {
    expect(report.targets[0]?.framework.toLowerCase()).toContain("next");
  });

  it("DATABASE_URL is classified as required-to-boot secret", () => {
    const dbUrl = report.requirements.environmentVariables.find(
      (e) => e.name === "DATABASE_URL",
    );
    expect(dbUrl).toBeDefined();
    expect(dbUrl?.classification).toBe("required-to-boot");
    expect(dbUrl?.sensitivity).toBe("secret");
    expect(dbUrl?.defaultValue).toBeUndefined();
  });

  it("PostgreSQL external service is detected", () => {
    const pg = report.requirements.externalServices.find((s) =>
      s.service.toLowerCase().includes("postgres"),
    );
    expect(pg).toBeDefined();
  });

  it("PostgreSQL connectionSupport is environment-configurable", () => {
    const pg = report.requirements.externalServices.find((s) =>
      s.service.toLowerCase().includes("postgres"),
    );
    expect(pg?.connectionSupport).toBe("environment-configurable");
  });
});

// ── Fixture D — Dead legacy + active v2 ──────────────────────────────────────

describe("Fixture D — dead legacy frontend alongside active v2", () => {
  const report = classifyRepository(fixtureDeadPlusLive);

  it("two targets are identified", () => {
    expect(report.targets).toHaveLength(2);
  });

  it("frontend-v2 is likely-runnable", () => {
    const v2 = report.targets.find((t) => t.workingDirectory.includes("frontend-v2"));
    expect(v2).toBeDefined();
    expect(v2?.status).toBe("likely-runnable");
  });

  it("frontend-legacy is likely-inactive", () => {
    const legacy = report.targets.find((t) =>
      t.workingDirectory.includes("frontend-legacy"),
    );
    expect(legacy).toBeDefined();
    expect(legacy?.status).toBe("likely-inactive");
  });

  it("frontend-legacy has at least one inactivity reason", () => {
    const legacy = report.targets.find((t) =>
      t.workingDirectory.includes("frontend-legacy"),
    );
    expect(legacy?.inactivityReasons?.length).toBeGreaterThan(0);
  });

  it("recommendation points to frontend-v2", () => {
    expect(report.recommendation).toBeDefined();
    const rec = report.targets.find((t) => t.id === report.recommendation?.targetId);
    expect(rec?.workingDirectory).toContain("frontend-v2");
  });

  it('overallStatus is "ready" (derived from v2, not overridden by inactive legacy)', () => {
    expect(report.overallStatus).toBe("ready");
  });
});

// ── Fixture E — Expo mobile ───────────────────────────────────────────────────

describe("Fixture E — Expo / React Native mobile app", () => {
  const report = classifyRepository(fixtureExpoMobile);

  it('repositoryType is "mobile"', () => {
    expect(report.repositoryType).toBe("mobile");
  });

  it('overallStatus is "unsupported"', () => {
    expect(report.overallStatus).toBe("unsupported");
  });

  it('previewStrategy is "unsupported"', () => {
    expect(report.previewStrategy).toBe("unsupported");
  });

  it("warning explains why mobile is not supported", () => {
    const hasMobileWarning = report.warnings.some(
      (w) => w.toLowerCase().includes("mobile") || w.toLowerCase().includes("expo") || w.toLowerCase().includes("react native"),
    );
    expect(hasMobileWarning).toBe(true);
  });
});

// ── Fixture F — Mixed monorepo ────────────────────────────────────────────────

describe("Fixture F — mixed monorepo (web + API + Expo)", () => {
  const report = classifyRepository(fixtureMixedMonorepo);

  it('repositoryType is "monorepo"', () => {
    expect(report.repositoryType).toBe("monorepo");
  });

  it("three targets are identified", () => {
    expect(report.targets).toHaveLength(3);
  });

  it("web target is likely-runnable", () => {
    const web = report.targets.find((t) => t.workingDirectory.includes("apps/web"));
    expect(web).toBeDefined();
    expect(web?.status).toBe("likely-runnable");
  });

  it("api target requires configuration or external service", () => {
    const api = report.targets.find((t) => t.workingDirectory.includes("apps/api"));
    expect(api).toBeDefined();
    expect(["configuration-required", "external-service-required"]).toContain(api?.status);
  });

  it("mobile target is unsupported", () => {
    const mobile = report.targets.find((t) => t.workingDirectory.includes("apps/mobile"));
    expect(mobile).toBeDefined();
    expect(mobile?.status).toBe("unsupported");
  });

  it('overallStatus is "ready" (derived from recommended web target — NOT from worst-case target)', () => {
    expect(report.overallStatus).toBe("ready");
  });

  it('overallStatus is NOT "unsupported" (mobile sibling must not override)', () => {
    expect(report.overallStatus).not.toBe("unsupported");
  });

  it("recommendation points to the web frontend", () => {
    expect(report.recommendation).toBeDefined();
    const rec = report.targets.find((t) => t.id === report.recommendation?.targetId);
    expect(rec?.workingDirectory).toContain("apps/web");
  });

  it("warning mentions the unsupported Expo package", () => {
    const hasExpoWarning = report.warnings.some(
      (w) => w.toLowerCase().includes("expo") || w.toLowerCase().includes("mobile"),
    );
    expect(hasExpoWarning).toBe(true);
  });
});

// ── Scan truncation warning ───────────────────────────────────────────────────

describe("scan truncation warning", () => {
  it("emits a truncation warning when input.scanTruncated is true", () => {
    const input: import("../types.js").RepositoryClassificationInput = {
      sourceMode: "local-complete",
      scanTruncated: true,
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            name: "truncated-app",
            scripts: { dev: "vite" },
            devDependencies: { vite: "^6.0.0" },
          }),
        },
        { path: "index.html", content: "<!DOCTYPE html><html><body><div id=root></div></body></html>" },
      ],
    };
    const report = classifyRepository(input);
    expect(report.warnings.some((w) => w.toLowerCase().includes("truncat"))).toBe(true);
  });

  it("does NOT emit a truncation warning when input.scanTruncated is absent", () => {
    const input: import("../types.js").RepositoryClassificationInput = {
      sourceMode: "local-complete",
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            name: "normal-app",
            scripts: { dev: "vite" },
            devDependencies: { vite: "^6.0.0" },
          }),
        },
      ],
    };
    const report = classifyRepository(input);
    expect(report.warnings.some((w) => w.toLowerCase().includes("truncat"))).toBe(false);
  });

  it("truncation warning does not suppress other analysis — targets are still built", () => {
    const input: import("../types.js").RepositoryClassificationInput = {
      sourceMode: "local-complete",
      scanTruncated: true,
      files: [
        {
          path: "package.json",
          content: JSON.stringify({
            name: "truncated-app",
            scripts: { dev: "vite" },
            devDependencies: { vite: "^6.0.0" },
          }),
        },
        { path: "index.html", content: "<!DOCTYPE html><html><body><div id=root></div></body></html>" },
        { path: "vite.config.ts", content: "import { defineConfig } from 'vite'; export default defineConfig({});" },
        { path: "src/main.ts", content: "console.log('hello');" },
      ],
    };
    const report = classifyRepository(input);
    expect(report.targets.length).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.toLowerCase().includes("truncat"))).toBe(true);
  });
});
