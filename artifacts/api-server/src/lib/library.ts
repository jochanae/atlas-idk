/**
 * Library helpers — row → API shape, preview truncation, dual-write, context load.
 */
import { db, projectsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  LIBRARY_ITEM_KINDS,
  LIBRARY_ORIGIN_SOURCES,
  type LibraryItemKind,
  type LibraryOriginSource,
  type LibraryLegacySource,
} from "@workspace/db";

export const PREVIEW_MAX_CHARS = 200;
/** Soft budget for attached library bodies injected into chat prompts (~chars). */
export const LIBRARY_CONTEXT_CHAR_BUDGET = 12_000;

export type LibraryItemApi = {
  id: string;
  kind: LibraryItemKind;
  title: string;
  content?: string;
  preview: string;
  project: { id: number; name?: string } | null;
  origin: {
    source: LibraryOriginSource;
    conversationId?: string | null;
    messageId?: string | null;
  };
  createdAt: string;
  updatedAt?: string;
};

export function truncatePreview(content: string | null | undefined, max = PREVIEW_MAX_CHARS): string {
  const raw = (content ?? "").trim();
  if (raw.length <= max) return raw;
  return raw.slice(0, max);
}

export function normalizeKind(raw: string | null | undefined): LibraryItemKind {
  const v = (raw ?? "").toLowerCase().trim();
  return (LIBRARY_ITEM_KINDS as readonly string[]).includes(v)
    ? (v as LibraryItemKind)
    : "other";
}

export function normalizeOriginSource(raw: string | null | undefined): LibraryOriginSource {
  const v = (raw ?? "").toLowerCase().trim();
  return (LIBRARY_ORIGIN_SOURCES as readonly string[]).includes(v)
    ? (v as LibraryOriginSource)
    : "unknown";
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

type RowLike = {
  id: string;
  kind: string;
  title: string;
  content: string | null;
  preview: string;
  project_id?: number | null;
  projectId?: number | null;
  project_name?: string | null;
  projectName?: string | null;
  origin_source?: string;
  originSource?: string;
  origin_conversation_id?: string | null;
  originConversationId?: string | null;
  origin_message_id?: string | null;
  originMessageId?: string | null;
  created_at?: Date | string;
  createdAt?: Date | string;
  updated_at?: Date | string | null;
  updatedAt?: Date | string | null;
};

export function rowToLibraryItem(row: RowLike, opts?: { includeContent?: boolean }): LibraryItemApi {
  const projectId = row.projectId ?? row.project_id ?? null;
  const projectName = row.projectName ?? row.project_name ?? undefined;
  const content = row.content ?? undefined;
  const includeContent = opts?.includeContent !== false;
  const createdAt = toIso(row.createdAt ?? row.created_at) ?? new Date(0).toISOString();
  const updatedAt = toIso(row.updatedAt ?? row.updated_at);

  return {
    id: String(row.id),
    kind: normalizeKind(row.kind),
    title: row.title,
    ...(includeContent && content != null ? { content } : {}),
    preview: row.preview || truncatePreview(content),
    project: projectId != null
      ? { id: projectId, ...(projectName ? { name: projectName } : {}) }
      : null,
    origin: {
      source: normalizeOriginSource(row.originSource ?? row.origin_source),
      conversationId: row.originConversationId ?? row.origin_conversation_id ?? null,
      messageId: row.originMessageId ?? row.origin_message_id ?? null,
    },
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function encodeLibraryCursor(createdAt: Date | string, id: string): string {
  const iso = toIso(createdAt) ?? String(createdAt);
  return Buffer.from(`${iso}\t${id}`, "utf8").toString("base64url");
}

export function decodeLibraryCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const tab = raw.indexOf("\t");
    if (tab < 0) return null;
    const createdAt = raw.slice(0, tab);
    const id = raw.slice(tab + 1);
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export type DualWriteHomeArtifactArgs = {
  userId: number;
  legacyId: number | string;
  kind: string;
  title: string;
  content: string;
  conversationId?: string | null;
};

/** Idempotent dual-write from home_artifacts → library_items. */
export async function dualWriteHomeArtifact(args: DualWriteHomeArtifactArgs): Promise<string | null> {
  const kind = normalizeKind(args.kind);
  const preview = truncatePreview(args.content);
  const legacyId = String(args.legacyId);
  try {
    const existing = await db.execute(sql`
      SELECT id FROM library_items
      WHERE legacy_source = ${"home_artifacts"} AND legacy_id = ${legacyId}
      LIMIT 1
    `);
    if (existing.rows.length > 0) {
      const id = (existing.rows[0] as { id: string }).id;
      await db.execute(sql`
        UPDATE library_items SET
          kind = ${kind},
          title = ${args.title},
          content = ${args.content},
          preview = ${preview},
          origin_conversation_id = ${args.conversationId ?? null},
          updated_at = now()
        WHERE id = ${id}::uuid
      `);
      return id;
    }
    const inserted = await db.execute(sql`
      INSERT INTO library_items (
        user_id, project_id, kind, title, content, preview,
        origin_source, origin_conversation_id, legacy_source, legacy_id
      )
      VALUES (
        ${args.userId}, NULL, ${kind}, ${args.title}, ${args.content}, ${preview},
        ${"ask-atlas"}, ${args.conversationId ?? null}, ${"home_artifacts"}, ${legacyId}
      )
      RETURNING id
    `);
    return (inserted.rows[0] as { id: string } | undefined)?.id ?? null;
  } catch {
    return null;
  }
}

export type DualWriteBookmarkArgs = {
  userId: number;
  projectId: number;
  legacyId: number | string;
  title: string;
  content?: string | null;
  messageId?: number | string | null;
};

/** Idempotent dual-write from project_bookmarks → library_items. */
export async function dualWriteBookmark(args: DualWriteBookmarkArgs): Promise<string | null> {
  const content = args.content ?? null;
  const preview = truncatePreview(content || args.title);
  const legacyId = String(args.legacyId);
  const messageId = args.messageId != null ? String(args.messageId) : null;
  try {
    const existing = await db.execute(sql`
      SELECT id FROM library_items
      WHERE legacy_source = ${"project_bookmarks"} AND legacy_id = ${legacyId}
      LIMIT 1
    `);
    if (existing.rows.length > 0) {
      const id = (existing.rows[0] as { id: string }).id;
      await db.execute(sql`
        UPDATE library_items SET
          title = ${args.title},
          content = ${content},
          preview = ${preview},
          origin_message_id = ${messageId},
          project_id = ${args.projectId},
          updated_at = now()
        WHERE id = ${id}::uuid
      `);
      return id;
    }
    const inserted = await db.execute(sql`
      INSERT INTO library_items (
        user_id, project_id, kind, title, content, preview,
        origin_source, origin_message_id, legacy_source, legacy_id
      )
      VALUES (
        ${args.userId}, ${args.projectId}, ${"bookmark"}, ${args.title}, ${content}, ${preview},
        ${"ask-atlas"}, ${messageId}, ${"project_bookmarks"}, ${legacyId}
      )
      RETURNING id
    `);
    return (inserted.rows[0] as { id: string } | undefined)?.id ?? null;
  } catch {
    return null;
  }
}

/** Delete the dual-written library row for a legacy source/id. */
export async function deleteLibraryByLegacy(
  legacySource: LibraryLegacySource,
  legacyId: number | string,
  userId: number,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM library_items
    WHERE legacy_source = ${legacySource}
      AND legacy_id = ${String(legacyId)}
      AND user_id = ${userId}
  `);
}

/**
 * Load active conversation context library items for prompt injection.
 * Returns a markdown block (or null) respecting LIBRARY_CONTEXT_CHAR_BUDGET.
 */
export async function loadConversationLibraryContext(
  conversationId: string,
  userId: number,
): Promise<string | null> {
  if (!conversationId || conversationId === "__legacy__") return null;

  try {
    const result = await db.execute(sql`
      SELECT
        li.id,
        li.kind,
        li.title,
        li.content,
        li.preview
      FROM conversation_context_items cci
      JOIN library_items li ON li.id = cci.library_item_id
      WHERE cci.conversation_id = ${conversationId}
        AND cci.detached_at IS NULL
        AND li.user_id = ${userId}
      ORDER BY cci.attached_at ASC
    `);

    const rows = result.rows as Array<{
      id: string;
      kind: string;
      title: string;
      content: string | null;
      preview: string;
    }>;
    if (!rows.length) return null;

    const parts: string[] = [];
    let used = 0;
    for (const row of rows) {
      const body = (row.content ?? row.preview ?? "").trim();
      if (!body) continue;
      const header = `### ${row.title} (${row.kind})`;
      const chunk = `${header}\n${body}`;
      if (used + chunk.length > LIBRARY_CONTEXT_CHAR_BUDGET) {
        const remaining = LIBRARY_CONTEXT_CHAR_BUDGET - used - header.length - 20;
        if (remaining > 80) {
          parts.push(`${header}\n${body.slice(0, remaining)}\n… [truncated]`);
        }
        break;
      }
      parts.push(chunk);
      used += chunk.length + 2;
    }

    if (!parts.length) return null;

    return [
      "--- ATTACHED LIBRARY CONTEXT ---",
      "The user attached these Library items to this conversation. Treat their bodies as verbatim reference material. Do not re-save or duplicate them unless asked.",
      ...parts,
      "--- END ATTACHED LIBRARY CONTEXT ---",
    ].join("\n\n");
  } catch {
    return null;
  }
}

/** Resolve project names for a set of project ids owned by user. */
export async function projectNameMap(
  userId: number,
  projectIds: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(projectIds.filter((id) => Number.isFinite(id)))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(and(eq(projectsTable.userId, userId), inArray(projectsTable.id, unique)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type CaptureDeliverableArgs = {
  userId: number;
  projectId: number;
  conversationId?: string | null;
  artifactId: number;
  type: string;
  title: string;
  summary?: string | null;
};

/**
 * Auto-capture a file-backed deliverable (pptx/docx/xlsx) into library_items.
 * Idempotent via legacy_source="project_artifacts" + legacy_id=artifactId.
 * Fire-and-forget — never throws.
 */
export async function captureDeliverableToLibrary(args: CaptureDeliverableArgs): Promise<void> {
  const kind = "document" satisfies LibraryItemKind;
  const legacyId = String(args.artifactId);
  const content = args.summary?.trim() || args.title;
  const preview = truncatePreview(content);
  try {
    const existing = await db.execute(sql`
      SELECT id FROM library_items
      WHERE legacy_source = ${"project_artifacts"} AND legacy_id = ${legacyId}
      LIMIT 1
    `);
    if (existing.rows.length > 0) {
      await db.execute(sql`
        UPDATE library_items SET
          title = ${args.title},
          content = ${content},
          preview = ${preview},
          updated_at = now()
        WHERE id = ${(existing.rows[0] as { id: string }).id}::uuid
      `);
      return;
    }
    await db.execute(sql`
      INSERT INTO library_items (
        user_id, project_id, kind, title, content, preview,
        origin_source, origin_conversation_id, legacy_source, legacy_id
      )
      VALUES (
        ${args.userId}, ${args.projectId}, ${kind}, ${args.title}, ${content}, ${preview},
        ${"workspace"}, ${args.conversationId ?? null}, ${"project_artifacts"}, ${legacyId}
      )
    `);
  } catch {
    // Fire-and-forget — never propagate, never block the tool result
  }
}
