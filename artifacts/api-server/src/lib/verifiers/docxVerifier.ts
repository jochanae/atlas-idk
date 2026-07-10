// DOCX structural verifier — F6A Stage 2.
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";
import { openOoxmlPackage, readEntryText } from "./ooxmlUtils";

registerArtifactVerifier({
  type: "docx",
  async verify({ buffer, rendered }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    let pkg;
    try {
      pkg = await openOoxmlPackage(buffer);
    } catch (err) {
      checks.push({ key: "docx-opens", pass: false, reason: err instanceof Error ? err.message : "Failed to open DOCX." });
      return checks;
    }
    checks.push({ key: "docx-opens", pass: true });

    const hasDocumentXml = pkg.fileNames.includes("word/document.xml");
    checks.push({
      key: "docx-document-part",
      pass: hasDocumentXml,
      ...(hasDocumentXml ? {} : { reason: "Missing word/document.xml — package is not a real document." }),
    });
    if (!hasDocumentXml) return checks;

    const xml = await readEntryText(pkg, "word/document.xml");
    const bodyMatch = xml && /<w:body>[\s\S]*<\/w:body>/.test(xml);
    checks.push({
      key: "docx-parses",
      pass: !!bodyMatch,
      ...(bodyMatch ? {} : { reason: "word/document.xml is present but has no parseable <w:body>." }),
    });

    const headingCount = xml ? (xml.match(/<w:pStyle w:val="Heading1"\/>/g) ?? []).length : 0;
    const expectedSections = rendered.expectedCounts?.sections;
    const sectionsOk = expectedSections == null || headingCount >= expectedSections;
    checks.push({
      key: "docx-expected-sections",
      pass: sectionsOk,
      ...(sectionsOk
        ? {}
        : { reason: `Expected ${expectedSections} section headings but only found ${headingCount}.` }),
    });

    return checks;
  },
});
