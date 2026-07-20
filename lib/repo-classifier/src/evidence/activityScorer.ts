import type { EvidenceItem } from "../types.js";
import type { WorkspacePackage, WorkspaceInfo } from "./workspaceDiscovery.js";
import type { DetectedScript } from "./scriptDetector.js";
import type { FrameworkResult } from "./frameworkDetector.js";
import { checkEntryPointExists } from "./frameworkDetector.js";
import { matchesNegatedGlob } from "./workspaceDiscovery.js";

const INACTIVE_DIR_SEGMENTS = ["legacy", "deprecated", "archive", "old", "backup", "unused"];

export type ActivityScore = {
  status: "likely-runnable" | "configuration-required" | "external-service-required" | "likely-inactive" | "ambiguous" | "unsupported";
  confidence: "high" | "medium" | "low";
  evidence: EvidenceItem[];
  inactivityReasons: string[];
};

export function scoreActivity(
  pkg: WorkspacePackage,
  workspace: WorkspaceInfo,
  framework: FrameworkResult,
  script: DetectedScript | null,
  hasRequiredConfig: boolean,
  hasExternalService: boolean,
): ActivityScore {
  const evidence: EvidenceItem[] = [...framework.evidence];
  const inactivityReasons: string[] = [];

  // ── Mobile / unsupported ────────────────────────────────────────────────────
  if (framework.isMobile) {
    return {
      status: "unsupported",
      confidence: "high",
      evidence,
      inactivityReasons: [],
    };
  }

  // ── Library-only packages: skip (not a runnable target) ────────────────────
  if (framework.isLibraryOnly && !script) {
    return {
      status: "unsupported",
      confidence: "medium",
      evidence,
      inactivityReasons: ["library-only package with no recognized runnable script"],
    };
  }

  // ── Strong inactive signals ────────────────────────────────────────────────

  // Signal 1: index.html declares an entry file that doesn't exist
  if (framework.indexHtmlEntryRef) {
    const exists = checkEntryPointExists(pkg, framework.indexHtmlEntryRef);
    if (!exists) {
      inactivityReasons.push(
        `index.html references entry point "${framework.indexHtmlEntryRef}" which does not exist`,
      );
      evidence.push({
        type: "failed-verification",
        description: `Entry point "${framework.indexHtmlEntryRef}" declared in index.html is missing`,
        source: (pkg.directory ? pkg.directory + "/" : "") + "index.html",
      });
      return {
        status: "likely-inactive",
        confidence: "medium",
        evidence,
        inactivityReasons,
      };
    } else {
      evidence.push({
        type: "detected",
        description: `Entry point "${framework.indexHtmlEntryRef}" exists`,
        source: (pkg.directory ? pkg.directory + "/" : "") + framework.indexHtmlEntryRef,
      });
    }
  }

  // Signal 2: explicitly matches a negated workspace glob
  if (
    pkg.directory &&
    workspace.workspaceGlobs.some((g) => matchesNegatedGlob(pkg.directory, g))
  ) {
    inactivityReasons.push("directory matches a negated workspace glob");
    evidence.push({
      type: "detected",
      description: "Package directory is excluded by a negated workspace glob",
      source: "pnpm-workspace.yaml",
    });
    return {
      status: "likely-inactive",
      confidence: "medium",
      evidence,
      inactivityReasons,
    };
  }

  // ── Weak inactive signals (accumulate) ─────────────────────────────────────

  let weakInactiveCount = 0;
  const weakInactiveReasons: string[] = [];

  // Weak: no recognized runnable script
  if (!script) {
    weakInactiveCount++;
    weakInactiveReasons.push("no recognized runnable script found");
    evidence.push({
      type: "failed-verification",
      description: "No recognized runnable script in package.json or workspace root",
      source: "package.json#scripts",
    });
  }

  // Weak: directory path contains a legacy-like segment
  if (INACTIVE_DIR_SEGMENTS.some((seg) => pkg.directory.split("/").includes(seg))) {
    weakInactiveCount++;
    const segment = INACTIVE_DIR_SEGMENTS.find((seg) => pkg.directory.split("/").includes(seg))!;
    weakInactiveReasons.push(`directory path contains "${segment}" segment`);
  }

  // Weak: outside workspace globs (for monorepos)
  if (workspace.isMonorepo && !pkg.isRoot && !pkg.isWorkspaceMember) {
    weakInactiveCount++;
    weakInactiveReasons.push("directory is outside declared workspace globs");
  }

  // Two or more weak signals → likely-inactive at low confidence
  if (weakInactiveCount >= 2) {
    inactivityReasons.push(...weakInactiveReasons);
    return {
      status: "likely-inactive",
      confidence: "low",
      evidence,
      inactivityReasons,
    };
  }

  // One weak signal (no script) with no other active signals → ambiguous
  if (weakInactiveCount === 1 && !script) {
    return {
      status: "ambiguous",
      confidence: "low",
      evidence,
      inactivityReasons: [],
    };
  }

  // ── Active path ────────────────────────────────────────────────────────────

  if (script) {
    evidence.push({
      type: "detected",
      description: `Recognized runnable script: ${script.key} = "${script.command}"`,
      source: "package.json#scripts." + script.key,
    });
  }

  // Determine final status based on requirements
  if (hasExternalService && !hasRequiredConfig) {
    return { status: "external-service-required", confidence: "medium", evidence, inactivityReasons: [] };
  }

  if (hasRequiredConfig) {
    return { status: "configuration-required", confidence: "medium", evidence, inactivityReasons: [] };
  }

  return {
    status: "likely-runnable",
    confidence: framework.confidence === "high" && !!script ? "high" : "medium",
    evidence,
    inactivityReasons: [],
  };
}
