// Mermaid diagram verifier — F6A Stage 3.
// Real check that the stored source is syntactically plausible Mermaid (not
// just a nonempty file): confirms a recognized diagram directive is present
// and the body isn't just that directive with nothing following it.
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";

const DIRECTIVE_PATTERNS: Record<string, RegExp> = {
  flowchart: /^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/im,
  sequence: /^\s*sequenceDiagram\b/im,
  architecture: /^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/im,
};

registerArtifactVerifier({
  type: "mermaid",
  async verify({ buffer, rendered }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];
    const source = buffer.toString("utf-8").trim();

    const nonEmpty = source.length > 0;
    checks.push({
      key: "mermaid-nonempty",
      pass: nonEmpty,
      ...(nonEmpty ? {} : { reason: "Mermaid source file is empty." }),
    });
    if (!nonEmpty) return checks;

    const diagramType = (rendered.preview as { diagramType?: string } | undefined)?.diagramType;
    const pattern = diagramType ? DIRECTIVE_PATTERNS[diagramType] : undefined;
    const hasKnownDirective =
      pattern?.test(source) ?? Object.values(DIRECTIVE_PATTERNS).some((p) => p.test(source));
    checks.push({
      key: "mermaid-valid-directive",
      pass: hasKnownDirective,
      ...(hasKnownDirective
        ? {}
        : {
            reason: diagramType
              ? `Source does not start with a valid directive for a "${diagramType}" diagram (expected e.g. "flowchart TD" or "sequenceDiagram").`
              : "Source does not start with a recognized Mermaid diagram directive.",
          }),
    });

    const directiveOnlyMatch = source.match(/^\s*(flowchart\s+\w+|graph\s+\w+|sequenceDiagram)\s*$/i);
    const hasBody = !directiveOnlyMatch;
    checks.push({
      key: "mermaid-has-body",
      pass: hasBody,
      ...(hasBody ? {} : { reason: "Diagram only contains the directive line — no nodes, edges, or messages were generated." }),
    });

    return checks;
  },
});
