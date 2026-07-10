// Verification Engine — F6A Stage 1.
//
// A shared pass/fail contract for every file-backed artifact, mirroring the
// plug-in pattern of artifactEngine.ts. Verifiers register per artifact type
// and only implement format-specific structural checks; this module owns the
// universal checks every format must satisfy (file exists, row persisted,
// Ledger linked, not truncated, etc.) plus persistence of the result.
//
// Deliberately kept separate from artifact *generation* status
// ("generated" | "needs_review"): that field already has one consumer
// (useChatStream.ts gating auto-render vs review) and overloading it with a
// "failed" value would be a silent breaking change for that consumer. This
// result lives under `metadata.verification` instead.
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";
import type { ArtifactRenderOutput, ArtifactCategory } from "./artifactEngine";

const objectStorageService = new ObjectStorageService();

export interface VerificationCheck {
  key: string;
  pass: boolean;
  /** Required when pass=false — verifiers must never fail silently. */
  reason?: string;
}

export type FailureClass = "transient" | "content-shape" | "permanent";

export interface VerificationResult {
  status: "verified" | "failed";
  checks: VerificationCheck[];
  /** Only set when status === "failed". Drives the one-shot auto-retry. */
  failureClass?: FailureClass;
  retryable: boolean;
  verifiedAt: string;
}

export interface VerifierContext<TInput = unknown> {
  buffer: Buffer;
  rendered: ArtifactRenderOutput;
  input: TInput;
  projectId: number;
}

export interface ArtifactVerifier<TInput = unknown> {
  /** Must match the ArtifactRenderer.type it verifies. */
  type: string;
  /** Format-specific structural checks (opens, expected shape, etc). */
  verify(ctx: VerifierContext<TInput>): Promise<VerificationCheck[]>;
}

const verifiers = new Map<string, ArtifactVerifier<any>>();

export function registerArtifactVerifier(verifier: ArtifactVerifier<any>): void {
  verifiers.set(verifier.type, verifier);
}

export function getArtifactVerifier(type: string): ArtifactVerifier<any> | undefined {
  return verifiers.get(type);
}

/**
 * Classifies a thrown error/failure reason into a retry decision.
 *
 * Only "transient" (network/storage blips) and "content-shape" (renderer
 * produced structurally wrong output that a re-render might fix, e.g. a
 * truncated LLM completion) are retryable exactly once. Missing credentials,
 * unsupported formats, storage permission failures, and deterministic
 * validation errors (e.g. a verifier that will always fail on this input)
 * are "permanent" and must never be retried automatically.
 */
export function classifyFailure(reason: string): FailureClass {
  const r = reason.toLowerCase();
  if (
    /credential|permission|forbidden|unauthorized|unsupported format|no renderer registered|invalid input|schema validation/.test(
      r,
    )
  ) {
    return "permanent";
  }
  if (/timeout|network|econnreset|storage (failed|error)|fetch failed|503|rate limit/.test(r)) {
    return "transient";
  }
  if (/truncat|empty|incomplete|missing (slide|section|sheet)|unbalanced|cut off/.test(r)) {
    return "content-shape";
  }
  return "permanent";
}

function checkFailureClass(checks: VerificationCheck[]): FailureClass {
  const firstFailure = checks.find((c) => !c.pass);
  return classifyFailure(firstFailure?.reason ?? "");
}

/**
 * Universal checks every artifact type must pass, regardless of format.
 * Uses the object storage client directly (file.exists() / file.download())
 * rather than calling the public download HTTP route — that route carries
 * auth/session/request-context concerns that don't belong inside the engine.
 */
async function runUniversalChecks(params: {
  objectPath: string;
  rendered: ArtifactRenderOutput;
  category: ArtifactCategory;
  rowPersisted: boolean;
  ledgerEntryId: number | null;
}): Promise<{ checks: VerificationCheck[]; storedBuffer: Buffer | null }> {
  const checks: VerificationCheck[] = [];
  let storedBuffer: Buffer | null = null;

  // 1. renderer completed
  const rendererCompleted = !!params.rendered?.buffer && params.rendered.buffer.byteLength > 0;
  checks.push({
    key: "renderer-completed",
    pass: rendererCompleted,
    ...(rendererCompleted ? {} : { reason: "Renderer produced an empty or missing buffer." }),
  });

  // 2. artifact file exists in object storage (direct storage check)
  let fileExists = false;
  try {
    const file = await objectStorageService.getObjectEntityFile(params.objectPath);
    const [exists] = await file.exists();
    fileExists = exists;
    if (exists) {
      const [downloaded] = await file.download();
      storedBuffer = downloaded;
    }
  } catch (err) {
    logger.warn({ err, objectPath: params.objectPath }, "verificationEngine: storage check failed");
  }
  checks.push({
    key: "file-exists",
    pass: fileExists,
    ...(fileExists ? {} : { reason: "Rendered file was not found in object storage after upload." }),
  });

  // 3. project_artifacts row persisted
  checks.push({
    key: "row-persisted",
    pass: params.rowPersisted,
    ...(params.rowPersisted ? {} : { reason: "project_artifacts row failed to persist." }),
  });

  // 4. Ledger entry created
  const ledgerOk = params.ledgerEntryId != null;
  checks.push({
    key: "ledger-entry-created",
    pass: ledgerOk,
    ...(ledgerOk ? {} : { reason: "Ledger entry insert failed or was skipped." }),
  });

  // 5. preview payload present where the category expects one
  const previewOk = !!params.rendered.preview && Object.keys(params.rendered.preview).length > 0;
  checks.push({
    key: "preview-present",
    pass: previewOk,
    ...(previewOk ? {} : { reason: "No preview payload was produced for this artifact." }),
  });

  // 6. output not truncated — compares expectedCounts (if the renderer declared any)
  // against what the storage/preview evidence actually shows.
  const expected = params.rendered.expectedCounts;
  if (expected && Object.keys(expected).length > 0) {
    const preview = params.rendered.preview ?? {};
    let truncated = false;
    let truncatedKey = "";
    for (const [key, expectedValue] of Object.entries(expected)) {
      const singular = key.endsWith("s") ? key.slice(0, -1) : key;
      const candidateKeys = [`${singular}Count`, `${key}Count`, key];
      const previewRecord = preview as Record<string, unknown>;
      const actual = candidateKeys
        .map((candidateKey) => previewRecord[candidateKey])
        .find((value) => typeof value === "number");
      if (typeof actual === "number" && actual < expectedValue) {
        truncated = true;
        truncatedKey = key;
        break;
      }
    }
    checks.push({
      key: "not-truncated",
      pass: !truncated,
      ...(truncated
        ? { reason: `Output looks truncated — fewer ${truncatedKey} than expected.` }
        : {}),
    });
  }

  return { checks, storedBuffer };
}

export async function verifyArtifact<TInput>(params: {
  type: string;
  category: ArtifactCategory;
  projectId: number;
  input: TInput;
  rendered: ArtifactRenderOutput;
  objectPath: string;
  rowPersisted: boolean;
  ledgerEntryId: number | null;
}): Promise<VerificationResult> {
  const { checks: universalChecks, storedBuffer } = await runUniversalChecks({
    objectPath: params.objectPath,
    rendered: params.rendered,
    category: params.category,
    rowPersisted: params.rowPersisted,
    ledgerEntryId: params.ledgerEntryId,
  });

  let formatChecks: VerificationCheck[] = [];
  const verifier = getArtifactVerifier(params.type);
  if (verifier) {
    try {
      formatChecks = await verifier.verify({
        buffer: storedBuffer ?? params.rendered.buffer,
        rendered: params.rendered,
        input: params.input,
        projectId: params.projectId,
      });
    } catch (err) {
      logger.warn({ err, type: params.type }, "verificationEngine: format verifier threw — treating as failed check");
      formatChecks = [
        {
          key: "format-verifier-error",
          pass: false,
          reason: err instanceof Error ? err.message : "Format verifier threw an unexpected error.",
        },
      ];
    }
  }

  const checks = [...universalChecks, ...formatChecks];
  const failed = checks.some((c) => !c.pass);

  if (!failed) {
    return { status: "verified", checks, retryable: false, verifiedAt: new Date().toISOString() };
  }

  const failureClass = checkFailureClass(checks);
  return {
    status: "failed",
    checks,
    failureClass,
    retryable: failureClass === "transient" || failureClass === "content-shape",
    verifiedAt: new Date().toISOString(),
  };
}
