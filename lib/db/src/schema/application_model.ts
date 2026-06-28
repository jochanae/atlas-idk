import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const applicationModelsTable = pgTable("application_models", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }).unique(),
  version: integer("version").notNull().default(1),
  identity: jsonb("identity").notNull().default({}),
  intent: jsonb("intent").notNull().default({}),
  pages: jsonb("pages").notNull().default([]),
  components: jsonb("components").notNull().default([]),
  data: jsonb("data").notNull().default({ entities: [], relationships: [] }),
  logic: jsonb("logic").notNull().default([]),
  buildState: jsonb("build_state").notNull().default({}),
  // Project DNA layers — Layer 2 (Creative Memory) and Layer 3 (Experience Intent)
  creativePrinciples: jsonb("creative_principles").notNull().default([]),
  experienceIntent: jsonb("experience_intent").notNull().default({}),
  // Visual Memory — compact log of processed sketches/images (no raw pixels stored)
  visualSketches: jsonb("visual_sketches").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const applicationModelHistoryTable = pgTable("application_model_history", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  modelVersion: integer("model_version").notNull(),
  fieldChanged: text("field_changed").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Identity ─────────────────────────────────────────────────────────────────
// Absorbs: project name, purpose, audience, category (pre-existing)
// + genome: coreEmotion, identity (positioning phrase), format, surfaceStrategy,
//           wedge, differentiator
export const ApplicationModelIdentitySchema = z.object({
  name: z.string().optional(),
  purpose: z.string().optional(),
  audience: z.string().optional(),
  category: z.string().optional(),
  coreEmotion: z.string().optional(),
  positioning: z.string().optional(),  // was genome.identity — "ownable identity in one phrase"
  format: z.string().optional(),
  surfaceStrategy: z.string().optional(),
  wedge: z.string().optional(),
  differentiator: z.string().optional(),
}).default({});

// ── Intent ───────────────────────────────────────────────────────────────────
// Absorbs: summary, coreProblems, keyOutcomes, constraints, approvedAt (pre-existing)
// + genome: openQuestions, confidenceScore, stack, protectedAreas
export const ApplicationModelIntentSchema = z.object({
  summary: z.string().optional(),
  coreProblems: z.array(z.string()).default([]),
  keyOutcomes: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  confidenceScore: z.number().default(0),
  stack: z.array(z.string()).default([]),
  protectedAreas: z.array(z.string()).default([]),
  approvedAt: z.string().nullable().optional(),
}).default(() => ({
  coreProblems: [],
  keyOutcomes: [],
  constraints: [],
  openQuestions: [],
  confidenceScore: 0,
  stack: [],
  protectedAreas: [],
}));

// ── Page / Component / Entity / Relationship / Logic ─────────────────────────
export const ApplicationModelPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  route: z.string().optional(),
  description: z.string().optional(),
  layout: z.string().optional(),
  children: z.array(z.string()).default([]),
});

export const ApplicationModelComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  pageId: z.string().optional(),
  description: z.string().optional(),
  props: z.record(z.string(), z.unknown()).default({}),
  children: z.array(z.string()).default([]),
});

export const ApplicationModelEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().default(false),
    description: z.string().optional(),
  })).default([]),
  description: z.string().optional(),
});

export const ApplicationModelRelationshipSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum(["one-to-one", "one-to-many", "many-to-many"]).default("one-to-many"),
  label: z.string().optional(),
});

export const ApplicationModelLogicSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["rule", "flow", "state-machine"]).default("rule"),
  description: z.string().optional(),
  triggers: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

// ── BuildState ───────────────────────────────────────────────────────────────
// Absorbs: generated, generatedAt, deployedAt, deployUrl, generatedFileCount (pre-existing)
// + genome: stage, lastEvolvedAt, lastExtractedAt
export const ApplicationModelBuildStateSchema = z.object({
  generated: z.boolean().default(false),
  generatedAt: z.string().nullable().optional(),
  deployedAt: z.string().nullable().optional(),
  deployUrl: z.string().nullable().optional(),
  generatedFileCount: z.number().default(0),
  stage: z.enum(["Think", "Shape", "Decide", "Workspace", "Strategize", "Build", "Operate", "Evolve"]).default("Think"),
  lastEvolvedAt: z.string().nullable().optional(),
  lastExtractedAt: z.string().nullable().optional(),
}).default(() => ({ generated: false, generatedFileCount: 0, stage: "Think" as const }));

export const ApplicationModelDataSchema = z.object({
  entities: z.array(ApplicationModelEntitySchema).default([]),
  relationships: z.array(ApplicationModelRelationshipSchema).default([]),
});

// ── Project DNA Layers ────────────────────────────────────────────────────────
// Layer 2: Creative Principles — accumulated from conversation, never deleted.
//   Each entry is a short declarative statement the product must honour.
export const CreativePrinciplesSchema = z.array(z.string()).default([]);

// Visual Sketch entry — compact record written when a user-attached image is processed.
// Raw pixels are never stored here; this is a searchable design-signal log.
export const VisualSketchEntrySchema = z.object({
  analyzedAt: z.string(),           // ISO timestamp
  description: z.string(),          // 1-2 sentence summary of the image
  signals: z.object({
    emotionalRegister: z.array(z.string()).default([]),
    visualLanguage: z.array(z.string()).default([]),
    designPrinciples: z.array(z.string()).default([]),
  }),
});
export const VisualSketchesSchema = z.array(VisualSketchEntrySchema).default([]);

// Layer 3: Experience Intent — overwritten (with confidence tracking) on each pass.
//   Captures the emotional + sensory brief that shapes every generated artifact.
export const ExperienceIntentSchema = z.object({
  emotionalRegister: z.array(z.string()).default([]),   // how the product should feel
  interactionPosture: z.array(z.string()).default([]),  // how users are expected to use it
  visualLanguage: z.array(z.string()).default([]),      // aesthetic descriptors
  designPrinciples: z.array(z.string()).default([]),    // interaction/UX maxims
  confidence: z.number().min(0).max(100).default(0),
  lastConfirmed: z.string().nullable().optional(),
}).default(() => ({
  emotionalRegister: [],
  interactionPosture: [],
  visualLanguage: [],
  designPrinciples: [],
  confidence: 0,
}));

export const ApplicationModelSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  version: z.number(),
  identity: ApplicationModelIdentitySchema,
  intent: ApplicationModelIntentSchema,
  pages: z.array(ApplicationModelPageSchema).default([]),
  components: z.array(ApplicationModelComponentSchema).default([]),
  data: ApplicationModelDataSchema,
  logic: z.array(ApplicationModelLogicSchema).default([]),
  buildState: ApplicationModelBuildStateSchema,
  creativePrinciples: CreativePrinciplesSchema,
  experienceIntent: ExperienceIntentSchema,
  visualSketches: VisualSketchesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ApplicationModelPatchSchema = z.object({
  identity: ApplicationModelIdentitySchema.optional(),
  intent: ApplicationModelIntentSchema.optional(),
  pages: z.array(ApplicationModelPageSchema).optional(),
  components: z.array(ApplicationModelComponentSchema).optional(),
  data: ApplicationModelDataSchema.optional(),
  logic: z.array(ApplicationModelLogicSchema).optional(),
  buildState: ApplicationModelBuildStateSchema.optional(),
  creativePrinciples: CreativePrinciplesSchema.optional(),
  experienceIntent: ExperienceIntentSchema.optional(),
  visualSketches: VisualSketchesSchema.optional(),
  reason: z.string().optional(),
});

export const ApplicationModelHistorySchema = z.object({
  id: z.number(),
  projectId: z.number(),
  modelVersion: z.number(),
  fieldChanged: z.string(),
  previousValue: z.unknown().nullable(),
  newValue: z.unknown().nullable(),
  reason: z.string().nullable(),
  changedAt: z.string(),
});

export type ApplicationModel = typeof applicationModelsTable.$inferSelect;
export type ApplicationModelHistory = typeof applicationModelHistoryTable.$inferSelect;

// ── Design Plans ─────────────────────────────────────────────────────────────
// Layer 4: Design Plan — structured visual + interaction design brief.
// Lifecycle: draft → proposed → committed
// Each project can accumulate multiple versions; the latest committed is canonical.
export const designPlansTable = pgTable("design_plans", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // 'draft' | 'proposed' | 'committed'
  body: jsonb("body").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

export const DesignPlanBodySchema = z.object({
  navigationPattern: z.string().optional(),
  responsiveIntent: z.object({
    mobile: z.string().optional(),
    tablet: z.string().optional(),
    desktop: z.string().optional(),
  }).optional(),
  informationHierarchy: z.array(z.string()).default([]),
  componentPatterns: z.string().optional(),
  motionPhilosophy: z.string().optional(),
  cardDensity: z.string().optional(),
  typographyScale: z.string().optional(),
  emptyStates: z.string().optional(),
  interactionPatterns: z.object({
    primaryAction: z.string().optional(),
    secondaryAction: z.string().optional(),
    editingStyle: z.string().optional(),
    confirmationBehavior: z.string().optional(),
    gestures: z.string().optional(),
    scrollingBehavior: z.string().optional(),
  }).optional(),
}).default(() => ({ informationHierarchy: [] }));

export const DesignPlanSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  version: z.number(),
  status: z.enum(["draft", "proposed", "committed"]),
  body: DesignPlanBodySchema,
  createdAt: z.string(),
  committedAt: z.string().nullable().optional(),
});

export type DesignPlan = typeof designPlansTable.$inferSelect;

// ── Project Artifacts ────────────────────────────────────────────────────────
// Versioned log of everything Atlas has generated for a project:
// design plans, blueprint snapshots, build outputs, and visual sketches.
export const projectArtifactsTable = pgTable("project_artifacts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'design_plan' | 'blueprint_snapshot' | 'build_output' | 'visual_sketch'
  version: integer("version").notNull().default(1),
  title: text("title").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectArtifact = typeof projectArtifactsTable.$inferSelect;
