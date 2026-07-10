// Chart (SVG) structural verifier — F6A Stage 3.
// Real parse: confirms the buffer is well-formed XML with an <svg> root
// (not just a string-contains "<svg" check) and that it renders visible
// content — at least one drawable primitive, not an empty canvas.
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";

const DRAWABLE_TAGS = ["rect", "circle", "path", "line", "polyline", "polygon", "text"];

function countDrawableNodes(node: unknown, count = { n: 0 }): number {
  if (Array.isArray(node)) {
    for (const item of node) countDrawableNodes(item, count);
    return count.n;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const tag = key.split(":").pop() ?? key;
      if (DRAWABLE_TAGS.includes(tag)) {
        count.n += Array.isArray(value) ? value.length : 1;
      }
      countDrawableNodes(value, count);
    }
  }
  return count.n;
}

registerArtifactVerifier({
  type: "chart",
  async verify({ buffer }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];
    const text = buffer.toString("utf-8");

    const validation = XMLValidator.validate(text);
    const isWellFormed = validation === true;
    checks.push({
      key: "chart-svg-well-formed",
      pass: isWellFormed,
      ...(isWellFormed
        ? {}
        : {
            reason:
              typeof validation === "object" && "err" in validation
                ? `SVG is not well-formed XML: ${validation.err.msg} (line ${validation.err.line})`
                : "SVG is not well-formed XML.",
          }),
    });
    if (!isWellFormed) return checks;

    const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: false });
    const parsed = parser.parse(text);
    const hasSvgRoot = !!parsed.svg;
    checks.push({
      key: "chart-svg-root",
      pass: hasSvgRoot,
      ...(hasSvgRoot ? {} : { reason: "Parsed XML has no <svg> root element." }),
    });
    if (!hasSvgRoot) return checks;

    const drawableCount = countDrawableNodes(parsed.svg);
    checks.push({
      key: "chart-nonempty",
      pass: drawableCount > 0,
      ...(drawableCount > 0
        ? {}
        : { reason: "SVG has an <svg> root but contains no drawable shapes or text — the chart is empty." }),
    });

    return checks;
  },
});
