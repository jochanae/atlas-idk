/**
 * Conversation extraction pass for the Application Model.
 *
 * After each Atlas response, this fires a lightweight Haiku call that reads
 * the current Application Model state and the conversation turn, then returns
 * a partial PATCH diff. The diff is applied asynchronously — it never blocks
 * the chat response.
 *
 * Conservative by design: only extracts what is explicitly mentioned.
 * No inference, no hallucination of structure that wasn't discussed.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db, applicationModelsTable, applicationModelHistoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { syncFlowCanvasFromModel } from "./flowMapSync";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ApplicationModelPatch {
  identity?: {
    name?: string;
    purpose?: string;
    audience?: string;
    category?: string;
  };
  intent?: {
    summary?: string;
    coreProblems?: string[];
    keyOutcomes?: string[];
    constraints?: string[];
  };
  pages?: Array<{ id: string; name: string; route?: string; description?: string }>;
  components?: Array<{ id: string; name: string; pageId?: string; description?: string }>;
  data?: {
    entities?: Array<{ id: string; name: string; description?: string; fields?: Array<{ name: string; type: string }> }>;
    relationships?: Array<{ id: string; from: string; to: string; type: string; label?: string }>;
  };
  logic?: Array<{ id: string; name: string; type: string; description?: string }>;
}

const EXTRACTION_PROMPT = `You are extracting structured Application Model data from a conversation turn.

CURRENT APPLICATION MODEL:
{CURRENT_MODEL}

CONVERSATION TURN:
User: {USER_MESSAGE}

Atlas: {ASSISTANT_REPLY}

Extract ONLY what is explicitly mentioned in this conversation turn. Do not infer or hallucinate structure.

Return a JSON object with ONLY the fields that have new or updated information. Omit any field with no new information. Use this structure:

{
  "identity": {
    "name": "project name if mentioned",
    "purpose": "what it does if described",
    "audience": "who it's for if mentioned",
    "category": "app/service/tool/etc if clear"
  },
  "intent": {
    "summary": "one sentence summary of core intent if described",
    "coreProblems": ["problem 1", "problem 2"],
    "keyOutcomes": ["outcome 1"],
    "constraints": ["constraint 1"]
  },
  "pages": [
    { "id": "slug-id", "name": "Page Name", "route": "/route", "description": "what it shows" }
  ],
  "components": [
    { "id": "slug-id", "name": "ComponentName", "description": "what it does" }
  ],
  "data": {
    "entities": [
      { "id": "slug-id", "name": "EntityName", "description": "what it represents", "fields": [{"name": "fieldName", "type": "string"}] }
    ],
    "relationships": [
      { "id": "slug-id", "from": "entity-id", "to": "entity-id", "type": "one-to-many", "label": "has many" }
    ]
  },
  "logic": [
    { "id": "slug-id", "name": "Rule Name", "type": "rule", "description": "what it enforces" }
  ]
}

Rules:
- If a field has no new information from this turn, OMIT it entirely (do not return empty arrays or null)
- For arrays (pages, components, entities), only include NEWLY mentioned items, not items already in the model
- For identity and intent text fields, only include if this turn explicitly describes them
- Use kebab-case for id fields
- Keep descriptions short (1 sentence max)
- If nothing new was mentioned, return {}

Respond with ONLY the JSON object, no explanation.`;

async function getCurrentModel(projectId: number): Promise<Record<string, unknown>> {
  const rows = await db
    .select()
    .from(applicationModelsTable)
    .where(eq(applicationModelsTable.projectId, projectId))
    .limit(1);

  if (rows.length === 0) return {};

  const row = rows[0];
  return {
    identity: row.identity ?? {},
    intent: row.intent ?? {},
    pages: row.pages ?? [],
    components: row.components ?? [],
    data: row.data ?? { entities: [], relationships: [] },
    logic: row.logic ?? [],
  };
}

async function applyModelPatch(projectId: number, patch: ApplicationModelPatch): Promise<void> {
  const current = await db
    .select()
    .from(applicationModelsTable)
    .where(eq(applicationModelsTable.projectId, projectId))
    .limit(1);

  if (current.length === 0) return;

  const row = current[0];
  const newVersion = row.version + 1;
  const historyRows: Array<{
    projectId: number;
    modelVersion: number;
    fieldChanged: string;
    previousValue: unknown;
    newValue: unknown;
    reason: string;
  }> = [];

  const updates: Record<string, unknown> = { version: newVersion };

  // Merge identity
  if (patch.identity && Object.keys(patch.identity).length > 0) {
    const prev = (row.identity as Record<string, unknown>) ?? {};
    const merged = { ...prev, ...Object.fromEntries(Object.entries(patch.identity).filter(([, v]) => v != null && v !== "")) };
    if (JSON.stringify(merged) !== JSON.stringify(prev)) {
      updates.identity = merged;
      historyRows.push({ projectId, modelVersion: newVersion, fieldChanged: "identity", previousValue: prev, newValue: merged, reason: "conversation-extracted" });
    }
  }

  // Merge intent
  if (patch.intent && Object.keys(patch.intent).length > 0) {
    const prev = (row.intent as Record<string, unknown>) ?? {};
    const merged: Record<string, unknown> = { ...prev };
    if (patch.intent.summary) merged.summary = patch.intent.summary;
    if (patch.intent.coreProblems?.length) {
      const existing = (prev.coreProblems as string[]) ?? [];
      merged.coreProblems = [...new Set([...existing, ...patch.intent.coreProblems])];
    }
    if (patch.intent.keyOutcomes?.length) {
      const existing = (prev.keyOutcomes as string[]) ?? [];
      merged.keyOutcomes = [...new Set([...existing, ...patch.intent.keyOutcomes])];
    }
    if (patch.intent.constraints?.length) {
      const existing = (prev.constraints as string[]) ?? [];
      merged.constraints = [...new Set([...existing, ...patch.intent.constraints])];
    }
    if (JSON.stringify(merged) !== JSON.stringify(prev)) {
      updates.intent = merged;
      historyRows.push({ projectId, modelVersion: newVersion, fieldChanged: "intent", previousValue: prev, newValue: merged, reason: "conversation-extracted" });
    }
  }

  // Merge pages — dedup by id AND name (case-insensitive) to prevent duplicates
  // when Haiku generates a different slug for a page that already exists.
  if (patch.pages?.length) {
    const prev = (row.pages as Array<{ id: string; name: string }>) ?? [];
    const existingIds = new Set(prev.map((p) => p.id));
    const existingNames = new Set(prev.map((p) => p.name.toLowerCase()));
    const newPages = patch.pages.filter(
      (p) => p.id && p.name && !existingIds.has(p.id) && !existingNames.has(p.name.toLowerCase()),
    );
    if (newPages.length > 0) {
      const merged = [...prev, ...newPages];
      updates.pages = merged;
      historyRows.push({ projectId, modelVersion: newVersion, fieldChanged: "pages", previousValue: prev, newValue: merged, reason: "conversation-extracted" });
    }
  }

  // Merge components — dedup by id AND name
  if (patch.components?.length) {
    const prev = (row.components as Array<{ id: string; name: string }>) ?? [];
    const existingIds = new Set(prev.map((c) => c.id));
    const existingNames = new Set(prev.map((c) => c.name.toLowerCase()));
    const newComponents = patch.components.filter(
      (c) => c.id && c.name && !existingIds.has(c.id) && !existingNames.has(c.name.toLowerCase()),
    );
    if (newComponents.length > 0) {
      const merged = [...prev, ...newComponents];
      updates.components = merged;
      historyRows.push({ projectId, modelVersion: newVersion, fieldChanged: "components", previousValue: prev, newValue: merged, reason: "conversation-extracted" });
    }
  }

  // Merge data (entities + relationships) — dedup by id AND name
  if (patch.data) {
    const prevData = (row.data as { entities?: Array<{ id: string; name: string }>; relationships?: Array<{ id: string }> }) ?? {};
    const prevEntities = prevData.entities ?? [];
    const prevRels = prevData.relationships ?? [];
    let changed = false;
    const mergedEntities = [...prevEntities];
    const mergedRels = [...prevRels];

    if (patch.data.entities?.length) {
      const existingIds = new Set(prevEntities.map((e) => e.id));
      const existingNames = new Set(prevEntities.map((e) => e.name.toLowerCase()));
      const newEntities = patch.data.entities.filter(
        (e) => e.id && e.name && !existingIds.has(e.id) && !existingNames.has(e.name.toLowerCase()),
      );
      if (newEntities.length > 0) { mergedEntities.push(...newEntities); changed = true; }
    }
    if (patch.data.relationships?.length) {
      const existingIds = new Set(prevRels.map((r) => r.id));
      const newRels = patch.data.relationships.filter((r) => !existingIds.has(r.id));
      if (newRels.length > 0) { mergedRels.push(...newRels); changed = true; }
    }
    if (changed) {
      const mergedData = { entities: mergedEntities, relationships: mergedRels };
      updates.data = mergedData;
      historyRows.push({ projectId, modelVersion: newVersion, fieldChanged: "data", previousValue: prevData, newValue: mergedData, reason: "conversation-extracted" });
    }
  }

  // Merge logic — dedup by id AND name
  if (patch.logic?.length) {
    const prev = (row.logic as Array<{ id: string; name: string }>) ?? [];
    const existingIds = new Set(prev.map((l) => l.id));
    const existingNames = new Set(prev.map((l) => l.name.toLowerCase()));
    const newLogic = patch.logic.filter(
      (l) => l.id && l.name && !existingIds.has(l.id) && !existingNames.has(l.name.toLowerCase()),
    );
    if (newLogic.length > 0) {
      const merged = [...prev, ...newLogic];
      updates.logic = merged;
      historyRows.push({ projectId, modelVersion: newVersion, fieldChanged: "logic", previousValue: prev, newValue: merged, reason: "conversation-extracted" });
    }
  }

  if (historyRows.length === 0) return; // nothing new

  // Stamp lastExtractedAt in buildState (no history record — operational metadata only)
  const prevBuildState = (row.buildState as Record<string, unknown>) ?? {};
  updates.buildState = { ...prevBuildState, lastExtractedAt: new Date().toISOString() };

  await db.update(applicationModelsTable).set(updates as any).where(eq(applicationModelsTable.projectId, projectId));
  await db.insert(applicationModelHistoryTable).values(historyRows);

  // Propagate to Flow Map canvas when pages or data entities changed.
  // Fire-and-forget — safe because extractAndUpdateApplicationModel is already non-blocking.
  if (updates.pages !== undefined || updates.data !== undefined) {
    syncFlowCanvasFromModel(projectId).catch((err) =>
      logger.warn({ err, projectId }, "flow sync after AM extraction failed — non-fatal"),
    );
  }
}

export async function extractAndUpdateApplicationModel({
  projectId,
  userMessage,
  assistantReply,
}: {
  projectId: number;
  userMessage: string;
  assistantReply: string;
}): Promise<void> {
  if (!projectId || !userMessage || !assistantReply) return;
  // Only extract when there's real content — skip greetings, acks, etc.
  if (assistantReply.trim().length < 100) return;

  try {
    const currentModel = await getCurrentModel(projectId);

    const prompt = EXTRACTION_PROMPT
      .replace("{CURRENT_MODEL}", JSON.stringify(currentModel, null, 2))
      .replace("{USER_MESSAGE}", userMessage.slice(0, 2000))
      .replace("{ASSISTANT_REPLY}", assistantReply.slice(0, 3000));

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!raw || raw === "{}") return;

    // Parse JSON — strip markdown fences if present
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    let patch: ApplicationModelPatch;
    try {
      patch = JSON.parse(jsonStr);
    } catch {
      logger.warn({ raw }, "applicationModelExtraction: JSON parse failed");
      return;
    }

    if (Object.keys(patch).length === 0) return;
    await applyModelPatch(projectId, patch);
    logger.info({ projectId, fields: Object.keys(patch) }, "applicationModelExtraction: applied");
  } catch (err) {
    logger.warn({ err, projectId }, "applicationModelExtraction: failed — non-fatal");
  }
}
