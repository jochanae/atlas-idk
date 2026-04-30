import type { ChatMessage } from "./atlas";

export type ArtifactKind = "code" | "doc" | "table";

export type Artifact = {
  id: string;
  messageId: string;
  kind: ArtifactKind;
  language?: string;
  title: string;
  body: string;
  createdAt: string;
};

/**
 * Behavioral rule (locked):
 * Artifacts spawn when AI output exceeds conversational intent and becomes
 * reusable structure. Concretely:
 *   - fenced code blocks > 5 lines
 *   - markdown tables (>=2 rows of pipes)
 *   - structured docs: >=4 markdown headings (## or ###)
 * Anything shorter renders inline in the chat thread.
 */
export function detectArtifacts(messages: ChatMessage[]): Artifact[] {
  const out: Artifact[] = [];

  for (const m of messages) {
    if (m.role !== "assistant") continue;

    // 1. Fenced code blocks
    const fence = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = fence.exec(m.content)) !== null) {
      const lang = (match[1] || "").trim();
      const body = match[2].replace(/\s+$/, "");
      const lineCount = body.split("\n").length;
      if (lineCount > 5) {
        out.push({
          id: `${m.id}-code-${idx}`,
          messageId: m.id,
          kind: "code",
          language: lang || "text",
          title: lang ? `${lang.toUpperCase()} · ${lineCount} lines` : `Code · ${lineCount} lines`,
          body,
          createdAt: m.created_at,
        });
        idx++;
      }
    }

    // 2. Markdown tables (header + separator + at least one row)
    const tableRegex = /(?:^|\n)((?:\|.+\|\n)(?:\|[\s:|-]+\|\n)(?:\|.+\|\n?)+)/g;
    let tMatch: RegExpExecArray | null;
    let tIdx = 0;
    while ((tMatch = tableRegex.exec(m.content)) !== null) {
      const body = tMatch[1].trim();
      const rows = body.split("\n").length - 2; // minus header + separator
      out.push({
        id: `${m.id}-table-${tIdx}`,
        messageId: m.id,
        kind: "table",
        title: `Table · ${rows} rows`,
        body,
        createdAt: m.created_at,
      });
      tIdx++;
    }

    // 3. Structured documents (>=4 markdown headings)
    const headings = m.content.match(/^#{2,3}\s+.+$/gm) ?? [];
    if (headings.length >= 4) {
      const firstHeading = headings[0].replace(/^#+\s+/, "").trim();
      out.push({
        id: `${m.id}-doc`,
        messageId: m.id,
        kind: "doc",
        title: firstHeading.slice(0, 60) || `Document · ${headings.length} sections`,
        body: m.content,
        createdAt: m.created_at,
      });
    }
  }

  return out;
}

/**
 * Strips artifact-sized blocks from a message so the inline chat shows a
 * concise summary, not the full code/table that already lives in the drawer.
 */
export function stripArtifactBlocks(content: string): string {
  let out = content;
  // Replace long fenced code with a hint
  out = out.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_, lang: string, body: string) => {
    const lines = body.split("\n").length;
    if (lines > 5) {
      const tag = (lang || "code").toUpperCase();
      return `\n\u2997 ${tag} block opened in Drawer (${lines} lines)\u2998\n`;
    }
    return `\`\`\`${lang}\n${body}\`\`\``;
  });
  // Replace tables
  out = out.replace(
    /(?:^|\n)((?:\|.+\|\n)(?:\|[\s:|-]+\|\n)(?:\|.+\|\n?)+)/g,
    (_, body: string) => {
      const rows = body.trim().split("\n").length - 2;
      return `\n\u2997 Table opened in Drawer (${rows} rows)\u2998\n`;
    },
  );
  return out.trim();
}
