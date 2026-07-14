import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, FileOutput, FileText, LayoutGrid, List, Search, Wand2 } from "lucide-react";
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

const CATEGORY_LABELS: Record<string, string> = {
  presentations: "Presentations",
  documents: "Documents",
  spreadsheets: "Spreadsheets",
  pdfs: "PDFs",
  drafts: "Drafts",
  notes: "Notes",
  sketches: "Sketches",
  other: "Other",
};

const CATEGORY_ORDER = ["presentations", "documents", "spreadsheets", "pdfs", "drafts", "notes", "sketches", "other"];

function categorize(a: ArtifactRecord): string {
  const t = (a.type ?? "").toLowerCase();
  const meta = a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata) ? a.metadata as Record<string, unknown> : {};
  const ext = (typeof meta.extension === "string" ? meta.extension : "").toLowerCase();
  const norm = ext || t;
  if (norm === "pptx" || t.includes("presentation") || t.includes("slide")) return "presentations";
  if (norm === "docx" || norm === "doc" || t.includes("word") || t.includes("document") || t.includes("report")) return "documents";
  if (norm === "xlsx" || norm === "xls" || norm === "csv" || t.includes("spreadsheet")) return "spreadsheets";
  if (norm === "pdf") return "pdfs";
  if (t.startsWith("draft_")) return "drafts";
  if (norm === "markdown" || norm === "md" || t.includes("markdown") || t.includes("plan") || t.includes("brief") || t.includes("html")) return "notes";
  if (t.includes("sketch") || t.includes("design")) return "sketches";
  return "other";
}

function typeColor(type: string, metadata: Record<string, unknown>): string {
  const t = type.toLowerCase();
  const ext = (typeof metadata.extension === "string" ? metadata.extension : "").toLowerCase();
  const norm = ext || t;
  if (norm === "pptx" || t.includes("presentation")) return "var(--atlas-gold)";
  if (norm === "docx" || norm === "doc" || t.includes("document")) return "rgba(100,160,255,0.85)";
  if (norm === "pdf") return "rgba(229,115,115,0.85)";
  if (norm === "xlsx" || norm === "xls" || t.includes("spreadsheet")) return "rgba(100,200,120,0.85)";
  if (t.startsWith("draft_")) return "rgba(190,140,255,0.85)";
  return "var(--atlas-muted)";
}

function TypeIcon({ type, metadata, size = 16 }: { type: string; metadata: Record<string, unknown>; size?: number }) {
  const t = type.toLowerCase();
  const ext = (typeof metadata.extension === "string" ? metadata.extension : "").toLowerCase();
  const norm = ext || t;
  if (norm === "pptx" || t.includes("presentation") || t.includes("slide")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.5" />
        <path d="M8 21h8M12 17v4" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="6" y="7" width="4" height="5" rx="0.8" fill="currentColor" opacity="0.35" strokeWidth="0" />
        <path d="M12.5 9h3M12.5 11h2" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (norm === "xlsx" || norm === "xls" || t.includes("spreadsheet")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeWidth="1.1" opacity="0.5" />
      </svg>
    );
  }
  if (t.startsWith("draft_")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 20h9" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return <FileText size={size} strokeWidth={1.5} />;
}

function renderArtifactMarkdown(md: string): string {
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

function verificationStatus(metadata: Record<string, unknown>): "verified" | "failed" | null {
  const verification = asRecord(metadata.verification);
  const status = textValue(verification.status);
  if (status === "verified" || status === "failed") return status;
  return null;
}

type VisualQAIssueSummary = { rule: string; severity: "warning" | "error"; message: string; pageIndex?: number };

function visualQAInfo(metadata: Record<string, unknown>): { issues: VisualQAIssueSummary[] } | null {
  const verification = asRecord(metadata.verification);
  const visualQA = asRecord(verification.visualQA);
  const status = textValue(visualQA.status);
  if (status !== "checked") return null;
  const rawIssues = Array.isArray(visualQA.issues) ? visualQA.issues : [];
  const issues = rawIssues.filter(
    (i): i is VisualQAIssueSummary =>
      !!i && typeof i === "object" && typeof (i as VisualQAIssueSummary).rule === "string" && typeof (i as VisualQAIssueSummary).message === "string",
  );
  return { issues };
}

function artifactDate(a: ArtifactRecord): string {
  return a.createdAt ?? a.created_at ?? "";
}

function relativeDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ArtifactsPanel({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ArtifactRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);
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
        setHighlighted(pending);
        const id = pending;
        setTimeout(() => setHighlighted((h) => (h === id ? null : h)), 2200);
      }
    } catch {}

    const focusHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ artifactId?: number | string; projectId?: number }>).detail ?? {};
      if (detail.projectId && detail.projectId !== projectId) return;
      if (detail.artifactId != null) {
        const idStr = String(detail.artifactId);
        setExpanded(idStr);
        setHighlighted(idStr);
        setTimeout(() => setHighlighted((h) => (h === idStr ? null : h)), 2200);
      }
    };
    // Reload the list when the Outputs panel is opened so freshly created
    // artifacts (from the live artifact_created SSE event) appear immediately.
    const openHandler = () => { void load(); };

    window.addEventListener("axiom:focus-output", focusHandler);
    window.addEventListener("axiom:open-output", openHandler);
    return () => {
      window.removeEventListener("axiom:focus-output", focusHandler);
      window.removeEventListener("axiom:open-output", openHandler);
    };
  }, [projectId, load]);

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

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      (a.type ?? "").toLowerCase().includes(q) ||
      (typeof asRecord(a.metadata).extension === "string"
        ? (asRecord(a.metadata).extension as string).toLowerCase().includes(q)
        : false),
    );
  }, [items, searchQuery]);

  const grouped = useMemo(() => {
    const g: Record<string, ArtifactRecord[]> = {};
    for (const a of filteredItems) {
      const cat = categorize(a);
      if (!g[cat]) g[cat] = [];
      g[cat].push(a);
    }
    return g;
  }, [filteredItems]);

  const showRecent = !searchQuery.trim() && filteredItems.length > 4;
  const recentItems = filteredItems.slice(0, 3);
  const activeCategoryCount = CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).length;

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

  // ── Expanded detail renderer (reused for both list and grid modes) ──────────
  const renderExpandedDetail = (a: ArtifactRecord) => {
    const typeStr = (a.type ?? "").toLowerCase();
    const metadata = asRecord(a.metadata);
    const payload = asRecord(a.payload);
    const preview = asRecord(payload.preview);
    const content = a.content ?? textValue(payload.markdown) ?? textValue(preview.body) ?? textValue(preview.html) ?? "";
    const fileBacked = isFileBackedArtifact(a);
    const extension = textValue(metadata.extension)?.toLowerCase() ?? (fileBacked ? typeStr : "md");
    const label = typeLabel(a.type, metadata);
    const slideHeadings = Array.isArray(preview.slideHeadings)
      ? preview.slideHeadings.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
      : [];
    const slideCount = typeof preview.slideCount === "number" ? preview.slideCount : null;
    const previewTitle = textValue(preview.title) ?? a.title;
    const previewSubtitle = textValue(preview.subtitle);
    const verifyStatus = fileBacked ? verificationStatus(metadata) : null;
    const visualQA = fileBacked ? visualQAInfo(metadata) : null;
    const visualQAIssues = visualQA?.issues ?? [];
    const visualQAErrorCount = visualQAIssues.filter((i) => i.severity === "error").length;
    const looksHtml = !fileBacked && (typeStr.includes("html") || /<\s*(html|body|div|section|main|!doctype)/i.test(content));
    const sendToDraft = (e: React.MouseEvent) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("axiom:open-preview", { detail: { source: "sandbox", content } }));
      toast("Sent to Draft preview.");
    };
    const downloadFile = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      window.open(`/api/projects/${projectId}/artifacts/${a.id}/download`, "_blank");
    };
    return (
      <div style={{ borderTop: "1px solid var(--atlas-border)", padding: "12px 14px" }}>
        {fileBacked ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(201,162,76,0.18)", background: "rgba(201,162,76,0.05)" }}>
              <div style={{ fontSize: "var(--ts-sm)", fontWeight: 650, marginBottom: 4 }}>{previewTitle}</div>
              {previewSubtitle && <div style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-muted)", lineHeight: 1.5 }}>{previewSubtitle}</div>}
              <div style={{ marginTop: 8, fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label}{extension ? ` · .${extension}` : ""}{slideCount != null ? ` · ${slideCount} slides` : ""}
              </div>
              {verifyStatus === "verified" && (
                <div style={{ marginTop: 8, fontSize: "var(--ts-xs)", color: "rgb(110,180,120)" }}>✓ Verified — passed all structural checks after generation.</div>
              )}
              {verifyStatus === "failed" && (
                <div style={{ marginTop: 8, fontSize: "var(--ts-xs)", color: "rgb(229,115,115)" }}>⚠ May be incomplete — one or more checks failed after generation.</div>
              )}
              {visualQA && visualQAIssues.length === 0 && (
                <div style={{ marginTop: 8, fontSize: "var(--ts-xs)", color: "rgb(110,180,120)" }}>✓ Visual quality check found no issues.</div>
              )}
            </div>
            {visualQAIssues.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 8, border: visualQAErrorCount > 0 ? "1px solid rgba(229,115,115,0.3)" : "1px solid rgba(230,181,90,0.3)", background: visualQAErrorCount > 0 ? "rgba(229,115,115,0.06)" : "rgba(230,181,90,0.06)" }}>
                <div style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Visual quality check</div>
                {visualQAIssues.map((issue, idx) => (
                  <div key={`${a.id}-vqa-${idx}`} style={{ fontSize: "var(--ts-sm)", lineHeight: 1.45, color: "var(--atlas-fg)", opacity: 0.9 }}>
                    <span style={{ color: issue.severity === "error" ? "rgb(229,115,115)" : "rgb(230,181,90)" }}>
                      {issue.severity === "error" ? "✕" : "⚠"}
                    </span>{" "}
                    {issue.pageIndex != null && <span style={{ color: "var(--atlas-muted)" }}>Page {issue.pageIndex + 1}: </span>}
                    {issue.message}
                  </div>
                ))}
              </div>
            )}
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
        ) : typeStr === "pipeline_sketch" ? (
          (() => {
            let screens: Array<{ name?: string; description?: string; components?: string[] }> = [];
            try {
              const parsed = JSON.parse(content) as Record<string, unknown>;
              if (Array.isArray(parsed.screens)) screens = parsed.screens as typeof screens;
            } catch { /* fall through */ }
            if (screens.length === 0) {
              return (
                <div
                  style={{ fontSize: "var(--ts-sm)", lineHeight: 1.6, color: "var(--atlas-fg)" }}
                  className="atlas-artifact-md"
                  dangerouslySetInnerHTML={{ __html: renderArtifactMarkdown(content) }}
                />
              );
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Screens · {screens.length}
                </div>
                {screens.map((screen, idx) => (
                  <div key={idx} style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid var(--atlas-border)", background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize: "var(--ts-sm)", fontWeight: 600, color: "var(--atlas-fg)", marginBottom: screen.description ? 3 : 0 }}>
                      {screen.name ?? `Screen ${idx + 1}`}
                    </div>
                    {screen.description && (
                      <div style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-muted)", lineHeight: 1.5 }}>{screen.description}</div>
                    )}
                    {Array.isArray(screen.components) && screen.components.length > 0 && (
                      <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {screen.components.map((c, ci) => (
                          <span key={ci} style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", padding: "1px 6px", borderRadius: 4, background: "rgba(201,162,76,0.08)", border: "1px solid rgba(201,162,76,0.2)", color: "var(--atlas-gold)", opacity: 0.85 }}>{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()
        ) : typeStr === "design_plan" ? (
          (() => {
            let body: Record<string, unknown> = {};
            try {
              const parsed = JSON.parse(content) as Record<string, unknown>;
              body = (parsed.body as Record<string, unknown>) ?? parsed;
            } catch { /* fall through */ }
            const fields: Array<{ label: string; value: unknown }> = [
              { label: "Navigation", value: body.navigationPattern },
              { label: "Component Patterns", value: body.componentPatterns },
              { label: "Typography Scale", value: body.typographyScale },
              { label: "Card Density", value: body.cardDensity },
              { label: "Motion Philosophy", value: body.motionPhilosophy },
              { label: "Empty States", value: body.emptyStates },
            ].filter((f) => typeof f.value === "string" && (f.value as string).trim());
            const responsive = body.responsiveIntent as Record<string, string> | undefined;
            const interaction = body.interactionPatterns as Record<string, string> | undefined;
            if (fields.length === 0 && !responsive && !interaction) {
              return (
                <div
                  style={{ fontSize: "var(--ts-sm)", lineHeight: 1.6, color: "var(--atlas-fg)" }}
                  className="atlas-artifact-md"
                  dangerouslySetInnerHTML={{ __html: renderArtifactMarkdown(content) }}
                />
              );
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {fields.map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--atlas-muted)" }}>{label}</span>
                    <span style={{ fontSize: "var(--ts-sm)", color: "var(--atlas-fg)", lineHeight: 1.5 }}>{String(value)}</span>
                  </div>
                ))}
                {responsive && Object.keys(responsive).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--atlas-muted)" }}>Responsive Intent</span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(responsive).map(([k, v]) => (
                        <span key={k} style={{ fontSize: "var(--ts-xs)", padding: "2px 7px", borderRadius: 5, background: "rgba(201,162,76,0.07)", border: "1px solid rgba(201,162,76,0.18)", color: "var(--atlas-gold)" }}>{k}: {v}</span>
                      ))}
                    </div>
                  </div>
                )}
                {interaction && Object.keys(interaction).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--atlas-muted)" }}>Interaction Patterns</span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(interaction).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => (
                        <span key={k} style={{ fontSize: "var(--ts-xs)", padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--atlas-muted)" }}>{k}: {String(v)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
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
    );
  };

  // ── Item row (list mode) ────────────────────────────────────────────────────
  const renderListItem = (a: ArtifactRecord) => {
    const isOpen = String(expanded) === String(a.id);
    const isHighlighted = String(highlighted) === String(a.id);
    const metadata = asRecord(a.metadata);
    const fileBacked = isFileBackedArtifact(a);
    const label = typeLabel(a.type, metadata);
    const created = artifactDate(a);
    const dateLabel = relativeDate(created);
    const color = typeColor(a.type, metadata);
    const verifyStatus = fileBacked ? verificationStatus(metadata) : null;
    const visualQA = fileBacked ? visualQAInfo(metadata) : null;
    const visualQAIssues = visualQA?.issues ?? [];
    const visualQAErrorCount = visualQAIssues.filter((i) => i.severity === "error").length;
    const downloadFile = (e: React.MouseEvent) => {
      e.stopPropagation();
      window.open(`/api/projects/${projectId}/artifacts/${a.id}/download`, "_blank");
    };
    return (
      <div key={a.id} style={{ border: isHighlighted ? "1px solid rgba(201,162,76,0.65)" : "1px solid var(--atlas-border)", borderRadius: 9, background: isHighlighted ? "rgba(201,162,76,0.06)" : "var(--atlas-card)", overflow: "hidden", transition: "border-color 400ms, background 400ms" }}>
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : a.id)}
          style={{ width: "100%", textAlign: "left", padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", cursor: "pointer", color: "var(--atlas-fg)" }}
        >
          <div style={{ flexShrink: 0, color, opacity: 0.85 }}>
            <TypeIcon type={a.type} metadata={metadata} size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--ts-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
            {dateLabel && (
              <div style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", marginTop: 1 }}>{dateLabel}</div>
            )}
          </div>
          {verifyStatus === "failed" && (
            <span title="One or more checks failed after generation." style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(229,115,115,0.14)", border: "1px solid rgba(229,115,115,0.4)", color: "rgb(229,115,115)", padding: "2px 6px", borderRadius: 5 }}>⚠</span>
          )}
          {visualQAIssues.length > 0 && (
            <span title={`${visualQAIssues.length} visual issue${visualQAIssues.length === 1 ? "" : "s"}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", background: visualQAErrorCount > 0 ? "rgba(229,115,115,0.14)" : "rgba(230,181,90,0.14)", border: visualQAErrorCount > 0 ? "1px solid rgba(229,115,115,0.4)" : "1px solid rgba(230,181,90,0.4)", color: visualQAErrorCount > 0 ? "rgb(229,115,115)" : "rgb(230,181,90)", padding: "2px 6px", borderRadius: 5 }}>⚠ {visualQAIssues.length}</span>
          )}
          {fileBacked && (
            <span
              role="button" tabIndex={0}
              onClick={downloadFile}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); downloadFile(e as unknown as React.MouseEvent); } }}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--ts-xs)", color: "var(--atlas-muted)", opacity: 0.7, padding: "2px 4px", borderRadius: 4, cursor: "pointer" }}
            >
              <Download size={11} strokeWidth={1.5} />
            </span>
          )}
          <span style={{ fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(201,162,76,0.10)", border: "1px solid rgba(201,162,76,0.25)", color: "var(--atlas-gold)", padding: "2px 5px", borderRadius: 5, flexShrink: 0 }}>{label}</span>
          <ChevronDown size={13} style={{ opacity: 0.45, flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
        </button>
        {isOpen && renderExpandedDetail(a)}
      </div>
    );
  };

  // ── Item card (grid mode) ───────────────────────────────────────────────────
  const renderGridItems = (gridItems: ArtifactRecord[]) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {gridItems.map((a) => {
        const isOpen = String(expanded) === String(a.id);
        const metadata = asRecord(a.metadata);
        const fileBacked = isFileBackedArtifact(a);
        const label = typeLabel(a.type, metadata);
        const created = artifactDate(a);
        const dateLabel = relativeDate(created);
        const color = typeColor(a.type, metadata);
        const downloadFile = (e: React.MouseEvent) => {
          e.stopPropagation();
          window.open(`/api/projects/${projectId}/artifacts/${a.id}/download`, "_blank");
        };
        const isHighlighted = String(highlighted) === String(a.id);
        return (
          <Fragment key={a.id}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : a.id)}
              style={{ textAlign: "left", padding: "10px 10px 9px", border: `1px solid ${isHighlighted ? "rgba(201,162,76,0.65)" : isOpen ? "rgba(201,162,76,0.35)" : "var(--atlas-border)"}`, borderRadius: 9, background: isHighlighted ? "rgba(201,162,76,0.07)" : isOpen ? "rgba(201,162,76,0.04)" : "var(--atlas-card)", cursor: "pointer", color: "var(--atlas-fg)", display: "flex", flexDirection: "column", gap: 6, minHeight: 80, transition: "border-color 400ms, background 400ms" }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
                <div style={{ color, opacity: 0.85 }}>
                  <TypeIcon type={a.type} metadata={metadata} size={18} />
                </div>
                {fileBacked && (
                  <span
                    role="button" tabIndex={0}
                    onClick={downloadFile}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); downloadFile(e as unknown as React.MouseEvent); } }}
                    style={{ color: "var(--atlas-muted)", opacity: 0.55, display: "flex", padding: 2 }}
                    title="Download"
                  >
                    <Download size={11} strokeWidth={1.5} />
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--ts-xs)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.4 }}>{a.title}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", color, opacity: 0.7, padding: "1px 4px", borderRadius: 3, border: `1px solid ${color}` }}>{label}</span>
                {dateLabel && <span style={{ fontSize: 9, color: "var(--atlas-muted)", opacity: 0.5, flexShrink: 0 }}>{dateLabel}</span>}
              </div>
            </button>
            {isOpen && (
              <div style={{ gridColumn: "1 / -1", border: "1px solid rgba(201,162,76,0.25)", borderRadius: 9, background: "var(--atlas-card)", overflow: "hidden", marginTop: -2 }}>
                {renderExpandedDetail(a)}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );

  // ── Section label ───────────────────────────────────────────────────────────
  const SectionLabel = ({ label, count }: { label: string; count: number }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, marginTop: 12 }}>
      <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.55 }}>{label}</span>
      <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.35 }}>{count}</span>
      <div style={{ flex: 1, height: 1, background: "var(--atlas-border)", opacity: 0.5 }} />
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 14px" }} className="scrollbar-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }} ref={draftMenuRef}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {/* Title */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, color: "var(--atlas-gold)", fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-xs)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <FileOutput size={13} /> Outputs
          </div>
          {/* List / Grid toggle */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--atlas-border)" }}>
            {(["list", "grid"] as const).map((mode) => (
              <button
                key={mode} type="button"
                onClick={() => setViewMode(mode)}
                title={mode === "list" ? "List view" : "Grid view"}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 26, border: "none", cursor: "pointer", transition: "background 120ms, color 120ms", background: viewMode === mode ? "rgba(201,162,76,0.15)" : "transparent", color: viewMode === mode ? "var(--atlas-gold)" : "var(--atlas-muted)" }}
              >
                {mode === "list" ? <List size={12} strokeWidth={2} /> : <LayoutGrid size={12} strokeWidth={2} />}
              </button>
            ))}
          </div>
          {/* Generate Draft */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setDraftMenuOpen((v) => !v)}
              disabled={generatingDraft !== null}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--ts-xs)", fontFamily: "var(--app-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.4)", color: "var(--atlas-gold)", padding: "5px 9px", borderRadius: 7, cursor: generatingDraft ? "default" : "pointer", opacity: generatingDraft ? 0.6 : 1 }}
            >
              <Wand2 size={11} />
              {generatingDraft ? "…" : "Draft"}
              <ChevronDown size={11} style={{ opacity: 0.7, transform: draftMenuOpen ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
            </button>
            {draftMenuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, background: "var(--atlas-card)", border: "1px solid var(--atlas-border)", borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minWidth: 170, overflow: "hidden" }}>
                {DRAFT_TYPES.map((d) => (
                  <button
                    key={d.type} type="button"
                    onClick={() => void handleGenerateDraft(d.type, d.label)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", fontSize: "var(--ts-sm)", color: "var(--atlas-fg)", background: "transparent", border: "none", cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.10)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--atlas-muted)", opacity: 0.4, pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search outputs…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: "1px solid var(--atlas-border)", background: "rgba(255,255,255,0.02)", color: "var(--atlas-fg)", fontSize: "var(--ts-sm)", fontFamily: "var(--app-font-sans)", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* ── Draft result card ──────────────────────────────────────────────── */}
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
                  <input type="email" placeholder="recipient@email.com" value={deliveryTarget.to ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, to: e.target.value }))} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
                )}
                {deliveryConfig.provider === "slack" && (
                  <input type="text" placeholder="Slack channel (optional — uses default)" value={deliveryTarget.channel ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, channel: e.target.value }))} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
                )}
                {deliveryConfig.provider === "github_pr" && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <input type="text" placeholder="owner/repo" value={deliveryTarget.repo ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, repo: e.target.value }))} style={inputStyle} />
                    <input type="text" placeholder="head branch" value={deliveryTarget.head ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, head: e.target.value }))} style={inputStyle} />
                    <input type="text" placeholder="base (main)" value={deliveryTarget.base ?? ""} onChange={(e) => setDeliveryTarget((t) => ({ ...t, base: e.target.value }))} style={inputStyle} />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => void handleDeliverDraft()} disabled={delivery.status === "sending" || delivery.status === "sent"}
                    style={{ fontSize: "var(--ts-xs)", color: delivery.status === "sent" ? "var(--atlas-muted)" : "var(--atlas-gold)", background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.4)", borderRadius: 8, padding: "5px 10px", cursor: delivery.status === "sending" || delivery.status === "sent" ? "default" : "pointer", opacity: delivery.status === "sending" ? 0.6 : 1 }}>
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

      {/* ── States ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32, color: "var(--atlas-muted)", fontSize: "var(--ts-sm)" }}>Loading outputs…</div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 32, color: "var(--atlas-muted)", fontSize: "var(--ts-sm)" }}>
          <div>Couldn't load outputs.</div>
          <button type="button" onClick={() => void load()} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-gold)", background: "transparent", border: "1px solid rgba(201,162,76,0.3)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>Retry</button>
        </div>
      ) : filteredItems.length === 0 ? (
        searchQuery ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "28px 16px", color: "var(--atlas-muted)" }}>
            <Search size={22} strokeWidth={1.2} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: "var(--ts-sm)", opacity: 0.55, textAlign: "center" }}>No outputs match "{searchQuery}"</div>
            <button type="button" onClick={() => setSearchQuery("")} style={{ fontSize: "var(--ts-xs)", color: "var(--atlas-gold)", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", opacity: 0.7 }}>Clear search</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, paddingBottom: 40 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--atlas-muted)" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.25 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>
            </svg>
            <div style={{ fontSize: "var(--ts-label)", color: "var(--atlas-muted)", opacity: 0.5, textAlign: "center", lineHeight: 1.65 }}>
              No outputs saved yet.<br />
              <span style={{ fontSize: "var(--ts-sm)" }}>Generated files and saved drafts appear here.</span>
            </div>
          </div>
        )
      ) : (
        <>
          {/* Recent section */}
          {showRecent && (
            <>
              <SectionLabel label="Recent" count={recentItems.length} />
              {viewMode === "grid"
                ? renderGridItems(recentItems)
                : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{recentItems.map((a) => renderListItem(a))}</div>
              }
              <div style={{ height: 1, background: "var(--atlas-border)", margin: "12px 0 4px", opacity: 0.4 }} />
            </>
          )}

          {/* Category sections */}
          {CATEGORY_ORDER.map((cat) => {
            const catItems = grouped[cat];
            if (!catItems?.length) return null;
            return (
              <div key={cat}>
                {activeCategoryCount > 1 && (
                  <SectionLabel label={CATEGORY_LABELS[cat]} count={catItems.length} />
                )}
                {viewMode === "grid"
                  ? <div style={{ marginBottom: 4 }}>{renderGridItems(catItems)}</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>{catItems.map((a) => renderListItem(a))}</div>
                }
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
