// XLSX structural verifier — F6A Stage 3.
// Opens the real OOXML package, validates sheet count against the renderer's
// declared expectedCounts, and — only when the caller actually requested
// formulas — confirms at least one <f> formula element survived into the
// worksheet XML (i.e. formulas weren't silently flattened to literal values).
import { registerArtifactVerifier, type VerificationCheck } from "../verificationEngine";
import { openOoxmlPackage, readEntryText, entriesMatching } from "./ooxmlUtils";

registerArtifactVerifier({
  type: "xlsx",
  async verify({ buffer, rendered }): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    let pkg;
    try {
      pkg = await openOoxmlPackage(buffer);
    } catch (err) {
      checks.push({
        key: "xlsx-opens",
        pass: false,
        reason: err instanceof Error ? err.message : "Failed to open XLSX.",
      });
      return checks;
    }
    checks.push({ key: "xlsx-opens", pass: true });

    const hasWorkbookXml = pkg.fileNames.includes("xl/workbook.xml");
    checks.push({
      key: "xlsx-workbook-part",
      pass: hasWorkbookXml,
      ...(hasWorkbookXml ? {} : { reason: "Missing xl/workbook.xml — package is not a real workbook." }),
    });
    if (!hasWorkbookXml) return checks;

    const workbookXml = (await readEntryText(pkg, "xl/workbook.xml")) ?? "";
    const declaredSheetNames = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) => m[1]);
    const sheetFiles = entriesMatching(pkg, /^xl\/worksheets\/sheet\d+\.xml$/);

    const expectedSheets = rendered.expectedCounts?.sheets;
    const sheetCountOk = expectedSheets == null || sheetFiles.length >= expectedSheets;
    checks.push({
      key: "xlsx-sheet-count",
      pass: sheetCountOk,
      ...(sheetCountOk
        ? {}
        : { reason: `Expected ${expectedSheets} sheets but only found ${sheetFiles.length}.` }),
    });

    checks.push({
      key: "xlsx-sheet-names-present",
      pass: declaredSheetNames.length === sheetFiles.length && declaredSheetNames.length > 0,
      ...(declaredSheetNames.length > 0
        ? {}
        : { reason: "Workbook declares no named sheets in xl/workbook.xml." }),
    });

    const preview = (rendered.preview ?? {}) as {
      formulasRequested?: boolean;
    };
    if (preview.formulasRequested) {
      let foundFormula = false;
      for (const sheetPath of sheetFiles) {
        const xml = await readEntryText(pkg, sheetPath);
        if (xml && /<f[ >]/.test(xml)) {
          foundFormula = true;
          break;
        }
      }
      checks.push({
        key: "xlsx-formulas-preserved",
        pass: foundFormula,
        ...(foundFormula
          ? {}
          : { reason: "Formulas were requested but no <f> formula element was found in any worksheet." }),
      });
    }

    return checks;
  },
});
