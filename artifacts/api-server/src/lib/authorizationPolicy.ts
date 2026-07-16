import type { AuthorizationPolicy, AtomicManifestInput } from "./buildStateContract";

export interface PolicyResolutionInput {
  proposal?: AuthorizationPolicy | null;
  manifest: AtomicManifestInput;
  isFirstProjectBuild: boolean;
  hasExistingAuthorizedRun: boolean;
}

const DEPLOY_EVIDENCE = new Set(["DEPLOY"]);
const SCHEMA_EVIDENCE = new Set(["SCHEMA_MUTATION"]);
const EXTERNAL_WRITE_EVIDENCE = new Set(["GITHUB_PUSH"]);

/**
 * Resolve the authorization policy for a build run.
 *
 * Atlas may propose a policy via manifest.authorizationPolicyProposal.
 * The server overrides based on deterministic conditions — the model
 * cannot bypass a required confirmation by proposing a weaker policy.
 *
 * Override priority (highest first):
 *   1. Deploy/publish evidence → destructive-confirmation-required
 *   2. Schema/DB mutation evidence → destructive-confirmation-required
 *   3. GitHub push evidence → external-write-confirmation-required
 *   4. First project build → explicit-confirmation-required
 *   5. More than 4 distinct target files → explicit-confirmation-required
 *   6. step-by-step on a new (unauthorised) project → explicit-confirmation-required
 *   7. Bounded edit in an already-authorized run ≤3 files → request-itself-authorizes
 *   8. single-artifact-generation → explicit-confirmation-required
 *   9. Fallback → explicit-confirmation-required
 */
export function resolveAuthorizationPolicy(
  input: PolicyResolutionInput,
): AuthorizationPolicy {
  const { manifest, isFirstProjectBuild, hasExistingAuthorizedRun } = input;

  const allTargetFiles = new Set(manifest.steps.flatMap((s) => s.targetFiles ?? []));
  const allEvidence = manifest.steps.flatMap((s) => s.requiredEvidence ?? []);

  if (allEvidence.some((v) => DEPLOY_EVIDENCE.has(v.toUpperCase()))) {
    return "destructive-confirmation-required";
  }

  if (allEvidence.some((v) => SCHEMA_EVIDENCE.has(v.toUpperCase()))) {
    return "destructive-confirmation-required";
  }

  if (allEvidence.some((v) => EXTERNAL_WRITE_EVIDENCE.has(v.toUpperCase()))) {
    return "external-write-confirmation-required";
  }

  if (isFirstProjectBuild) {
    return "explicit-confirmation-required";
  }

  if (allTargetFiles.size > 4) {
    return "explicit-confirmation-required";
  }

  if (
    manifest.atomicPolicy === "step-by-step" &&
    !hasExistingAuthorizedRun
  ) {
    return "explicit-confirmation-required";
  }

  if (hasExistingAuthorizedRun && allTargetFiles.size <= 3) {
    return "request-itself-authorizes";
  }

  if (manifest.atomicPolicy === "single-artifact-generation") {
    return "explicit-confirmation-required";
  }

  return "explicit-confirmation-required";
}

/**
 * Check whether a verb requires destructive or external-write confirmation
 * regardless of the broader run policy. Used as a secondary gate for
 * specific actions that are always high-risk.
 */
export function verbRequiresConfirmation(verb: string): AuthorizationPolicy | null {
  const v = verb.toUpperCase();
  if (v === "DEPLOY" || v === "SCHEMA_MUTATION") return "destructive-confirmation-required";
  if (v === "GITHUB_PUSH") return "external-write-confirmation-required";
  return null;
}
