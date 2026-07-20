/**
 * Lightweight ring buffer for attachment / turn activity verbs.
 *
 * The companion timeline-verbs handoff will harden persistence; this module
 * lets resolve/extract emit `attachment_unsupported` (and related) events that
 * `/api/nexus/activity` can already surface to the frontend rail.
 */

export type AttachmentActivityType =
  | "attachment_received"
  | "image_analyzed"
  | "document_analyzed"
  | "attachment_unsupported"
  | "atlas_thinking"
  | "response_generated";

export type AttachmentActivityEvent = {
  id: string;
  type: AttachmentActivityType;
  userId: number;
  projectId: number;
  projectName?: string;
  title: string;
  subtitle?: string;
  attachmentName?: string;
  reason?: string;
  timestamp: string;
};

const MAX_EVENTS = 200;
const events: AttachmentActivityEvent[] = [];

export function recordAttachmentActivity(
  event: Omit<AttachmentActivityEvent, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): AttachmentActivityEvent {
  const full: AttachmentActivityEvent = {
    id:
      event.id ??
      `attact-${event.type}-${event.userId}-${event.attachmentName ?? "none"}-${Date.now()}`,
    type: event.type,
    userId: event.userId,
    projectId: event.projectId,
    projectName: event.projectName,
    title: event.title,
    subtitle: event.subtitle,
    attachmentName: event.attachmentName,
    reason: event.reason,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  // Idempotency: replace existing id rather than duplicating.
  const existing = events.findIndex((e) => e.id === full.id);
  if (existing >= 0) {
    events[existing] = full;
  } else {
    events.push(full);
    while (events.length > MAX_EVENTS) events.shift();
  }
  return full;
}

export function listAttachmentActivitiesForProjects(
  userId: number,
  projectIds: number[],
): AttachmentActivityEvent[] {
  const idSet = new Set(projectIds);
  return events.filter((e) => e.userId === userId && idSet.has(e.projectId));
}

/** Test helper — clears the ring buffer. */
export function __resetAttachmentActivityForTests(): void {
  events.length = 0;
}
