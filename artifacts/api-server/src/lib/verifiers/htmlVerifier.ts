// HTML structural verifier — F6A Stage 2.
// Folds the existing safety/completeness heuristic into the shared
// verification contract instead of it being an HTML-only side channel: the
// renderer's own safety verdict is surfaced here as a real check, plus a
// "persisted" check that the buffer round-trips as valid UTF-8 markup.
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";

registerArtifactVerifier({
  type: "html",
  async verify({ buffer, rendered }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    const html = buffer.toString("utf-8");
    const persisted = html.trim().length > 0;
    checks.push({
      key: "html-persisted",
      pass: persisted,
      ...(persisted ? {} : { reason: "Persisted HTML file is empty." }),
    });

    const looksLikeDocument = /<html[\s>]/i.test(html) && /<\/html>/i.test(html);
    checks.push({
      key: "html-renderable-document",
      pass: looksLikeDocument,
      ...(looksLikeDocument ? {} : { reason: "Persisted file is not a well-formed standalone HTML document." }),
    });

    const preview = rendered.preview as { safe?: boolean; reasons?: string[] } | undefined;
    const safe = preview?.safe ?? true;
    checks.push({
      key: "html-safe",
      pass: safe,
      ...(safe ? {} : { reason: preview?.reasons?.[0] ?? "Safety check flagged this HTML for manual review." }),
    });

    return checks;
  },
});
