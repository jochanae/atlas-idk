// Visual QA Engine — F6B.
//
// F6A (verificationEngine.ts) answers "is this file mechanically valid" —
// did the renderer succeed, does every requested slide/section exist, does
// the file reopen. This engine is the next, additive layer: render the
// artifact and judge whether it actually *looks* right — text overflow,
// empty slides, low contrast, orphaned/sparse bullets.
//
// Deliberately mirrors verificationEngine.ts's plug-in pattern (per-type
// registration, universal result shape) but is NOT merged into
// `VerificationResult` — the task calls for "a visualQA section" alongside
// F6A's fields, not overloading them. Callers persist this result at
// `metadata.verification.visualQA`, a sibling of `status`/`checks`.
import { renderToImages, type RenderableFormat } from "./renderToImages";
import { logger } from "./logger";

export type VisualQASeverity = "warning" | "error";

export interface VisualQAIssue {
  /** Stable machine-readable rule id, e.g. "empty-slide", "low-contrast". */
  rule: string;
  severity: VisualQASeverity;
  /** 0-based page/slide index the issue was found on, when applicable. */
  pageIndex?: number;
  message: string;
}

export interface VisualQAResult {
  status: "checked" | "skipped" | "unavailable";
  /** Populated when status !== "checked" — must never be a silent skip. */
  reason?: string;
  pagesChecked: number;
  issues: VisualQAIssue[];
  checkedAt: string;
}

export interface VisualQACheckerContext<TInput = unknown> {
  /** One rendered PNG per page/slide, in order. */
  pages: Buffer[];
  input: TInput;
  /** Renderer-supplied preview payload (e.g. slide headings/bullets), when present. */
  preview: Record<string, unknown> | null;
}

export interface VisualQAChecker<TInput = unknown> {
  /** Must match the ArtifactRenderer.type it checks. */
  type: string;
  /** Which rasterizable format this type's file actually is (pptx renders via LibreOffice->PDF; pdf skips that step). */
  format: RenderableFormat;
  check(ctx: VisualQACheckerContext<TInput>): Promise<VisualQAIssue[]>;
}

const checkers = new Map<string, VisualQAChecker<any>>();

export function registerVisualQAChecker(checker: VisualQAChecker<any>): void {
  checkers.set(checker.type, checker);
}

export function getVisualQAChecker(type: string): VisualQAChecker<any> | undefined {
  return checkers.get(type);
}

export async function runVisualQA<TInput>(params: {
  type: string;
  buffer: Buffer;
  input: TInput;
  preview: Record<string, unknown> | null;
}): Promise<VisualQAResult> {
  const checker = getVisualQAChecker(params.type);
  const checkedAt = new Date().toISOString();

  if (!checker) {
    // Not every artifact type has a visual QA rule set yet (out of scope for
    // this pass — see task-173). Recorded explicitly so this reads as "not
    // yet supported for this type", not as a silent absence of data.
    return { status: "skipped", reason: `No visual QA checker registered for type "${params.type}".`, pagesChecked: 0, issues: [], checkedAt };
  }

  const rendered = await renderToImages(params.buffer, checker.format);
  if (rendered.status !== "rendered") {
    return {
      status: rendered.status === "unavailable" ? "unavailable" : "skipped",
      reason: rendered.reason,
      pagesChecked: 0,
      issues: [],
      checkedAt,
    };
  }

  try {
    const issues = await checker.check({
      pages: rendered.pages.map((p) => p.png),
      input: params.input,
      preview: params.preview,
    });
    return { status: "checked", pagesChecked: rendered.pages.length, issues, checkedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, type: params.type }, "visualQAEngine: checker threw — reporting as skipped, not failing the artifact");
    return { status: "skipped", reason: `Visual QA checker threw: ${message}`, pagesChecked: rendered.pages.length, issues: [], checkedAt };
  }
}
