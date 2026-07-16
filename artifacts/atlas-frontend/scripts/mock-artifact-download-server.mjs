/**
 * Local authenticated stand-in for:
 *   GET /api/projects/260/artifacts/680/download
 *
 * Mirrors production headers from projectArtifacts download + htmlAppRenderer.
 * Cookie: atlas-session=probe-ok
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_DOWNLOAD_PORT || 8790);
const HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Axiom Activity Ledger</title></head>
<body><h1>Axiom Activity Ledger</h1><p>mock probe body</p></body>
</html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/login") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body>login</body></html>");
    return;
  }
  if (url.pathname !== "/api/projects/260/artifacts/680/download") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  const cookie = req.headers.cookie || "";
  if (!cookie.includes("atlas-session=probe-ok")) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Content-Disposition": 'attachment; filename="Axiom Activity Ledger.html"',
  });
  res.end(HTML);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock download listening on http://127.0.0.1:${PORT}`);
});
