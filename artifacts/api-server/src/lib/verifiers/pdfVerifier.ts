// PDF structural verifier — F6A Stage 2.
// Real parse via pdf-parse (not just a "%PDF-" signature check): confirms the
// document opens, reports a nonzero page count, and has extractable text.
// Import the internal lib entry point directly instead of the package's
// `index.js` wrapper: that wrapper runs a `require.main === module`
// "debug mode" check which misfires under bundlers/test runners (module
// parent detection is unreliable there) and tries to read a fixture file
// from disk, throwing ENOENT.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";

registerArtifactVerifier({
  type: "pdf",
  async verify({ buffer }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    const hasHeader = buffer.subarray(0, 5).toString("latin1") === "%PDF-";
    checks.push({
      key: "pdf-header",
      pass: hasHeader,
      ...(hasHeader ? {} : { reason: "File does not start with the %PDF- magic header." }),
    });
    if (!hasHeader) return checks;

    try {
      const parsed = await pdfParse(buffer);
      const pageCount = parsed.numpages ?? 0;
      checks.push({
        key: "pdf-parses",
        pass: true,
      });
      checks.push({
        key: "pdf-nonzero-pages",
        pass: pageCount > 0,
        ...(pageCount > 0 ? {} : { reason: "PDF parsed but reports zero pages." }),
      });
      const text = (parsed.text ?? "").trim();
      checks.push({
        key: "pdf-has-text-content",
        pass: text.length > 0,
        ...(text.length > 0 ? {} : { reason: "No extractable text content found in the PDF." }),
      });
    } catch (err) {
      checks.push({
        key: "pdf-parses",
        pass: false,
        reason: err instanceof Error ? err.message : "Failed to parse PDF content.",
      });
    }

    return checks;
  },
});
