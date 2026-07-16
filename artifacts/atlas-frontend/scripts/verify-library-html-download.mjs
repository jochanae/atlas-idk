/**
 * Manual probe for Library → Draft Preview HTML retrieval.
 *
 * Usage (authenticated browser session cookie required):
 *   node scripts/verify-library-html-download.mjs \
 *     --projectId=260 --artifactId=680 \
 *     --cookie='connect.sid=...' \
 *     --base=https://YOUR_HOST
 *
 * Without credentials, this prints the exact frontend call and exits 2.
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    projectId: { type: "string", default: "260" },
    artifactId: { type: "string", default: "680" },
    cookie: { type: "string" },
    base: { type: "string", default: "" },
  },
});

const projectId = values.projectId;
const artifactId = values.artifactId;
const path = `/api/projects/${projectId}/artifacts/${artifactId}/download`;
const url = `${values.base || ""}${path}`;

console.log("=== Library HTML retrieval probe ===");
console.log("Exact frontend call:");
console.log(`  const res = await fetch(${JSON.stringify(path)}, { credentials: "include" });`);
console.log("  const contentType = res.headers.get('content-type');");
console.log("  const disposition = res.headers.get('content-disposition');");
console.log("  const body = await res.text();");
console.log("  const looksHtml = /^\\s*<!DOCTYPE\\s+html/i.test(body) || /<html[\\s>]/i.test(body);");
console.log("");
console.log("Alternate lightweight probe (JSON preview, may embed html):");
console.log(`  GET /api/projects/${projectId}/artifacts/${artifactId}/preview`);
console.log("");

if (!values.cookie) {
  console.log("No --cookie provided; skipping live request.");
  console.log("Code-path expectation (htmlAppRenderer): mimeType text/html, extension html,");
  console.log("download sets Content-Disposition: attachment and streams object storage bytes.");
  process.exit(2);
}

const res = await fetch(url, {
  headers: { Cookie: values.cookie },
  redirect: "manual",
});

const contentType = res.headers.get("content-type");
const disposition = res.headers.get("content-disposition");
const body = await res.text();
const looksHtml = /^\s*<!DOCTYPE\s+html/i.test(body) || /<html[\s>]/i.test(body);

console.log("status:", res.status);
console.log("content-type:", contentType);
console.log("content-disposition:", disposition);
console.log("bodyLength:", body.length);
console.log("startsWithDoctypeOrHtml:", looksHtml);
console.log("bodyHead:", JSON.stringify(body.slice(0, 160)));
process.exit(res.ok && looksHtml ? 0 : 1);
