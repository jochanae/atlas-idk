/**
 * askAtlasSurfaceUtils — pure helpers extracted from AskAtlasSurface.
 * Kept UI-agnostic (no hooks, no shell state) so tests can cover them
 * and the main surface file stays smaller.
 */
import type { AskAtlasMessage } from "./AskAtlasSurface";

export const ASK_ATLAS_PLACEHOLDERS = [
  "Ask the global view…",
  "What's conflicting across projects…",
  "Which project is most worth doing next…",
  "Where are decisions stalling…",
  "What pattern keeps repeating…",
];

export const PROJECT_OPEN_INTENT_RE = /\b(go|jump|open|workspace|inside)\b|\binto\s+that\b/i;
export const NAVIGATE_TO_RE = /\bNAVIGATE_TO:\s*(\{[^\n]+\})/;

export type NavigateTarget = { projectId: number; projectName: string } | null;

/** Fields the nexus stream may set when delivering a sketch (async after `done`). */
export type AskAtlasSketchFields = Pick<
  AskAtlasMessage,
  "imageUrl" | "imageB64" | "imageMimeType" | "imageGen" | "pendingSketch"
>;

/**
 * Resolve the inline sketch src the same way workspace AssistantBubble does.
 * Stream delivery writes `imageGen` / `imageB64` — not `imageUrl`.
 */
export function resolveAskAtlasSketchSrc(msg: AskAtlasSketchFields): string | null {
  if (typeof msg.imageB64 === "string" && msg.imageB64) {
    return `data:${msg.imageMimeType ?? "image/png"};base64,${msg.imageB64}`;
  }
  const fromGen = msg.imageGen?.images?.[0]?.imageUrl;
  if (typeof fromGen === "string" && fromGen) return fromGen;
  if (typeof msg.imageUrl === "string" && msg.imageUrl) return msg.imageUrl;
  return null;
}

export function askAtlasMessageHasSketch(msg: AskAtlasSketchFields): boolean {
  return !!resolveAskAtlasSketchSrc(msg) || !!msg.pendingSketch;
}

export function extractNavigateTo(content: string): { target: NavigateTarget; cleanContent: string } {
  const match = content.match(NAVIGATE_TO_RE);
  if (!match) return { target: null, cleanContent: content };
  try {
    const parsed = JSON.parse(match[1]) as { projectId?: unknown; projectName?: unknown };
    if (typeof parsed.projectId === "number" && typeof parsed.projectName === "string") {
      const cleanContent = content.replace(NAVIGATE_TO_RE, "").replace(/\n{3,}/g, "\n\n").trim();
      return { target: { projectId: parsed.projectId, projectName: parsed.projectName }, cleanContent };
    }
  } catch {}
  return { target: null, cleanContent: content };
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findProjectOpenTarget<P extends { id: number; name: string }>(
  content: string,
  projects: P[],
): P | null {
  if (!PROJECT_OPEN_INTENT_RE.test(content)) return null;
  for (const project of projects) {
    const name = project.name.trim();
    if (!name) continue;
    const nameRe = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}(?=$|[^a-z0-9])`, "i");
    if (nameRe.test(content)) return project;
  }
  return null;
}

/**
 * Legacy / sketch image helper for Ask Atlas user bubbles.
 *
 * INT-40: AttachmentStrip owns structured attachments (including PPTX/PDF).
 * Never render non-image attachments as <img> — that produced the broken
 * inline preview after a valid PPTX card. When `attachments` is present,
 * return null and let AttachmentStrip render the strip alone.
 */
export function renderMessageImages(msg: AskAtlasMessage) {
  if (msg.attachments && msg.attachments.length > 0) {
    return null;
  }

  // Sketch / legacy single-image path (no structured attachments array).
  const sketchSrc = resolveAskAtlasSketchSrc(msg);
  const url = sketchSrc ?? (typeof msg.imageUrl === "string" && msg.imageUrl ? msg.imageUrl : null);
  if (!url) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: msg.content ? 8 : 0 }}>
      <div style={{ position: "relative" }}>
        <img
          src={url}
          alt="Attached"
          style={{
            width: "100%",
            maxWidth: "100%",
            height: "auto",
            maxHeight: 320,
            objectFit: "cover",
            borderRadius: 8,
            display: "block",
            border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 25%, transparent)",
          }}
        />
      </div>
    </div>
  );
}
