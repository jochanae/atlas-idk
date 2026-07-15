/**
 * Canonical frontend shape for a Library item.
 *
 * This type is intentionally shaped for the future `GET /api/library`
 * endpoint (see docs/handoffs/2026-07-15-library-foundation-backend.md),
 * NOT for any current legacy response. All legacy shapes MUST be
 * converted through an adapter in `./adapters/*` before reaching UI code.
 *
 * DO NOT add legacy fields (e.g. home_artifacts.type) to this type.
 * DO NOT let UI components import legacy response types directly.
 */
export type LibraryItemKind =
  | "document"
  | "prd"
  | "plan"
  | "strategy"
  | "spec"
  | "outline"
  | "brief"
  | "bookmark"
  | "sketch"
  | "other";

export interface LibraryItemOrigin {
  /** Where the item came from — conversation, workspace, upload, etc. */
  source: "ask-atlas" | "workspace" | "upload" | "unknown";
  /** Conversation the item originated in, if any. */
  conversationId?: string | null;
  /** Message it was saved from, if any. */
  messageId?: string | null;
}

export interface LibraryItemProject {
  id: number;
  name?: string;
}

export interface LibraryItem {
  /** Stable, canonical id. String so it can hold future non-numeric ids. */
  id: string;
  /** Normalized kind — never the raw legacy `type` string. */
  kind: LibraryItemKind;
  title: string;
  /** Full body text. Optional — list views should prefer `preview`. */
  content?: string;
  /** Short preview snippet (~120 chars) for list rows. */
  preview: string;
  /** Project scope, if any. `null` = user-level. */
  project: LibraryItemProject | null;
  origin: LibraryItemOrigin;
  createdAt: string;
  updatedAt?: string;
}
