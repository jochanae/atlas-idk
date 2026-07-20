/**
 * Attachment / turn activity verbs for the workspace rail.
 *
 * Keeps a process-local ring buffer for immediate same-process reads, and
 * dual-writes to durable `workspace_activity` so polls survive restarts.
 */

import {
  emitWorkspaceActivityAsync,
  type WorkspaceActivityType,
} from "./workspaceActivity";

export type AttachmentActivityType = WorkspaceActivityType;

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

  // Durable persistence — same idempotency key as the ring-buffer id.
  emitWorkspaceActivityAsync({
    userId: full.userId,
    projectId: full.projectId,
    type: full.type,
    title: full.title,
    subtitle: full.subtitle,
    attachmentName: full.attachmentName,
    reason: full.reason,
    idempotencyKey: full.id,
  });

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
