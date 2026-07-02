import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import shellRouter from "./routes/shell";
import { logger } from "./lib/logger";
import { createReadStream, statSync, readFileSync } from "fs";
import path from "path";
import { projectWorkspaceDir } from "./lib/projectWorkspace";
import { WebhookHandlers } from "./webhookHandlers";

const app: Express = express();

// ── Stripe webhook — MUST be registered before express.json() ──────────────
// Stripe sends raw Buffer; express.json() would destroy it
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature' });
      return;
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, 'Stripe webhook error');
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// ── Standard middleware ────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
const ALLOWED_ORIGINS: Set<string> = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://axiomsystem.app",
  "https://www.axiomsystem.app",
  "https://axiom-atlas-mocha.vercel.app",
  "https://lovable.dev",
  "https://5360bfd7-938b-4b5e-b3a5-5d9c9f8e7a2b.lovableproject.com",
  "https://atlas-idk.vercel.app",
  "https://atlas-iq.lovable.app",
  ...(process.env.APP_URL ? [process.env.APP_URL] : []),
  ...(process.env.REPLIT_DOMAINS?.split(",").map((d) => `https://${d.trim()}`) ?? []),
  ...(process.env.RAILWAY_PUBLIC_DOMAIN ? [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`] : []),
  ...(process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
  ...(process.env.EXTRA_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      if (/^https:\/\/([a-z0-9-]+\.)+replit\.(dev|app)$/.test(origin)) return callback(null, true);
      if (/^https:\/\/([a-z0-9-]+\.)*lovable\.app$/.test(origin)) return callback(null, true);
      if (/^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/.test(origin)) return callback(null, true);
      if (/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/.test(origin)) return callback(null, true);
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-GitHub-Token", "X-Requested-With"],
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
// Fallback: some clients (Lovable preview, certain fetch polyfills) omit the
// Content-Type header. express.json() silently skips those — body stays
// undefined. express.text('*/*') reads whatever body-parser left unread, then
// the inline middleware tries to JSON-parse it. This makes every POST/PUT/PATCH
// resilient regardless of whether the client sent a Content-Type header.
app.use(express.text({ limit: "20mb", type: "*/*" }));
app.use((req, _res, next) => {
  if (typeof req.body === "string") {
    const trimmed = req.body.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        // leave as string — let the route validator produce the right error
      }
    }
  }
  next();
});
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ── Public static preview (no auth) ──────────────────────────────────────
// Serves a pre-built workspace dist/ so anyone can confirm the app renders.
// Build first: cd .project-workspaces/<id> && npm run build
const PREVIEW_MIME: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
};
app.use("/api/preview/workspace/:projectId", (req, res) => {
  const projectId = Number(req.params["projectId"]);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }
  const distDir = path.join(projectWorkspaceDir(projectId), "dist");
  const base = `/api/preview/workspace/${projectId}`;

  let filePath = (!req.path || req.path === "/") ? "/index.html" : req.path;
  if (!path.extname(filePath)) filePath = "/index.html";
  const fullPath = path.join(distDir, filePath);
  if (!fullPath.startsWith(distDir)) { res.status(403).end(); return; }

  const serveIndex = () => {
    const idx = path.join(distDir, "index.html");
    let html: string;
    try { html = readFileSync(idx, "utf8"); } catch { res.status(404).send("No build found — run npm run build in the project workspace first."); return; }
    // Rewrite absolute asset paths so they resolve under the preview base
    html = html.replace(/(src|href)="\/(assets\/[^"]+)"/g, `$1="${base}/$2"`);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  };

  if (filePath === "/index.html") { serveIndex(); return; }

  try { statSync(fullPath); } catch { serveIndex(); return; }
  const mime = PREVIEW_MIME[path.extname(fullPath).toLowerCase()] ?? "application/octet-stream";
  res.setHeader("Content-Type", mime);
  createReadStream(fullPath).pipe(res);
});

// ── Public share route — /share/:token (no auth required) ─────────────────
// Serves the static build output for a project identified by its share token.
app.use("/share/:token", async (req, res) => {
  const token = req.params["token"];
  if (!token || !/^[a-f0-9]{32}$/.test(token)) { res.status(400).send("Invalid share token"); return; }

  let projectId: number | null = null;
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ id: number }>(
      "SELECT id FROM projects WHERE share_token = $1",
      [token]
    );
    projectId = result.rows[0]?.id ?? null;
  } catch {
    res.status(500).send("Database error"); return;
  }

  if (!projectId) { res.status(404).send("Share link not found or has been revoked."); return; }

  const distDir = path.join(projectWorkspaceDir(projectId), "dist");
  const SHARE_MIME: Record<string, string> = {
    ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  };

  const base = `/share/${token}`;
  let filePath = (!req.path || req.path === "/") ? "/index.html" : req.path;
  if (!path.extname(filePath)) filePath = "/index.html";
  const fullPath = path.join(distDir, filePath);
  if (!fullPath.startsWith(distDir)) { res.status(403).end(); return; }

  const serveIndex = () => {
    const idx = path.join(distDir, "index.html");
    let html: string;
    try { html = readFileSync(idx, "utf8"); } catch { res.status(404).send("No build found — the project may not have been built yet."); return; }
    html = html.replace(/(src|href)="\/(assets\/[^"]+)"/g, `$1="${base}/$2"`);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  };

  if (filePath === "/index.html") { serveIndex(); return; }

  try { statSync(fullPath); } catch { serveIndex(); return; }
  const mime = SHARE_MIME[path.extname(fullPath).toLowerCase()] ?? "application/octet-stream";
  res.setHeader("Content-Type", mime);
  createReadStream(fullPath).pipe(res);
});

app.use("/api/shell", shellRouter);
app.use("/api", router);

export default app;
