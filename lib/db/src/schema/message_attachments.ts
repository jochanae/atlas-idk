import {
  pgTable,
  uuid,
  integer,
  text,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";
import { libraryItemsTable } from "./library_items";

/**
 * Persistent chat attachments.
 *
 * Sequencing (option a): row is created at POST /api/attachments/request-upload
 * with upload_status='pending_upload'. Message linkage (`chat_message_id` /
 * `nexus_message_id`) and conversation_id are patched on the send turn.
 * conversation_id is nullable until send because request-upload may precede
 * conversation creation (frontend contract does not require it on upload).
 *
 * ID types match the live schema: users/projects are integer serials;
 * nexus/chat message PKs are integer serials; library_items.id is uuid.
 */

export const ATTACHMENT_SURFACES = ["ask_atlas", "nexus"] as const;
export type AttachmentSurface = (typeof ATTACHMENT_SURFACES)[number];

export const ATTACHMENT_KINDS = [
  "image",
  "pdf",
  "doc",
  "spreadsheet",
  "code",
  "text",
  "other",
] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_UPLOAD_STATUSES = [
  "pending_upload",
  "uploaded",
  "failed",
] as const;
export type AttachmentUploadStatus = (typeof ATTACHMENT_UPLOAD_STATUSES)[number];

export const ATTACHMENT_AVAILABILITY_STATUSES = [
  "active",
  "expiring",
  "expired",
  "library",
] as const;
export type AttachmentAvailabilityStatus =
  (typeof ATTACHMENT_AVAILABILITY_STATUSES)[number];

export const ATTACHMENT_PROCESSING_STATUSES = [
  "pending",
  "understood",
  "unsupported",
  "failed",
] as const;
export type AttachmentProcessingStatus =
  (typeof ATTACHMENT_PROCESSING_STATUSES)[number];

export const messageAttachmentsTable = pgTable(
  "message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    /** Nexus conversation UUID or home conversation id as text. Null until send. */
    conversationId: text("conversation_id"),
    surface: text("surface").$type<AttachmentSurface>(),
    chatMessageId: integer("chat_message_id"),
    nexusMessageId: integer("nexus_message_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    kind: text("kind").$type<AttachmentKind>().notNull().default("other"),
    storageBucket: text("storage_bucket").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadStatus: text("upload_status")
      .$type<AttachmentUploadStatus>()
      .notNull()
      .default("pending_upload"),
    availabilityStatus: text("availability_status")
      .$type<AttachmentAvailabilityStatus>()
      .notNull()
      .default("active"),
    processingStatus: text("processing_status")
      .$type<AttachmentProcessingStatus>()
      .notNull()
      .default("pending"),
    libraryItemId: uuid("library_item_id").references(
      () => libraryItemsTable.id,
      { onDelete: "set null" },
    ),
    /** Null once promoted to Library. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /**
     * Stable client-minted UUID assigned at file-selection time.
     * Set by the frontend so the server can correlate attachment_ack
     * events with the optimistic UI chip. Null for programmatic inserts.
     */
    clientAttachmentId: text("client_attachment_id"),
    /** Machine-readable error code when upload_status = 'failed'. */
    uploadErrorCode: text("upload_error_code"),
    /** Human-readable upload failure detail (max 500 chars). */
    uploadErrorMessage: text("upload_error_message"),
    /** Number of upload attempts made (incremented each try). */
    uploadAttemptCount: integer("upload_attempt_count").notNull().default(0),
    /** Timestamp of the most recent upload attempt. */
    lastUploadAttemptAt: timestamp("last_upload_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("message_attachments_user_id_idx").on(t.userId),
    index("message_attachments_conversation_id_idx").on(t.conversationId),
    index("message_attachments_chat_message_id_idx").on(t.chatMessageId),
    index("message_attachments_nexus_message_id_idx").on(t.nexusMessageId),
    index("message_attachments_expires_at_idx")
      .on(t.expiresAt)
      .where(sql`${t.availabilityStatus} <> 'library'`),
  ],
);

export const insertMessageAttachmentSchema = createInsertSchema(
  messageAttachmentsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMessageAttachment = z.infer<
  typeof insertMessageAttachmentSchema
>;
export type MessageAttachment = typeof messageAttachmentsTable.$inferSelect;
