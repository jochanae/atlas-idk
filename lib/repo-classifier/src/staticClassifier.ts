import type {
  RepositoryClassificationInput,
  RepositoryRunabilityReport,
  RunnableTarget,
  EnvironmentRequirement,
  Recommendation,
  EvidenceItem,
} from "./types.js";
import { discoverWorkspace } from "./evidence/workspaceDiscovery.js";
import { detectRunnableScript, detectInstallCommand } from "./evidence/scriptDetector.js";
import { detectFramework } from "./evidence/frameworkDetector.js";
import { scanEnvVars } from "./evidence/envVarScanner.js";
import { detectExternalServices } from "./evidence/serviceDetector.js";
import { scoreActivity } from "./evidence/activityScorer.js";
import type { WorkspacePackage } from "./evidence/workspaceDiscovery.js";

// ── Target ID generation ───────────────────────────────────────────────────────

function makeTargetId(pkg: WorkspacePackage): string {
  const name = (pkg.packageJson.name as string | undefined) ?? pkg.directory ?? "root";
  return name
    .replace(/^@[\w-]+\//, "") // strip npm scope prefix
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Start command construction ────────────────────────────────────────────────

function makeStartCommand(scriptKey: string, pkg: WorkspacePackage): string {
  const scripts = (pkg.packageJson.scripts as Record<string, unknown> | undefined) ?? {};
  // If root has --filter orchestration, use that; otherwise use local dev script
  const raw = scripts[scriptKey];
  if (typeof raw === "string" && raw.includes("--filter")) {
    return raw; // root orchestration script
  }
  return `pnpm run ${scriptKey}`;
}

// ── repositoryType derivation ─────────────────────────────────────────────────

type RepositoryTypeDerived = RepositoryRunabilityReport["repositoryType"];

function deriveRepositoryType(
  isMonorepo: boolean,
  targets: RunnableTarget[],
): RepositoryTypeDerived {
  if (isMonorepo) return "monorepo";

  const nonUnsupported = targets.filter((t) => t.status !== "unsupported");
  if (nonUnsupported.length === 0 && targets.some((t) => t.status === "unsupported")) {
    return "mobile";
  }
  const roles = new Set(nonUnsupported.map((t) => t.role));
  if (roles.has("frontend") || roles.has("api") || roles.has("fullstack") || roles.has("worker")) {
    return "single-app";
  }
  return "unknown";
}

// ── Recommendation selection ──────────────────────────────────────────────────

const ROLE_PREFERENCE: Record<RunnableTarget["role"], number> = {
  frontend: 0,
  fullstack: 1,
  api: 2,
  worker: 3,
  unknown: 4,
};

const STATUS_PREFERENCE: Record<string, number> = {
  "likely-runnable": 0,
  "configuration-required": 1,
  "external-service-required": 2,
  ambiguous: 3,
  "likely-inactive": 4,
  unsupported: 5,
};

function selectRecommendation(targets: RunnableTarget[]): Recommendation | undefined {
  const candidates = targets.filter(
    (t) => t.status !== "unsupported" && t.status !== "likely-inactive",
  );
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    const statusDiff = (STATUS_PREFERENCE[a.status] ?? 9) - (STATUS_PREFERENCE[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return (ROLE_PREFERENCE[a.role] ?? 9) - (ROLE_PREFERENCE[b.role] ?? 9);
  });

  const best = candidates[0]!;
  const reasons: string[] = [];
  const evidence: EvidenceItem[] = [];

  if (best.role === "frontend") {
    reasons.push("Frontend target is directly previewable in the Atlas runtime");
  } else if (best.role === "fullstack") {
    reasons.push("Fullstack target provides the complete application experience");
  } else if (best.role === "api") {
    reasons.push("API target is the primary runnable service in this repository");
  }
  if (best.status === "likely-runnable") {
    reasons.push("Static evidence is consistent with this target being runnable without additional configuration");
  } else if (best.status === "configuration-required") {
    reasons.push("Target requires environment variables to be supplied before starting");
  }

  return { targetId: best.id, reasons, evidence };
}

// ── overallStatus derivation ──────────────────────────────────────────────────

type OverallStatus = RepositoryRunabilityReport["overallStatus"];

function deriveOverallStatus(
  targets: RunnableTarget[],
  recommendation: Recommendation | undefined,
): OverallStatus {
  if (!recommendation) {
    const allUnsupported = targets.length > 0 && targets.every((t) => t.status === "unsupported");
    if (allUnsupported) return "unsupported";
    return "ambiguous";
  }
  const rec = targets.find((t) => t.id === recommendation.targetId);
  if (!rec) return "ambiguous";

  switch (rec.status) {
    case "likely-runnable": return "ready";
    case "configuration-required": return "configuration-required";
    case "external-service-required": return "external-service-required";
    default: return "ambiguous";
  }
}

// ── previewStrategy ────────────────────────────────────────────────────────────

function derivePreviewStrategy(
  overallStatus: OverallStatus,
  recommendation: Recommendation | undefined,
  targets: RunnableTarget[],
): RepositoryRunabilityReport["previewStrategy"] {
  if (!recommendation) return "unsupported";
  const rec = targets.find((t) => t.id === recommendation.targetId);
  if (!rec) return "unsupported";
  if (overallStatus === "unsupported") return "unsupported";
  return "local-runtime";
}

// ── Report confidence ─────────────────────────────────────────────────────────

function deriveReportConfidence(
  input: RepositoryClassificationInput,
  targets: RunnableTarget[],
  recommendation: Recommendation | undefined,
): "high" | "medium" | "low" {
  // github-partial caps at medium
  if (input.sourceMode === "github-partial") {
    return "medium";
  }
  if (!recommendation) return "low";
  const rec = targets.find((t) => t.id === recommendation.targetId);
  return rec?.confidence ?? "low";
}

// ── Main classifier ────────────────────────────────────────────────────────────

/**
 * Classify a repository from normalized file records.
 *
 * Pure function — no I/O, no network, no process execution, no database access.
 * Phase 1 ceiling: maximum target status emitted is "likely-runnable".
 * "verified-runnable" requires a Phase 2 runtime check.
 */
export function classifyRepository(
  input: RepositoryClassificationInput,
): RepositoryRunabilityReport {
  const { sourceMode } = input;

  // ── Empty input ──────────────────────────────────────────────────────────
  if (input.files.length === 0) {
    return {
      repositoryType: "unknown",
      sourceMode,
      targets: [],
      requirements: {
        environmentVariables: [],
        externalServices: [],
        systemDependencies: [],
      },
      previewStrategy: "unsupported",
      overallStatus: "ambiguous",
      confidence: "low",
      evidence: [],
      warnings: ["No file tree available"],
    };
  }

  // ── Workspace discovery ───────────────────────────────────────────────────
  const workspace = discoverWorkspace(input.files);

  // ── Global env scan (used for report-level requirements) ─────────────────
  const { requirements: globalEnvReqs, evidence: envScanEvidence } = scanEnvVars(input.files);

  // ── Global service detection (used for report-level requirements) ─────────
  // Collect services across all packages
  const allServicesMap = new Map<string, ReturnType<typeof detectExternalServices>[number]>();
  for (const pkg of workspace.packages) {
    for (const svc of detectExternalServices(pkg, input.files)) {
      if (!allServicesMap.has(svc.service)) allServicesMap.set(svc.service, svc);
    }
  }

  // ── Build targets ─────────────────────────────────────────────────────────
  const targets: RunnableTarget[] = [];
  const warnings: string[] = [];

  // Warn if the source adapter reported scan truncation
  if (input.scanTruncated) {
    warnings.push(
      "Repository scan was truncated at the file limit — analysis may be incomplete for large repositories",
    );
  }
  const rootInstallCommand = detectInstallCommand(
    workspace.packages.find((p) => p.isRoot) ?? workspace.packages[0]!,
  );

  for (const pkg of workspace.packages) {
    // In monorepos: skip root (orchestrator) and non-workspace members
    if (workspace.isMonorepo && pkg.isRoot) continue;
    if (workspace.isMonorepo && !pkg.isWorkspaceMember) continue;

    const framework = detectFramework(pkg);
    const script = detectRunnableScript(pkg, workspace);

    // In monorepos: skip pure library packages
    if (workspace.isMonorepo && framework.isLibraryOnly && !script) continue;

    // Skip packages that have no framework and no script (e.g. workspace scripts/ utilities)
    if (framework.framework === "unknown" && !script && !framework.isMobile) continue;

    // Per-package env scan to determine config requirements for this target
    const { requirements: pkgEnvReqs } = scanEnvVars(pkg.ownedFiles);
    const hasRequiredConfig = pkgEnvReqs.some(
      (e) => e.classification === "required-to-boot",
    );

    // Per-package service detection
    const pkgServices = detectExternalServices(pkg, input.files);
    const hasExternalService = pkgServices.length > 0;

    // Activity + status scoring
    const activity = scoreActivity(
      pkg,
      workspace,
      framework,
      script,
      hasRequiredConfig,
      hasExternalService,
    );

    // Build start command
    const scriptKey = script?.key ?? "dev";
    const startCommand = makeStartCommand(scriptKey, pkg);

    const target: RunnableTarget = {
      id: makeTargetId(pkg),
      role: framework.role,
      workingDirectory: pkg.directory || ".",
      installCommand: workspace.isMonorepo ? rootInstallCommand : detectInstallCommand(pkg),
      buildCommand:
        typeof (pkg.packageJson.scripts as Record<string, unknown> | undefined)?.build === "string"
          ? `pnpm run build`
          : undefined,
      startCommand,
      framework: framework.framework,
      dependencies: Object.keys(
        (pkg.packageJson.dependencies as Record<string, unknown> | undefined) ?? {},
      ),
      externalServices: pkgServices.map((s) => s.service),
      environmentVariables: pkgEnvReqs.map((e) => e.name),
      status: activity.status,
      confidence: activity.confidence,
      evidence: activity.evidence,
      inactivityReasons:
        activity.inactivityReasons.length > 0 ? activity.inactivityReasons : undefined,
    };

    targets.push(target);

    // Warn about unsupported mobile packages
    if (activity.status === "unsupported" && framework.isMobile) {
      warnings.push(
        `Expo / React Native package at "${pkg.directory}" is not previewable in the Atlas runtime`,
      );
    }
  }

  // ── Recommendation ─────────────────────────────────────────────────────────
  const recommendation = selectRecommendation(targets);

  // ── Overall status + preview strategy ─────────────────────────────────────
  const overallStatus = deriveOverallStatus(targets, recommendation);
  const previewStrategy = derivePreviewStrategy(overallStatus, recommendation, targets);

  // ── Report-level confidence ────────────────────────────────────────────────
  const confidence = deriveReportConfidence(input, targets, recommendation);

  // ── Repository type ────────────────────────────────────────────────────────
  const repositoryType = deriveRepositoryType(workspace.isMonorepo, targets);

  // ── Merge services for report-level ───────────────────────────────────────
  const reportServices = [...allServicesMap.values()];

  // ── Top-level evidence ─────────────────────────────────────────────────────
  const topEvidence: EvidenceItem[] = [...envScanEvidence];
  if (workspace.isMonorepo) {
    topEvidence.push({
      type: "detected",
      description: `Monorepo with ${targets.length} candidate package(s)`,
      source: workspace.workspaceGlobs.length > 0 ? "pnpm-workspace.yaml" : "package.json#workspaces",
    });
  }

  return {
    repositoryType,
    sourceMode,
    targets,
    recommendation,
    requirements: {
      environmentVariables: globalEnvReqs,
      externalServices: reportServices,
      systemDependencies: [],
    },
    previewStrategy,
    overallStatus,
    confidence,
    evidence: topEvidence,
    warnings,
  };
}
