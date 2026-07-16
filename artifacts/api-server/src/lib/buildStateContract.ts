import { createHash } from "node:crypto";
import type { IssueType } from "@workspace/run-contract";

export type BuildType = "artifact-only" | "project-file";

export type AuthorizationPolicy =
  | "explicit-confirmation-required"
  | "request-itself-authorizes"
  | "destructive-confirmation-required"
  | "external-write-confirmation-required";

export type AtomicPolicy = "step-by-step" | "single-artifact-generation";

export type SurfaceName =
  | "chat"
  | "timeline"
  | "changes"
  | "preview"
  | "outputs"
  | "code"
  | "local-dev";

export type IterationStrategy =
  | "revise-existing-artifact"
  | "modify-project-files"
  | "new-run";

export type PreviewDestination = "draft" | "local-dev" | "deployed" | null;

export interface AtomicStepManifest {
  id: string;
  sequence: number;
  title: string;
  targetFiles: string[];
  requiredEvidence: string[];
  maxFiles: number;
  maxPatchLines: number;
  allowNewDependencies: boolean;
}

export interface RequestAuthorization {
  authorizingMessageId: string;
  allowedVerbs: string[];
  allowedPaths: string[];
  expiresAtRunEnd: true;
  scopeExpansionPolicy: "require-reauthorization";
}

export interface BuildStateContract {
  issueType: IssueType;
  requiredSteps: string[];
  completedSteps: string[];
  outcome: Record<string, unknown>;

  buildType: BuildType;
  authorizationPolicy: AuthorizationPolicy;
  atomicPolicy: AtomicPolicy;
  estimatedAtomicSteps: number;

  approvedPlanVersion: string | null;
  approvedBy: number | null;
  approvedAt: string | null;

  expectedSurfaces: SurfaceName[];
  changesExpected: boolean;
  previewDestination: PreviewDestination;
  localDevExpected: boolean;
  iterationStrategy: IterationStrategy;

  targetFiles: string[];
  expectedArtifacts: string[];
  rollbackTarget: string | null;
  verificationCriteria: string;

  steps: AtomicStepManifest[];
  requestAuthorization: RequestAuthorization | null;
}

export interface AtomicManifestInput {
  planVersion?: string;
  buildType: BuildType;
  authorizationPolicyProposal?: AuthorizationPolicy;
  atomicPolicy: AtomicPolicy;
  estimatedAtomicSteps?: number;
  steps: Array<{
    id: string;
    sequence: number;
    title: string;
    targetFiles: string[];
    requiredEvidence: string[];
    maxFiles?: number;
    maxPatchLines?: number;
    allowNewDependencies?: boolean;
  }>;
  expectedSurfaces?: SurfaceName[];
  changesExpected?: boolean;
  previewDestination?: PreviewDestination;
  localDevExpected?: boolean;
  iterationStrategy?: IterationStrategy;
  verificationCriteria?: string;
}

export type ManifestValidationResult =
  | { ok: true; manifest: AtomicManifestInput; planVersion: string }
  | { ok: false; error: string };

const VALID_EVIDENCE = new Set([
  "CODE_SEARCH", "FILE_INSPECTION", "PATCH", "BUILD", "TYPECHECK",
  "TEST", "STARTUP", "HEALTH_CHECK", "DEPLOY", "BROWSER_FLOW", "OTHER",
]);

const VALID_SURFACES = new Set([
  "chat", "timeline", "changes", "preview", "outputs", "code", "local-dev",
]);

export function validateBuildManifest(raw: unknown): ManifestValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Manifest must be a JSON object" };
  }
  const m = raw as Record<string, unknown>;

  if (!["artifact-only", "project-file"].includes(m.buildType as string)) {
    return { ok: false, error: `Invalid buildType: "${m.buildType}" — must be "artifact-only" or "project-file"` };
  }
  if (!["step-by-step", "single-artifact-generation"].includes(m.atomicPolicy as string)) {
    return { ok: false, error: `Invalid atomicPolicy: "${m.atomicPolicy}"` };
  }
  if (!Array.isArray(m.steps) || m.steps.length === 0) {
    return { ok: false, error: "steps must be a non-empty array" };
  }

  for (const step of m.steps as unknown[]) {
    if (typeof step !== "object" || step === null) {
      return { ok: false, error: "Each step must be an object" };
    }
    const s = step as Record<string, unknown>;
    if (typeof s.id !== "string" || !s.id) return { ok: false, error: "Each step must have a string id" };
    if (typeof s.sequence !== "number") return { ok: false, error: `Step "${s.id}": sequence must be a number` };
    if (typeof s.title !== "string" || !s.title) return { ok: false, error: `Step "${s.id}": title required` };
    if (!Array.isArray(s.targetFiles)) return { ok: false, error: `Step "${s.id}": targetFiles must be an array` };
    if (!Array.isArray(s.requiredEvidence)) return { ok: false, error: `Step "${s.id}": requiredEvidence must be an array` };
    for (const ev of s.requiredEvidence as unknown[]) {
      if (typeof ev !== "string" || !VALID_EVIDENCE.has(ev)) {
        return { ok: false, error: `Step "${s.id}": unknown requiredEvidence "${ev}"` };
      }
    }
    const maxFiles = typeof s.maxFiles === "number" ? s.maxFiles : 5;
    if (maxFiles > ATOMIC_LIMITS.absoluteMaxFilesPerStep) {
      return { ok: false, error: `Step "${s.id}": maxFiles ${maxFiles} exceeds hard limit ${ATOMIC_LIMITS.absoluteMaxFilesPerStep}` };
    }
    const maxPatchLines = typeof s.maxPatchLines === "number" ? s.maxPatchLines : 300;
    if (maxPatchLines > ATOMIC_LIMITS.absoluteMaxPatchLines) {
      return { ok: false, error: `Step "${s.id}": maxPatchLines ${maxPatchLines} exceeds hard limit ${ATOMIC_LIMITS.absoluteMaxPatchLines}` };
    }
  }

  if (m.expectedSurfaces !== undefined) {
    if (!Array.isArray(m.expectedSurfaces)) return { ok: false, error: "expectedSurfaces must be an array" };
    for (const s of m.expectedSurfaces as unknown[]) {
      if (typeof s !== "string" || !VALID_SURFACES.has(s)) {
        return { ok: false, error: `Unknown surface: "${s}"` };
      }
    }
  }

  const manifest = m as AtomicManifestInput;
  const planVersion =
    typeof m.planVersion === "string" ? m.planVersion : hashManifest(manifest);

  return { ok: true, manifest, planVersion };
}

export function parseBuildContractBlock(
  text: string,
): { raw: string; json: unknown } | null {
  const match =
    /BUILD_CONTRACT_START\s*([\s\S]*?)\s*BUILD_CONTRACT_END/.exec(text);
  if (!match) return null;
  try {
    const json = JSON.parse(match[1]);
    return { raw: match[1], json };
  } catch {
    return null;
  }
}

export function stripBuildContractBlock(text: string): string {
  return text
    .replace(/\nBUILD_CONTRACT_START[\s\S]*?BUILD_CONTRACT_END(?:\n|$)/g, "\n")
    .trim();
}

export function hashManifest(manifest: AtomicManifestInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        manifest.steps.map((s) => ({
          id: s.id,
          seq: s.sequence,
          files: s.targetFiles,
        })),
      ),
    )
    .digest("hex")
    .slice(0, 16);
}

export const ATOMIC_LIMITS = {
  maxFilesPerStep: 5,
  maxPatchLinesPerStep: 300,
  absoluteMaxFilesPerStep: 10,
  absoluteMaxPatchLines: 1000,
} as const;

export function buildInitialContract(
  manifest: AtomicManifestInput,
  resolvedPolicy: AuthorizationPolicy,
  planVersion: string,
  rollbackTarget: string | null,
): BuildStateContract {
  const allTargetFiles = [
    ...new Set(manifest.steps.flatMap((s) => s.targetFiles)),
  ];
  const normalizedSteps: AtomicStepManifest[] = manifest.steps.map((s) => ({
    id: s.id,
    sequence: s.sequence,
    title: s.title,
    targetFiles: s.targetFiles,
    requiredEvidence: s.requiredEvidence,
    maxFiles: s.maxFiles ?? ATOMIC_LIMITS.maxFilesPerStep,
    maxPatchLines: s.maxPatchLines ?? ATOMIC_LIMITS.maxPatchLinesPerStep,
    allowNewDependencies: s.allowNewDependencies ?? false,
  }));

  return {
    issueType: manifest.buildType === "project-file" ? "UI_BEHAVIOR" : "CONTENT_EDIT",
    requiredSteps: [],
    completedSteps: [],
    outcome: { code: "NOT_STARTED", label: "Plan pending authorization", complete: false, pendingVerification: [] },

    buildType: manifest.buildType,
    authorizationPolicy: resolvedPolicy,
    atomicPolicy: manifest.atomicPolicy,
    estimatedAtomicSteps: normalizedSteps.length,

    approvedPlanVersion: null,
    approvedBy: null,
    approvedAt: null,

    expectedSurfaces: manifest.expectedSurfaces ?? ["chat", "timeline"],
    changesExpected: manifest.changesExpected ?? (manifest.buildType === "project-file"),
    previewDestination: manifest.previewDestination ?? null,
    localDevExpected: manifest.localDevExpected ?? false,
    iterationStrategy: manifest.iterationStrategy ?? "modify-project-files",

    targetFiles: allTargetFiles,
    expectedArtifacts: [],
    rollbackTarget,
    verificationCriteria: manifest.verificationCriteria ?? "",

    steps: normalizedSteps,
    requestAuthorization: null,
  };
}
