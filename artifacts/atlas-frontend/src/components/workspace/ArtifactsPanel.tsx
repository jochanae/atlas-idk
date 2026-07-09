import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, FileOutput, Wand2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/api";

const DRAFT_TYPES: Array<{ type: string; label: string }> = [
  { type: "draft_email", label: "Email Draft" },
  { type: "draft_slack", label: "Slack Message" },
  { type: "draft_pr", label: "PR Description" },
  { type: "draft_changelog", label: "Changelog Entry" },
];

type ArtifactRecord = {
  id: number | string;
  projectId?: number;
  sessionId?: number | null;
  type: string;
  title: string;
  content?: string;
  createdAt?: string;
  created_at?: string;
  version?: number;
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  source?: "project" | "legacy";
};

type DraftResult = {
  id: number;
  type: string;
  label: string;
  title: string;
  body: string;
};

// Maps a draft artifact type to the Delivery Engine provider that can send it,
// plus the target field(s) the user needs to fill in. draft_changelog has no
// delivery provider yet — it stays copy/download only.
const DELIVERY_BY_DRAFT_TYPE: Record<string, { provider: string; actionLabel: string }> = {
  draft_email: { provider: "email", actionLabel: "Send Email" },
  draft_slack: { provider: "slack", actionLabel: "Post to Slack" },
  draft_pr: { provider: "github_pr", actionLabel: "Open Pull Request" },
};

type DeliveryState = {
  status: "idle" | "sending" | "sent" | "failed";
  error?: string;
  externalRef?: Record<string, unknown> | null;
};

function renderArtifactMarkdown(md: string): string {
  // Minimal markdown -> HTML (headings, bold, italic, code, links, lists, paragraphs)
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      let t = esc(para.join(" "));
      t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      out.push(`<p>${t}</p>`);
      para = [];
    }
  };
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  for (const ln of lines) {
    if (ln.startsWith("```")) {
      flushPara(); closeList();
      if (!inCode) { out.push("<pre><code>"); inCode = true; }
      else { out.push("</code></pre>"); inCode = false; }
      continue;
    }
    if (inCode) { out.push(esc(ln) + "\n"); continue; }
    const h = ln.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); closeList(); out.push(`<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`); continue; }
    const li = ln.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      if (!inList) { out.push("<ul>"); inList = true; }
      let t = esc(li[1]);
      t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      out.push(`<li>${t}</li>`);
      continue;
    }
    if (ln.trim() === "") { flushPara(); closeList(); continue; }
    para.push(ln);
  }
  flushPara(); closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function typeLabel(type: string, metadata: Record<string, unknown>): string {
  const extension = textValue(metadata.extension)?.toLowerCase();
  const normalized = (extension || type || "output").toLowerCase();
  if (normalized === "pptx") return "PowerPoint";
  if (normalized === "docx") return "Word Doc";
  if (normalized === "xlsx") return "Spreadsheet";
  if (normalized === "pdf") return "PDF";
  if (normalized.startsWith("draft_")) return "Draft";
  return normalized.replace(/_/g, " ");
}

function isFileBackedArtifact(a: ArtifactRecord): boolean {
  const metadata = asRecord(a.metadata);
  return Boolean(metadata.objectPath || metadata.extension || metadata.mimeType || metadata.category === "presentation" || metadata.category === "document" || metadata.category === "spreadsheet");
}

function artifactDate(a: ArtifactRecord): string {
  return a.createdAt ?? a.created_at ?? "";
}

export function ArtifactsPanel({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ArtifactRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [draftMenuOpen, setDraftMenuOpen] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<Record<string, string>>({});
  const [delivery, setDelivery] = useState<DeliveryState>({ status: "idle" });
  const draftMenuRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [projectRes, legacyRes] = await Promise.allSettled([
        fetch(`/api/projects/${projectId}/artifacts`, {
          credentials: "include",
          headers: getAuthHeaders(),
        }),
        fetch(`/api/artifacts?projectId=${projectId}`, {
          credentials: "include",
          headers: getAuthHeaders(),
        }),
      ]);

      const projectData = projectRes.status === "fulfilled" && projectRes.value.ok
        ? await projectRes.value.json().catch(() => ({}))
        : {};
      const legacyData = legacyRes.status === "fulfilled" && legacyRes.value.ok
        ? await legacyRes.value.json().catch(() => ({}))
        : {};
      const projectItems: ArtifactRecord[] = ((projectData.artifacts ?? []) as ArtifactRecord[])
        .map((a) => ({ ...a, source: "project" as const }));
      const legacyRaw = Array.isArray(legacyData) ? legacyData : (legacyData.artifacts ?? []);
      const legacyItems: ArtifactRecord[] = (legacyRaw as ArtifactRecord[])
        .map((a) => ({ ...a, source: "legacy" as const }));

      if (projectRes.status === "fulfilled" && legacyRes.status === "fulfilled" && !projectRes.value.ok && !legacyRes.value.ok) {
        throw new Error(`HTTP ${projectRes.value.status}`);
      }

      const merged = [...projectItems, ...legacyItems]
        .sort((a, b) => new Date(artifactDate(b)).getTime() - new Date(artifactDate(a)).getTime());
      setItems(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(`atlas-open-output-${projectId}`);
      if (pending) {
        sessionStorage.removeItem(`atlas-open-output-${projectId}`);
        setExpanded(pending);
      }
    } catch {}

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ artifactId?: number | string; projectId?: number }>).detail ?? {};
      if (detail.projectId && detail.projectId !== projectId) return;
      if (detail.artifactId != null) setExpanded(String(detail.artifactId));
    };
    window.addEventListener("axiom:focus-output", handler);
    return () => window.removeEventListener("axiom:focus-output", handler);
  }, [projectId]);

  useEffect(() => {
    if (!draftMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (draftMenuRef.current && !draftMenuRef.current.contains(e.target as Node)) {
        setDraftMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [draftMenuOpen]);

  const handleGenerateDraft = useCallback(async (type: string, label: string) => {
    setDraftMenuOpen(false);
    setGeneratingDraft(type);
    try {
      const r = await fetch(`/api/projects/${projectId}/deliverables/${type}/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      const artifact = await r.json();
      const preview = artifact?.preview ?? {};
      setDraftResult({
        id: artifact.id,
        type,
        label,
        title: preview.title ?? artifact.title ?? label,
        body: preview.body ?? "",
      });
      setDeliveryTarget({});
      setDelivery({ status: "idle" });
      toast(`${label} generated.`);
      void load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to generate draft.";
      toast(message.includes("No conversation context") ? "Start a conversation first — nothing to draft from yet." : message);
    } finally {
      setGeneratingDraft(null);
    }
  }, [load, projectId]);

  const handleCopyDraft = useCallback(async () => {
    if (!draftResult) return;
    try {
      await navigator.clipboard.writeText(draftResult.body);
      toast("Copied to clipboard.");
    } catch {
      toast("Couldn't copy — select and copy manually.");
    }
  }, [draftResult]);

  const handleDownloadDraft = useCallback(() => {
    if (!draftResult) return;
    window.open(`/api/projects/${projectId}/artifacts/${draftResult.id}/download`, "_blank");
  }, [draftResult, projectId]);

  const handleDeliverDraft = useCallback(async () => {
    if (!draftResult) return;
    const config = DELIVERY_BY_DRAFT_TYPE[draftResult.type];
    if (!config) return;

    let target: Record<string, string> = {};
    if (config.provider === "email") {
      target = { to: (deliveryTarget.to ?? "").trim() };
    } else if (config.provider === "slack") {
      target = { channel: (deliveryTarget.channel ?? "").trim() };
    } else if (config.provider === "github_pr") {
      target = {
        repo: (deliveryTarget.repo ?? "").trim(),
        head: (deliveryTarget.head ?? "").trim(),
        base: (deliveryTarget.base ?? "main").trim(),
      };
    }

    setDelivery({ status: "sending" });
    try {
      const r = await fetch(`/api/projects/${projectId}/artifacts/${draftResult.id}/deliver`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ provider: config.provider, target }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.status === "failed") {
        const message = data?.error || `HTTP ${r.status}`;
        setDelivery({ status: "failed", error: message });
        toast(message);
        return;
      }
      setDelivery({ status: "sent", externalRef: data?.externalRef ?? null });
      toast(`${config.actionLabel} succeeded.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Delivery failed.";
      setDelivery({ status: "failed", error: message });
      toast(message);
    }
  }, [draftResult, deliveryTarget, projectId]);

  const handleDelete = useCallback(async (id: string | number) => {
    const item = (items ?? []).find((a) => String(a.id) === String(id));
    if (item?.source !== "project") return;
    try {
      const r = await fetch(`/api/projects/${projectId}/artifacts/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error();
      setItems((prev) => (prev ?? []).filter((a) => a.id !== id));
      toast("Output deleted.");
    } catch {
      toast("Failed to delete output.");
    }
  }, [items, projectId]);

  const handleExport = useCallback((a: ArtifactRecord) => {
    const safe = a.title.replace(/[^a-z0-9\-_. ]+/gi, "_").slice(0, 80) || "artifact";
    const blob = new Blob([a.content ?? ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${safe}.md`;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  }, []);

  const handleExportPDF = useCallback((a: ArtifactRecord) => {
    const win = window.open("", "_blank");
    if (!win) { toast("Pop-up blocked — allow pop-ups to export PDF."); return; }
    const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const bodyHtml = renderArtifactMarkdown(a.content ?? "");
    const titleEsc = escapeHtml(a.title);
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${titleEsc}</title>
<style>
  @page { size: Letter; margin: 0.75in; }
  html, body { background: #ffffff; color: #111827; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    margin: 0;
    padding: 0.25in 0.35in;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-size: 24pt; line-height: 1.25; margin: 0 0 0.4em; font-weight: 700; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
  h2 { font-size: 18pt; line-height: 1.3; margin: 1.2em 0 0.4em; font-weight: 600; }
  h3 { font-size: 14pt; margin: 1em 0 0.35em; font-weight: 600; }
  h4, h5, h6 { font-size: 12pt; margin: 0.9em 0 0.3em; font-weight: 600; }
  p { margin: 0 0 0.75em; }
  ul, ol { margin: 0 0 0.85em 1.4em; padding: 0; }
  li { margin: 0.2em 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5pt; background: #f3f4f6; padding: 1px 5px; border-radius: 4px; }
  pre { background: #f3f4f6; padding: 12px 14px; border-radius: 6px; overflow: auto; page-break-inside: avoid; }
  pre code { background: transparent; padding: 0; font-size: 10pt; }
  a { color: #2563eb; text-decoration: underline; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
</style>
</head>
<body>
  <h1>${titleEsc}</h1>
  ${bodyHtml}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 50);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }, []);


  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 14px" }} className="scrollbar-none">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, position: "relative" }} ref={draftMenuRef}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <FileOutput size={13} /> Outputs
          </div>
          <div style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", opacity: 0.6, marginTop: 3 }}>
            Generated files, decks, documents, and saved drafts.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDraftMenuOpen((v) => !v)}
          disabled={generatingDraft !== null}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em",
            background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.4)", color: "var(--atlas-gold)",
            padding: "6px 12px", borderRadius: 8, cursor: generatingDraft ? "default" : "pointer",
            opacity: generatingDraft ? 0.6 : 1,
          }}
        >
          <Wand2 size={13} />
          {generatingDraft ? "Generating…" : "Generate Draft"}
          <ChevronDown size={12} style={{ opacity: 0.7, transform: draftMenuOpen ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
        </button>
        {draftMenuOpen && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20,
              background: "var(--atlas-card)", border: "1px solid var(--atlas-border)", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minWidth: 180, overflow: "hidden",
            }}
          >
            {DRAFT_TYPES.map((d) => (
              <button
                key={d.type}
                type="button"
                onClick={() => void handleGenerateDraft(d.type, d.label)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "9px 12px",
                  fontSize: "var(--ts-sm)", color: "var(--atlas-fg)", background: "transparent", border: "none", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.10)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {draftResult && (
        <div style={{ border: "1px solid rgba(201,162,76,0.4)", borderRadius: 10, background: "var(--atlas-card)", padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--atlas-gold)", marginBottom: 4 }}>{draftResult.label} — copy-ready draft</div>
              <div style={{ fontSize: "var(--ts-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draftResult.title}</div>
            </div>
            <button type="button" onClick={() => setDraftResult(null)} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}>Dismiss</button>
          </div>
          <pre style={{ marginTop: 10, marginBottom: 10, maxHeight: 260, overflowY: "auto", fontSize: "var(--ts-sm)", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--atlas-fg)", fontFamily: "inherit", background: "transparent" }}>{draftResult.body}</pre>
          {(() => {
            const deliveryConfig = DELIVERY_BY_DRAFT_TYPE[draftResult.type];
            if (!deliveryConfig) return null;
            const inputStyle: CSSProperties = {
              fontSize: "var(--ts-xs)", padding: "5px 8px", borderRadius: 6,
              border: "1px solid var(--atlas-border)", background: "var(--atlas-bg)", color: "var(--atlas-fg)",
              flex: 1, minWidth: 0,
            };
            return (
              <div style={{ marginBottom: 10, paddingTop: 10, borderTop: "1px solid var(--atlas-border)" }}>
                {deliveryConfig.provider === "email" && (
                  <input
                    type="email"
                    placeholder="recipient@email.com"
                    value={deliveryTarget.to ?? ""}
                    onChange={(e) => setDeliveryTarget((t) => ({ ...t, to: e.target.value }))}
                    style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
                  />
                )}
                {deliveryConfig.provider === "slack" && (
                  <input
                    type="text"
                    placeholder="Slack channel (optional — uses default)"
                    value={deliveryTarget.channel ?? ""}
                    onChange={(e) => setDeliveryTarget((t) => ({ ...t, channel: e.target.value }))}
                    style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
                  />
                )}
                {deliveryConfig.provider === "github_pr" && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <input type="text" placeholder="owner/repo" value={deliveryTarget.repo ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, repo: e.target.value }))} style={inputStyle} />
                    <input type="text" placeholder="head branch" value={deliveryTarget.head ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, head: e.target.value }))} style={inputStyle} />
                    <input type="text" placeholder="base (main)" value={deliveryTarget.base ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, base: e.target.value }))} style={inputStyle} />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void handleDeliverDraft()}
                    disabled={delivery.status === "sending" || delivery.status === "sent"}
                    style={{
                      fontSize: "var(--ts-xs)", color: delivery.status === "sent" ? "var(--atlas-muted)" : "var(--atlas-gold)",
                      background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.4)", borderRadius: 8,
                      padding: "5px 10px", cursor: delivery.status === "sending" || delivery.status === "sent" ? "default" : "pointer",
                      opacity: delivery.status === "sending" ? 0.6 : 1,
                    }}
                  >
                    {delivery.status === "sending" ? "Sending…" : delivery.status === "sent" ? "Sent ✓" : deliveryConfig.actionLabel}
                  </button>
                  {delivery.status === "failed" && (
                    <span style={{ fontSize: "var(--ts-xs)", color: "#e07a7a" }}>{delivery.error}</span>
                  )}
                </div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void handleCopyDraft()} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-gold)", background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.4)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Copy</button>
            <button type="button" onClick={handleDownloadDraft} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-fg)", background: "transparent", border: "1px solid var(--atlas-border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Download .md</button>
          </div>
        </div>
      )}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32, color: "var(--atlas-muted)", fontSize: "var(--ts-sm)" }}>Loading outputs…</div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 32, color: "var(--atlas-muted)", fontSize: "var(--ts-sm)" }}>
          <div>Couldn’t load outputs.</div>
          <button type="button" onClick={() => void load()} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-gold)", background: "transparent", border: "1px solid rgba(201,162,76,0.3)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>Retry</button>
        </div>
      ) : !items || items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, paddingBottom: 40 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.25 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>
          </svg>
          <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-muted)", opacity: 0.5, textAlign: "center", lineHeight: 1.65 }}>
            No outputs saved yet.<br />
            <span style={{ fontSize: "var(--ts-sm)" }}>Generated files and saved drafts appear here.</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((a) => {
            const isOpen = String(expanded) === String(a.id);
            const created = a.createdAt ?? a.created_at ?? "";
            const dateLabel = created ? new Date(created).toLocaleString() : "";
            const typeStr = (a.type ?? "").toLowerCase();
            const metadata = asRecord(a.metadata);
            const payload = asRecord(a.payload);
            const preview = asRecord(payload.preview);
            const content = a.content ?? textValue(payload.markdown) ?? textValue(preview.body) ?? "";
            const fileBacked = isFileBackedArtifact(a);
            const extension = textValue(metadata.extension)?.toLowerCase() ?? (fileBacked ? typeStr : "md");
            const label = typeLabel(a.type, metadata);
            const category = textValue(metadata.category);
            const slideHeadings = Array.isArray(preview.slideHeadings)
              ? preview.slideHeadings.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
              : [];
            const slideCount = typeof preview.slideCount === "number" ? preview.slideCount : null;
            const previewTitle = textValue(preview.title) ?? a.title;
            const previewSubtitle = textValue(preview.subtitle);
            const looksHtml = !fileBacked && (typeStr.includes("html") || /<\s*(html|body|div|section|main|!doctype)/i.test(content));
            const sendToDraft = (e: React.MouseEvent) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("axiom:open-preview", {
                detail: { source: "sandbox", content },
              }));
              toast("Sent to Draft preview.");
            };
            const downloadFile = (e?: React.MouseEvent) => {
              e?.stopPropagation();
              window.open(`/api/projects/${projectId}/artifacts/${a.id}/download`, "_blank");
            };
            return (
              <div key={a.id} style={{ border: "1px solid var(--atlas-border)", borderRadius: 10, background: "var(--atlas-card)", overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  style={{ width: "100%", textAlign: "left", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", cursor: "pointer", color: "var(--atlas-fg)" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--ts-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{previewTitle}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      {dateLabel && <span style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)" }}>{dateLabel}</span>}
                      {slideCount != null && <span style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", opacity: 0.8 }}>· {slideCount} slides</span>}
                      {category && <span style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", opacity: 0.8 }}>· {category}</span>}
                    </div>
                  </div>
                  {fileBacked && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={downloadFile}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); downloadFile(e as unknown as React.MouseEvent); } }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(201,162,76,0.14)", border: "1px solid rgba(201,162,76,0.4)", color: "var(--atlas-gold)", padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
                    >
                      <Download size={11} /> Download
                    </span>
                  )}
                  {looksHtml && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={sendToDraft}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sendToDraft(e as unknown as React.MouseEvent); } }}
                      style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(201,162,76,0.14)", border: "1px solid rgba(201,162,76,0.4)", color: "var(--atlas-gold)", padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
                    >
                      Preview
                    </span>
                  )}
                  <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.3)", color: "var(--atlas-gold)", padding: "2px 6px", borderRadius: 6 }}>{label}</span>
                  <ChevronDown size={14} style={{ opacity: 0.6, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
                </button>
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--atlas-border)", padding: "12px 14px" }}>
                    {fileBacked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(201,162,76,0.18)", background: "rgba(201,162,76,0.05)" }}>
                          <div style={{ fontSize: "var(--ts-sm)", fontWeight: 650, marginBottom: 4 }}>{previewTitle}</div>
                          {previewSubtitle && <div style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-muted)", lineHeight: 1.5 }}>{previewSubtitle}</div>}
                          <div style={{ marginTop: 8, fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {label}{extension ? ` · .${extension}` : ""}{slideCount != null ? ` · ${slideCount} slides` : ""}
                          </div>
                        </div>
                        {slideHeadings.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Slide outline</div>
                            {slideHeadings.map((heading, idx) => (
                              <div key={`${a.id}-slide-${idx}`} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: "var(--ts-sm)", lineHeight: 1.45 }}>
                                <span style={{ fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", opacity: 0.75, fontSize: "var(--ts-xs)", minWidth: 18 }}>{idx + 2}</span>
                                <span style={{ color: "var(--atlas-fg)", opacity: 0.88 }}>{heading}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{ fontSize: "var(--ts-sm)", lineHeight: 1.6, color: "var(--atlas-fg)" }}
                        className="atlas-artifact-md"
                        dangerouslySetInnerHTML={{ __html: renderArtifactMarkdown(content) }}
                      />
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {looksHtml && (
                        <button type="button" onClick={sendToDraft} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-gold)", background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.4)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Send to Draft</button>
                      )}
                      {fileBacked ? (
                        <button type="button" onClick={downloadFile} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-gold)", background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.4)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Download .{extension || a.type}</button>
                      ) : (
                        <>
                          <button type="button" onClick={() => handleExport(a)} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-fg)", background: "transparent", border: "1px solid var(--atlas-border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Export MD</button>
                          <button type="button" onClick={() => handleExportPDF(a)} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-fg)", background: "transparent", border: "1px solid var(--atlas-border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Export PDF</button>
                        </>
                      )}
                      {a.source === "project" && (
                        <button type="button" onClick={() => void handleDelete(a.id)} style={{ fontSize: "var(--ts-xs)", color: "rgb(229,115,115)", background: "transparent", border: "1px solid rgba(229,115,115,0.3)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Delete</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
