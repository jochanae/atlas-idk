// PPTX structural verifier — F6A Stage 2.
// Opens the real package (not just a zip-signature check) and validates slide
// count, that no slide is empty, and that slide relationships/media resolve.
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";
import { openOoxmlPackage, readEntryText, entriesMatching } from "./ooxmlUtils";

registerArtifactVerifier({
  type: "pptx",
  async verify({ buffer, rendered }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    let pkg;
    try {
      pkg = await openOoxmlPackage(buffer);
    } catch (err) {
      checks.push({ key: "pptx-opens", pass: false, reason: err instanceof Error ? err.message : "Failed to open PPTX." });
      return checks;
    }
    checks.push({ key: "pptx-opens", pass: true });

    const hasPresentationXml = pkg.fileNames.includes("ppt/presentation.xml");
    checks.push({
      key: "pptx-presentation-part",
      pass: hasPresentationXml,
      ...(hasPresentationXml ? {} : { reason: "Missing ppt/presentation.xml — package is not a real presentation." }),
    });

    const slideFiles = entriesMatching(pkg, /^ppt\/slides\/slide\d+\.xml$/).sort();
    const expectedSlides = rendered.expectedCounts?.slides;
    const slideCountOk = expectedSlides == null || slideFiles.length >= expectedSlides;
    checks.push({
      key: "pptx-slide-count",
      pass: slideCountOk,
      ...(slideCountOk
        ? {}
        : { reason: `Expected ${expectedSlides} slides but only found ${slideFiles.length}.` }),
    });

    let emptySlide: string | null = null;
    for (const slidePath of slideFiles) {
      const xml = await readEntryText(pkg, slidePath);
      const hasText = !!xml && /<a:t>[^<]+<\/a:t>/.test(xml);
      if (!hasText) {
        emptySlide = slidePath;
        break;
      }
    }
    checks.push({
      key: "pptx-no-empty-slides",
      pass: !emptySlide,
      ...(emptySlide ? { reason: `Slide "${emptySlide}" has no visible text content.` } : {}),
    });

    const relFiles = entriesMatching(pkg, /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/);
    let brokenRel: string | null = null;
    for (const relPath of relFiles) {
      const xml = await readEntryText(pkg, relPath);
      if (!xml) continue;
      const targets = [...xml.matchAll(/Target="([^"]+)"/g)].map((m) => m[1]);
      for (const target of targets) {
        if (target.startsWith("http") || target.startsWith("../")) {
          const resolved = target.startsWith("../") ? `ppt/${target.replace("../", "")}` : null;
          if (resolved && !pkg.fileNames.includes(resolved)) {
            brokenRel = `${relPath} -> ${target}`;
            break;
          }
        }
      }
      if (brokenRel) break;
    }
    checks.push({
      key: "pptx-relationships-valid",
      pass: !brokenRel,
      ...(brokenRel ? { reason: `Broken relationship reference: ${brokenRel}` } : {}),
    });

    return checks;
  },
});
