/**
 * Canonical frontend shape for a Library item.
 *
 * Consumes GET /api/library. Includes optional sourceRef from the
 * source-integrity backend contract for reopening canonical origins.
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

/** Durable pointer back to the originating record (source-integrity contract). */
export type LibrarySourceRef =
  | {
      sourceKind: "project-artifact";
      sourceId: string;
      artifactType: string | null;
      projectId: number | null;
      conversationId: string | null;
    }
  | {
      sourceKind: "home-artifact";
      sourceId: string;
      artifactType: string | null;
      conversationId: string | null;
    }
  | {
      sourceKind: "conversation-bookmark";
      sourceId: string;
      messageId: string | null;
      conversationId: string | null;
      projectId: number | null;
    };

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
  /** Canonical reopen pointer when the backend provides one. */
  sourceRef?: LibrarySourceRef | null;
  createdAt: string;
  updatedAt?: string;
}
