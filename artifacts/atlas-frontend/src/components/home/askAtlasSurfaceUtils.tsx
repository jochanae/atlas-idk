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

export function renderMessageImages(msg: AskAtlasMessage) {
  const images = msg.attachments && msg.attachments.length > 0
    ? msg.attachments
    : (msg.imageUrl ? [{ mediaType: "", base64: "", name: undefined, _url: msg.imageUrl }] as Array<{
        mediaType: string;
        base64: string;
        name?: string;
        _url?: string;
      }> : []);

  if (images.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: msg.content ? 8 : 0 }}>
      {images.map((img, idx) => {
        const url = (img as { _url?: string })._url ?? `data:${img.mediaType};base64,${img.base64}`;
        return (
          <div key={idx} style={{ position: "relative" }}>
            <img
              src={url}
              alt={img.name || "Attached"}
              style={{
                width: images.length === 1 ? "100%" : 110,
                maxWidth: "100%",
                height: images.length === 1 ? "auto" : 110,
                maxHeight: images.length === 1 ? 320 : 110,
                objectFit: "cover",
                borderRadius: 8,
                display: "block",
                border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 25%, transparent)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
