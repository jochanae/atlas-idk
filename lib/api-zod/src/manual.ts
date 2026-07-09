import { z } from "zod/v4";

const numericId = z.coerce.number().int().positive();

// ── Projects ──────────────────────────────────────────────────────────────

export const CreateProjectBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entity_type: z.enum(["idea", "project"]).optional(),
  status: z.enum(["shaping", "committed", "built", "archived"]).optional(),
});

export const UpdateProjectBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  memory: z.string().nullable().optional(),
  previewUrl: z.string().nullable().optional(),
  linkedRepo: z.string().nullable().optional(),
  githubToken: z.string().nullable().optional(),
  nodeState: z.unknown().optional(),
  shape: z.unknown().optional(),
  lastHandoverAt: z.string().nullable().optional(),
  lastHandoverHash: z.string().nullable().optional(),
}).passthrough();

export const GetProjectParams = z.object({ id: numericId });
export const UpdateProjectParams = z.object({ id: numericId });
export const DeleteProjectParams = z.object({ id: numericId });
export const TouchProjectParams = z.object({ projectId: numericId });
export const ListReadinessSnapshotsParams = z.object({ id: numericId });
export const RecordReadinessSnapshotParams = z.object({ id: numericId });

export const ListRecentProjectsQueryParams = z.object({
  withinHours: z.coerce.number().int().positive().optional(),
});

export const RecordReadinessSnapshotBody = z.object({
  score: z.number().int().min(0).max(100),
});

// ── Sessions ─────────────────────────────────────────────────────────────

export const CreateSessionBody = z.object({
  title: z.string().min(1),
  mode: z.string().optional(),
  status: z.string().optional(),
  reflectionMode: z.boolean().optional(),
  ideaMode: z.boolean().optional(),
  seedMessage: z.string().optional(),
  seedIntentType: z.string().optional(),
}).passthrough();

export const CreateSessionParams = z.object({ projectId: numericId });
export const GetSessionParams = z.object({ id: numericId });
export const DeleteSessionParams = z.object({ id: numericId });
export const ListSessionsParams = z.object({ projectId: numericId });
export const ListMessagesParams = z.object({ sessionId: numericId });

// ── Entries ───────────────────────────────────────────────────────────────

export const CreateEntryBody = z.object({
  title: z.string().min(1),
  type: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  details: z.string().optional(),
  severity: z.string().optional(),
  verb: z.string().optional(),
  build_id: z.string().optional(),
  is_violation: z.boolean().optional(),
  cost_of_lesson: z.number().nullable().optional(),
  deviation: z.boolean().optional(),
  deviation_reason: z.string().optional(),
  deviationReason: z.string().optional(),
  catchAgainstId: z.number().int().optional(),
  sessionId: z.number().int().optional(),
  sourceMessageId: z.number().int().optional(),
  cardSchemaVersion: z.number().int().optional(),
  context_what: z.string().optional(),
  context_why: z.string().optional(),
  mode: z.string().optional(),
  am_field: z.string().optional(),
}).passthrough();

export const UpdateEntryBody = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  details: z.string().optional(),
  severity: z.string().optional(),
  verb: z.string().optional(),
  deviation: z.boolean().optional(),
  deviation_reason: z.string().optional(),
  context_what: z.string().optional(),
  context_why: z.string().optional(),
}).passthrough();

export const CreateEntryParams = z.object({ projectId: numericId });
export const UpdateEntryParams = z.object({ id: numericId });
export const DeleteEntryParams = z.object({ id: numericId });
export const ListEntriesParams = z.object({ projectId: numericId });
export const ReopenEntryParams = z.object({ id: numericId });

export const ListEntriesQueryParams = z.object({
  status: z.string().optional(),
});

// ── Capacity ──────────────────────────────────────────────────────────────

export const CapacityEstimateBody = z.object({
  kind: z.enum(["forge_codegen", "sketch_generation", "image_edit", "agent_execution"]),
  payload: z.object({
    prompt: z.string().optional(),
    context: z.unknown().optional(),
    model: z.string().optional(),
  }).optional(),
});

export const CapacityConsumeBody = z.object({
  kind: z.enum(["forge_codegen", "sketch_generation", "image_edit", "agent_execution"]),
  estimateId: z.string().optional(),
  actualCredits: z.number().nonnegative(),
  actualTokens: z.number().nonnegative().optional(),
  filesTouched: z.number().nonnegative().optional(),
  componentsAdded: z.number().nonnegative().optional(),
  runId: z.string().optional(),
  ledgerEntryId: z.string().optional(),
  model: z.string().optional(),
});

// ── Thoughts ──────────────────────────────────────────────────────────────

export const CreateThoughtBody = z.object({
  content: z.string().min(1),
});

// ── Project Sources (F2 Source Intelligence) ──────────────────────────────

export const ProjectSourceType = z.enum(["zip", "github", "replit", "generated", "pasted"]);
export const ProjectSourceIngestStatus = z.enum(["pending", "indexing", "ready", "failed"]);

export const IngestSourceBody = z.object({
  sourceType: ProjectSourceType,
  sourceRef: z.record(z.string(), z.unknown()).optional(),
  payload: z.object({
    storageKey: z.string().min(1).optional(),
    files: z.array(z.object({ path: z.string().min(1), content: z.string() })).optional(),
  }).default({}),
  isPrimary: z.boolean().optional(),
});

export const IngestSourceResponse = z.object({
  sourceId: z.string().uuid(),
  status: z.literal("indexing"),
});

export const SourceListItem = z.object({
  id: z.string().uuid(),
  projectId: z.number().int(),
  sourceType: ProjectSourceType,
  sourceRef: z.record(z.string(), z.unknown()),
  isPrimary: z.boolean(),
  lastIngestedAt: z.string().nullable(),
  lastIngestStatus: ProjectSourceIngestStatus,
  lastIngestError: z.string().nullable(),
  fileCount: z.number().int(),
  totalBytes: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SourceSearchHit = z.object({
  path: z.string(),
  line: z.number().int(),
  preview: z.string(),
  matchRange: z.tuple([z.number().int(), z.number().int()]),
});

export const SourceCitation = z.object({
  path: z.string(),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  snippet: z.string(),
});

export const SourceQaBody = z.object({
  question: z.string().min(1),
  k: z.number().int().min(1).max(20).optional(),
});

export const SourceQaResponse = z.object({
  answer: z.string(),
  citations: z.array(SourceCitation),
});

export const SourceImpactBody = z.object({
  paths: z.array(z.string()).min(1),
  depth: z.number().int().min(1).max(5).optional(),
});

export const SourceDiffResponse = z.object({
  since: z.string().uuid(),
  sinceTakenAt: z.string(),
  latestSnapshotId: z.string().uuid(),
  latestTakenAt: z.string(),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  modified: z.array(z.object({
    path: z.string(),
    oldSha: z.string(),
    newSha: z.string(),
  })),
});

export const SourceRoute = z.object({
  method: z.string().optional(),
  path: z.string(),
  handler: z.string().optional(),
  file: z.string(),
  line: z.number().int(),
});

