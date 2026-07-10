// `pdf-parse@1.1.1` ships types only for its top-level `index.js` wrapper
// (via @types/pdf-parse). We import the internal `lib/pdf-parse.js` entry
// point directly instead (see verifiers/pdfVerifier.ts for why), which has
// no bundled declaration — so we declare its shape here, matching
// @types/pdf-parse's default export signature.
declare module "pdf-parse/lib/pdf-parse.js" {
  import type { PDFParseResult, Options } from "pdf-parse";

  function pdfParse(dataBuffer: Buffer | Uint8Array, options?: Options): Promise<PDFParseResult>;
  export default pdfParse;
}
