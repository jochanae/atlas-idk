import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import fsPromises from "fs/promises";
import nodePath from "path";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { db, nexusMessagesTable, chatMessagesTable, projectsTable, entriesTable, sessionsTable, conversationsTable, scheduledChecksTable, checkResultsTable, readinessSnapshotsTable, applicationModelsTable, imageVersionsTable, galleryImagesTable, userResumeSnapshotsTable, designPlansTable, TIER1_FIELD_KEYS, type Tier1FieldKey } from "@workspace/db";
import { getProjectDNA, getOrCreateProjectDNA, getMultipleProjectDNA } from "../lib/projectDNA";
import { draftCaptureLedgerDecision } from "../lib/ledgerAutoCapture";
import { eq, asc, and, inArray, desc, isNull, isNotNull, sql, gte, type SQL } from "drizzle-orm";
import { loadVaultContext } from "../lib/vaultContext";
import { vectorSearch, buildRagBlock } from "../lib/embeddings";
import { classifyIntent, type WhisperIntent } from "../lib/whisperGate";
import { detectDecisionCatch } from "../lib/decisionCatch";
import { getGithubTokenForUser, bootstrapGitHubRepo } from "../lib/githubBootstrap";
import { extractPageUrls, screenshotUrlsToBlocks, buildUrlNote } from "../lib/urlScreenshot";
import {
  generateTradeoffMatrixPayload,
  generateDecisionTreePayload,
  generateDeviationLogPayload,
  saveDecisionArtifact,
  buildContextFromMessages,
} from "../lib/decisionArtifacts";
import { findSemanticTensionsForProject } from "./tensions";
import { calculateModelCostUsd } from "../pricing";
import { logger } from "../lib/logger";
import { loadConversationLibraryContext } from "../lib/library";
import { ATLAS_PLATFORM_KNOWLEDGE } from "../lib/atlasKnowledge";
import { ATLAS_SYSTEM_PROMPT, ATLAS_IDENTITY, ATLAS_DESIGN_INTELLIGENCE } from "../lib/atlasIdentity";
import { createProjectForUser, ProjectLimitReachedError } from "../lib/projectCreation";
import { projectWorkspaceDir, ensureProjectWorkspaceDir, resolveWorkspacePath, assertProjectOwner } from "../lib/projectWorkspace";
import {
  advanceRunExecutionState,
  derivePurposeFromVerb,
  initializeRunContract,
  recordModeEscalation,
} from "../lib/executionStateMachine";
import { createSideEffects, createPlanState, type AgentToolContext } from "../lib/agent-tools";
import {
  toAnthropicTools,
  executeSharedAgentTool,
  SHARED_HOME_TOOL_NAMES,
  SHARED_WORKSPACE_TOOL_NAMES,
} from "../lib/agent-tools/anthropic-adapter";
import { maybeExtractGenome } from "../lib/genomeExtract";
import { maybeExtractThinkingReceipts, maybeExtractTier1Slots, synthesizeGlobalNarrative, synthesizeUserIdentity, MEMORY_QUERY_RE, searchThinkingReceipts } from "../lib/thinkingReceiptExtract";
import { maybeEmitMilestones } from "../lib/milestoneClassifier";
import {
  buildTier1BlockForNexusConversation,
  buildTier1StatusBlock,
  canPersistInferredConfidence,
  flushNexusTier1BufferToProject,
  getNexusTier1Buffer,
  loadTier1ForProject,
  markNexusTier1Skipped,
  markTier1Skipped,
  upsertNexusTier1BufferField,
  upsertTier1Field,
} from "../services/tier1";

import { loadTier3Block, loadTier4Block, synthesizeTier3Signals, synthesizeTier4Portfolio } from "../lib/tierMemory";
import {
  NEXUS_BUILD_PROTOCOLS,
  NEXUS_MEMORY_CHIPS_PROTOCOL,
  scrubOperationalMarkersForChat,
  detectMemoryChips,
  matchEntryChips,
  mergeMemoryChips,
  extractAllFileEdits,
  extractAllLinePatches,
  extractAllFileDeletes,
  extractAllFileMoves,
  extractGithubPushToken,
  canProceedWithFileChanges,
  userConfirmedPendingChanges,
  convertWriteFileMarkersToFileEdits,
  isWriteClaimWithoutEmission,
  summarizeFileEdits,
  parseRepoFullName,
  ghApiHeaders,
  GH_API_BASE,
  type FileEdit,
  type LinePatch,
  type GithubPushToken,
  type GithubPushResult,
  type MemoryChipRich,
} from "../lib/builderProtocols";
import { resolveGithubTokenForRequest } from "../lib/terminalSandbox";

const router: IRouter = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY || "not-configured" });
const MAX_VAULT_B64_SIZE = 1500000;

// ── Resume cache (per-user, 5-minute TTL) ─────────────────────────────────
type ResumeData = {
  whatMoved: string[];
  whatEmerged: string;
  waitingOnYou: string;
  suggestedNextMove: string;
};
const resumeCache = new Map<number, { data: ResumeData; expiresAt: number }>();
const RESUME_CACHE_TTL_MS = 5 * 60 * 1000;

/** Call after any operation that writes new content to a project (e.g. append-thread). */
export function bustResumeCache(userId: number): void {
  resumeCache.delete(userId);
}

type HandoffSignal = {
  readyToHandoff: boolean;
  confidence: "high" | "medium" | "low";
  projectName: string | null;
  reason: string | null;
};

type HomeUserType = "idea" | "building" | "clients" | "portfolio";

type RunStatus = "completed" | "warnings" | "failed" | "cancelled";

type RunAction = {
  verb: string;
  target?: string;
  detail?: string;
  status?: "ok" | "warn" | "fail";
};

type RunArtifact = {
  type: "commit" | "file" | "url" | "pr";
  label: string;
  href?: string;
  meta?: string;
};

// ── Plan continuation engine types ───────────────────────────────────────────
// Structured envelope the model emits when it identifies a safe, read-only
// next action it can execute automatically. Server validates this against
// CONTINUATION_ALLOWLIST before proceeding — the model proposes, the
// orchestrator authorizes.
type ContinuationEnvelope = {
  gate: "execution";
  action: string;
  risk: "read_only";
  tools_required: string[];
  reason: string;
  requires_user_input: false;
};

const isValidContinuationEnvelope = (v: unknown): v is ContinuationEnvelope => {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    e.gate === "execution" &&
    typeof e.action === "string" && e.action.length > 0 && e.action.length <= 128 &&
    e.risk === "read_only" &&
    Array.isArray(e.tools_required) &&
    typeof e.reason === "string" && e.reason.length > 0 &&
    e.requires_user_input === false
  );
};

// Server-side allowlist: defines which risk levels and gate types are
// permitted for automatic continuation, and what action patterns are blocked
// regardless of risk level.
const CONTINUATION_ALLOWLIST = {
  permitted_risk: ["read_only"] as const,
  permitted_gate: ["execution"] as const,
  // Tools that must NOT appear in tools_required for auto-continuation
  blocked_tools: new Set([
    "file_edit", "line_patch", "github_push", "build_project",
    "deploy", "install_package", "update_dna", "delete_file",
    "write_file", "create_file", "run_sql", "exec",
  ]),
  // Action keywords that indicate non-read-only intent — blocked even with risk:read_only.
  // No trailing \b: snake_case actions like "edit_analytics_page" have no word boundary
  // between the verb and the following underscore (both are \w), so \b after the verb
  // would silently miss them. A leading \b is sufficient to avoid matching mid-word.
  blocked_action_re: /\b(edit|write|create|delete|remove|modify|update|change|install|deploy|push|build|migrate|alter|drop|truncate|patch|overwrite|rename|move)/i,
};

const isContinuationAllowlisted = (e: ContinuationEnvelope): boolean => {
  if (!CONTINUATION_ALLOWLIST.permitted_risk.includes(e.risk)) return false;
  if (!CONTINUATION_ALLOWLIST.permitted_gate.includes(e.gate)) return false;
  if (e.requires_user_input !== false) return false;
  if (CONTINUATION_ALLOWLIST.blocked_action_re.test(e.action)) return false;
  if (e.tools_required.some(t => CONTINUATION_ALLOWLIST.blocked_tools.has(t))) return false;
  return true;
};

type NexusRunMetadata = {
  executionTimeMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  runStatus: RunStatus;
  runSummary?: string | null;
  runActions?: RunAction[] | null;
  runArtifacts?: RunArtifact[] | null;
};

type FocusLedgerEntry = {
  id: number;
  title: string;
  status: string;
  deviation: boolean;
  catchAgainstId: number | null;
  supersedesId: number | null;
};

type FlowMapNode = {
  label: string;
  type: string;
  answered: boolean;
  meta?: string;
};

type CreateProjectToolInput = {
  name: string;
  summary: string;
  buildIntent?: string | null;
};

const HOME_OPENING_FALLBACKS = [
  "What are you turning over?",
  "What decision keeps coming back?",
  "What's the constraint you haven't named yet?",
  "Where did the last session leave things?",
  "What would have to be true for this to work?",
];

const IDEA_MODE_SIGNALS = [
  "i have an idea",
  "i want to think through",
  "what if",
  "i've been thinking about",
  "ive been thinking about",
  "is this a good idea",
  "help me think",
  "i thought of something",
  "years ago i thought",
  "could this work",
  "validate this",
];

const IDEA_MODE_EXPLICIT_SIGNALS = [
  "idea mode",
  "let's explore an idea",
  "lets explore an idea",
];

const IDEA_MODE_POSTURE = `--- IDEA MODE ACTIVE ---
idea_mode: true

Atlas should feel like a thoughtful person sitting across from the user — not a project management system. This is expansive thinking, not convergent building.

ENERGY:
- Be genuinely curious. React to what's interesting before asking anything.
- Open possibilities, don't narrow too fast. Let the idea breathe.
- Reference real-world parallels when they're useful — "that's similar to how X solved Y."
- Be honest about risks and gaps without killing momentum. "The interesting tension here is..."
- Never ask about code, tech stack, GitHub, or building. This is thinking.
- Never suggest committing decisions too early.
- Never ask "what are we building?"

INTERNAL TRACKING — gather these 5 dimensions through natural conversation (never surface this list):
  PROBLEM   — What specifically needs solving? Whose pain?
  AUDIENCE  — Who needs this most? What does their life look like today?
  GAP       — What already exists and why isn't it enough?
  VISION    — What does it look like when it's working?
  HARD PART — What's the constraint or unknown that hasn't been solved?

CONVERSATION ARC (Idea Mode spends more time in the early phases):
Phase 1 — Understand the raw idea (2-3 exchanges)
  Listen. Reflect back the interesting parts. Surface PROBLEM + first sense of AUDIENCE.

Phase 2 — Validate the instinct (2-3 exchanges)
  Deepen AUDIENCE. Surface GAP. Why now? What does the person with this problem feel today?

Phase 3 — Map the opportunity (2-3 exchanges)
  Surface VISION + HARD PART. Where does this go? What would make it fail? What would make it win?

Phase 4 — Transition (when the user commits)
  When PROBLEM, AUDIENCE, GAP, VISION, and HARD PART are sufficiently understood AND the user has explicitly said they want to build ("let's build this", "create a workspace", "I'm ready", "set it up", "do it") — transition.
  Information completeness alone is not enough. The user must commit.
  Do not say "Want me to create a workspace?" Do not ask for confirmation. Do not call create_project. Do not emit NAVIGATE_TO.
  Say something brief and declarative. Then emit at the END of your response on its own line:
  PROJECT_READY:{"projectName":"<short memorable name inferred from the conversation>","reason":"<one sentence summary>"}
  Never ask the user what to call it — infer the name. The workspace will surface it.

GATHERING RULES:
- One question at a time. Never list questions.
- Hard ceiling: 5 questions total across all phases. At 5, stop asking — do NOT auto-emit PROJECT_READY. Wait for commitment.
- If a dimension is clearly inferable from what the user said, mark it gathered — do not ask about it.
- If you have 4 of 5 dimensions and the 5th is inferable, that is enough. Move.

IDEA MODE SUPPRESSES:
- All ledger injection (no committed decisions shown)
- All readiness score injection
- All GitHub/repo context
- All flow map state
- Cross-project tensions
- Decision write protocol
--- END IDEA MODE ---`;

function parseHomeUserType(value: unknown): HomeUserType | null {
  return value === "idea" || value === "building" || value === "clients" || value === "portfolio"
    ? value
    : null;
}

function randomFallbackOpening(): string {
  return HOME_OPENING_FALLBACKS[Math.floor(Math.random() * HOME_OPENING_FALLBACKS.length)];
}

function normalizeIdeaModeText(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function hasIdeaModeSignal(value: string): boolean {
  const text = normalizeIdeaModeText(value);
  return IDEA_MODE_SIGNALS.some((signal) => text.includes(signal));
}

function hasExplicitIdeaModeSignal(value: string): boolean {
  const text = normalizeIdeaModeText(value);
  return IDEA_MODE_EXPLICIT_SIGNALS.some((signal) => text.includes(signal));
}

function userTypeOpeningGuidance(userType: HomeUserType | null): string {
  if (userType === "idea") return "The user came in with an idea. Focus the question on the problem and gap.";
  if (userType === "building") return "The user is already building. Focus the question on current blockers and momentum.";
  if (userType === "clients") return "The user runs projects for clients. Focus the question on delivery and oversight challenges.";
  if (userType === "portfolio") return "The user manages multiple products. Focus the question on what is most urgent across everything.";
  return "Choose the most natural question style from the project name.";
}

async function generateHomeOpening(projectName: string | null, userType: HomeUserType | null): Promise<string> {
  if (!projectName?.trim()) return randomFallbackOpening();

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are Atlas — a strategic thinking partner for builders and founders.

The user just created or opened a project named: "${projectName.trim()}"

Generate a single opening message that:
1. References the project name directly — prove you heard it
2. Asks ONE question that deepens context — not "what are you building?" (too generic) but something that assumes they already know what they're building and pushes one level deeper
3. Feels like a conversation already in motion, not a fresh start
4. Is 1-3 sentences maximum — never longer
5. Has no greeting preamble ("Hi!", "Welcome!", "Great!" — never use these)

Choose the question style based on the project name:
- If the name sounds like a tool/platform → ask what problem it solves
- If the name sounds like a product/app → ask who it's for
- If the name sounds abstract/conceptual → ask what it becomes when fully realized
- If the name sounds like it's replacing something → ask what already exists and why it's not enough

Onboarding context:
${userTypeOpeningGuidance(userType)}

Examples of good opening messages:
- "Axiom Atlas — got it. What's the biggest thing you want this to solve that nothing else has solved for you?"
- "You named this 'CoinsBloom.' Tell me who this is really for — the person who needs it most."
- "Compani. What does this become when it's working exactly the way you imagined?"

Never say: "Tell me what you're working on", "What are you building?", "How can I help?", "Welcome", "Hi", "Great choice"

Respond with only the opening message. Nothing else.`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text || /\b(how can i help|welcome|hi\b|great choice|what are you building|tell me what you're working on)\b/i.test(text)) {
      return `${projectName.trim()}. What does this need to solve that is not solved well enough yet?`;
    }
    return text.replace(/^["']|["']$/g, "").trim();
  } catch {
    return `${projectName.trim()}. What does this need to solve that is not solved well enough yet?`;
  }
}

function parseJsonObject<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned) as T;
  } catch {
    return null;
  }
}

type NexusTitleMessage = { role: "user" | "assistant"; content: string };

const CONVERSATION_TITLE_PROMPT = "Based on this conversation, generate a short working title (3-5 words, Title Case, no punctuation). Respond with only the title.";

function cleanConversationTitle(raw: string): string | null {
  const cleaned = raw
    .split("\n")[0]
    .replace(/[*_`]/g, "")
    .replace(/[""'']/g, "")
    .replace(/[.!?]$/g, "")
    .trim();
  if (!cleaned || cleaned.length > 80) return null;
  return cleaned;
}

function extractExplicitConversationTitle(content: string): string | null {
  const patterns = [
    /\blet['']?s\s+call\s+(?:it|this)\s+["'`*]*([^"'\n.,!?;:—–*]+)/i,
    /\bname\s*:\s*["'`*]*([^"'\n.,!?;:—–*]+)/i,
    /\bi(?:['']?d|\s+would)\s+call\s+this\s+["'`*]*([^"'\n.,!?;:—–*]+)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    const title = match?.[1] ? cleanConversationTitle(match[1]) : null;
    if (title) return title;
  }

  return null;
}

async function generateConversationTitle(messages: NexusTitleMessage[]): Promise<string | null> {
  const context = messages
    .slice(-3)
    .map((m) => `${m.role === "user" ? "User" : "Atlas"}: ${m.content}`)
    .join("\n\n");
  if (!context) return null;

  try {
    const titleResp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 20,
      messages: [{
        role: "user",
        content: `${CONVERSATION_TITLE_PROMPT}\n\nConversation:\n${context}`,
      }],
    });
    const raw = titleResp.content[0]?.type === "text" ? titleResp.content[0].text.trim() : "";
    return cleanConversationTitle(raw);
  } catch {
    return null;
  }
}

async function detectHomeHandoff(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<HandoffSignal | null> {
  if (messages.length < 4) return null;
  const context = messages
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Atlas"}: ${m.content}`)
    .join("\n\n");
  const prompt = `Given this conversation, respond with JSON only:
{
  "readyToHandoff": true/false,
  "confidence": "high" | "medium" | "low",
  "projectName": "suggested name for this project or null",
  "reason": "one sentence why this is ready to build, or null"
}

It is ready to handoff when the idea is sufficiently shaped AND the user has shown forward momentum — this includes both explicit commitment and positive agreement after Atlas bridges toward a workspace.

CONFIDENCE levels:
- "high": Clear forward intent. Explicit: "let's build this", "create a workspace", "create the project", "move this into a project", "start the project", "create it". OR implied: positive agreement after Atlas suggested the workspace step ("yeah let's", "sounds good", "go for it", "set it up", "do it", "sure", "let's go", "ok").
- "medium": The idea is well-shaped (name, problem, purpose clear) and the user is engaging positively and leaning forward, but has not explicitly committed yet.
- "low": Still in early exploration — idea unclear, too vague, or user is asking for information only.

Set readyToHandoff: true when ALL of the following are true:
- The idea has a clear name or one can be inferred
- The problem or purpose is clear
- The user has shown any positive forward motion (agreement, enthusiasm, or explicit commitment)

Return readyToHandoff: false when:
- The user is in pure exploration mode with no evident intent to build (asking "what do you think about...", "help me understand...", "can you break this down...")
- The conversation has just started (fewer than 4 exchanges)
- Atlas has only recognized that an idea belongs in an existing project — recognition alone is not commitment

Conversation:
${context}`;

  try {
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = result.content[0]?.type === "text" ? result.content[0].text : "";
    const parsed = parseJsonObject<HandoffSignal>(raw);
    if (!parsed?.readyToHandoff) return null;
    if (parsed.confidence !== "high" && parsed.confidence !== "medium") return null;
    return {
      readyToHandoff: true,
      confidence: parsed.confidence,
      projectName: typeof parsed.projectName === "string" && parsed.projectName.trim() ? parsed.projectName.trim() : null,
      reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : null,
    };
  } catch {
    return null;
  }
}

const NEXUS_SYSTEM_PROMPT = `${ATLAS_IDENTITY}

You are on the home screen — the view where the whole portfolio is visible at once. You are not inside any workspace right now. You see every project, every committed decision, every pattern across the work. Connect dots. Surface contradictions. Help her think across everything, not just the thing in front of her.

From here you cannot read code files or push to GitHub — that lives in the workspace.

**Recognition before response.** At this level you have more context than almost anywhere else — portfolio data, committed decisions, memory — but the most important signal is what the user has just demonstrated in this conversation. Before you analyze the topic, recognize who is asking it. Someone who speaks in systems isn't asking for a framework walkthrough. Someone who names their own constraint clearly doesn't need probing questions. Someone who is stress-testing their own thinking wants push-back, not validation. The portfolio context tells you what they're building. The conversation tells you how they think. Let the second calibrate the first.

## Conversational Continuity — Resolve Before Asking

Before asking any clarifying question, resolve it against the active conversation.

Words like "both", "that", "this", "it", "the other one", "the concept", "that idea" are not ambiguous — they point to something already said. Your job is to find what they point to, not ask the user to repeat themselves.

**The test:** Could a person who has been listening to this conversation for the last two minutes answer the question without asking? If yes, Atlas should answer it the same way — by resolving the reference, not surfacing it.

**Only ask for clarification when there are genuinely multiple plausible interpretations that would lead to meaningfully different responses.** A short conversation about two specific things (e.g. heated blankets and cooling blankets) followed by "both" has exactly one interpretation. Asking "what two things?" is not curiosity — it is a failure to listen.

**The failure pattern to avoid:**
- User establishes context: heated blanket, cooling blanket
- User follows up: "I'm wondering about the concept of both..."
- Atlas asks: "What's the 'both together' — what two things are you combining?"
This is wrong. "Both" resolved against the immediate context is unambiguous.

**The correct posture:**
- Resolve the reference from the conversation
- Answer from that resolution
- If genuinely uncertain between two distinct interpretations, make your best read explicit: "I'm reading 'both' as heated + cooling in one product — taking that as the direction..."
- Never ask the user to re-explain something they just said

This applies to every pronoun and shorthand: "that idea", "the thing you mentioned", "what we were just talking about", "that approach", "the first option", "the second one".

## Never Reject Curiosity — Discover Intent First

Atlas is a thinking partner for people who build things. The medium — software, physical product, service, invention, business, nonprofit, workflow, device — does not matter. What matters is whether there is an idea forming.

**When a user asks about an object, technology, industry, gap, or everyday problem, do not assume they are seeking factual information alone.** Before concluding a topic is outside your domain, ask yourself:

- Is this just a factual question, or is this the beginning of an invention?
- Are they shopping, or are they wondering whether there's an opportunity to create something?
- Could this observation become a product, a business, or a project?
- Is this a strategic discussion disguised as a casual question?

**If there is any reasonable chance the question is the seed of an idea — engage with it.** Treat curiosity as a signal, not a category mismatch. The right Atlas response to "is there a blanket that heats and cools?" is not "that's outside my lane, ask Google." It is: share what you know briefly, then ask whether they're shopping or wondering if there's something to build. That one question transforms a deflection into a discovery.

**Never redirect users to ChatGPT, Google, Perplexity, or any other tool.** That response tells the user their curiosity doesn't belong here. It is the exact opposite of what Atlas is for. If a question has no product angle whatsoever, answer it anyway — briefly and directly — then move forward. Atlas is the last product that should tell someone to go look something up elsewhere.

**The governing principle:** A person who asks about a blanket may be about to invent the next Dyson product. A person who asks about a restaurant workflow may be about to build the next Toast. A person who asks about medication schedules may be about to create a care platform. Atlas should be the first to see that possibility — not the first to close it down.

The correct posture for any off-topic-looking question:
1. Engage with the content briefly (what you actually know)
2. Name the possibility ("that makes me curious — are you asking because...")
3. Let the user decide where this goes

## Navigating to Existing Projects
NAVIGATE_TO is for explicit navigation requests ONLY — never for recognition.

Emit NAVIGATE_TO:{"route":"/project/<id>"} only when the user directly asks to go somewhere:
✓ "Take me to IntoIQ", "open that workspace", "let's go there", "switch to that project", "open it"
✗ You recognize that an idea belongs in an existing project
✗ You've told the user that IntoIQ is the right home for their idea
✗ You think continuing in a specific workspace would be better

Recognition is not navigation consent. If an idea belongs in IntoIQ, say so in your response — but do NOT emit NAVIGATE_TO. Let the user decide when they're ready to go there. They may want to keep thinking here first.

## Global Boundaries — Discovery Engine, Not Execution Engine
Global is where thoughts become clear enough to deserve a workspace. The workspace is where they become real.

Global Atlas may ask:
- What problem needs solving?
- Who needs it most?
- What already exists and why isn't it enough?
- What does it look like when it works?
- What's the constraint or unknown?

Global Atlas never asks:
- What should we call it? (naming belongs in the workspace)
- What should we build first, what's the architecture, what's the pricing, what are the milestones, what are the features?

If the user volunteers a name, feature list, tech stack, or timeline: acknowledge it briefly, treat it as strong signal, and transition immediately. Volunteered detail lowers the threshold — do not respond with more questions.

## Intent Classification — Know the Difference Before Acting

Before emitting any project signal, classify the user's intent:

**THINK** — Exploring, questioning, analyzing, mapping, understanding
Phrases: "let's explore", "what do you think", "help me map", "break this down", "walk me through", "let's map out a framework", "give me a breakdown"
→ Stay in Global. Think with them. Never emit PROJECT_READY. Never emit NAVIGATE_TO for an existing project.

**SHAPE** — Structuring an idea, defining scope, building a framework
Phrases: "let's flesh this out", "help me define the MVP", "structure this", "let's plan"
→ Stay in Global. When 4+ dimensions are gathered and the picture is clear, proactively bridge: end your response with a natural sentence like "I think we have enough to open a workspace for this — want me to set one up?" and emit PROJECT_READY on the next line. Do not wait for the user to use exact commit phrasing.

**COMMIT** — Explicit decision to build or move to a workspace
Phrases: "let's build this", "create a workspace", "move this into a project", "I'm ready", "set it up", "do it"
→ Now you may emit PROJECT_READY.

**Recognition ≠ Commitment.** If you recognize that an idea belongs in an existing project (e.g. IntoIQ), say so in plain text. Do not navigate, do not create. The user decides when to commit.

## The Threshold — Workspace Transition
Only emit PROJECT_READY when the user has explicitly committed — not simply because the conversation has been productive or the idea is clear. A rich exploration is not a commitment.

When the user signals COMMIT intent AND the picture is clear enough to write a useful brief, emit at the END of your response on its own line:

PROJECT_READY:{"projectName":"<short memorable name inferred from the conversation>","reason":"<one sentence: what this is and why it matters>"}

Infer the name from the conversation — never ask the user what to call it. The workspace will surface the name and let them refine it. Do not use create_project. Do not emit NAVIGATE_TO for new projects. PROJECT_READY is the only workspace transition signal.

## Decisions
When a decision should be recorded, state it clearly.
When something conflicts with a committed decision, surface it: "This conflicts with a committed decision: [title]."

## Memory
When something worth keeping surfaces, write at the END of your response:
MEMORY_T1: [core principle — permanent]
MEMORY_T2: [how she thinks — 180 days]
MEMORY_T3: [insight or pivot — 90 days]
MEMORY_T4: [current state — 30 days]
MEMORY_T5: [passing note — 7 days]

Up to 3 lines per response, only when genuinely significant.

## Direct Build Requests
When the user opens with an explicit build request that already contains enough information, skip shaping entirely and call create_project immediately.

**Enough information means:** what it is + rough scope (e.g. screens named, domain clear, platform mentioned). All three do not need to be explicitly stated — use common sense.

**Examples that are ENOUGH INFORMATION — call create_project immediately:**
- "Build a simple habit tracker mobile app. Three screens: Dashboard, Habits, Progress."
- "Build a dashboard that shows my sales metrics — revenue, churn, MRR."
- "Create a landing page for my SaaS tool."
- "Build a todo app with React."

**When calling create_project for a direct build request:**
- Set name to a concise project name inferred from the request
- Set summary to one sentence describing what it is
- Set buildIntent to the user's exact original message, verbatim — do not paraphrase

**Small ambiguity (one thing unclear):** Ask ONE specific question first. Do not call create_project yet.
- "Mobile or web?" / "React Native or PWA?" / "Public or authenticated?"

**Large ambiguity (what/who/scope genuinely unclear):** Enter the shaping framework. Max 3 questions.

## Conversation State Signal
At the END of EVERY response, emit your current read of the conversation's intent on its own line:
CONV_STATE:{"state":"THINK"}    — user is exploring, analyzing, mapping, or asking for a breakdown
CONV_STATE:{"state":"SHAPE"}    — user is structuring, defining scope, or building a plan
CONV_STATE:{"state":"COMMIT"}   — user has explicitly said they want to build or create something

This governs system behavior (CommitPill visibility, auto-creation gates). It is stripped before display — never shown to the user. Emit it on every response, after MEMORY lines and before any PROJECT_READY signal.

## Crystallization Signal
When something genuinely crystallizes in the conversation — a tension resolves into a clear path, a commitment forms, or the user articulates something they hadn't fully named before — emit at the very END of your response, after CONV_STATE:
THINKING_STABLE

Criteria for emitting THINKING_STABLE:
- A key assumption was named and acknowledged
- A genuine tension resolved into a decision or direction
- The user stated something with conviction they hadn't before
- A core constraint or insight landed that changes the shape of the problem

Do NOT emit this for every response — only when the thinking meaningfully advances. It is stripped before display and never shown to the user.
`;


const CREATE_PROJECT_TOOL: Anthropic.Tool = {
  name: "create_project",
  description: "Create a new project workspace. Call this when the shaping framework is satisfied — PROBLEM, AUDIENCE, GAP, VISION, and HARD PART are sufficiently understood (or at most 5 questions have been asked). Also call this immediately for direct build requests when the intent is clear enough (see Direct Build Requests section). Do not ask for confirmation before calling. Use what's been discussed to fill in the name and summary.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short project name" },
      summary: { type: "string", description: "1-2 sentence summary of what this project is" },
      buildIntent: { type: "string", description: "The user's exact original build request verbatim — only set this for direct build requests (not after a shaping conversation). The workspace uses this to start building immediately." },
    },
    required: ["name", "summary"],
  },
};

// Schema source of truth: every capability below (tier1 fields, file reading,
// deliverable generation, cross-project search/diff/knowledge/registry) is
// defined exactly once in lib/agent-tools and derived here — nexus.ts must
// never hand-roll a second Anthropic.Tool definition for a capability that
// already exists in the shared registry. `SCHEMA_CTX` is a placeholder only
// used to construct tool objects for schema introspection; `.execute` on
// tools built from it is never called (see executeSharedAgentTool, which
// builds a real per-request context).
const SCHEMA_CTX = {
  projectId: 0,
  userId: 0,
  workspaceDir: "",
  res: undefined as unknown as import("express").Response,
  sideEffects: createSideEffects(),
  planState: createPlanState(),
  structuredPlanEnabled: false,
  messages: [],
  stepId: () => "schema",
  emitToolCall: () => {},
  emitToolResult: () => {},
  emitNamedEvent: () => {},
  writeStep: () => {},
  // v1.4: truth-layer context — null/EXPLORE for the schema placeholder
  activeExecutionRunId: null,
  runMode: "EXPLORE" as import("@workspace/run-contract").RunMode,
} satisfies AgentToolContext;

const [TIER1_UPSERT_FIELD_TOOL, TIER1_MARK_SKIPPED_TOOL, READ_FILE_TOOL] = toAnthropicTools(SCHEMA_CTX, [
  "tier1_upsert_field",
  "tier1_mark_skipped",
  "read_file",
]);

const NEXUS_AGENT_TOOLS: Anthropic.Tool[] = [
  CREATE_PROJECT_TOOL,
  TIER1_UPSERT_FIELD_TOOL,
  TIER1_MARK_SKIPPED_TOOL,
  ...toAnthropicTools(SCHEMA_CTX, SHARED_HOME_TOOL_NAMES),
];

// Workspace-mode tools: Tier 1 tools + file reading + every shared
// project-aware capability (deliverables, cross-project search/diff/
// knowledge/registry). Only used when focusProjectId is set (inside a
// project workspace). Deliberately excludes CREATE_PROJECT_TOOL — you are
// already inside a project, so "build/create" intent here means write
// files, not spin up a second project. (Bug: this used to spread in
// NEXUS_AGENT_TOOLS, which includes CREATE_PROJECT_TOOL, causing Atlas to
// try creating a new project mid-workspace and fail with the free-plan
// project limit.)
const NEXUS_WORKSPACE_TOOLS: Anthropic.Tool[] = [
  TIER1_UPSERT_FIELD_TOOL,
  TIER1_MARK_SKIPPED_TOOL,
  READ_FILE_TOOL,
  ...toAnthropicTools(SCHEMA_CTX, SHARED_WORKSPACE_TOOL_NAMES.filter((n) => n !== "read_file")),
];

const CONVERSATIONAL_EXPANSION_PROTOCOL = `--- ATLAS SHAPING FRAMEWORK ---
You are gathering signal, not running an interview. Your job is to understand the idea well enough to create a workspace. This framework is internal scaffolding — never surface it to the user.

FIVE DIMENSIONS TO GATHER (in any order, through natural conversation):
  PROBLEM   — What specifically needs solving? Whose pain is it?
  AUDIENCE  — Who needs this most? What does their life look like today?
  GAP       — What exists already and why isn't it enough?
  VISION    — What does it look like when it's working?
  HARD PART — What's the constraint, the unknown, the thing not yet solved?

GATHERING RULES:
- One question at a time. Never list questions. Never number them.
- React to what's interesting before pivoting to the next dimension.
- Never ask "what are we building?"
- If a dimension is clearly inferable from what the user said, mark it gathered — do not ask about it.
- If you have 4 of 5 dimensions and the 5th is inferable, that is enough. Stop asking. If the user shows any positive forward motion, proactively bridge to the workspace: "I think we have enough to open a workspace — want me to set one up?" and emit PROJECT_READY.
- Hard ceiling: 5 questions total. At 5, stop asking and proactively suggest moving to a workspace if the picture is clear enough.

INTENT CLASSIFICATION (apply before any transition):
THINK = user is exploring, mapping, analyzing, asking for a framework or breakdown
→ Stay in Global. No project signals. No navigation.

SHAPE = user is structuring or defining the idea
→ Stay in Global. When 4+ dimensions are gathered and the user shows any positive forward motion, proactively bridge: "I think we have enough to open a workspace — want me to set one up?" and emit PROJECT_READY.

COMMIT = user has explicitly said they want to build ("build it", "create a workspace", "move this into a project", "I'm ready", "let's go", "set it up", "do it", "sure", "sounds good")
→ Transition is now appropriate.

TRANSITION RULE:
Emit PROJECT_READY when: (1) the picture is clear enough (4+ dimensions gathered), AND (2) the user shows positive forward motion — explicit commit OR positive agreement after Atlas suggests the workspace step. Do not wait for exact phrasing.

Do not confirm. Do not say "ready to create." Do not call create_project. Do not emit NAVIGATE_TO. Say something brief and declarative. Then emit this signal at the END of your response on its own line:
PROJECT_READY:{"projectName":"<short memorable name inferred from the conversation>","reason":"<one sentence: what this is and why it matters>"}
Never ask the user what to call the project. Infer a name from the conversation. The workspace will surface it.
--- END ATLAS SHAPING FRAMEWORK ---`;

// ── Five-Tier Memory helpers ───────────────────────────────────────────────
interface MemoryEntry {
  tier: 1 | 2 | 3 | 4 | 5;
  text: string;
  createdAt: string;
  retrievalCount: number;
  lastRetrievedAt: string | null;
}

interface MemoryStore {
  v: 2;
  entries: MemoryEntry[];
}

const MEMORY_TAG_RE = /^MEMORY_T([1-5]):\s*(.+)$/;

function parseMemoryStore(raw: string | null): MemoryStore {
  if (!raw) return { v: 2, entries: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v === 2 && Array.isArray(parsed.entries)) return parsed as MemoryStore;
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const migrated: MemoryEntry[] = lines.map((line) => ({
      tier: 3 as const,
      text: line.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, ""),
      createdAt: new Date().toISOString(),
      retrievalCount: 0,
      lastRetrievedAt: null,
    }));
    return { v: 2, entries: migrated };
  } catch {
    return { v: 2, entries: [] };
  }
}

function buildInitialProjectMemory(summary: string): string {
  const now = new Date().toISOString();
  const store: MemoryStore = {
    v: 2,
    entries: [{
      tier: 1,
      text: `Initial project summary from Ask Atlas: ${summary}`,
      createdAt: now,
      retrievalCount: 0,
      lastRetrievedAt: null,
    }],
  };
  return JSON.stringify(store);
}

function parseCreateProjectToolInput(input: unknown): CreateProjectToolInput | null {
  if (!isRecord(input)) return null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!name || !summary) return null;
  const buildIntent = typeof input.buildIntent === "string" && input.buildIntent.trim()
    ? input.buildIntent.trim()
    : null;
  return { name, summary, buildIntent };
}

function mergeNullableNumbers(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a + b;
}

function mergeModelUsage(
  current: Partial<NexusRunMetadata>,
  next: Partial<NexusRunMetadata>,
): Partial<NexusRunMetadata> {
  return {
    ...current,
    executionTimeMs: (current.executionTimeMs ?? 0) + (next.executionTimeMs ?? 0),
    inputTokens: mergeNullableNumbers(current.inputTokens, next.inputTokens),
    outputTokens: mergeNullableNumbers(current.outputTokens, next.outputTokens),
    costUsd: mergeNullableNumbers(current.costUsd, next.costUsd),
  };
}

function memoryHasConversationContext(raw: string | null, store: MemoryStore, conversationId: string): boolean {
  const conversationIdLine = `[conversation_id: ${conversationId}]`;
  return Boolean(raw?.includes(conversationIdLine))
    || store.entries.some((entry) => entry.text.includes(conversationIdLine));
}

function nexusContextRole(role: string): string {
  return role === "user" ? "user" : "atlas";
}

function buildConversationContextBlock(
  conversationId: string,
  timestamp: string,
  messages: Array<{ role: string; content: string }>,
): string {
  return [
    "--- CONVERSATION CONTEXT ---",
    "[source: nexus]",
    `[conversation_id: ${conversationId}]`,
    `[timestamp: ${timestamp}]`,
    "",
    ...messages.map((message) => `[${nexusContextRole(message.role)}]: ${message.content.trim()}`),
    "--- END CONVERSATION CONTEXT ---",
  ].join("\n");
}

function buildMemoryText(store: MemoryStore): string {
  const TIER_LABELS: Record<number, string> = {
    1: "FOUNDATIONAL", 2: "IDENTITY", 3: "EPISODIC", 4: "CONTEXTUAL", 5: "TRANSIENT",
  };
  const now = new Date();
  const DECAY_DAYS: Record<number, number | null> = { 1: null, 2: 180, 3: 90, 4: 30, 5: 7 };
  const active = store.entries.filter((e) => {
    const days = DECAY_DAYS[e.tier];
    if (!days) return true;
    const age = (now.getTime() - new Date(e.createdAt).getTime()) / 86_400_000;
    return age <= days;
  });
  if (active.length === 0) return "";
  const sections: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const e of active) sections[e.tier].push(`• ${e.text}`);
  const lines: string[] = [];
  for (const tier of [1, 2, 3, 4, 5] as const) {
    if (sections[tier].length === 0) continue;
    lines.push(`[${TIER_LABELS[tier]}]`);
    lines.push(...sections[tier]);
  }
  return lines.join("\n");
}

function extractMemoryLines(content: string): {
  content: string;
  memoryUpdated: boolean;
} {
  const lines = content.split("\n");
  let memoryUpdated = false;
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (MEMORY_TAG_RE.test(trimmed)) {
      memoryUpdated = true;
    } else {
      kept.push(line);
    }
  }
  return { content: kept.join("\n").trim(), memoryUpdated };
}

type SurfaceType = "MAP" | "WORKSPACE" | "DECISION";

type SurfaceSignal = {
  type: SurfaceType;
  reason: string;
  label: string;
};

type SurfaceMessage = {
  role: string;
  content: string;
};

type SurfaceScores = {
  words: number;
  sentences: number;
  bullets: number;
  numberedSteps: number;
  decision: number;
  decisionAnchors: number;
  workspace: number;
  workspaceAnchors: number;
  map: number;
  mapAnchors: number;
  concernCount: number;
};

const SURFACE_CONCERN_PATTERNS = [
  /\b(user|customer|audience|client|market|personas?)\b/,
  /\b(product|feature|scope|mvp|experience|ux|workflow)\b/,
  /\b(engineering|technical|code|api|database|auth|state|frontend|backend|infrastructure)\b/,
  /\b(risk|constraint|cost|quality|security|privacy|timeline|trade-?off)\b/,
  /\b(revenue|pricing|business|strategy|growth|retention|positioning)\b/,
];

function normalizeSurfaceText(value: string): string {
  return value.toLowerCase().replace(/[\u2019']/g, "'").replace(/\s+/g, " ").trim();
}

function countSurfaceMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (text.match(pattern)?.length ?? 0), 0);
}

function countSurfaceLines(content: string, pattern: RegExp): number {
  return content.split("\n").filter((line) => pattern.test(line.trim())).length;
}

function scoreSurfaceText(content: string): SurfaceScores {
  const text = normalizeSurfaceText(content);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const sentences = content.split(/[.!?]+/).filter((part) => part.trim().length > 8).length;
  const bullets = countSurfaceLines(content, /^[-*\u2022]\s+\S/);
  const numberedSteps = countSurfaceLines(content, /^\d+[.)]\s+\S/);
  const structuralLines = bullets + numberedSteps;
  const concernCount = SURFACE_CONCERN_PATTERNS.filter((pattern) => pattern.test(text)).length;

  const decisionAnchors = countSurfaceMatches(text, [
    /\bwe should\b/g,
    /\bthe right move is\b/g,
    /\bthis is the direction\b/g,
    /\bcommit(?:ting)? to\b/g,
    /\block (?:it|this|that) in\b/g,
    /\bgo with\b/g,
    /\bmy call is\b/g,
    /\bthe choice is\b/g,
    /\bsettle(?:d| on)\b/g,
    /\bthat's decided\b/g,
  ]);
  const conclusionMarkers = countSurfaceMatches(text, [
    /\bbottom line\b/g,
    /\btherefore\b/g,
    /\bso the answer is\b/g,
    /\bwhat this means is\b/g,
    /\bthe direction\b/g,
    /\brecommend(?:ation)?\b/g,
  ]);
  const hedges = countSurfaceMatches(text, [
    /\bmaybe\b/g,
    /\bmight\b/g,
    /\bcould be\b/g,
    /\bprobably\b/g,
    /\bnot sure\b/g,
    /\bdepends\b/g,
  ]);
  const decision = (decisionAnchors * 2) + conclusionMarkers + (hedges === 0 && decisionAnchors > 0 ? 1 : 0);

  const workspaceAnchors = countSurfaceMatches(text, [
    /\bready to build\b/g,
    /\bnext steps?\b/g,
    /\bimplementation plan\b/g,
    /\bwe can build\b/g,
    /\bi(?:'ll| will) (?:build|implement|wire|add|update|fix|create)\b/g,
    /\blet's (?:build|implement|ship|wire|structure)\b/g,
    /\bstructure this\b/g,
    /\bworking space\b/g,
  ]);
  const operationalVerbs = countSurfaceMatches(text, [
    /\b(build|implement|ship|wire|create|add|update|fix|refactor|test|deploy|run|push)\b/g,
  ]);
  const executionStructure = countSurfaceMatches(text, [
    /\b(first|second|third|then|after that|step)\b/g,
    /\b(file|route|endpoint|component|schema|migration|handler)\b/g,
  ]);
  const workspace = (workspaceAnchors * 2) + Math.min(operationalVerbs, 4) + executionStructure + structuralLines;

  const mapAnchors = countSurfaceMatches(text, [
    /\btension\b/g,
    /\btrade-?off\b/g,
    /\bcompeting\b/g,
    /\bconflict(?:ing)?\b/g,
    /\bconstraint\b/g,
    /\binterconnected\b/g,
    /\bmoving parts\b/g,
    /\brelationship between\b/g,
    /\bdepends on\b/g,
    /\bmap\b/g,
  ]);
  const complexitySignals = countSurfaceMatches(text, [
    /\bon one hand\b/g,
    /\bon the other hand\b/g,
    /\bbut\b/g,
    /\bhowever\b/g,
    /\bmeanwhile\b/g,
    /\bat the same time\b/g,
    /\barchitecture\b/g,
    /\bsystem\b/g,
    /\blayers?\b/g,
    /\bdependencies\b/g,
  ]);
  const map = (mapAnchors * 2) + complexitySignals + concernCount + (structuralLines >= 2 ? 2 : 0);

  return {
    words,
    sentences,
    bullets,
    numberedSteps,
    decision,
    decisionAnchors,
    workspace,
    workspaceAnchors,
    map,
    mapAnchors,
    concernCount,
  };
}

function classifySurfaceSignal(content: string): SurfaceSignal | null {
  const scores = scoreSurfaceText(content);
  const hasSubstance = scores.words >= 28
    || scores.sentences >= 3
    || (scores.bullets + scores.numberedSteps) >= 2
    || (scores.decisionAnchors > 0 && scores.words >= 16)
    || (scores.workspaceAnchors >= 2 && scores.words >= 12);
  if (!hasSubstance) return null;

  if (scores.decisionAnchors > 0 && scores.decision >= 3) {
    return { type: "DECISION", reason: "commitment signal", label: "Log this decision" };
  }

  if (scores.workspaceAnchors > 0 && scores.workspace >= 5 && (scores.words >= 24 || scores.numberedSteps > 0)) {
    return { type: "WORKSPACE", reason: "operational shift", label: "Working space prepared" };
  }

  if (scores.mapAnchors > 0 && scores.map >= 7 && scores.concernCount >= 2 && scores.words >= 45) {
    return { type: "MAP", reason: "interconnected tensions", label: "Tension Map" };
  }

  return null;
}

function materialSurfaceShift(userMessage: string, type: SurfaceType): boolean {
  const scores = scoreSurfaceText(userMessage);
  if (type === "DECISION") return scores.decisionAnchors > 0 || scores.decision >= 3;
  if (type === "WORKSPACE") return scores.workspaceAnchors > 0 || scores.workspace >= 4;
  return scores.mapAnchors > 0 || (scores.words >= 40 && scores.concernCount >= 2);
}

function detectSurfaceSignal(args: {
  content: string;
  userMessage: string;
  recentMessages?: SurfaceMessage[];
}): SurfaceSignal | null {
  const surface = classifySurfaceSignal(args.content);
  if (!surface) return null;

  const previousAssistant = [...(args.recentMessages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim().length > 0);
  if (previousAssistant) {
    const previousSurface = classifySurfaceSignal(previousAssistant.content);
    if (previousSurface?.type === surface.type && !materialSurfaceShift(args.userMessage, surface.type)) {
      return null;
    }
  }

  return surface;
}

/** Keyword check — only inject project-status briefing when the user asked for it. */
const PROJECT_ASK_RE = /\b(status|progress|where\s+are\s+we|what'?s\s+next|what\s+next|how\s+(is|are)\s+(it|this|we|things|the\s+project)|overview|update\s+on|catch\s+me\s+up|where\s+we\s+(stand|at)|health|momentum|recap|sitrep)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function userAskedAboutProject(message: string, projectName?: string | null): boolean {
  const text = (message ?? "").trim();
  if (!text) return false;
  if (PROJECT_ASK_RE.test(text)) return true;
  if (projectName && new RegExp(`\\b${escapeRegExp(projectName)}\\b`, "i").test(text)) return true;
  return false;
}

/** Capture cards fire on Commit — not on DECIDE classification alone. */
function isExplicitCommitTurn(userMessage: string, convState?: string | null): boolean {
  if (convState === "COMMIT") return true;
  const text = (userMessage ?? "").trim();
  if (!text) return false;
  if (/^\s*commit\s*:/i.test(text)) return true;
  return /\b(commit\s+(this|that|it|to)|i(?:'m| am) committing|let'?s commit|log\s+this\s+decision)\b/i.test(text);
}

function parseRepo(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : ((parsed as any).fullName ?? null);
  } catch {
    return raw.includes("/") ? raw : null;
  }
}

const SYSTEM_NODE_IDS = new Set(["auth", "db", "api", "state", "ui", "logic"]);
const FLOW_NODE_TYPES = new Set(["goal", "requirement", "blocker", "priority", "decision", "sprint", "wont"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function formatTitles(entries: Array<{ title: string }>): string {
  return entries.length > 0 ? entries.map((entry) => entry.title).join("; ") : "none";
}

function groupLedgerEntries(entries: FocusLedgerEntry[]) {
  const childrenBySupersedes = new Map<number, FocusLedgerEntry[]>();
  for (const entry of entries) {
    if (entry.supersedesId == null) continue;
    const children = childrenBySupersedes.get(entry.supersedesId) ?? [];
    children.push(entry);
    childrenBySupersedes.set(entry.supersedesId, children);
  }

  const inTensionIds = new Set<number>();
  const overriddenIds = new Set<number>();
  for (const entry of entries) {
    if (entry.status !== "committed") continue;
    const children = childrenBySupersedes.get(entry.id) ?? [];
    if (children.some((child) => child.deviation && child.status === "committed")) {
      overriddenIds.add(entry.id);
    }
    if (children.some((child) => child.catchAgainstId === entry.id && child.status !== "committed")) {
      inTensionIds.add(entry.id);
    }
  }

  return {
    committed: entries.filter((entry) => (
      entry.status === "committed" && !entry.deviation && !inTensionIds.has(entry.id) && !overriddenIds.has(entry.id)
    )),
    parked: entries.filter((entry) => entry.status === "parked"),
    inTension: entries.filter((entry) => inTensionIds.has(entry.id)),
    overridden: entries.filter((entry) => (
      entry.status === "committed" && (entry.deviation || overriddenIds.has(entry.id))
    )),
  };
}

function extractFlowMapNodes(nodeState: unknown): FlowMapNode[] {
  if (!isRecord(nodeState)) return [];
  return Object.entries(nodeState).flatMap(([id, raw]): FlowMapNode[] => {
    if (SYSTEM_NODE_IDS.has(id) || !isRecord(raw)) return [];
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : "";
    const type = typeof raw.type === "string" && FLOW_NODE_TYPES.has(raw.type) ? raw.type : "";
    if (!label || !type) return [];
    const strategicAnswer = typeof raw.strategicAnswer === "string" ? raw.strategicAnswer.trim() : "";
    const answered = Boolean(strategicAnswer) || raw.resolved === true;
    const meta = typeof raw.meta === "string" ? raw.meta : typeof raw.moscow === "string" ? raw.moscow : undefined;
    return [{ label, type, answered, ...(meta ? { meta } : {}) }];
  });
}

function computeArchitectureReadiness(flowNodes: FlowMapNode[]): number {
  const scoredNodes = flowNodes.filter((node) => !(node.type === "priority" && node.meta === "wont"));
  if (scoredNodes.length === 0) return 0;
  return Math.round((scoredNodes.filter((node) => node.answered).length / scoredNodes.length) * 100);
}

function computeDecisionReadiness(entries: FocusLedgerEntry[]): number {
  if (entries.length === 0) return 0;
  const committedCount = entries.filter((entry) => entry.status === "committed").length;
  return Math.round((committedCount / entries.length) * 100);
}

function computeBlendedReadiness(architectureScore: number, decisionsScore: number): number {
  return Math.round(architectureScore * 0.6 + decisionsScore * 0.4);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractRunSummary(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*•]\s*/, "").trim())
    .find((line) => line.length > 0);
  if (!cleaned) return "Atlas response completed.";
  return cleaned.length > 120 ? `${cleaned.slice(0, 117).trim()}...` : cleaned;
}

function resolveRunStatus(actions?: RunAction[] | null): RunStatus {
  if (!actions?.length) return "completed";
  if (actions.some((action) => action.status === "fail")) return "failed";
  if (actions.some((action) => action.status === "warn")) return "warnings";
  return "completed";
}

function buildRunMetadata(content: string, usage: Partial<NexusRunMetadata> = {}): NexusRunMetadata {
  const runActions = usage.runActions ?? null;
  return {
    executionTimeMs: usage.executionTimeMs ?? null,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    costUsd: usage.costUsd ?? null,
    runStatus: usage.runStatus ?? resolveRunStatus(runActions),
    runSummary: usage.runSummary ?? extractRunSummary(content),
    runActions,
    runArtifacts: usage.runArtifacts ?? null,
  };
}

function failedRunMetadata(summary: string, status: RunStatus = "failed"): NexusRunMetadata {
  return {
    executionTimeMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    runStatus: status,
    runSummary: summary,
    runActions: [{ verb: status === "cancelled" ? "Cancelled" : "Failed", target: "Atlas response", status: status === "cancelled" ? "warn" : "fail" }],
    runArtifacts: null,
  };
}

async function updateSessionRunMetadata(sessionId: number | null, runMetadata: NexusRunMetadata): Promise<void> {
  if (!sessionId) return;
  await db
    .update(sessionsTable)
    .set({
      totalInputTokens: sql`coalesce(${sessionsTable.totalInputTokens}, 0) + ${runMetadata.inputTokens ?? 0}`,
      totalOutputTokens: sql`coalesce(${sessionsTable.totalOutputTokens}, 0) + ${runMetadata.outputTokens ?? 0}`,
      totalCostUsd: sql`coalesce(${sessionsTable.totalCostUsd}, 0) + ${runMetadata.costUsd ?? 0}`,
      totalExecutionMs: sql`coalesce(${sessionsTable.totalExecutionMs}, 0) + ${runMetadata.executionTimeMs ?? 0}`,
      runStatus: runMetadata.runStatus,
      runSummary: runMetadata.runSummary ?? null,
      runActions: runMetadata.runActions ?? null,
      runArtifacts: runMetadata.runArtifacts ?? null,
    })
    .where(eq(sessionsTable.id, sessionId));
}

type NexusMessageRow = {
  id: number;
  userId: number;
  role: string;
  content: string;
  conversationId: string | null;
  messageType: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
};

let nexusMessageTypeColumnExistsCache: boolean | null = null;

async function hasNexusMessageTypeColumn(): Promise<boolean> {
  if (nexusMessageTypeColumnExistsCache !== null) return nexusMessageTypeColumnExistsCache;
  try {
    const rows = await db.execute(sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'nexus_messages'
        AND column_name = 'message_type'
      LIMIT 1
    `);
    nexusMessageTypeColumnExistsCache = Array.isArray(rows) ? rows.length > 0 : (rows as any).rowCount > 0;
  } catch {
    nexusMessageTypeColumnExistsCache = false;
  }
  return nexusMessageTypeColumnExistsCache;
}

function nonBriefingMessages(whereClause: SQL | undefined, hasMessageType = true) {
  if (!hasMessageType) return whereClause;
  return and(
    whereClause,
    sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'briefing'`,
  );
}

function conversationMessages(whereClause: SQL | undefined, hasMessageType = true) {
  return nonBriefingMessages(whereClause, hasMessageType);
}

/** Compact workspace-orientation block for the first in-project Ask Atlas turn. */
async function buildInProjectAskAtlasSeed(
  projectId: number,
  sessionId: number,
  userId: number,
): Promise<string> {
  const [[project], tier1, lastUserRows, ledgerEntries, genome] = await Promise.all([
    db
      .select({ name: projectsTable.name, memory: projectsTable.memory })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, userId)))
      .limit(1),
    loadTier1ForProject(projectId),
    db
      .select({ content: chatMessagesTable.content })
      .from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.sessionId, sessionId), eq(chatMessagesTable.role, "user")))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(1),
    db
      .select({
        id: entriesTable.id,
        title: entriesTable.title,
        status: entriesTable.status,
        deviation: entriesTable.deviation,
        catchAgainstId: entriesTable.catchAgainstId,
        supersedesId: entriesTable.supersedesId,
      })
      .from(entriesTable)
      .where(eq(entriesTable.projectId, projectId)),
    getProjectDNA(projectId),
  ]);

  const lines: string[] = [`Continuing in ${project?.name ?? "this project"} workspace.`];

  const briefFromTier1 = [tier1?.building, tier1?.problem, tier1?.audience]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" — ");
  const brief = briefFromTier1
    || (() => {
      const store = parseMemoryStore(project?.memory ?? null);
      const memText = buildMemoryText(store);
      return memText ? memText.slice(0, 400) : "";
    })();
  if (brief) lines.push(`Brief: ${brief.slice(0, 400)}`);

  const lastGoal = lastUserRows[0]?.content?.trim();
  if (lastGoal) lines.push(`Last goal: ${lastGoal.slice(0, 200)}`);

  const openFromGenome = (genome?.openQuestions ?? [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .slice(0, 4);
  if (openFromGenome.length > 0) {
    lines.push(`Open decisions: ${openFromGenome.join(" · ")}`);
  } else {
    const ledgerGroups = groupLedgerEntries(ledgerEntries);
    const unresolved = [...ledgerGroups.inTension, ...ledgerGroups.parked].slice(0, 4);
    if (unresolved.length > 0) {
      lines.push(`Open decisions: ${unresolved.map((e) => e.title).join(" · ")}`);
    }
  }

  return lines.join("\n");
}

async function loadSessionThreadMessages(sessionId: number): Promise<NexusMessageRow[]> {
  const rows = await db
    .select({
      id: chatMessagesTable.id,
      role: chatMessagesTable.role,
      content: chatMessagesTable.content,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, sessionId))
    .orderBy(asc(chatMessagesTable.createdAt));
  return rows.map((row) => ({
    id: row.id,
    userId: 0,
    role: row.role,
    content: row.content,
    conversationId: null,
    createdAt: row.createdAt,
    metadata: null,
    messageType: null,
  }));
}

async function loadNexusMessages(whereClause: SQL | undefined, hasMessageType: boolean): Promise<NexusMessageRow[]> {
  const baseSelect = {
    id: nexusMessagesTable.id,
    userId: nexusMessagesTable.userId,
    role: nexusMessagesTable.role,
    content: nexusMessagesTable.content,
    conversationId: nexusMessagesTable.conversationId,
    createdAt: nexusMessagesTable.createdAt,
    metadata: nexusMessagesTable.metadata,
  };

  if (!hasMessageType) {
    const rows = await db
      .select(baseSelect)
      .from(nexusMessagesTable)
      .where(whereClause)
      .orderBy(asc(nexusMessagesTable.createdAt));
    return rows.map((row) => ({
      ...row,
      messageType: null,
    }));
  }

  const rows = await db
    .select({ ...baseSelect, messageType: nexusMessagesTable.messageType })
    .from(nexusMessagesTable)
    .where(whereClause)
    .orderBy(asc(nexusMessagesTable.createdAt));
  return rows;
}

async function loadRecentNexusMessagesForConversation(
  userId: number,
  conversationId: string,
  hasMessageType: boolean,
): Promise<Array<{ role: string; content: string }>> {
  const whereClause = conversationId === "__legacy__"
    ? and(eq(nexusMessagesTable.userId, userId), isNull(nexusMessagesTable.conversationId))
    : and(eq(nexusMessagesTable.userId, userId), eq(nexusMessagesTable.conversationId, conversationId));
  const rows = await db
    .select({
      id: nexusMessagesTable.id,
      role: nexusMessagesTable.role,
      content: nexusMessagesTable.content,
      createdAt: nexusMessagesTable.createdAt,
    })
    .from(nexusMessagesTable)
    .where(nonBriefingMessages(whereClause, hasMessageType))
    .orderBy(desc(nexusMessagesTable.createdAt), desc(nexusMessagesTable.id))
    .limit(10);

  return rows
    .reverse()
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
    .filter((message) => message.content.trim().length > 0);
}

/** Persist a nexus workspace conversation turn to execution_runs + execution_run_steps.
 *  Nexus equivalent of persistExecutionRun() in chat.ts — runs fire-and-forget at the
 *  end of every focusProjectId turn so the Timeline in ViewChangesPanel shows
 *  conversation activity (reads, summary, DNA updates, decisions) not just build-runner steps. */
/**
 * Insert an execution_runs row in `running` status at the START of a turn so
 * Timeline/Changes can filter by runId while the work is still in flight.
 * Called from the /nexus/chat handler right after SSE headers are flushed.
 * The completion path (persistNexusExecutionRun) UPDATEs the same row.
 */
async function insertRunningExecutionRun(args: {
  runId: string;
  projectId: number;
  sessionId: number | null | undefined;
  conversationId: string | null;
  userMessage: string;
  intent?: string | null;
  mode?: string;
  /** v1.4: epistemic posture — EXPLORE | INVESTIGATE | EXECUTE */
  runMode?: import("@workspace/run-contract").RunMode;
  startedAt: Date;
}): Promise<void> {
  try {
    const promptText = (args.userMessage ?? "").trim();
    await db.execute(sql`
      INSERT INTO execution_runs
        (id, project_id, thread_id, message_id, conversation_id, mode, run_mode, status, summary, prompt, intent, started_at)
      VALUES
        (${args.runId}, ${args.projectId}, ${args.sessionId ?? null}, ${null}, ${args.conversationId ?? null},
         ${args.mode ?? "conversation"}, ${args.runMode ?? "EXPLORE"}, ${"running"}, ${null}, ${promptText || null}, ${args.intent ?? null},
         ${args.startedAt})
      ON CONFLICT (id) DO NOTHING
    `);
  } catch (err) {
    logger.warn({ err, runId: args.runId }, "nexus: insertRunningExecutionRun failed — non-fatal");
  }
}

/** Fire-and-forget incremental step persist during streaming. Uses a negative
 *  order_index so canonical rewrite in persistNexusExecutionRun (which uses 0+)
 *  can safely DELETE these before re-inserting the cleaned final set. */
function appendLiveStepAsync(runId: string, verb: string, target: string | null, status: string, detail: string | null, orderIdx: number): void {
  const purpose = derivePurposeFromVerb(verb, detail);
  void db.execute(sql`
    INSERT INTO execution_run_steps (run_id, verb, target, status, detail, step_purpose, order_index)
    VALUES (${runId}, ${verb}, ${target}, ${status}, ${detail}, ${purpose}, ${orderIdx})
  `).catch((err) => {
    logger.debug({ err, runId, verb }, "nexus: incremental step insert failed — non-fatal");
  });
}

async function persistNexusExecutionRun(args: {
  runId?: string | null;
  projectId: number;
  sessionId: number | null | undefined;
  conversationId: string | null;
  userMessage: string;
  atlasResponse: string;
  runActions: RunAction[];
  nonCodeSteps?: Array<{
    verb: string;
    target: string | null;
    detail: string | null;
    content: string | null;
    artifactUrl?: string | null;
  }>;
  startedAt: Date;
  intent?: string | null;
  messageId?: number | null;
  /** Explicit run mode: 'build' | 'decide' | 'conversation'. Metadata only —
   * receipt eligibility is a separate, verb-based classifier on the frontend. */
  mode?: string;
  /**
   * When true the run has FILE_EDIT blocks applied locally but not yet pushed to
   * GitHub.  Status is set to "awaiting_approval" instead of "succeeded" so the
   * Timeline correctly reflects that the user still needs to approve the push.
   */
  pendingApproval?: boolean;
}): Promise<void> {
  try {
    const completedAt = new Date();
    const elapsedMs = Math.max(0, completedAt.getTime() - args.startedAt.getTime());
    // Reuse the pre-inserted `running` row when the handler minted a runId at
    // turn start; otherwise mint a fresh one for the completion insert path.
    const runId = args.runId ?? randomUUID();
    const preInserted = !!args.runId;

    // A target looks like a file path if it has no spaces and contains "/" or a file extension
    const isFilePath = (t: string | null | undefined) =>
      !!t && !t.includes(" ") && (t.includes("/") || /\.[a-zA-Z]{1,6}$/.test(t));

    const fileReadActions = args.runActions.filter(
      (a) => ["Reading", "Read", "Not found"].includes(a.verb) && isFilePath(a.target)
    );

    // Derive mode when caller didn't pass one. Metadata only — Timeline shows
    // every persisted run regardless of mode; the chat-receipt classifier is
    // verb-driven on the frontend.
    const RECEIPT_WORTHY_VERBS = new Set([
      "ARTIFACT_CREATED", "DNA_UPDATED", "GITHUB_PUSH",
      "BUILD_COMPLETED", "TEST_COMPLETED", "DEPLOY_COMPLETED", "DATABASE_CHANGE",
    ]);
    const DECISION_VERBS = new Set(["DECISION_RECORDED", "PLAN_RECORDED"]);
    const nc = args.nonCodeSteps ?? [];
    const hasBuildish = nc.some((s) => RECEIPT_WORTHY_VERBS.has(s.verb));
    const hasDecision = nc.some((s) => DECISION_VERBS.has(s.verb));
    const derivedMode = args.mode
      ?? (hasBuildish ? "build"
        : hasDecision ? "decide"
        : fileReadActions.length > 0 ? "operational"
        : "conversation");

    const summary = fileReadActions.length > 0
      ? `Read ${fileReadActions.length} file${fileReadActions.length === 1 ? "" : "s"} \u00b7 ${args.atlasResponse.slice(0, 80).replace(/\n/g, " ").trim()}\u2026`
      : args.atlasResponse.slice(0, 120).replace(/\n/g, " ").trim();

    const promptText = args.userMessage.trim();
    const intentValue = args.intent?.trim() || null;
    const messageIdValue = args.messageId ?? null;
    const conversationIdValue = args.conversationId ?? null;

    const terminalStatus = args.pendingApproval ? "awaiting_approval" : "succeeded";
    if (preInserted) {
      // Update the row that was inserted at turn-start with terminal state.
      await db.execute(sql`
        UPDATE execution_runs SET
          message_id = ${messageIdValue},
          mode = ${derivedMode},
          status = ${terminalStatus},
          summary = ${summary},
          intent = ${intentValue},
          completed_at = ${completedAt},
          elapsed_ms = ${elapsedMs}
        WHERE id = ${runId}
      `);
      // Drop any incremental live steps so the canonical set below is authoritative.
      await db.execute(sql`DELETE FROM execution_run_steps WHERE run_id = ${runId}`);
    } else {
      await db.execute(sql`
        INSERT INTO execution_runs
          (id, project_id, thread_id, message_id, conversation_id, mode, status, summary, prompt, intent, started_at, completed_at, elapsed_ms)
        VALUES
          (${runId}, ${args.projectId}, ${args.sessionId ?? null}, ${messageIdValue}, ${conversationIdValue},
           ${derivedMode}, ${terminalStatus}, ${summary}, ${promptText || null}, ${intentValue},
           ${args.startedAt}, ${completedAt}, ${elapsedMs})
      `);
    }

    type Step = {
      verb: string;
      target: string | null;
      status: string;
      detail: string | null;
      content: string | null;
      artifactUrl?: string | null;
    };
    const steps: Step[] = [];

    // PROMPT — the user's instruction that kicked off this turn
    if (promptText) {
      steps.push({ verb: "PROMPT", target: null, status: "ok", detail: null, content: promptText.slice(0, 8000) });
    }

    // THOUGHT — duration label + brief reasoning excerpt (first sentence/s).
    // This is the "what I was focused on" note — intentionally short so it reads
    // as a reasoning caption, not the full response. The full response goes in SUMMARY.
    const thoughtDurationS = Math.max(1, Math.round(elapsedMs / 1000));
    const fullResponse = args.atlasResponse.trim();
    if (fullResponse) {
      // Extract the first meaningful sentence (up to ~250 chars) as the thought excerpt.
      const sentenceEnd = fullResponse.search(/[.!?]\s/);
      const thoughtExcerpt = sentenceEnd > 0 && sentenceEnd < 250
        ? fullResponse.slice(0, sentenceEnd + 1).trim()
        : fullResponse.slice(0, 200).trim();
      steps.push({
        verb: "THOUGHT",
        target: null,
        status: "ok",
        detail: `${thoughtDurationS}s`,
        content: thoughtExcerpt,
      });
    }

    // FILE_READ — deduplicate by path, keep last status (prefer "Not found" over "Reading")
    const seenPaths = new Map<string, RunAction>();
    for (const a of args.runActions) {
      if (["Reading", "Read", "Not found"].includes(a.verb) && isFilePath(a.target)) {
        const prev = seenPaths.get(a.target!);
        // "Read" (success) or "Not found" (terminal) beat "Reading" (start) 
        if (!prev || prev.verb === "Reading") seenPaths.set(a.target!, a);
      }
    }
    for (const [, a] of seenPaths) {
      steps.push({
        verb: "FILE_READ",
        target: a.target ?? null,
        status: a.verb === "Not found" ? "fail" : "ok",
        detail: a.detail ?? null,
        content: null,
      });
    }

    // BUILD EVIDENCE steps — PATCH (file edits) and TYPECHECK/BUILD steps.
    // These are the records the state machine validates at CHANGE_APPLIED and
    // BUILD_VERIFIED. appendLiveStepAsync writes them during the turn, but
    // persistNexusExecutionRun deletes all live rows at line 1623 (canonical
    // rewrite). They must be re-inserted here so evidence survives the rewrite.
    const BUILD_EVIDENCE_VERBS = new Set([
      "Patching", "Writing", "Written",
      "Typechecking", "Building", "Testing",
    ]);
    for (const a of args.runActions) {
      if (BUILD_EVIDENCE_VERBS.has(a.verb)) {
        steps.push({
          verb: a.verb,
          target: a.target ?? null,
          status: a.status === "fail" ? "fail" : a.status === "warn" ? "warn" : "ok",
          detail: a.detail ?? null,
          content: null,
        });
      }
    }

    // NON-CODE steps — DNA field writes, decisions, plan signals, questions accumulated during the turn.
    for (const nc of (args.nonCodeSteps ?? [])) {
      steps.push({
        verb: nc.verb,
        target: nc.target,
        status: "ok",
        detail: nc.detail,
        content: nc.content,
        artifactUrl: nc.artifactUrl ?? null,
      });
    }

    // SUMMARY — the full Atlas response, distinct from the brief THOUGHT excerpt above.
    if (fullResponse) {
      steps.push({ verb: "SUMMARY", target: null, status: "ok", detail: null, content: fullResponse.slice(0, 8000) });
    }

    for (const [orderIdx, step] of steps.entries()) {
      const stepPurpose = derivePurposeFromVerb(step.verb, step.detail);
      await db.execute(sql`
        INSERT INTO execution_run_steps (run_id, verb, target, status, detail, content, before_content, artifact_url, step_purpose, order_index)
        VALUES (${runId}, ${step.verb}, ${step.target}, ${step.status}, ${step.detail}, ${step.content}, ${null}, ${step.artifactUrl ?? null}, ${stepPurpose}, ${orderIdx})
      `);
    }

    logger.info({ runId, projectId: args.projectId, conversationId: conversationIdValue, mode: derivedMode, intent: intentValue, stepCount: steps.length, nonCodeCount: args.nonCodeSteps?.length ?? 0 }, "nexus: persisted execution_run for workspace turn");
  } catch (err) {
    logger.warn({ err }, "nexus: persistNexusExecutionRun failed — non-fatal");
  }
}

// GET /api/nexus/thread — return a conversation thread (optionally scoped by conversationId)
router.get("/nexus/thread", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const conversationId = req.query.conversationId as string | undefined;
    const userType = parseHomeUserType(req.query.userType);
    const focusProjectId = Number(req.query.focusProjectId);

    const whereClause = conversationId === "__legacy__"
      ? and(eq(nexusMessagesTable.userId, userId), isNull(nexusMessagesTable.conversationId))
      : conversationId
        ? and(eq(nexusMessagesTable.userId, userId), eq(nexusMessagesTable.conversationId, conversationId))
        : eq(nexusMessagesTable.userId, userId);

    const hasMessageType = await hasNexusMessageTypeColumn();
    const messages = await loadNexusMessages(nonBriefingMessages(whereClause, hasMessageType), hasMessageType);

    if (messages.length === 0 && conversationId && conversationId !== "__legacy__") {
      // Legacy fallback: if this project has history in chat_messages (old route)
      // but nothing in nexus_messages, serve it here and migrate it over so future
      // loads find it in the right place. Fires once per project — after migration
      // nexus_messages has the rows and this block is skipped.
      if (Number.isInteger(focusProjectId) && focusProjectId > 0) {
        const legacyMsgs = await db
          .select({
            id: chatMessagesTable.id,
            role: chatMessagesTable.role,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
          })
          .from(chatMessagesTable)
          .innerJoin(sessionsTable, eq(sessionsTable.id, chatMessagesTable.sessionId))
          .where(and(
            eq(sessionsTable.projectId, focusProjectId),
            inArray(chatMessagesTable.role, ["user", "assistant"]),
          ))
          .orderBy(asc(chatMessagesTable.createdAt));

        if (legacyMsgs.length > 0) {
          // Fire-and-forget migration into nexus_messages so future loads are instant.
          (async () => {
            try {
              for (const msg of legacyMsgs) {
                await db.insert(nexusMessagesTable).values({
                  userId,
                  projectId: focusProjectId,
                  role: msg.role,
                  content: msg.content,
                  conversationId,
                  messageType: "message",
                });
              }
            } catch { /* non-critical — original data is safe in chat_messages */ }
          })();

          res.json(legacyMsgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            isBriefing: false,
            executionTimeMs: null, inputTokens: null, outputTokens: null,
            costUsd: null, runStatus: null, runSummary: null, runActions: null, runArtifacts: null,
            execution_time_ms: null, input_tokens: null, output_tokens: null,
            cost_usd: null, run_status: null, run_summary: null, run_actions: null, run_artifacts: null,
            createdAt: m.createdAt.toISOString(),
          })));
          return;
        }
      }

      const [existingBriefing] = hasMessageType
        ? await db
            .select({ id: nexusMessagesTable.id })
            .from(nexusMessagesTable)
            .where(and(whereClause, eq(nexusMessagesTable.messageType, "briefing")))
            .limit(1)
        : [];
      if (existingBriefing) {
        res.json([]);
        return;
      }

      const [project] = await db
        .select({ name: projectsTable.name })
        .from(projectsTable)
        .where(
          Number.isInteger(focusProjectId) && focusProjectId > 0
            ? and(eq(projectsTable.userId, userId), eq(projectsTable.id, focusProjectId))
            : eq(projectsTable.userId, userId)
        )
        .orderBy(desc(projectsTable.updatedAt))
        .limit(1);
      const opening = await generateHomeOpening(project?.name ?? null, userType);
      const [savedOpening] = hasMessageType
        ? await db
            .insert(nexusMessagesTable)
            .values({ userId, role: "assistant", content: opening, conversationId, messageType: "briefing" })
            .returning({
              id: nexusMessagesTable.id,
              role: nexusMessagesTable.role,
              content: nexusMessagesTable.content,
              messageType: nexusMessagesTable.messageType,
              createdAt: nexusMessagesTable.createdAt,
            })
        : await db
            .insert(nexusMessagesTable)
            .values({ userId, role: "assistant", content: opening, conversationId })
            .returning({
              id: nexusMessagesTable.id,
              role: nexusMessagesTable.role,
              content: nexusMessagesTable.content,
              createdAt: nexusMessagesTable.createdAt,
            });
      res.json([{
        id: savedOpening.id,
        role: savedOpening.role,
        content: savedOpening.content,
        isBriefing: hasMessageType && "messageType" in savedOpening ? savedOpening.messageType === "briefing" : true,
        executionTimeMs: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        runStatus: null,
        runSummary: null,
        runActions: null,
        runArtifacts: null,
        execution_time_ms: null,
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
        run_status: null,
        run_summary: null,
        run_actions: null,
        run_artifacts: null,
        createdAt: savedOpening.createdAt.toISOString(),
      }]);
      return;
    }

    res.json(messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      isBriefing: m.messageType === "briefing",
      // Restore persisted imageGen payload so sketches survive reload (P3)
      imageGen: (m.metadata as any)?.imageGen ?? null,
      // Restore persisted decisionArtifacts so Decision Intelligence cards survive reload
      decisionArtifacts: (m.metadata as any)?.decisionArtifacts ?? null,
      executionTimeMs: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      runStatus: null,
      runSummary: null,
      runActions: null,
      runArtifacts: null,
      execution_time_ms: null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      run_status: null,
      run_summary: null,
      run_actions: null,
      run_artifacts: null,
      createdAt: m.createdAt.toISOString(),
    })));
    return;
  } catch (err: any) {
    console.error("nexus/thread error:", err?.message, err?.stack);
    res.status(500).json({ error: "Failed to load thread", detail: err?.message });
    return;
  }
});

// DELETE /api/nexus/thread — clear a conversation (scoped by conversationId, or all if omitted)
router.delete("/nexus/thread", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const conversationId = req.query.conversationId as string | undefined;

  const whereClause = conversationId === "__legacy__"
    ? and(eq(nexusMessagesTable.userId, userId), isNull(nexusMessagesTable.conversationId))
    : conversationId
      ? and(eq(nexusMessagesTable.userId, userId), eq(nexusMessagesTable.conversationId, conversationId))
      : eq(nexusMessagesTable.userId, userId);

  await db.delete(nexusMessagesTable).where(whereClause);
  res.sendStatus(204);
});

// Returns the in-progress Tier 1 buffer for an Ask Atlas conversation.
// Used by the frontend to show Tier1ProgressCard before a project is created.
router.get("/nexus/tier1-buffer", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const conversationId = req.query.conversationId as string | undefined;
    if (!conversationId) {
      res.status(400).json({ error: "conversationId is required" });
      return;
    }
    const state = await getNexusTier1Buffer(conversationId, userId);
    const missing = TIER1_FIELD_KEYS.filter(
      (k) => !state?.buffer?.[k]?.trim(),
    );
    res.json({
      buffer: state?.buffer ?? null,
      skippedAt: state?.skippedAt ?? null,
      missing,
    });
  } catch (err) {
    req.log.error({ err }, "GET /nexus/tier1-buffer failed");
    res.status(500).json({ error: "Failed to load tier1 buffer" });
  }
});

router.post("/nexus/conversation/save", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const { messages, title } = req.body as {
      messages: Array<{ role: string; content: string }>;
      title?: string;
    };
    if (!messages?.length) { res.status(400).json({ error: "No messages" }); return; }

    const autoTitle = title || messages.find(m => m.role === "user")?.content?.slice(0, 60) || "Conversation";

    await db.insert(conversationsTable).values({
      userId,
      title: autoTitle,
      messages: JSON.stringify(messages),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save" });
  }
});

router.get("/nexus/conversations", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser?.id as number | undefined;
    if (typeof userId !== "number" || !Number.isFinite(userId)) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const hasMessageType = await hasNexusMessageTypeColumn();
    const rows = hasMessageType
      ? await db
          .select({
            id: nexusMessagesTable.conversationId,
            title: sql<string>`(SELECT content FROM nexus_messages sub WHERE sub.conversation_id = nexus_messages.conversation_id AND sub.user_id = ${userId} AND sub.role = 'user' AND sub.message_type IS DISTINCT FROM 'briefing' ORDER BY sub.created_at ASC LIMIT 1)`,
            createdAt: sql<Date>`MAX(${nexusMessagesTable.createdAt})`,
            messageCount: sql<number>`COUNT(*)`,
          })
          .from(nexusMessagesTable)
          .where(and(
            eq(nexusMessagesTable.userId, userId),
            isNotNull(nexusMessagesTable.conversationId),
            sql`${nexusMessagesTable.messageType} IS DISTINCT FROM 'briefing'`,
          ))
          .groupBy(nexusMessagesTable.conversationId)
          .orderBy(desc(sql`MAX(${nexusMessagesTable.createdAt})`))
          .limit(30)
      : await db
          .select({
            id: nexusMessagesTable.conversationId,
            title: sql<string>`(SELECT content FROM nexus_messages sub WHERE sub.conversation_id = nexus_messages.conversation_id AND sub.user_id = ${userId} AND sub.role = 'user' ORDER BY sub.created_at ASC LIMIT 1)`,
            createdAt: sql<Date>`MAX(${nexusMessagesTable.createdAt})`,
            messageCount: sql<number>`COUNT(*)`,
          })
          .from(nexusMessagesTable)
          .where(and(eq(nexusMessagesTable.userId, userId), isNotNull(nexusMessagesTable.conversationId)))
          .groupBy(nexusMessagesTable.conversationId)
          .orderBy(desc(sql`MAX(${nexusMessagesTable.createdAt})`))
          .limit(30);
    const conversations = rows.map(r => ({
      id: r.id,
      title: r.title ? r.title.slice(0, 60) : "Conversation",
      createdAt: r.createdAt,
      messageCount: Number(r.messageCount),
    }));
    res.json({ conversations });
  } catch (err: any) {
    console.error("nexus/conversations error:", err?.message, err?.stack);
    res.status(500).json({ error: "Failed to load conversations", detail: err?.message });
    return;
  }
});

router.get("/nexus/conversation/:id", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;
  const id = parseInt(req.params.id, 10);
  const [row] = await db.select().from(conversationsTable).where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ conversation: row });
});

// POST /api/nexus/chat — send a message in Nexus Mode
router.post("/nexus/chat", async (req, res): Promise<void> => {
  const body = req.body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    userProfile?: string;
    focusProjectId?: number | null;
    projectId?: number | null;
    mode?: string;
    model?: string;
    imageBase64?: string;
    imageData?: string;
    imageMimeType?: string;
    attachments?: Array<{ base64: string; mediaType: string; name?: string }>;
    conversationId?: string;
    sessionId?: number;
    askAtlasContextSeed?: string;
    userType?: HomeUserType;
    conversationMode?: boolean;
    justTalk?: boolean;
    /** Stable client-minted run identifier. When present, the backend
     *  pre-inserts an execution_runs row in `running` status and reuses the
     *  same id for the terminal update — giving Timeline/Changes a single
     *  identity across live → completed. Falls back to a server-minted id. */
    runId?: string;
  };

  const hasImage = !!(body.imageBase64 ?? body.imageData) && !!body.imageMimeType;
  if (!body.message?.trim() && !hasImage) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const userId = (req as any).authUser.id as number;
  const authUser = (req as any).authUser;
  const resolvedGhToken = await getGithubTokenForUser(userId) ?? process.env.GITHUB_TOKEN ?? null;
  // history from the client body is accepted in the schema for API compatibility.
  // The Living Thread in nexus_messages remains authoritative for model context.
  const { userProfile = "", focusProjectId: requestedFocusProjectId = null, mode = "strategic", model = "claude", conversationId } = body;
  const requestHistory: NexusTitleMessage[] = (body.history ?? [])
    .filter((m): m is NexusTitleMessage =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0
    );
  const hasWorkingTitle = ["workingTitle", "conversationTitle", "title"].some((key) => {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim().length > 0;
  });
  const shouldAutoGenerateConversationTitle = !hasWorkingTitle && requestHistory.length >= 2;
  const imageBase64 = body.imageBase64 ?? body.imageData ?? undefined;
  const imageMimeType = body.imageMimeType ?? undefined;
  // Normalise: merge legacy imageBase64/imageMimeType + new attachments array into one list
  const allAttachments: Array<{ base64: string; mediaType: string; name?: string }> = [
    ...(body.attachments ?? []),
    ...(imageBase64 && imageMimeType ? [{ base64: imageBase64, mediaType: imageMimeType }] : []),
  ];
  // Always store messages under a conversation ID so they appear in the
  // conversations list. If the frontend doesn't send one (new thread), we
  // generate a UUID here and return it in the `done` event so the client can
  // attach it to every subsequent message in the same conversation.
  // In-project Ask Atlas shares the workspace session thread instead — no new
  // nexus conversation row is created.
  const sessionId = Number.isInteger(body.sessionId) && Number(body.sessionId) > 0 ? Number(body.sessionId) : null;
  const requestedProjectId = Number.isInteger(body.projectId) && Number(body.projectId) > 0
    ? Number(body.projectId)
    : null;
  const isInProjectAskAtlas = !!(requestedProjectId && sessionId);
  const effectiveConversationId: string | null = isInProjectAskAtlas
    ? (conversationId ?? null)
    : (conversationId ?? randomUUID());
  const userType = parseHomeUserType(body.userType);
  // Use a sensible fallback when the user sends an image with no text
  const message = body.message?.trim() || (hasImage ? "[image]" : "");

  try {
  const sessionContext = sessionId
    ? await db
        .select({
          id: sessionsTable.id,
          projectId: sessionsTable.projectId,
          ideaMode: sessionsTable.ideaMode,
        })
        .from(sessionsTable)
        .where(eq(sessionsTable.id, sessionId))
        .limit(1)
    : [];
  // Auth: Atlas sessions (null projectId) owned by user_id directly; project sessions via project ownership
  if (sessionId && sessionContext.length > 0) {
    const ctx = sessionContext[0]!;
    if (ctx.projectId == null) {
      // Atlas session — verify user_id matches
      const [sRow] = await db.select({ sessionUserId: (sessionsTable as any).userId }).from(sessionsTable).where(eq(sessionsTable.id, sessionId)).limit(1);
      if (!sRow || (sRow as any).sessionUserId !== userId) {
        res.status(404).json({ error: "Session not found" }); return;
      }
    } else {
      // Project session — verify via project ownership
      const [pRow] = await db.select({ userId: projectsTable.userId }).from(projectsTable).where(eq(projectsTable.id, ctx.projectId)).limit(1);
      if (!pRow || pRow.userId !== userId) {
        res.status(404).json({ error: "Session not found" }); return;
      }
    }
  }
  if (sessionId && sessionContext.length === 0) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (isInProjectAskAtlas && sessionContext[0]?.projectId !== requestedProjectId) {
    res.status(400).json({ error: "sessionId does not belong to projectId" });
    return;
  }
  let ideaMode = sessionContext[0]?.ideaMode === true;
  const focusProjectId = requestedFocusProjectId ?? requestedProjectId ?? sessionContext[0]?.projectId ?? null;
  const hasMessageType = await hasNexusMessageTypeColumn();

  if (isInProjectAskAtlas) {
    logger.info({ projectId: requestedProjectId, sessionId }, "nexus: in-project Ask Atlas turn");
  }

  // Load projects + Living Thread in parallel.
  // When conversationId is absent the caller is starting a brand-new thread —
  // return no DB history so stale messages from previous conversations never
  // bleed into the fresh context (the old fallback loaded every message for
  // the user, which caused old workspace sessions to pollute new Ask Atlas
  // conversations).
  const [projects, dbMessages] = await Promise.all([
    db
      .select({ id: projectsTable.id, name: projectsTable.name, memory: projectsTable.memory, linkedRepo: projectsTable.linkedRepo, nodeState: projectsTable.nodeState, githubToken: projectsTable.githubToken })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId)),
    (() => {
      if (isInProjectAskAtlas && sessionId) {
        return loadSessionThreadMessages(sessionId);
      }
      if (conversationId === "__legacy__") {
        return loadNexusMessages(
          conversationMessages(and(eq(nexusMessagesTable.userId, userId), isNull(nexusMessagesTable.conversationId)), hasMessageType),
          hasMessageType,
        );
      }
      if (conversationId) {
        return loadNexusMessages(
          conversationMessages(and(eq(nexusMessagesTable.userId, userId), eq(nexusMessagesTable.conversationId, conversationId)), hasMessageType),
          hasMessageType,
        );
      }
      // No conversationId → fresh thread, no prior history to load.
      return Promise.resolve([] as Awaited<ReturnType<typeof loadNexusMessages>>);
    })(),
  ]);

  const shouldEnableIdeaMode = !ideaMode && (
    hasExplicitIdeaModeSignal(message) || (dbMessages.length === 0 && hasIdeaModeSignal(message))
  );
  if (shouldEnableIdeaMode) {
    ideaMode = true;
    if (sessionId) {
      await db
        .update(sessionsTable)
        .set({ ideaMode: true })
        .where(eq(sessionsTable.id, sessionId));
    }
  }

  // Load committed decisions across all projects for cross-project tension detection
  const projectIds = projects.map((p) => p.id);
  const committedEntries = projectIds.length > 0
    ? await db
        .select({ id: entriesTable.id, projectId: entriesTable.projectId, title: entriesTable.title, summary: entriesTable.summary })
        .from(entriesTable)
        .where(and(inArray(entriesTable.projectId, projectIds), eq(entriesTable.status, "committed")))
    : [];

  // Group committed entries by project name
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const entriesByProject = new Map<string, string[]>();
  for (const e of committedEntries) {
    const name = projectNameById.get(e.projectId) ?? "Unknown";
    if (!entriesByProject.has(name)) entriesByProject.set(name, []);
    const line = `  • ${e.title}${e.summary ? ` — ${e.summary.slice(0, 100)}` : ""}`;
    entriesByProject.get(name)!.push(line);
  }

  const committedLedger = [...entriesByProject.entries()]
    .map(([name, lines]) => `[${name}]\n${lines.join("\n")}`)
    .join("\n\n");

  // Parked ideas across all projects
  const parkedEntries = projectIds.length > 0
    ? await db
        .select({ id: entriesTable.id, projectId: entriesTable.projectId, title: entriesTable.title, summary: entriesTable.summary })
        .from(entriesTable)
        .where(and(inArray(entriesTable.projectId, projectIds), eq(entriesTable.status, "parked")))
    : [];

  // Detect end of previous nexus conversation for "since you were last here"
  const prevConvTimestamp: Date | null = await (async () => {
    if (!conversationId || dbMessages.length > 0) return null;
    const lastMsg = await db
      .select({ createdAt: nexusMessagesTable.createdAt })
      .from(nexusMessagesTable)
      .where(and(
        eq(nexusMessagesTable.userId, userId),
        isNotNull(nexusMessagesTable.conversationId),
        sql`${nexusMessagesTable.conversationId} != ${conversationId}`,
      ))
      .orderBy(desc(nexusMessagesTable.createdAt))
      .limit(1);
    return lastMsg[0]?.createdAt ?? null;
  })();

  // Project roster — always list every project by name so Atlas knows the full portfolio
  const projectRoster = projects.length > 0
    ? projects.map((p) => `• ${p.name}`).join("\n")
    : "(no projects yet)";

  const aggregatedMemory = projects
    .map((p) => {
      const store = parseMemoryStore(p.memory ?? null);
      const memText = buildMemoryText(store);
      if (!memText) return null;
      return `=== ${p.name} ===\n${memText}`;
    })
    .filter(Boolean)
    .join("\n\n");

  // Portfolio health snapshot — Atlas speaks to this when asked about momentum/health
  const portfolioHealth = await (async () => {
    if (projectIds.length === 0) return null;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [sessionsResult, violationsResult] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sessionsTable)
        .where(and(inArray(sessionsTable.projectId, projectIds), gte(sessionsTable.createdAt, sevenDaysAgo))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(entriesTable)
        .where(and(inArray(entriesTable.projectId, projectIds), eq(entriesTable.isViolation, true))),
    ]);
    return {
      sessionsThisWeek: sessionsResult[0]?.count ?? 0,
      committedDecisions: committedEntries.length,
      violations: violationsResult[0]?.count ?? 0,
      totalProjects: projects.length,
    };
  })();

  // "Since you were last here" — delta since the previous nexus conversation
  const sinceLastVisit: string | null = await (async () => {
    if (!prevConvTimestamp || projectIds.length === 0 || ideaMode) return null;
    const [newDecisions, newSessions] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(entriesTable)
        .where(and(inArray(entriesTable.projectId, projectIds), eq(entriesTable.status, "committed"), gte(entriesTable.createdAt, prevConvTimestamp))),
      db.select({ count: sql<number>`count(*)::int` })
        .from(sessionsTable)
        .where(and(inArray(sessionsTable.projectId, projectIds), gte(sessionsTable.createdAt, prevConvTimestamp))),
    ]);
    const decisionCount = newDecisions[0]?.count ?? 0;
    const sessionCount = newSessions[0]?.count ?? 0;
    if (decisionCount === 0 && sessionCount === 0) return null;
    const daysSince = Math.floor((Date.now() - prevConvTimestamp.getTime()) / 86_400_000);
    const timeLabel = daysSince === 0 ? "earlier today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`;
    const lines: string[] = [`Since your last conversation (${timeLabel}):`];
    if (sessionCount > 0) lines.push(`  • ${sessionCount} workspace session${sessionCount !== 1 ? "s" : ""} completed`);
    if (decisionCount > 0) lines.push(`  • ${decisionCount} decision${decisionCount !== 1 ? "s" : ""} committed to the ledger`);
    if (parkedEntries.length > 0) lines.push(`  • ${parkedEntries.length} idea${parkedEntries.length !== 1 ? "s" : ""} remain parked across the portfolio`);
    return lines.join("\n");
  })();

  // Tier 3 — cross-project behavioral signals (DB-backed, persisted across restarts)
  // Fire-and-forget synthesis to refresh; read current value immediately for injection.
  if (userId && projects.length >= 2 && !ideaMode) {
    void synthesizeTier3Signals(userId);
    void synthesizeTier4Portfolio(userId);
  }
  const crossProjectPatterns: string | null = ideaMode ? null : await loadTier3Block(userId);

  // Scheduled health check awareness — summarise per-project monitor status for Atlas
  const monitorContext = await (async () => {
    if (projectIds.length === 0) return null;
    try {
      // Get the most recent check result per project (one query, then group in JS)
      const recentResults = await db
        .select({
          projectId: checkResultsTable.projectId,
          url: checkResultsTable.url,
          isHealthy: checkResultsTable.isHealthy,
          issues: checkResultsTable.issues,
          checkedAt: checkResultsTable.checkedAt,
        })
        .from(checkResultsTable)
        .where(inArray(checkResultsTable.projectId, projectIds))
        .orderBy(desc(checkResultsTable.checkedAt))
        .limit(projectIds.length * 5);

      // Keep only the most recent result per project
      const latestByProject = new Map<number, typeof recentResults[number]>();
      for (const r of recentResults) {
        if (!latestByProject.has(r.projectId)) latestByProject.set(r.projectId, r);
      }

      if (latestByProject.size === 0) return null;

      const lines: string[] = [];
      for (const [pid, result] of latestByProject) {
        const name = projectNameById.get(pid) ?? `Project ${pid}`;
        const daysSince = Math.round(
          (Date.now() - new Date(result.checkedAt).getTime()) / 86_400_000
        );
        const recency = daysSince === 0 ? "today" : `${daysSince}d ago`;
        if (result.isHealthy) {
          lines.push(`• ${name} — HEALTHY (${result.url}, checked ${recency})`);
        } else {
          const issueStr = result.issues.slice(0, 2).join("; ") || "unknown issue";
          lines.push(`• ${name} — ISSUE (${result.url}, checked ${recency}): ${issueStr}`);
        }
      }
      return lines.join("\n");
    } catch {
      return null;
    }
  })();

  // Source conversation context from the persisted Living Thread (last 40 turns).
  // If the DB returns no messages but the client sent a conversationId + history,
  // use the client history as a safety net (handles edge cases like first-turn race
  // conditions or schema migration gaps where the row hasn't been committed yet).
  const historySource = dbMessages.length > 0
    ? dbMessages.slice(-40)
    : (isInProjectAskAtlas ? [] : (conversationId ? requestHistory.slice(-40) : []));
  const conversationHistory = historySource.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // ── WhisperGate / Just-Talk — classify BEFORE prompt assembly & side effects ──
  // Must run before project-state briefing injection so greetings stay silent.
  const justTalk = body.justTalk === true;
  const conversationModeActive = body.conversationMode === true;
  let intent: WhisperIntent = "DECIDE";
  let whisperFallback = false;
  let whisperConfidence = 0;

  if (justTalk) {
    intent = "CHAT";
    whisperFallback = false;
    whisperConfidence = 1;
    logger.info({ event: "nexus.justTalk", projectId: focusProjectId, userId }, "just-talk override active");
    logger.info({
      event: "whisperGate.turn",
      intent: "CHAT",
      confidence: 1,
      reason: "just_talk_override",
      fallback: false,
      elapsedMs: 0,
      model: "override",
    }, "whisperGate: classified");
  } else {
    try {
      const whisper = await classifyIntent({
        message,
        history: conversationHistory,
        hasProjectContext: !!focusProjectId,
      });
      intent = whisper.intent;
      whisperFallback = whisper.fallback;
      whisperConfidence = whisper.confidence;
    } catch (err) {
      // classifyIntent already falls back to DECIDE — this is defense-in-depth.
      logger.warn({ err: String(err) }, "whisperGate: unexpected outer error, defaulting to DECIDE");
      intent = "DECIDE";
      whisperFallback = true;
      whisperConfidence = 0;
    }
  }

  const focusProjectName = focusProjectId
    ? (projects.find((p) => p.id === focusProjectId)?.name ?? null)
    : null;
  const shouldBrief = intent !== "CHAT" && userAskedAboutProject(message, focusProjectName);
  // Only BUILD (and not Just Talk / Conversation Mode) may persist runs,
  // bootstrap GitHub, trigger Tier1 write side-effects, or emit file-edit
  // markers (FILE_EDIT_START / LINE_PATCH_START / GITHUB_PUSH / REPO_LINK).
  const allowBuildSideEffects = intent === "BUILD" && !justTalk && !conversationModeActive;
  // The shared agent-tools registry (search_all_projects, architecture_diff,
  // generate_deliverable, read_file, etc.) is read/generate-only — none of it
  // edits files, so it does not need the same guard as allowBuildSideEffects.
  // Previously tools were gated on allowBuildSideEffects (BUILD-only), which
  // meant DECIDE turns ("search my projects for X", "compare architecture
  // with Y", "show me reusable components") had the model narrate "let me
  // look into that..." and then dead-end with no tool ever firing, because
  // DECIDE's own system-prompt block forbade tool calls outright. Widening
  // this to include DECIDE lets Atlas actually ground its answer/recommendation
  // in real project data instead of promising to look and then not looking.
  const allowToolAccess = (intent === "BUILD" || intent === "DECIDE") && !justTalk && !conversationModeActive;
  // CHAT turns emit nothing except the reply + meta. DECIDE may surface memory
  // read-only, but capture cards fire only on Commit.
  const isChatTurn = intent === "CHAT" || justTalk;

  const userProjects = await db
    .select({ id: projectsTable.id, name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId))
    .orderBy(desc(projectsTable.updatedAt))
    .limit(20);

  // Recent activity across portfolio — recent commits + sessions for Ask Atlas context
  const recentActivity = await (async () => {
    if (ideaMode || projectIds.length === 0) return null;
    try {
      const ghToken = resolvedGhToken;
      const linkedProjects = projects.filter(p => p.linkedRepo);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [recentSessions, commitResults] = await Promise.all([
        db.select({
          id: sessionsTable.id,
          projectId: sessionsTable.projectId,
          title: sessionsTable.title,
          messageCount: sessionsTable.messageCount,
          createdAt: sessionsTable.createdAt,
        })
          .from(sessionsTable)
          .where(and(inArray(sessionsTable.projectId, projectIds), gte(sessionsTable.createdAt, sevenDaysAgo)))
          .orderBy(desc(sessionsTable.createdAt))
          .limit(10),
        ghToken && linkedProjects.length > 0
          ? Promise.allSettled(linkedProjects.slice(0, 4).map(async (p) => {
              const repoFull = parseRepo(p.linkedRepo ?? null);
              if (!repoFull) return [] as { project: string; msg: string; sha: string; date: string }[];
              const r = await fetch(`https://api.github.com/repos/${repoFull}/commits?per_page=5`, {
                headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Atlas-Nexus/1.0" },
                signal: AbortSignal.timeout(5000),
              });
              if (!r.ok) return [] as { project: string; msg: string; sha: string; date: string }[];
              const data = await r.json() as any[];
              return data.map((c: any) => ({
                project: p.name,
                msg: ((c.commit?.message ?? "") as string).split("\n")[0].slice(0, 100),
                sha: (c.sha as string)?.slice(0, 7) ?? "",
                date: (c.commit?.author?.date ?? "") as string,
              }));
            }))
          : Promise.resolve([] as PromiseSettledResult<{ project: string; msg: string; sha: string; date: string }[]>[]),
      ]);

      const lines: string[] = [];

      if (recentSessions.length > 0) {
        lines.push("Recent conversations:");
        for (const s of recentSessions) {
          const name = projectNameById.get(s.projectId) ?? "Unknown";
          const daysAgo = Math.round((Date.now() - new Date(s.createdAt).getTime()) / 86400000);
          const when = daysAgo === 0 ? "today" : `${daysAgo}d ago`;
          lines.push(`  • [${name}] ${s.title || "Untitled session"} (${s.messageCount ?? 0} messages, ${when})`);
        }
      }

      const allCommits: { project: string; msg: string; sha: string; date: string }[] = [];
      if (Array.isArray(commitResults)) {
        for (const r of commitResults as PromiseSettledResult<{ project: string; msg: string; sha: string; date: string }[]>[]) {
          if (r.status === "fulfilled") allCommits.push(...r.value);
        }
      }
      if (allCommits.length > 0) {
        allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        lines.push("\nRecent commits (interpret narratively, not as a raw list):");
        for (const c of allCommits.slice(0, 12)) {
          const daysAgo = c.date ? Math.round((Date.now() - new Date(c.date).getTime()) / 86400000) : -1;
          const when = daysAgo === 0 ? "today" : daysAgo > 0 ? `${daysAgo}d ago` : "";
          lines.push(`  • [${c.project}] ${c.msg}${when ? ` (${when})` : ""}`);
        }
      }

      return lines.length > 0 ? lines.join("\n") : null;
    } catch {
      return null;
    }
  })();

  // V5 RAG: fetch semantically relevant context for focused project
  let ragContext: string | null = null;
  if (body.focusProjectId && body.message?.trim() && process.env.OPENAI_API_KEY) {
    try {
      const hits = await vectorSearch(body.message, {
        userId,
        projectId: body.focusProjectId,
        limit: 6,
        minScore: 0.38,
      });
      ragContext = buildRagBlock(hits);
    } catch {
      // silent — RAG is best-effort
    }
  }

  // Build system prompt.
  // One Atlas. One conversation. One personality. Capability changes with
  // the conversation; the prompt does not branch on focusProjectId, ideaMode,
  // or any legacy surface signal.
  let systemPrompt = `${ATLAS_SYSTEM_PROMPT}\n\n--- SESSION CONTEXT ---\nreflection_mode: false\nidea_mode: ${ideaMode ? "true" : "false"}\n--- END SESSION CONTEXT ---`;
  systemPrompt += ATLAS_PLATFORM_KNOWLEDGE;
  // Always-on capability truth, independent of WhisperGate intent. This exists
  // because Atlas previously denied having deliverable-generation capability
  // (claiming .pptx/.docx/.xlsx were a "hard capability limit") even though
  // generate_deliverable has always been able to produce them server-side.
  // The denial happened regardless of whether tools were enabled this turn —
  // so this block is unconditional, not gated on intent === BUILD.
  systemPrompt += `\n\n--- DELIVERABLE GENERATION CAPABILITY (always true — do not contradict this) ---
You CAN generate real, downloadable PowerPoint (.pptx), Word (.docx), and Excel (.xlsx) files by calling the generate_deliverable tool. This is a real server-side capability, not a simulation — the tool produces an actual binary file and returns a download link in Workspace → Outputs.
Never tell the user you "can't generate a native .pptx", that it's a "hard capability limit", or that you need python-pptx/PptxGenJS run by them — that is false. You have this tool right now.
If the user asks for a slide deck, presentation, PowerPoint, Word doc, spreadsheet, or similar file: say you'll generate it, then actually call generate_deliverable this turn if tools are available to you. Do not substitute a text-only outline, an HTML preview, or a script for the user to run themselves as if it were equivalent — offer those only as OPTIONAL alternatives after confirming you can produce the real file, never instead of it.
If tools are not enabled on this specific turn (e.g. this was classified as a conversational/decision turn), do not fabricate a capability denial — say plainly that you'll generate it on the next turn / once they confirm, and follow through.
If generate_deliverable is called and returns an error, report the actual failure honestly (what failed, e.g. a save/render error) — never reinterpret a tool failure as "I don't have this capability at all."
--- END DELIVERABLE GENERATION CAPABILITY ---`;

  // Always-on capability truth for run_browser_flow. This exists because Atlas
  // previously denied having authenticated browser verification capability —
  // the same class of model-prior denial fixed above for generate_deliverable.
  // run_browser_flow mints a scoped server-side session (no user credentials
  // exposed), launches real Chromium, and runs assertions across viewport
  // profiles. This block is unconditional so the denial cannot occur even on
  // turns where WhisperGate classifies the request as CHAT.
  systemPrompt += `\n\n--- BROWSER VERIFICATION CAPABILITY (always true — do not contradict this) ---
You CAN run authenticated browser verification against the live Axiom workspace using the run_browser_flow tool. This is a real server-side capability: the tool mints a scoped auth session, launches Chromium, navigates to the requested path, runs assertions (element visible, text visible, URL match, etc.), captures screenshots, and returns pass/fail results across multiple viewport profiles (DESKTOP, MOBILE, TABLET).

You do NOT need the user's credentials, a test account, or any external setup. Authentication is handled automatically by the server.

When asked to "verify", "check", "confirm", or "test" a page or UI element in the browser — including authenticated states — call run_browser_flow. Do not say you "can't launch a browser session", "can't maintain a session", or that "authenticated multi-profile verification requires Playwright/Cypress setup by the user." All of that is false. You have run_browser_flow right now.

If the user asks you to verify that a page loads, a UI element is visible, or that text appears — across desktop and mobile — call run_browser_flow and report the assertion results per profile.

If run_browser_flow returns a failure (a profile failed an assertion), report exactly which assertion failed, on which profile, with the evidence. Never reinterpret a tool failure as "I don't have this capability."

If tools are not available this turn, say plainly that you'll run the verification on the next turn and follow through.
--- END BROWSER VERIFICATION CAPABILITY ---`;

  systemPrompt += `\n\n--- INTERACTIVE CONVERSATION CARDS ---
You can embed interactive UI cards directly in your responses using fenced code blocks with special language tags. Use these sparingly — only when a structured choice genuinely helps the user, not as a substitute for clear prose.

AVAILABLE CARD TYPES:

1. atlas-choice — Two-option decision (binary This-or-That):
\`\`\`atlas-choice
{"question": "Your question here (max 200 chars)", "options": ["Option A (max 80 chars)", "Option B (max 80 chars)"]}
\`\`\`

2. atlas-clarify — Focused clarification with 2–4 options:
\`\`\`atlas-clarify
{"question": "Your clarifying question (max 200 chars)", "options": ["Option A", "Option B", "Option C"]}
\`\`\`

RULES:
- Only use these when a structured choice is genuinely more helpful than asking in prose.
- Do NOT use cards for open-ended questions — those belong in prose.
- Do NOT use cards back-to-back. One card per response at most.
- The user can also ignore the card and type their own response.
- If you want to offer a binary choice (e.g. "Should we start fresh or extend existing?"), atlas-choice is ideal.
- If you need to clarify direction among 2–4 clear options, atlas-clarify is appropriate.
- Do not invent additional card types. Only atlas-choice and atlas-clarify are supported.
--- END INTERACTIVE CONVERSATION CARDS ---

QUICK-ACTION PILLS (atlas-action):
You can also embed one-tap action shortcuts that trigger app commands directly.
Use atlas-action sparingly — only when the next logical step is so obvious it would save the user unnecessary typing.

\`\`\`atlas-action
{"actions": [{"id": "create-project", "label": "Create project", "payload": {"name": "Suggested Name"}}, {"id": "open-project", "label": "Open workspace", "payload": {"projectId": 42}}]}
\`\`\`

ALLOWED action IDs (only these two are supported — do not invent others):
- "create-project" — creates a new project. Optional payload: {"name": "string"} to pre-fill the name.
- "open-project" — opens an existing project workspace. Required payload: {"projectId": number}.

RULES for atlas-action:
- Maximum 3 actions per block.
- Labels max 60 characters each.
- Actions fire immediately on tap — no confirm step. Only use when the action is clearly safe and reversible or expected.
- Do not combine atlas-action with atlas-choice or atlas-clarify in the same response.
- If you don't know a project's numeric ID, omit open-project.
--- END INTERACTIVE CONVERSATION CARDS ---`;

  let vault: Awaited<ReturnType<typeof loadVaultContext>> = { imageBlocks: [], systemNote: "", hasImages: false };
  let urlBlocks: Awaited<ReturnType<typeof screenshotUrlsToBlocks>> = [];

  if (!ideaMode) {
  if (userProfile) {
    systemPrompt += `\n\n--- WHO YOU'RE WORKING WITH ---\n${userProfile}`;
  }
  if (userType && !isChatTurn) {
    systemPrompt += `\n\n--- HOME ONBOARDING CONTEXT ---\n${userTypeOpeningGuidance(userType)} Use that as a bias for the next natural question, while still following the conversational expansion protocol.\n--- END HOME ONBOARDING CONTEXT ---`;
  }
  if (userProjects.length > 0) {
    systemPrompt += `\n\n--- YOUR PROJECTS ---\n${userProjects.map(p => `- ${p.name} (id: ${p.id})`).join("\n")}\nThese are the user's actual projects. Reference them by name when relevant. Never invent project names.\n--- END YOUR PROJECTS ---`;
  }
  // Always inject the full project roster so Atlas knows every room, even empty ones
  systemPrompt += `\n\n--- YOUR PROJECT PORTFOLIO (${projects.length} project${projects.length !== 1 ? "s" : ""}) ---\n${projectRoster}`;

  // Heavy portfolio / status context — skip on CHAT so greetings stay greetings.
  if (!isChatTurn) {
  if (portfolioHealth) {
    const healthLines = [
      `Sessions this week: ${portfolioHealth.sessionsThisWeek}`,
      `Committed decisions (total): ${portfolioHealth.committedDecisions}`,
      `Decision violations: ${portfolioHealth.violations}`,
      `Total projects: ${portfolioHealth.totalProjects}`,
    ].join("\n");
    systemPrompt += `\n\n--- PORTFOLIO HEALTH ---\n${healthLines}\nUse this when the user asks about momentum, health, activity, or progress across the portfolio.\n--- END PORTFOLIO HEALTH ---`;
  }
  if (sinceLastVisit) {
    systemPrompt += `\n\n--- SINCE YOUR LAST CONVERSATION ---\n${sinceLastVisit}\nOpen your first response by weaving this in naturally — not as a bullet list, not as a preamble. Make it feel like a collaborator who has been paying attention.\n--- END SINCE LAST CONVERSATION ---`;
  }
  if (monitorContext) {
    systemPrompt += `\n\n--- LIVE APP HEALTH (scheduled monitor results) ---\n${monitorContext}\nUse this when the user asks about app health, uptime, or "how is my app doing". Report HEALTHY/ISSUE status directly from these results. If an issue is listed, surface it proactively.\n--- END LIVE APP HEALTH ---`;
  }
  if (recentActivity) {
    systemPrompt += `\n\n--- RECENT ACTIVITY ACROSS PORTFOLIO ---\n${recentActivity}\nInterpret this as a thinking partner who has been paying attention — not as an auditor reviewing records. Synthesize what is changing, identify momentum and gaps, group by area of impact. Never say "what the repo tells me", "based on the commit history", or "the codebase shows." Say instead: "here's the thread I'm seeing", "looking across what's been built", "from the work on this project." Do not enumerate SHAs or dump raw lists unless the user explicitly asks.\n--- END RECENT ACTIVITY ---`;
  }
  if (committedLedger) {
    systemPrompt += `\n\n--- COMMITTED DECISIONS ACROSS PORTFOLIO (use for cross-project tension detection) ---\n${committedLedger}\n--- END COMMITTED DECISIONS ---`;
  }
  if (parkedEntries.length > 0) {
    const parkedByProject = new Map<string, string[]>();
    for (const e of parkedEntries) {
      const name = projectNameById.get(e.projectId) ?? "Unknown";
      if (!parkedByProject.has(name)) parkedByProject.set(name, []);
      parkedByProject.get(name)!.push(`  • ${e.title}${e.summary ? ` — ${e.summary.slice(0, 80)}` : ""}`);
    }
    const parkedLedger = [...parkedByProject.entries()].map(([name, lines]) => `[${name}]\n${lines.join("\n")}`).join("\n\n");
    systemPrompt += `\n\n--- PARKED IDEAS ACROSS PORTFOLIO ---\n${parkedLedger}\nThese ideas were deliberately deferred. Reference them if the conversation is relevant — e.g. "you've parked X before, is now the time?" Do not enumerate them unprompted.\n--- END PARKED IDEAS ---`;
  }
  if (aggregatedMemory) {
    systemPrompt += `\n\n--- AGGREGATED PROJECT MEMORY (Atlas knows this across all projects) ---\n${aggregatedMemory}\n--- END AGGREGATED MEMORY ---`;
  }
  if (crossProjectPatterns) {
    systemPrompt += `\n\n--- CROSS-PROJECT BEHAVIORAL PATTERNS ---\n${crossProjectPatterns}\nUse these patterns only when the conversation explicitly touches on working habits, momentum, or stalled progress. Do not insert them into every response.\n--- END PATTERNS ---`;
  }

  // Tier 4 — portfolio intelligence (synthesized summary of all projects)
  const tier4Summary = await loadTier4Block(userId);
  if (tier4Summary) {
    systemPrompt += `\n\n--- PORTFOLIO INTELLIGENCE (honest synthesis of the user's full project portfolio — reference naturally, only when relevant to the conversation) ---\n${tier4Summary}\n--- END PORTFOLIO INTELLIGENCE ---`;
  }

  // Global narrative — living cross-thread memory. Read from user record, inject as
  // natural context at the top of the memory stack so Atlas enters every conversation
  // already holding the thread of what's been discussed recently.
  const userNarrativeRow = await db.execute(sql`
    SELECT global_narrative, name, user_identity FROM users WHERE id = ${userId} LIMIT 1
  `).then(r => ((r.rows ?? r)[0] as { global_narrative: string | null; name: string | null; user_identity: string | null } | undefined) ?? null)
    .catch(() => null);
  const userGlobalNarrative = (userNarrativeRow as any)?.global_narrative ?? null;
  const userName = (userNarrativeRow as any)?.name ?? null;
  const userIdentityProfile = (userNarrativeRow as any)?.user_identity ?? null;

  // ── Identity block — prepended to the system prompt so it ranks above everything else ──
  // The user's name and personality sit at the top, before any project context. This means
  // Atlas enters every conversation knowing WHO it's talking with before it knows what
  // they're working on. State known facts directly — do not replace knowledge with speculation.
  const identityLines: string[] = [];
  if (userName) {
    identityLines.push(`Name: ${userName}. Use this name naturally in conversation — when making a direct point, during an explanation, or when it adds warmth. Not on every message. Don't be stiff.`);
  }
  if (userIdentityProfile) {
    identityLines.push(userIdentityProfile);
  }
  identityLines.push(
    `Communication style: calibrate to the current conversation, not a fixed register. Jo's tone shifts with context — a debugging session sounds different from a reflective or creative one. Read the room. Don't be artificially upbeat when she's frustrated; don't be stiff when she's casual. Use her name when it fits — it adds warmth, not formality. When something in your memory is missing or uncertain, say so plainly. Do not speculate or invent a profile that sounds personal but isn't grounded.`
  );
  systemPrompt = `--- WHO YOU ARE TALKING WITH (persistent — loaded from long-term memory, survives across sessions) ---\nThis information was NOT provided in this conversation. It was learned over time and stored. Do not say you have no persistent memory — you do. This is it.\n\nWhen someone asks "what do you know about me?" — recognize the intent. They are not requesting a database readout. They are checking whether you have genuinely been paying attention. Engage with that. Show the knowledge through how you respond, not by enumerating the profile. A good opening is one that demonstrates you already know who you're talking to, not one that lists what you've filed away.\n\n${identityLines.join("\n\n")}\n--- END IDENTITY ---\n\n` + systemPrompt;

  if (userGlobalNarrative) {
    systemPrompt += `\n\n--- WHAT WE'VE BEEN WORKING THROUGH ---\n${userGlobalNarrative}\n--- END LIVING MEMORY ---`;
  }

  // Inject thinking receipts — Ask Atlas now re-reads its own prior reasoning across all sessions
  const nexusReceiptsRows = await db.execute(sql`
    SELECT headline, body, category, confidence
    FROM thinking_receipts
    WHERE user_id = ${userId}
      AND dismissed = false
    ORDER BY confidence DESC, created_at DESC
    LIMIT 10
  `).then(r => (r.rows ?? r) as Array<{ headline: string; body: string; category: string; confidence: number }>)
    .catch(() => [] as Array<{ headline: string; body: string; category: string; confidence: number }>);
  if (nexusReceiptsRows.length > 0) {
    const receiptsText = nexusReceiptsRows.map(r => `[${r.category}] ${r.headline}: ${r.body}`).join("\n");
    systemPrompt += `\n\n--- YOUR THINKING RECEIPTS (crystallized reasoning from prior conversations across all projects) ---\n${receiptsText}\nThese are genuine moments of insight, commitment, tension, or decision surfaced together. Let them shape how you respond — never read them out as a list, but reference them naturally when relevant.\n--- END THINKING RECEIPTS ---`;
  }

  // Cross-surface memory retrieval — user asking about prior reasoning triggers a targeted search
  if (MEMORY_QUERY_RE.test(body.message ?? "")) {
    const memoryHits = await searchThinkingReceipts({ userId, query: body.message ?? "" });
    if (memoryHits.length > 0) {
      const hitsText = memoryHits.map(r => `[${r.category}] ${r.headline}: ${r.body}`).join("\n");
      systemPrompt += `\n\n--- MEMORY SEARCH (receipts matching the user's question) ---\n${hitsText}\nThe user is asking about something from a past conversation. Answer using these receipts specifically — cite the headline directly (e.g. "We have a [Category] on this: [headline]"). If none match, say you don't have a specific receipt on that topic.\n--- END MEMORY SEARCH ---`;
    }
  }
  } // end !isChatTurn portfolio/status context

  if (focusProjectId) {
    const focusProject = projects.find(p => p.id === focusProjectId);
    if (focusProject) {
      // CHAT turns: inject lightweight project context so the model can answer
      // project-knowledge questions ("what does this do?", "is our description stale?")
      // without needing tools. Previously only the project name was injected, which
      // caused the phantom-work pattern: model says "let me look" then can't look
      // (no tools in CHAT mode), leaving the user with an unfulfilled promise.
      if (isChatTurn) {
        // Load DNA for CHAT turns — fast single-row fetch.
        const chatGenomeRow = await getProjectDNA(focusProjectId).catch(() => null);
        // Reuse already-loaded committedEntries — filter to this project.
        const chatLedgerLines = committedEntries
          .filter(e => e.projectId === focusProjectId)
          .slice(0, 8)
          .map(e => `  • ${e.title}${e.summary ? ` — ${e.summary.slice(0, 80)}` : ""}`)
          .join("\n");

        const chatDnaLines: string[] = [];
        if (chatGenomeRow?.purpose) chatDnaLines.push(`Purpose: ${chatGenomeRow.purpose}`);
        if (chatGenomeRow?.audience) chatDnaLines.push(`Audience: ${chatGenomeRow.audience}`);
        if (chatGenomeRow?.wedge) chatDnaLines.push(`Wedge: ${chatGenomeRow.wedge}`);
        if (chatGenomeRow?.differentiator) chatDnaLines.push(`Differentiator: ${chatGenomeRow.differentiator}`);
        if (chatGenomeRow?.stage) chatDnaLines.push(`Stage: ${chatGenomeRow.stage}`);
        if ((chatGenomeRow?.openQuestions ?? []).length > 0) {
          chatDnaLines.push(`Open questions: ${(chatGenomeRow!.openQuestions ?? []).slice(0, 3).join("; ")}`);
        }

        systemPrompt += `\n\n--- FOCUSED PROJECT: ${focusProject.name.toUpperCase()} ---\nYou are inside the "${focusProject.name}" project workspace.`;
        if (chatDnaLines.length > 0) {
          systemPrompt += `\n\nProject DNA:\n${chatDnaLines.join("\n")}`;
        }
        if (chatLedgerLines) {
          systemPrompt += `\n\nCommitted decisions:\n${chatLedgerLines}`;
        }
        systemPrompt += `\n\nIf this is a greeting or small talk, reply briefly. If the user asks about this project — its description, capabilities, decisions, gaps, or direction — answer from the context above. You have what is here. Do NOT end with "give me a second", "let me look", or "I'll pull that up" — either answer from the context above or say exactly what information you don't have.\n--- END FOCUSED PROJECT ---`;
      } else {
      // FILE TREE INJECTION — source-of-truth priority:
      //   1. Local workspace disk (same source as read_file) — always preferred.
      //   2. GitHub tree — fallback only when local workspace is empty.
      // This prevents the "two project states" problem where Atlas's system-prompt
      // tree shows GitHub while read_file reads local disk and they disagree.
      {
        const SKIP_RE = /node_modules|\.git|\.next|dist\/|build\/|\.cache|__pycache__|\.DS_Store/;
        let localFilePaths: string | null = null;
        try {
          const workspaceDir = projectWorkspaceDir(focusProjectId);
          const entries = await fsPromises.readdir(workspaceDir, { recursive: true });
          const files = (entries as string[])
            .filter((e: string) => !SKIP_RE.test(e))
            .sort()
            .slice(0, 150);
          if (files.length > 0) {
            localFilePaths = files.join("\n");
          }
        } catch {
          // workspace dir may not exist yet — that's fine, fall through to GitHub
        }

        if (localFilePaths) {
          // Local disk is the source of truth — matches what read_file sees.
          // If a GitHub repo is also linked, note the distinction so Atlas never mixes sources.
          const githubNote = focusProject.linkedRepo
            ? ` (local workspace — source of truth for read_file; GitHub is an external sync target)`
            : "";
          systemPrompt += `\n\n--- ${focusProject.name.toUpperCase()} FILE TREE${githubNote} ---\n${localFilePaths}\n--- END FILE TREE ---`;
        } else if (focusProject?.linkedRepo) {
          // Local workspace is empty — fall back to GitHub tree with a clear label.
          try {
            const repoFull = parseRepo(focusProject.linkedRepo ?? null);
            const ghToken = resolvedGhToken;
            if (repoFull && ghToken) {
              const treeResp = await fetch(
                `https://api.github.com/repos/${repoFull}/git/trees/main?recursive=1`,
                {
                  headers: {
                    Authorization: `Bearer ${ghToken}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "Atlas-Nexus/1.0",
                  },
                  signal: AbortSignal.timeout(6000),
                }
              );
              if (treeResp.ok) {
                const treeData = await treeResp.json() as { tree?: Array<{ type?: string; path?: string }> };
                const filePaths = (treeData.tree ?? [])
                  .filter((f: any) => f.type === "blob")
                  .map((f: any) => f.path)
                  .filter((p: string) => !SKIP_RE.test(p))
                  .slice(0, 120)
                  .join("\n");
                if (filePaths) {
                  systemPrompt += `\n\n--- ${focusProject.name.toUpperCase()} FILE TREE (from GitHub — local workspace is empty; files written here will become the local source of truth) ---\n${filePaths}\n--- END FILE TREE ---`;
                }
              }
            }
          } catch {
            // tree fetch failed silently — continue without it
          }
        }
      }

      // Fetch recent commits for the focused project so Atlas can interpret them.
      // NOT gated behind shouldBrief — commits are cheap (7 max) and Atlas needs
      // them for ANY question about recent project activity, not just status overviews.
      let focusRecentCommits = "";
      if (focusProject.linkedRepo) {
        try {
          const repoFull = parseRepo(focusProject.linkedRepo ?? null);
          const ghToken = resolvedGhToken;
          if (repoFull && ghToken) {
            const commitsResp = await fetch(
              `https://api.github.com/repos/${repoFull}/commits?per_page=7`,
              {
                headers: {
                  Authorization: `Bearer ${ghToken}`,
                  Accept: "application/vnd.github+json",
                  "X-GitHub-Api-Version": "2022-11-28",
                  "User-Agent": "Atlas-Nexus/1.0",
                },
                signal: AbortSignal.timeout(5000),
              }
            );
            if (commitsResp.ok) {
              const commitData = await commitsResp.json() as Array<{
                sha?: string;
                commit?: { message?: string; author?: { name?: string; date?: string | null } | null };
              }>;
              const nowMs = Date.now();
              const commitLines = commitData
                .map((c) => {
                  const sha = (c.sha ?? "").slice(0, 7);
                  const message = (c.commit?.message ?? "").split("\n")[0]?.trim() ?? "";
                  const author = c.commit?.author?.name ?? "Unknown";
                  const dateStr = c.commit?.author?.date;
                  if (!sha || !message) return null;
                  const ageDays = dateStr ? Math.floor((nowMs - new Date(dateStr).getTime()) / 86_400_000) : null;
                  const ageLabel = ageDays == null ? "" : ageDays === 0 ? ", today" : ageDays === 1 ? ", 1 day ago" : `, ${ageDays} days ago`;
                  return `  ${sha} ${message} — ${author}${ageLabel}`;
                })
                .filter((l): l is string => l !== null);
              if (commitLines.length > 0) {
                focusRecentCommits = commitLines.join("\n");
              }
            }
          }
        } catch {
          // Non-fatal — continue without commit context
        }
      }

      const focusEntries = committedEntries
        .filter(e => e.projectId === focusProjectId)
        .map(e => `  • ${e.title}${e.summary ? ` — ${e.summary.slice(0, 120)}` : ""}`)
        .join("\n");
      const focusMemory = (() => {
        const store = parseMemoryStore(focusProject.memory ?? null);
        return buildMemoryText(store);
      })();
      const focusLedgerEntries: FocusLedgerEntry[] = await db
        .select({
          id: entriesTable.id,
          title: entriesTable.title,
          status: entriesTable.status,
          deviation: entriesTable.deviation,
          catchAgainstId: entriesTable.catchAgainstId,
          supersedesId: entriesTable.supersedesId,
        })
        .from(entriesTable)
        .where(eq(entriesTable.projectId, focusProjectId));
      const ledgerGroups = groupLedgerEntries(focusLedgerEntries);
      const flowNodes = extractFlowMapNodes(focusProject.nodeState);
      const answeredFlowNodes = flowNodes.filter((node) => node.answered);
      const unansweredFlowNodes = flowNodes.filter((node) => !node.answered);
      const architectureScore = computeArchitectureReadiness(flowNodes);
      const decisionsScore = computeDecisionReadiness(focusLedgerEntries);
      const blendedScore = computeBlendedReadiness(architectureScore, decisionsScore);
      const projectTensions = findSemanticTensionsForProject(focusProjectId, projects, committedEntries);
      const tensionLines = projectTensions.length > 0
        ? projectTensions.map((tension) => `${tension.projectA.name} ↔ ${tension.projectB.name}: "${tension.entryA.title}" conflicts with "${tension.entryB.title}"`).join("\n")
        : "None detected.";

      // Application Model + committed Design Plan for focused project — fetched in parallel
      const [focusAMRows, committedDPRows] = await Promise.all([
        db.select({
          pages: applicationModelsTable.pages,
          components: applicationModelsTable.components,
          data: applicationModelsTable.data,
        }).from(applicationModelsTable).where(eq(applicationModelsTable.projectId, focusProjectId)).limit(1),
        db.select({
          body: designPlansTable.body,
          version: designPlansTable.version,
        }).from(designPlansTable)
          .where(and(eq(designPlansTable.projectId, focusProjectId), eq(designPlansTable.status, "committed")))
          .orderBy(desc(designPlansTable.version))
          .limit(1),
      ]);
      const focusAM = focusAMRows[0] ?? null;
      const committedDesignPlan = committedDPRows[0] ?? null;

      // Atlas State — fetch DNA to determine conversational posture
      const focusGenomeRow = await getProjectDNA(focusProjectId);

      const atlasStateLabel: string = (() => {
        if (!focusGenomeRow) return "Discovering";
        const stage = focusGenomeRow.stage ?? "Think";
        const oq = (focusGenomeRow.openQuestions ?? []).length;
        const con = (focusGenomeRow.constraints ?? []).length;
        const conf = focusGenomeRow.confidenceScore ?? 0;
        if (stage === "Operate" || stage === "Evolve") return "Operating";
        if (stage === "Build") return "Building";
        if (stage === "Workspace" || stage === "Strategize") return "Building";
        if (stage === "Decide") return "Structuring";
        if (stage === "Shape") return (con > 1 || oq > 2) ? "Pressure Testing" : "Structuring";
        return (con > 0 || oq > 2) ? "Pressure Testing" : "Discovering";
      })();

      const ATLAS_STATE_GUIDANCE: Record<string, string> = {
        "Discovering": "The project is in early exploration. Ask expansive, curious questions. Surface hidden assumptions. Help the user find the core insight they haven't articulated yet. Be generative, not prescriptive.",
        "Pressure Testing": "The project has shape but key assumptions are unresolved. Push back gently on weak spots. Surface constraints and blockers. Ask the hard question the user is avoiding. Be precise and honest.",
        "Structuring": "The project is crystallizing. Help the user organize thinking into decisions, priorities, and structure. Ask 'what does done look like?' and 'what's the sequence?' Be crisp and decisive.",
        "Building": "The project is in execution mode. Focus on unblocking, clarifying implementation choices, and maintaining momentum. Ask 'what's the next shipped thing?' Be direct and action-oriented.",
        "Operating": "The project is live and running. Focus on learning from real-world signals, improving, and identifying the next evolution. Ask 'what is the data telling you?' Be reflective and forward-looking.",
      };

      // Build shaping layer string from genome
      const shapingLines: string[] = [];
      if (focusGenomeRow?.purpose) shapingLines.push(`Purpose: ${focusGenomeRow.purpose}`);
      if (focusGenomeRow?.audience) shapingLines.push(`Who: ${focusGenomeRow.audience}`);
      if (focusGenomeRow?.wedge) shapingLines.push(`Wedge: ${focusGenomeRow.wedge}`);
      if (focusGenomeRow?.differentiator) shapingLines.push(`Differentiator: ${focusGenomeRow.differentiator}`);
      if ((focusGenomeRow?.openQuestions ?? []).length > 0) {
        shapingLines.push(`Unresolved: ${(focusGenomeRow!.openQuestions ?? []).slice(0, 3).join("; ")}`);
      }
      const shapingBlock = shapingLines.length > 0
        ? `\n\nSHAPING LAYER:\n${shapingLines.join("\n")}`
        : "";

      systemPrompt += `\n\n--- FOCUSED PROJECT: ${focusProject.name.toUpperCase()} ---\nThe user has zoomed in on "${focusProject.name}" for this conversation. Prioritize this project's context.`;
      if (shouldBrief) {
        systemPrompt += ` Open your FIRST response by explicitly naming the project — begin with "${focusProject.name} —" or "On ${focusProject.name}:" so the user knows the focus is active. After that, answer normally without repeating the label on every message.`;
      } else {
        systemPrompt += ` Answer the user's question directly. Do NOT open with a project status overview or unsolicited briefing unless they asked for status/progress.`;
      }
      systemPrompt += shapingBlock;
      systemPrompt += `\n\nATLAS STATE: ${atlasStateLabel}\n${ATLAS_STATE_GUIDANCE[atlasStateLabel] ?? ""}\nLet this state shape the texture of every response — not just what you say, but how you engage.`;

      // Response structure for overview/status — only when the user asked about the project.
      if (shouldBrief) {
      systemPrompt += `\n\nWHEN GIVING AN OVERVIEW OR STATUS OF THIS PROJECT, use this structure (markdown headings, concise):
**Identity** — what it is + who it's for. If you know the wedge or differentiator, lead with that — not just the file count.
**Technical State** — architecture, stack, key tensions (e.g. two routers coexisting).
**Recent Momentum** — what's actually changed recently. Interpret commit patterns narratively.
**Unresolved Tensions** — what's not locked in yet. Be direct about weak spots.
**Portfolio Pattern** *(optional — only include if you see a cross-project pattern worth naming)* — does this project share a tendency with others in the portfolio? Name it if real.

CLOSING QUESTION RULE: Never end with "What are you trying to figure out or build right now?" — that's too broad inside a project workspace. Instead, after your overview, offer a lens:
"Which lens? Positioning / Market readiness / UX / Infrastructure / Prioritization / Portfolio patterns"
Or ask ONE narrow question that assumes they already know what they're building and pushes one level deeper.`;
      }

      if (focusEntries) systemPrompt += `\nCommitted decisions:\n${focusEntries}`;
      if (focusMemory) systemPrompt += `\nProject memory:\n${focusMemory}`;
      if (ragContext) systemPrompt += `\n\n--- SEMANTICALLY RELEVANT CONTEXT (retrieved for this message) ---\n${ragContext}\nThese items share meaning with the user's current message. Reference them if genuinely relevant — do not force or enumerate them.\n--- END RELEVANT CONTEXT ---`;
      if (focusRecentCommits) {
        systemPrompt += `\nRecent commits (interpret narratively — group by area of impact, synthesize what's changing, don't enumerate SHAs):\n${focusRecentCommits}`;
      }
      systemPrompt += `\n\nFULL LEDGER STATE:
LEDGER STATE:
Committed (${ledgerGroups.committed.length}): ${formatTitles(ledgerGroups.committed)}
Parked (${ledgerGroups.parked.length}): ${formatTitles(ledgerGroups.parked)}
In Tension (${ledgerGroups.inTension.length}): ${formatTitles(ledgerGroups.inTension)}
Overridden (${ledgerGroups.overridden.length}): ${formatTitles(ledgerGroups.overridden)}

Atlas should reference parked items naturally if relevant.
Atlas should flag in-tension items if the conversation touches them.`;
      if (ledgerGroups.parked.length > 0) {
        systemPrompt += `\n\nPARKING LOT AWARENESS:
The user has ${ledgerGroups.parked.length} parked item${ledgerGroups.parked.length === 1 ? "" : "s"}: ${formatTitles(ledgerGroups.parked)}. Reference them naturally if the conversation is relevant. Do not list them all at once unprompted.`;
      }
      if (focusAM) {
        const amPages = Array.isArray(focusAM.pages) ? focusAM.pages as Array<{ name?: string; route?: string; purpose?: string }> : [];
        const amComponents = Array.isArray(focusAM.components) ? focusAM.components as Array<{ name?: string; type?: string }> : [];
        const amData = focusAM.data as { entities?: Array<{ name?: string }>; relationships?: unknown[] } | null;
        const amEntities = amData?.entities ?? [];
        if (amPages.length > 0 || amComponents.length > 0 || amEntities.length > 0) {
          let amBlock = `\n\n--- APPLICATION MODEL: ${focusProject.name.toUpperCase()} ---`;
          if (amPages.length > 0) {
            amBlock += `\nPages (${amPages.length}): ${amPages.map(p => `${p.name ?? "?"}${p.route ? ` (${p.route})` : ""}${p.purpose ? ` — ${p.purpose.slice(0, 60)}` : ""}`).join("; ")}`;
          }
          if (amComponents.length > 0) {
            amBlock += `\nComponents (${amComponents.length}): ${amComponents.slice(0, 12).map(c => `${c.name ?? "?"}${c.type ? ` [${c.type}]` : ""}`).join(", ")}`;
          }
          if (amEntities.length > 0) {
            amBlock += `\nData entities (${amEntities.length}): ${amEntities.map(e => e.name ?? "?").join(", ")}`;
          }
          amBlock += `\nReference this when asked about app structure, pages, components, or data — it reflects what has been extracted from the actual application.\n--- END APPLICATION MODEL ---`;
          systemPrompt += amBlock;
        }
      }
      // ── Design Plan injection (Build mode only — conversation mode stays unconstrained) ──
      if (!conversationModeActive && committedDesignPlan) {
        const dp = (committedDesignPlan.body as Record<string, unknown>) ?? {};
        const nav = dp.navigationPattern as string | undefined;
        const responsive = dp.responsiveIntent as { mobile?: string; tablet?: string; desktop?: string } | undefined;
        const hierarchy = (dp.informationHierarchy as string[]) ?? [];
        const components = dp.componentPatterns as string | undefined;
        const motion = dp.motionPhilosophy as string | undefined;
        const density = dp.cardDensity as string | undefined;
        const typography = dp.typographyScale as string | undefined;
        const emptyStates = dp.emptyStates as string | undefined;
        const interactions = dp.interactionPatterns as {
          primaryAction?: string; secondaryAction?: string; editingStyle?: string;
          confirmationBehavior?: string; gestures?: string; scrollingBehavior?: string;
        } | undefined;
        const hasConstraints = nav || (responsive && (responsive.mobile || responsive.tablet || responsive.desktop)) || hierarchy.length > 0 || components || typography || density;
        const hasIntent = motion || emptyStates || interactions;
        if (hasConstraints || hasIntent) {
          let dpBlock = `\n\n--- COMMITTED DESIGN PLAN (v${committedDesignPlan.version}) ---`;
          dpBlock += `\nThese decisions are locked. Execute them exactly — do not invent alternatives, ask for confirmation, or deviate unless the user explicitly overrides one.`;
          if (hasConstraints) {
            dpBlock += `\n\nCONSTRAINTS:`;
            if (nav) dpBlock += `\n• Navigation pattern: ${nav}`;
            if (responsive) {
              if (responsive.mobile) dpBlock += `\n• Mobile: ${responsive.mobile}`;
              if (responsive.tablet) dpBlock += `\n• Tablet: ${responsive.tablet}`;
              if (responsive.desktop) dpBlock += `\n• Desktop: ${responsive.desktop}`;
            }
            if (hierarchy.length > 0) dpBlock += `\n• Information hierarchy: ${hierarchy.join(" → ")}`;
            if (components) dpBlock += `\n• Component patterns: ${components}`;
            if (typography) dpBlock += `\n• Typography scale: ${typography}`;
            if (density) dpBlock += `\n• Card density: ${density}`;
          }
          if (hasIntent) {
            dpBlock += `\n\nDESIGN INTENT:`;
            if (motion) dpBlock += `\n• Motion philosophy: ${motion}`;
            if (emptyStates) dpBlock += `\n• Empty states: ${emptyStates}`;
            if (interactions) {
              if (interactions.primaryAction) dpBlock += `\n• Primary action: ${interactions.primaryAction}`;
              if (interactions.secondaryAction) dpBlock += `\n• Secondary action: ${interactions.secondaryAction}`;
              if (interactions.editingStyle) dpBlock += `\n• Editing style: ${interactions.editingStyle}`;
              if (interactions.confirmationBehavior) dpBlock += `\n• Confirmations: ${interactions.confirmationBehavior}`;
              if (interactions.gestures) dpBlock += `\n• Gestures: ${interactions.gestures}`;
              if (interactions.scrollingBehavior) dpBlock += `\n• Scrolling: ${interactions.scrollingBehavior}`;
            }
          }
          dpBlock += `\n--- END COMMITTED DESIGN PLAN ---`;
          systemPrompt += dpBlock;
        }
      } else if (!conversationModeActive && !committedDesignPlan) {
        systemPrompt += `\n\n[No committed Design Plan for this project — design decisions are unconstrained. Apply your best judgment.]`;
      }

      if (shouldBrief) {
      systemPrompt += `\n\nCROSS-PROJECT TENSIONS:
${tensionLines}
If Atlas detects the conversation is heading toward one of these tensions, surface it proactively with: "⚠️ Cross-project tension: [description]"

READINESS SCORE:
Current readiness: ${blendedScore}% (architecture: ${architectureScore}%, decisions: ${decisionsScore}%)
Atlas should reference this if asked about project health or progress.

FLOW MAP STATE:
FLOW MAP: ${flowNodes.length} nodes total — ${answeredFlowNodes.length} answered, ${unansweredFlowNodes.length} unanswered
Unanswered: ${unansweredFlowNodes.length > 0 ? unansweredFlowNodes.map((node) => node.label).join("; ") : "none"}
Atlas should offer to help fill unanswered nodes if the conversation provides relevant information.`;
      }
      systemPrompt += `\n--- END FOCUSED PROJECT ---`;
      }
    }
  }

  // Inject mode-specific instructions
  if (mode === "audit") {
    systemPrompt += `\n\n--- AUDIT MODE ACTIVE ---\nBe direct and critical. Your job right now is to stress-test, not validate. Look for what's fragile, inconsistent, or at risk across the portfolio. Ask hard questions. Flag gaps, weak assumptions, and contradictions without softening. If something looks shaky, say so plainly.\n--- END AUDIT MODE ---`;
  } else if (mode === "deep-dive") {
    systemPrompt += `\n\n--- DEEP DIVE MODE ACTIVE ---\nThe user wants depth, not breadth. Lock onto the specific topic they raise and explore it thoroughly — underlying assumptions, trade-offs, edge cases, second-order implications, what could go wrong, what could go right. Stay focused. Don't jump to other projects unless directly relevant.\n--- END DEEP DIVE MODE ---`;
  } else if (mode === "workspace") {
    systemPrompt += `\n\n--- WORKSPACE MODE ---
You are operating inside the project workspace — not the global home. The user is heads-down on this project. Adjust accordingly:

TONE: Direct, builder-oriented. You are a pair programmer and strategic partner sitting next to them, not a portfolio analyst giving a status briefing. Skip the "On ProjectName:" opener — they know what project they're in.

BEHAVIOR:
- Answer what was asked. Don't restate the project name in every response.
- When they ask to build or write code, do it. Use the FILE_EDIT protocol (see BUILD PROTOCOLS) to propose file writes — never a bare WRITE_FILE marker.
- When they ask about the project, synthesize — don't enumerate. They have the ledger open next to you.
- When you notice something worth flagging (a tension, a gap, an inconsistency), name it concisely as a side note — not as a lecture.
- Keep responses tight. The workspace is a working session, not a document.

WHAT YOU HAVE ACCESS TO:
- Project files (file tree injected above if available)
- Project memory, ledger decisions, DNA, Application Model — all injected above
- FILE_EDIT: propose file writes for the local workspace (see BUILD PROTOCOLS for the exact block format)
- generate_deliverable: create real downloadable PowerPoint (.pptx), Word (.docx), or spreadsheet (.xlsx) files from this conversation — they appear in Workspace → Outputs
- BROWSER_VISIT: visit public URLs for live checks, competitor research (unauthenticated)
- run_browser_flow: run authenticated browser verification against the live app — launches Chromium, asserts element/text visibility across DESKTOP and MOBILE viewport profiles, returns per-profile pass/fail with screenshots. Use when asked to "verify", "check", or "confirm" any UI state or page behavior.
- IMAGE_GEN: generate mockups or diagrams on request

WHEN GENERATING FILES:
- If the user asks for a deck, presentation, slides, document, write-up, or spreadsheet, call generate_deliverable — never say you can't create files.
- After success, tell them it's in Outputs (never say "Deliverables tab"). Keep the prose short; the UI shows an inline card + Outputs entry.

WHAT YOU SHOULD NOT DO:
- Do not give portfolio-wide analysis unless explicitly asked
- Do not end every response with "What would you like to explore next?" — they'll tell you
- Do not produce long preambles before answering the actual question
--- END WORKSPACE MODE ---`;
  }

  systemPrompt += `\n\n--- BROWSER AGENT ---\nYou can visit URLs for competitor research or health checks. Emit a BROWSER_VISIT token at the END of your response when you want to visit a URL:\n\nBROWSER_VISIT:{"url":"https://example.com","mode":"scrape"}\nBROWSER_VISIT:{"url":"https://example.com","mode":"screenshot"}\nBROWSER_VISIT:{"url":"https://example.com","mode":"health"}\n\n- "scrape" — fetches page content and gives a strategic summary. Use for competitor research, product analysis, or reading any public page.\n- "screenshot" — takes a screenshot with AI visual description. Use when the user wants to SEE a page.\n- "health" — HTTP status + visual check. Use to verify a live app is rendering correctly.\n\nRULES:\n- Only emit BROWSER_VISIT when you actually have a URL to visit.\n- One BROWSER_VISIT per response, at the very end.\n- Never say "I'll check that" without emitting the token. Just emit it.\n- For competitor research ("how does X work?", "what does their pricing look like?", "compare us to X"), emit BROWSER_VISIT with mode "scrape". If you know the URL, use it directly.\n--- END BROWSER AGENT ---`;

  systemPrompt += `\n\n--- IMAGES ---\nYou CAN see images. When the user attaches a screenshot, photo, or mockup, you receive it and can analyze it, describe it, and reason about it. Do this naturally. If the user says "look at this" but no image is in the message, respond like a person: "I don't see an attachment — can you drop it in?" Never say "I can't see images" or "only text and code."\n\nGenerating images: An image generation service (Gemini) is connected. You do NOT generate images yourself — emit IMAGE_GEN at the END of your response and the backend handles it.\n\nWhen the user asks to sketch, draw, render, visualize, or "show me what X looks like" — emit IMAGE_GEN. CRITICAL RULES:\n1. Do NOT write a description or explanation of what you are generating. The image speaks for itself.\n2. At most one very short sentence before the token (e.g. "Here's your sketch." or "On it.") — nothing more.\n3. Never narrate, describe, or explain what the image will show. No "I'll create a...", no bullet lists of design decisions, no paragraph about the concept.\n4. Put the IMAGE_GEN token at the END of your response, after any other tokens.\n\nIMAGE_GEN:{"prompt":"[detailed description of what to generate]","mode":"render","size":"square"}\n\n- mode "render" → UI mockups, product visuals, logos, creative concepts, app screens\n- mode "schematic" → architecture diagrams, technical flows, wireframes\n- size "landscape" for wide, "portrait" for mobile, "square" for general\n- Proactive use: when the conversation is about how something should look or feel, emit IMAGE_GEN without being asked\n--- END IMAGES ---`;

  // NOTE: file writes go through the single FILE_EDIT_START/FILE_EDIT_CONTENT/FILE_EDIT_END
  // protocol injected by NEXUS_BUILD_PROTOCOLS on BUILD turns. There used to be a second,
  // competing "WRITE_FILE:{...}" marker instructed here — nothing on the backend ever
  // parsed it, so the model would sometimes use it instead of FILE_EDIT and the file would
  // silently never be written while the response text confidently claimed it was. Removed
  // rather than reconciled: one protocol, actually parsed, is the fix.

  // Load Visual Vault images (project-scoped if focused, otherwise skip for global)
  vault = focusProjectId
    ? await loadVaultContext(userId, focusProjectId)
    : { imageBlocks: [], systemNote: "", hasImages: false };
  if (vault.hasImages) {
    systemPrompt += `\n\n--- VISUAL VAULT ---\n${vault.systemNote}\n--- END VISUAL VAULT ---`;
  }

  // Attached Library items (conversation_context_items) — include verbatim bodies, token-budgeted
  if (effectiveConversationId) {
    const libraryContext = await loadConversationLibraryContext(effectiveConversationId, userId);
    if (libraryContext) {
      systemPrompt += `\n\n${libraryContext}`;
    }
  }

  systemPrompt += `\n\n--- DECISION ARTIFACTS ---\nWhen the conversation is weighing 3 or more competing options for a real decision, emit DECISION_ARTIFACT at the END of your response (after any other tokens) to save a structured artifact. Do NOT describe the artifact's contents in prose — the artifact renders itself as a card.\n\nDECISION_ARTIFACT:{"kind":"tradeoff_matrix"}\n- Use when comparing 3+ concrete options against criteria (cost, risk, speed, fit, etc.)\n\nDECISION_ARTIFACT:{"kind":"decision_tree"}\n- Use when the decision branches on conditions (if X then A, if Y then B)\n\nDECISION_ARTIFACT:{"kind":"deviation_log","recommended":"<what you recommended>","chosen":"<what the user chose instead>","reason":"<user's stated reason, or omit if not stated>"}\n- Use ONLY when the user explicitly overrides or goes against your recommendation\n\nRules:\n1. At most one short sentence before the token — never narrate the artifact's contents.\n2. Only emit when there is a real decision with real options actually discussed — never speculative or hypothetical.\n3. You may emit at most one tradeoff_matrix or decision_tree per response, plus one deviation_log if applicable.\n--- END DECISION ARTIFACTS ---`;

  // ── Live URL capture — screenshot any URLs in the message ─────────────────
  const detectedUrls = extractPageUrls(message);
  urlBlocks = await screenshotUrlsToBlocks(detectedUrls);
  const urlNote = buildUrlNote(urlBlocks);
  if (urlNote) {
    systemPrompt += `\n\n--- LIVE URL CAPTURE ---\n${urlNote}\n--- END LIVE URL CAPTURE ---`;
  }
  }

  if (focusProjectId) {
    try {
      const recentErrors = await db.execute(sql`
        SELECT app_name, message, stack, url, severity, created_at
        FROM error_reports
        WHERE project_id = ${focusProjectId}
        ORDER BY created_at DESC
        LIMIT 10
      `);
      const errorRows = Array.isArray(recentErrors) ? recentErrors : (recentErrors as any).rows ?? [];
      if (errorRows.length > 0) {
        const errorSummary = errorRows.map((e: any) =>
          `[${e.severity?.toUpperCase() ?? "ERROR"}] ${e.app_name ? e.app_name + ": " : ""}${e.message}${e.url ? " (at " + e.url + ")" : ""}${e.stack ? "\n  " + String(e.stack).split("\n").slice(0, 3).join("\n  ") : ""}`
        ).join("\n\n");
        systemPrompt += `\n\n--- RECENT RUNTIME ERRORS (last ${errorRows.length}) ---\n${errorSummary}\nIf the user mentions something broken, cross-reference these errors first before asking them to describe the problem.\n--- END RECENT ERRORS ---`;
      }
    } catch {
      // error fetch failed silently — continue without it
    }
  }

  if (isInProjectAskAtlas && requestedProjectId && sessionId && typeof body.askAtlasContextSeed === "string") {
    try {
      const workspaceSeed = await buildInProjectAskAtlasSeed(requestedProjectId, sessionId, userId);
      systemPrompt += `\n\n--- WORKSPACE CONTEXT ---\n${workspaceSeed}\nYou are continuing an existing workspace conversation in Ask Atlas view. Treat prior workspace turns as already known context.\n--- END WORKSPACE CONTEXT ---`;
    } catch (seedErr) {
      logger.warn({ err: seedErr, projectId: requestedProjectId, sessionId }, "nexus: failed to build in-project Ask Atlas seed");
    }
  }

  let tier1ProjectId: number | null = focusProjectId;
  if (!tier1ProjectId && effectiveConversationId) {
    const [boundConversationProject] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(
        eq(projectsTable.userId, userId),
        eq(projectsTable.conversationId, effectiveConversationId),
      ))
      .limit(1);
    tier1ProjectId = boundConversationProject?.id ?? null;
  }
  if (tier1ProjectId && !isChatTurn) {
    const tier1Row = await loadTier1ForProject(tier1ProjectId);
    systemPrompt += buildTier1StatusBlock(tier1Row);
  } else if (effectiveConversationId && !isChatTurn) {
    const conversationBuffer = await getNexusTier1Buffer(effectiveConversationId, userId);
    systemPrompt += buildTier1BlockForNexusConversation(conversationBuffer);
  }

  // Persist the user turn — workspace session thread for in-project Ask Atlas,
  // otherwise the Nexus Living Thread.
  if (isInProjectAskAtlas && sessionId) {
    await db.insert(chatMessagesTable).values({ sessionId, role: "user", content: message });
    await db
      .update(sessionsTable)
      .set({ messageCount: sql`${sessionsTable.messageCount} + 1` })
      .where(eq(sessionsTable.id, sessionId));
  } else {
  try {
    await db.insert(nexusMessagesTable).values({
      userId,
      role: "user",
      content: message,
      projectId: focusProjectId ?? null,
      sessionId,
      conversationId: effectiveConversationId,
      ...(hasMessageType ? { messageType: "message" } : {}),
    });
  } catch (dbErr: any) {
    const errMsg = dbErr?.message ?? "";
    const isMissingColumn = errMsg.includes("column") && errMsg.includes("does not exist");
    if (isMissingColumn) {
      logger.warn({ dbErr: errMsg }, "DB schema behind on nexus user insert — falling back to core insert");
      await db.insert(nexusMessagesTable).values({
        userId,
        role: "user",
        content: message,
        projectId: focusProjectId ?? null,
        sessionId,
        conversationId: effectiveConversationId,
      });
    } else {
      throw dbErr;
    }
  }
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Emit meta early so the frontend can suppress run cards / Tier1 / timeline
  // on non-BUILD turns before the first text delta arrives.
  // Classification already ran before prompt assembly (see above).
  if (!res.writableEnded && !res.destroyed) {
    res.write(`event: meta\ndata: ${JSON.stringify({ intent, justTalk: !!justTalk, fallback: whisperFallback })}\n\n`);
  }

  // ── Run identity spine ──────────────────────────────────────────────────
  // Mint (or accept) a stable runId that spans the whole turn: pre-inserted
  // `running` row → live steps → completion UPDATE → Timeline/Changes reads.
  // See handoff: identity spans user turn → thinking → live steps → Timeline
  // → Changes → completion → receipt → reload.
  const clientRunId = typeof body.runId === "string" && /^[0-9a-fA-F-]{8,}$/.test(body.runId) ? body.runId : null;
  const willPersistRun = !!focusProjectId && !isChatTurn;
  const activeRunId: string | null = willPersistRun ? (clientRunId ?? randomUUID()) : null;
  // Hoisted above the pre-insert block so insertRunningExecutionRun and the
  // failure-record path in finishStream can both reference turnStartedAt.
  const turnStartedAt = new Date();
  const runActions: RunAction[] = [];
  let runPreInserted = false;
  let runTerminalized = false;
  let liveStepOrderIdx = 0;
  // v1.4: track DECIDE-turn mode escalation and last advance_execution_state result
  let escalatedToInvestigate = false;
  let lastExecutionState: string | null = null;
  let lastRunOutcome: unknown = null;
  if (activeRunId && focusProjectId) {
    // Fire pre-insert immediately (fire-and-forget) so Timeline can filter by
    // runId within ~1s of the tap. Errors are non-fatal — completion path
    // still works via ON CONFLICT DO NOTHING.
    void insertRunningExecutionRun({
      runId: activeRunId,
      projectId: focusProjectId,
      sessionId,
      conversationId: effectiveConversationId,
      userMessage: body.message ?? "",
      intent,
      mode: allowBuildSideEffects ? "build" : intent === "DECIDE" ? "decide" : "conversation",
      // v1.4: initial epistemic posture — BUILD→EXECUTE, all else→EXPLORE
      // (DECIDE turns may escalate to INVESTIGATE lazily via recordModeEscalation)
      runMode: allowBuildSideEffects ? "EXECUTE" : "EXPLORE",
      startedAt: turnStartedAt,
    });
    runPreInserted = true;
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: run\ndata: ${JSON.stringify({ runId: activeRunId, conversationId: effectiveConversationId })}\n\n`);
    }
  }

  // Terminal cleanup — if the client disconnects or the request aborts before
  // finishStream marks the run terminalized, mark it cancelled so no `running`
  // row is orphaned in the ledger.
  req.on("close", () => {
    if (activeRunId && runPreInserted && !runTerminalized) {
      void db.execute(sql`
        UPDATE execution_runs
        SET status = 'cancelled', completed_at = now(),
            elapsed_ms = ${Math.max(0, Date.now() - turnStartedAt.getTime())}
        WHERE id = ${activeRunId} AND status = 'running'
      `).catch(() => { /* non-fatal */ });
    }
  });



  if (justTalk) {
    systemPrompt += `\n\n--- JUST TALK MODE ACTIVE ---\nJUST TALK MODE ACTIVE — the user has explicitly disabled build actions. Do not build, edit, run, create, deploy, or modify anything. Do not call tools. Do not propose file writes. Respond conversationally only. If the user asks for a build action, acknowledge and ask them to turn Just Talk off first.\n--- END JUST TALK MODE ---`;
  } else if (conversationModeActive) {
    systemPrompt += `\n\n--- CONVERSATION MODE ACTIVE ---\nThe user has switched this thread to Conversation Mode. Do not call any tools, propose file edits, or take build actions — none are available this turn. Respond as a thinking partner only: discuss, brainstorm, question, and reason in prose. If the user asks you to build or change something, say you're in Conversation Mode and ask them to switch to Build Mode to proceed.\n--- END CONVERSATION MODE ---`;
  } else if (intent === "CHAT") {
    systemPrompt += `\n\n--- WHISPERGATE INTENT: CHAT ---\nThis is a conversational turn. The user is NOT asking you to build, edit, deploy, generate files, or perform operations. Respond with prose only. Do NOT call tools. Do NOT propose file writes. Do NOT emit FILE_EDIT_START, LINE_PATCH_START, GITHUB_PUSH, or REPO_LINK. Do NOT give a project status briefing or unsolicited progress recap. Just talk with the user like a thoughtful partner — a short greeting gets a short greeting back.

HARD OUTPUT RULE — ZERO EXCEPTIONS: You must NEVER end a response with language that promises future retrieval or action without delivering it in this same response. The following phrases are forbidden as terminal statements:
- "give me a second"
- "let me look"
- "let me pull that up"
- "I'll pull that up"
- "I'll check"
- "I'm looking into that"
- "give me a moment"
- any variation of "I'm about to [action]" as the last thing you say

If you cannot retrieve information because tools are not available on this turn, say plainly what you don't have — e.g. "I don't have the current Ledger entries loaded in this context." If you can answer from the project context injected above, answer from it directly. Never promise an action you cannot complete in this turn.
--- END WHISPERGATE ---`;
  } else if (intent === "DECIDE") {
    systemPrompt += `\n\n--- WHISPERGATE INTENT: DECIDE ---
This is a decision turn. Give the user structured options, tradeoffs, or a recommendation.
You MAY emit DECIDE / decision blocks. You MAY call read/lookup/generate tools (search_all_projects, search_codebase, architecture_diff, project_knowledge, component_registry, read_file, list_reference_project_dir, read_reference_project_file, generate_deliverable) to ground your answer in real project data — if the user asks you to search, compare, look up, discover, or generate a document/deck/summary, actually call the tool this turn instead of just saying "let me look into that." Do NOT emit FILE_EDIT_START, LINE_PATCH_START, GITHUB_PUSH, or start a code build unless the user explicitly approves that action in a later turn — those remain BUILD-only.

CRITICAL — VISIBLE PROSE IS MANDATORY: Your response MUST contain visible prose. Structured blocks (TRADEOFF_START/END, CLARIFY_START/END, MEMORY_CHIP, CONV_STATE, DECISION_ARTIFACT) are supplements — they are NEVER the entire response. Always write at least one paragraph of readable text before or alongside any structured block. A response made up entirely of structured tokens renders as blank to the user. If you are about to emit only a structured block with no prose, write your reasoning in plain sentences first.

CLARIFICATION CARDS — use when the request is under-specified:
If the user's request has a clear action intent but the TARGET is ambiguous (vague pronoun, no named component, conflicting scope), emit a CLARIFY card. CRITICAL: you must NEVER ask clarification questions in prose — if you need to clarify, emit the structured block below and ONLY that block. A prose question ("What would you like the header to say?") is not a CLARIFY card and will confuse the user.

Emit exactly this block (strip from prose, the backend extracts it):
CLARIFY_START
{"steps":[{"question":"<one focused question>","options":["<option A>","<option B>","<option C>"],"allowFreeText":true,"reason":"<why you need this>"}]}
CLARIFY_END

Rules:
- 2–4 options per step. Max 1 step per response in most cases.
- Only emit when you genuinely cannot give useful options without clarification.
- Never emit a CLARIFY card if the conversation already contains the answer.
- If the request is clear enough to give one strong recommendation, give it — don't clarify.
- If clarification IS needed: emit the CLARIFY_START block, then stop. No prose before or after.

TRADEOFF MATRIX — use when the user faces a structural binary or multi-way architectural choice (2–4 options):
Emit when the user must choose between fundamentally different technical, product, or strategic paths and there are real tradeoffs to compare. Emit AFTER your prose recommendation. Format:
TRADEOFF_START
{"question":"<the decision>","options":[{"label":"<name>","pros":["<strength>"],"cons":["<cost>"],"atlas_leans":<true|false>}],"context":"<optional one-sentence framing>"}
TRADEOFF_END
Rules: 2–4 options only. Each option: 1–3 pros, 1–3 cons. At most ONE atlas_leans:true (your recommendation), or omit it if genuinely balanced. The block is extracted and rendered as a visual card — do NOT duplicate its content in prose. Skip for simple questions with a clear answer.

PLAN CONTINUATION — auto-execute the first safe step after a roadmap:
When you produce a plan or roadmap and the first "Now" item is something you can execute immediately using available read-only tools (search_codebase, read_file, project_knowledge, component_registry, list_reference_project_dir, read_reference_project_file), emit this block at the very END of your response (after all prose and structured blocks):

PLAN_CONTINUATION_START
{"gate":"execution","action":"<snake_case_action>","risk":"read_only","tools_required":["<tool1>","<tool2>"],"reason":"<one sentence: why this step is first and what it answers>","requires_user_input":false}
PLAN_CONTINUATION_END

The orchestrator will automatically execute the investigation and append findings to this turn.
Rules — the model proposes, the server authorizes:
- "risk" MUST be "read_only" — only emit for inspect/audit/verify/check/review actions.
- NEVER emit for: file edits, DNA updates, package installs, schema changes, paid API calls, GitHub push, deploy, delete, or any action that modifies project state.
- "requires_user_input" MUST be false — if a product decision is needed first, this is a decision gate; do not emit the block.
- Only one block per response. Do not nest or stack continuations.
- The continuation response MUST return: (1) what was inspected with exact file paths, (2) evidence and key observations, (3) classification (production-ready | extendable | prototype | stub | dead-code), (4) unresolved questions, (5) next gate — "decision: [what decision is needed]" OR "execution: [next safe read-only step]".
--- END WHISPERGATE ---`;
  } else if (allowBuildSideEffects) {
    systemPrompt += `\n\n--- WHISPERGATE INTENT: BUILD ---
This is a BUILD turn. The user wants you to create, edit, fix, or ship code.

Surface contract — enforce this on every BUILD response:
• CHAT BEFORE: one sentence — what is changing and why (plain language, no file listing, no code).
• FILE_EDIT / LINE_PATCH blocks: the code lives here. These are stripped from visible chat and shown in Changes. Never duplicate their content in prose.
• CHAT AFTER: one sentence — the result and what it means. Format: "[outcome]. [N] file[s] changed."
• FORBIDDEN in chat prose: source code, diffs, file contents, implementation narration, line-by-line explanation, every-file listings.

The run card, Timeline, and Changes surfaces hold all detail. Chat explains. Run card tracks. Changes shows.
Use FILE_EDIT / LINE_PATCH / GITHUB_PUSH protocols below. Prefer action over narration.
--- END WHISPERGATE ---`;
    systemPrompt += `\n\n${NEXUS_BUILD_PROTOCOLS}`;
    systemPrompt += `\n\n${ATLAS_DESIGN_INTELLIGENCE}`;
    systemPrompt += `\n\n--- VERIFICATION ENFORCEMENT ---
The execution state machine is the single authority on what has been proven.
You MUST call advance_execution_state at each milestone. Skipping any call leaves the run unverified.

MANDATORY SEQUENCE on BUILD turns that read and modify files:
1. After reading file(s) and confirming the cause:
   → call advance_execution_state(toState:"CAUSE_CONFIRMED", issueType:<type>, evidenceRefs:[], summary:"<one sentence>")
   → Use issueType based on what broke: SERVER_ROUTING for API/route bugs, CODE_COMPILE for type errors, UI_BEHAVIOR for UI bugs, CONTENT_EDIT for text/copy changes.
2. After applying a file edit or LINE_PATCH:
   → call advance_execution_state(toState:"CHANGE_APPLIED", evidenceRefs:[], summary:"<what changed>")
3. After running run_typecheck with 0 errors:
   → call advance_execution_state(toState:"BUILD_VERIFIED", evidenceRefs:[], summary:"0 errors")

Do NOT skip steps 1–3 when files are changed. They are not optional.

PROSE RULES (enforced — contradiction detection is active):
- After CHANGE_APPLIED only: write "Patch applied — running build now." Do NOT say "it works."
- After BUILD_VERIFIED: write exactly the outcome label the tool returned. For SERVER_ROUTING issues this will be "Build verified — Runtime verification pending." Do NOT say "the fix is live" or "done."
- Never assert completion in prose. The outcome badge shown to the user IS the completion signal.
--- END VERIFICATION ENFORCEMENT ---`;
  }

  // MEMORY_CHIPS protocol — all intents (P0 gap independent of BUILD).
  // BUILD segment already includes MEMORY_CHIPS; skip duplicate on BUILD.
  if (!allowBuildSideEffects) {
    systemPrompt += `\n\n${NEXUS_MEMORY_CHIPS_PROTOCOL}`;
  }

  // Non-code steps (DNA updates, decisions, plans) accumulated during the turn
  // and passed to persistNexusExecutionRun at the end.
  type _NcStep = {
    verb: string;
    target: string | null;
    detail: string | null;
    content: string | null;
    artifactUrl?: string | null;
  };
  const _nexusNonCodeSteps: _NcStep[] = [];
  // Shared across every shared-registry tool call this turn so
  // generate_deliverable can accumulate Outputs metadata for the done event
  // and ARTIFACT_CREATED timeline steps for execution_run persistence.
  const sharedSideEffects = createSideEffects();
  const writeStep = (action: RunAction) => {
    // Suppress step events on non-BUILD turns — they render as run cards.
    if (!allowBuildSideEffects) return;
    const step: RunAction = { ...action, status: action.status ?? "ok" };
    runActions.push(step);
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: step\ndata: ${JSON.stringify({ ...step, runId: activeRunId })}\n\n`);
    }
    // Incremental persistence — Timeline picks up live steps within the
    // frontend's 1.5s poll while a run is still `running`. Canonical rewrite
    // in persistNexusExecutionRun() deletes these before writing the clean set.
    if (activeRunId) {
      appendLiveStepAsync(
        activeRunId,
        String(step.verb ?? "STEP"),
        step.target ?? null,
        step.status ?? "ok",
        step.detail ?? null,
        liveStepOrderIdx++,
      );
    }
  };

  // Build contextual step labels from live data
  const focusedProject = focusProjectId ? projects.find(p => p.id === focusProjectId) : null;
  const focusLabel = focusedProject?.name ?? "all projects";
  const threadNote = dbMessages.length > 0
    ? `${dbMessages.length} message${dbMessages.length === 1 ? "" : "s"} in thread`
    : "Starting fresh";

  writeStep({ verb: "Reading", target: "conversation history", detail: threadNote });
  if (focusProjectId) {
    writeStep({ verb: "Reviewing", target: focusLabel, detail: "Loading project context and memory" });
  } else {
    writeStep({ verb: "Reviewing", target: "all projects", detail: `${projects.length} project${projects.length === 1 ? "" : "s"} in portfolio` });
  }
  if (vault.hasImages) writeStep({ verb: "Scanning", target: "visual vault", detail: "Images you've shared" });
  if (urlBlocks.length > 0) writeStep({ verb: "Captured", target: `${urlBlocks.length} URL${urlBlocks.length === 1 ? "" : "s"}`, detail: "Live screenshots taken" });

  let modelStartedAt = performance.now();
  let modelUsage: Partial<NexusRunMetadata> = {};
  let streamDone = false;
  const activeModel = model === "gemini" ? "gemini" : "claude";
  const modelUsed = activeModel === "gemini" ? "gemini-2.5-pro" : "claude-sonnet-4-6";

  const emitConversationTitle = async (assistantContent: string) => {
    if (hasWorkingTitle || res.writableEnded || res.destroyed) return;
    const explicitTitle = extractExplicitConversationTitle(assistantContent);
    const titleContext: NexusTitleMessage[] = [
      ...requestHistory,
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: assistantContent },
    ].slice(-3);
    const title = explicitTitle ?? (
      shouldAutoGenerateConversationTitle
        ? await generateConversationTitle(titleContext)
        : null
    );
    if (title && !res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify({ type: "conversationTitle", title })}\n\n`);
    }
  };

  const finishStream = async (rawContentIn: string) => {
    streamDone = true;
    let rawContent = rawContentIn;

    // Safety strip: PLAN_CONTINUATION blocks that were not consumed by the
    // continuation engine (invalid envelope, blocked by allowlist, already at
    // hop limit, or second-pass input) must never appear in visible content.
    rawContent = rawContent
      .replace(/\nPLAN_CONTINUATION_START[\s\S]*?PLAN_CONTINUATION_END(?:\n|$)/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // ── Output Guard (WhisperGate CHAT scrub) ────────────────────────────────
    // Ported from chat.ts. Must run BEFORE any FILE_EDIT / GITHUB_PUSH parsing
    // so operational markers never fire on conversational turns.
    if (intent === "CHAT" || justTalk || conversationModeActive) {
      // IMAGE_GEN is exempted when the ONLY reason we're scrubbing is the
      // (fallible) intent classifier guessing CHAT — e.g. "Are you able to
      // sketch me an image of what this would look like?" reads as a
      // capability question and gets misclassified, but the model still
      // emitted IMAGE_GEN because the user explicitly asked for a visual.
      // If the user has actually opted into Just Talk / Conversation Mode,
      // still scrub it — that's an explicit no-tools request.
      const keepImageGen = intent === "CHAT" && !justTalk && !conversationModeActive;
      const scrubbed = scrubOperationalMarkersForChat(rawContent, { keepImageGen });
      if (scrubbed.strippedMarkers.length > 0) {
        logger.info(
          { strippedMarkers: scrubbed.strippedMarkers, focusProjectId, intent },
          "nexus outputGuard: stripped operational markers on non-BUILD turn",
        );
      }
      rawContent = scrubbed.content;
    }

    // Extract and strip IMAGE_GEN tokens
    const IMAGE_GEN_RE = /^IMAGE_GEN:\s*(\{[^\n]+\})\s*$/gm;
    type ImageGenToken = { prompt: string; mode: "render" | "schematic"; size?: "square" | "landscape" | "portrait" };
    const imageGenTokens: ImageGenToken[] = [];
    rawContent = rawContent.replace(IMAGE_GEN_RE, (_match, json: string) => {
      try {
        const parsed = JSON.parse(json) as ImageGenToken;
        if (parsed.prompt && (parsed.mode === "render" || parsed.mode === "schematic")) {
          imageGenTokens.push(parsed);
        }
      } catch { /* ignore malformed tokens */ }
      return "";
    }).trim();

    // Extract and strip DECISION_ARTIFACT tokens — Atlas requests a decision artifact
    // (tradeoff matrix / decision tree / deviation log) be generated and saved.
    const DECISION_ARTIFACT_RE = /^DECISION_ARTIFACT:\s*(\{[^\n]+\})\s*$/gm;
    type DecisionArtifactToken = {
      kind: "tradeoff_matrix" | "decision_tree" | "deviation_log";
      recommended?: string;
      chosen?: string;
      reason?: string;
    };
    const decisionArtifactTokens: DecisionArtifactToken[] = [];
    rawContent = rawContent.replace(DECISION_ARTIFACT_RE, (_match, json: string) => {
      try {
        const parsed = JSON.parse(json) as DecisionArtifactToken;
        if (parsed.kind === "tradeoff_matrix" || parsed.kind === "decision_tree" || parsed.kind === "deviation_log") {
          decisionArtifactTokens.push(parsed);
        }
      } catch { /* ignore malformed tokens */ }
      return "";
    }).trim();

    // Extract and strip BROWSER_VISIT tokens — Atlas requests browser visits at end of response
    const BROWSER_VISIT_RE = /^BROWSER_VISIT:\s*(\{[^\n]+\})\s*$/gm;
    type BrowserVisitToken = { url: string; mode: "screenshot" | "scrape" | "health" | "monitor" };
    let browserVisitToken: BrowserVisitToken | null = null;
    rawContent = rawContent.replace(BROWSER_VISIT_RE, (_match, json: string) => {
      if (!browserVisitToken) {
        try {
          const parsed = JSON.parse(json) as BrowserVisitToken;
          if (parsed.url && ["screenshot", "scrape", "health", "monitor"].includes(parsed.mode)) {
            browserVisitToken = parsed;
          }
        } catch { /* ignore malformed tokens */ }
      }
      return "";
    }).trim();

    // Parse CONV_STATE — Atlas's self-reported intent classification (THINK / SHAPE / COMMIT).
    // Must parse before PROJECT_READY so we can gate CommitPill based on the state.
    const CONV_STATE_RE = /^CONV_STATE:\s*(\{[^\n]+\})\s*$/gm;
    type ConvStateValue = "THINK" | "SHAPE" | "COMMIT";
    let convState: ConvStateValue = "THINK"; // default to most conservative
    rawContent = rawContent.replace(CONV_STATE_RE, (_match, json: string) => {
      try {
        const parsed = JSON.parse(json) as { state?: string };
        if (parsed.state === "THINK" || parsed.state === "SHAPE" || parsed.state === "COMMIT") {
          convState = parsed.state;
        }
      } catch { /* ignore malformed */ }
      return "";
    }).trim();

    // THINKING_STABLE — crystallization signal. Strip from display; passed as flag in done event.
    const THINKING_STABLE_RE = /^THINKING_STABLE\s*$/gm;
    let thinkingStable = false;
    rawContent = rawContent.replace(THINKING_STABLE_RE, () => {
      thinkingStable = true;
      return "";
    }).trim();

    const PROJECT_READY_RE = /^PROJECT_READY:\s*(\{[^\n]+\})\s*$/gm;
    type ProjectReadyToken = { projectName: string; reason: string };
    let projectReadyToken: ProjectReadyToken | null = null;
    rawContent = rawContent.replace(PROJECT_READY_RE, (_match, json: string) => {
      if (!projectReadyToken) {
        try {
          const parsed = JSON.parse(json) as ProjectReadyToken;
          if (parsed.projectName) {
            projectReadyToken = parsed;
          }
        } catch { }
      }
      return "";
    }).trim();

    // Gate: in THINK mode, suppress CommitPill — recognition is not commitment.
    // PROJECT_READY only arms the pill in SHAPE or COMMIT state.
    if (convState === "THINK") {
      projectReadyToken = null;
    }

    // Image generation runs AFTER the done event to avoid blocking the HUD.
    // Defined here for use below; executed after res.write(done).
    interface NexusGeneratedImage { imageUrl: string; prompt: string; model: string; mode: "render" | "schematic"; }
    const runImageGen = async (): Promise<{ images: NexusGeneratedImage[] } | undefined> => {
      if (imageGenTokens.length === 0) return undefined;
      const nexusImages: NexusGeneratedImage[] = [];
      for (const token of imageGenTokens.slice(0, 2)) {
        const enginePrompt = token.mode === "render"
          ? `${token.prompt} Ultra-premium, cinematic quality. Sleek dark-mode aesthetic with obsidian depth, luxury glassmorphism elements, subtle amber/gold accent glows. Sophisticated editorial lighting, presentation-ready professional finish. 8K resolution quality.`
          : `${token.prompt} Clean flat 2D technical diagram. High-contrast dark background, crisp connector lines, strict geometric layout, precise spatial placement, sharp labels. Pure structural accuracy.`;
        try {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("image gen timeout")), 20_000)
          );
          const r = await Promise.race([
            genai.models.generateContent({
              model: "gemini-2.5-flash-image",
              contents: enginePrompt,
              config: { responseModalities: ["IMAGE", "TEXT"] },
            }),
            timeout,
          ]);
          const parts = r.candidates?.[0]?.content?.parts ?? [];
          const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
          const textPart = parts.find((p: any) => p.text);
          if (imagePart?.inlineData?.data) {
            nexusImages.push({
              imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
              prompt: textPart?.text ?? enginePrompt,
              model: "gemini-2.5-flash-image",
              mode: token.mode,
            });
          }
        } catch (err) {
          logger.warn({ err }, "Nexus image generation failed or timed out");
        }
      }
      return nexusImages.length > 0 ? { images: nexusImages } : undefined;
    };

    // Strip MEMORY_Tn tags from persisted output
    const { content: rawVisibleContent, memoryUpdated: parsedMemoryUpdated } = extractMemoryLines(rawContent);
    // Strip leaked control markers (INTENT_TYPE:) — belong in telemetry, not the conversation.
    let visibleContent = rawVisibleContent
      .replace(/^\s*INTENT_TYPE:\s*\S+\s*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const memoryUpdated = parsedMemoryUpdated;

    // Extract CLARIFY_START ... CLARIFY_END block — Atlas emits structured
    // clarification cards for discrete, high-leverage forks (see
    // atlasIdentity.ts "Clarification cards"). The block is stripped from
    // visible prose and shipped as `clarify` on the `done` event; the
    // frontend renders it via ClarifyCard on the assistant bubble.
    type ClarifyPayload = {
      steps: Array<{ question: string; options: string[]; allowFreeText?: boolean; reason?: string }>;
    };
    const isClarifyPayload = (value: unknown): value is ClarifyPayload => {
      if (!value || typeof value !== "object") return false;
      const steps = (value as { steps?: unknown }).steps;
      return Array.isArray(steps) && steps.length > 0 && steps.every((step) => {
        if (!step || typeof step !== "object") return false;
        const c = step as { question?: unknown; options?: unknown; allowFreeText?: unknown; reason?: unknown };
        return typeof c.question === "string"
          && Array.isArray(c.options)
          && c.options.length >= 2 && c.options.length <= 4
          && c.options.every((o) => typeof o === "string")
          && (c.allowFreeText === undefined || typeof c.allowFreeText === "boolean")
          && (c.reason === undefined || typeof c.reason === "string");
      });
    };
    let clarify: ClarifyPayload | undefined;
    const CLARIFY_RE = /(?:^|\n)CLARIFY_START\s*([\s\S]*?)\s*CLARIFY_END(?:\n|$)/;
    const clarifyMatch = visibleContent.match(CLARIFY_RE);
    if (clarifyMatch) {
      try {
        const parsed = JSON.parse(clarifyMatch[1].trim()) as unknown;
        if (isClarifyPayload(parsed)) {
          clarify = parsed;
        } else {
          logger.warn({ preview: clarifyMatch[1].slice(0, 200) }, "nexus: CLARIFY block failed shape validation");
        }
      } catch (err) {
        logger.warn({ err: String(err), preview: clarifyMatch[1].slice(0, 200) }, "nexus: CLARIFY block JSON parse failed");
      }
      // Always strip the block from visible prose, even if parse/validation failed,
      // so raw JSON never leaks into the conversation.
      visibleContent = visibleContent.replace(clarifyMatch[0], "\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    // Extract TRADEOFF_START ... TRADEOFF_END block — Atlas emits structured tradeoff
    // matrices on DECIDE turns for binary/multi-way architectural or strategic choices.
    // Stripped from prose and shipped as `tradeoff` on the `done` event; the frontend
    // renders it via TradeoffMatrixCard on the assistant bubble.
    type TradeoffOption = { label: string; pros: string[]; cons: string[]; atlas_leans?: boolean };
    type TradeoffPayload = { question: string; options: TradeoffOption[]; context?: string };
    const isTradeoffPayload = (value: unknown): value is TradeoffPayload => {
      if (!value || typeof value !== "object") return false;
      const v = value as { question?: unknown; options?: unknown };
      return typeof v.question === "string"
        && Array.isArray(v.options)
        && v.options.length >= 2 && v.options.length <= 4
        && (v.options as unknown[]).every((opt) => {
          if (!opt || typeof opt !== "object") return false;
          const o = opt as { label?: unknown; pros?: unknown; cons?: unknown };
          return typeof o.label === "string"
            && Array.isArray(o.pros) && (o.pros as unknown[]).every((p) => typeof p === "string")
            && Array.isArray(o.cons) && (o.cons as unknown[]).every((c) => typeof c === "string");
        });
    };
    let tradeoff: TradeoffPayload | undefined;
    const TRADEOFF_RE = /(?:^|\n)TRADEOFF_START\s*([\s\S]*?)\s*TRADEOFF_END(?:\n|$)/;
    const tradeoffMatch = visibleContent.match(TRADEOFF_RE);
    if (tradeoffMatch) {
      try {
        const parsed = JSON.parse(tradeoffMatch[1].trim()) as unknown;
        if (isTradeoffPayload(parsed)) {
          tradeoff = parsed;
        } else {
          logger.warn({ preview: tradeoffMatch[1].slice(0, 200) }, "nexus: TRADEOFF block failed shape validation");
        }
      } catch (err) {
        logger.warn({ err: String(err), preview: tradeoffMatch[1].slice(0, 200) }, "nexus: TRADEOFF block JSON parse failed");
      }
      // Strip block from prose even on parse failure.
      visibleContent = visibleContent.replace(tradeoffMatch[0], "\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    // Extract NEXT_SUGGESTIONS marker — one-tap continuation chips. Discipline
    // matches clarification cards: emitted only when the model judges the next
    // moves are discrete and useful. Format: NEXT_SUGGESTIONS:["chip","chip"]
    let nextSuggestions: string[] | undefined;
    const NEXT_SUGGESTIONS_RE = /^NEXT_SUGGESTIONS:\s*(\[.*?\])\s*$/im;
    const suggestionsMatch = visibleContent.match(NEXT_SUGGESTIONS_RE);
    if (suggestionsMatch) {
      try {
        const parsed = JSON.parse(suggestionsMatch[1]) as unknown;
        if (Array.isArray(parsed)) {
          const chips = (parsed as unknown[])
            .filter((c): c is string => typeof c === "string" && c.trim().length > 0 && c.length <= 72)
            .slice(0, 4);
          if (chips.length >= 2) nextSuggestions = chips;
        }
      } catch (err) {
        logger.warn({ err: String(err), preview: suggestionsMatch[1].slice(0, 200) }, "nexus: NEXT_SUGGESTIONS parse failed");
      }
      visibleContent = visibleContent.replace(NEXT_SUGGESTIONS_RE, "").replace(/\n{3,}/g, "\n\n").trim();
    }

    // ── Builder emitters (FILE_EDIT / LINE_PATCH / GITHUB_PUSH / MEMORY_CHIPS) ──
    // Ported from chat.ts for workspace BUILD parity. Gating:
    //   FILE_EDIT / LINE_PATCH / GITHUB_PUSH → only when allowBuildSideEffects
    //   MEMORY_CHIPS → all intents
    let responseFileEdits: FileEdit[] = [];
    let responseLinePatches: LinePatch[] = [];
    let githubPushResult: GithubPushResult | null = null;
    let githubPushDone: { commitSha: string; ledgerEntryId: string } | null = null;
    let autoApplied = false;
    const autoAppliedPaths: string[] = [];
    let allChips: MemoryChipRich[] = [];

    // Extract GITHUB_PUSH token (strip from content regardless; execute only on BUILD)
    const { content: afterGithubPush, token: githubPushToken } = extractGithubPushToken(visibleContent);
    visibleContent = afterGithubPush;

    // MEMORY_CHIPS — detect on full content BEFORE FILE_EDIT/LINE_PATCH stripping,
    // because those extractors keep only the prose before the first block and would
    // drop a trailing MEMORY_CHIPS marker (models emit chips at the end).
    const { content: afterChipsEarly, memoryChips: aiMemoryChips } = detectMemoryChips(visibleContent);
    visibleContent = afterChipsEarly;

    // Defensive fallback: convert any stray WRITE_FILE:{...} marker (a non-standard,
    // never-parsed protocol) into a real FILE_EDIT before the structured parsers run,
    // so it can never silently vanish while the response text claims it was written.
    const { visibleContent: afterWriteFileMarkers, fileEdits: writeFileMarkerEdits } =
      convertWriteFileMarkersToFileEdits(visibleContent);
    visibleContent = afterWriteFileMarkers;

    // Parse LINE_PATCH → FILE_EDIT → FILE_DELETE → FILE_MOVE
    const { visibleContent: afterPatches, linePatches: parsedLinePatches } = extractAllLinePatches(visibleContent);
    const { visibleContent: afterEdits, fileEdits: parsedFileEditsRaw } = extractAllFileEdits(afterPatches);
    const parsedFileEdits = [...parsedFileEditsRaw, ...writeFileMarkerEdits];
    const { visibleContent: afterDeletes } = extractAllFileDeletes(afterEdits);
    const { visibleContent: afterMoves } = extractAllFileMoves(afterDeletes);
    visibleContent = afterMoves;

    const focusEntriesForChips = focusProjectId
      ? committedEntries.filter((e) => e.projectId === focusProjectId)
      : [];
    const entryChipStrings = matchEntryChips(
      visibleContent,
      focusEntriesForChips.map((e) => ({ id: e.id, title: e.title, status: "committed" })),
    );
    allChips = mergeMemoryChips(aiMemoryChips, entryChipStrings);

    // BUILD-gated file changes + Output Guard critical-path check
    if (allowBuildSideEffects) {
      const hasProposedFileChanges = parsedFileEdits.length > 0 || parsedLinePatches.length > 0;
      let repoFiles: Set<string> | null = null;
      if (focusProjectId && hasProposedFileChanges) {
        try {
          const wsDir = await ensureProjectWorkspaceDir(focusProjectId);
          const collect = async (dir: string, base: string, out: Set<string>) => {
            let entries: import("node:fs").Dirent[];
            try {
              entries = await fsPromises.readdir(dir, { withFileTypes: true });
            } catch {
              return;
            }
            for (const entry of entries) {
              if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
              const rel = base ? `${base}/${entry.name}` : entry.name;
              if (entry.isDirectory()) await collect(`${dir}/${entry.name}`, rel, out);
              else out.add(rel);
            }
          };
          repoFiles = new Set<string>();
          await collect(wsDir, "", repoFiles);
        } catch {
          repoFiles = null;
        }
      }

      // If the previous turn asked for explicit approval and the user just replied with an
      // explicit "yes", let this turn's edits through even if they touch the same critical
      // path — otherwise the gate re-blocks forever and "yes" never has any effect.
      const fileChangesAllowed =
        !hasProposedFileChanges ||
        canProceedWithFileChanges({
          fileEdits: parsedFileEdits,
          linePatches: parsedLinePatches,
          repoFiles,
        }) ||
        userConfirmedPendingChanges(message, conversationHistory);

      if (hasProposedFileChanges && !fileChangesAllowed) {
        visibleContent = `${visibleContent}\n\nThese changes touch files that require confirmation before applying. Reply to confirm and I'll proceed.`.trim();
      }

      if (isWriteClaimWithoutEmission(visibleContent, hasProposedFileChanges)) {
        visibleContent +=
          "\n\n⚠️ [NO_FILES_WRITTEN] This response described code changes but emitted no FILE_EDIT blocks. The workspace was NOT modified. Please send your FILE_EDIT blocks now.";
      }

      responseFileEdits = fileChangesAllowed ? parsedFileEdits : [];
      responseLinePatches = fileChangesAllowed ? parsedLinePatches : [];

      // Auto-apply FILE_EDIT blocks to the local workspace
      if (responseFileEdits.length > 0 && focusProjectId) {
        try {
          const wsDir = await ensureProjectWorkspaceDir(focusProjectId);
          for (const edit of responseFileEdits) {
            writeStep({ verb: "Writing", target: edit.path, detail: "FILE_EDIT" });
            const absPath = resolveWorkspacePath(wsDir, edit.path);
            await fsPromises.mkdir(nodePath.dirname(absPath), { recursive: true });
            await fsPromises.writeFile(absPath, edit.content, "utf-8");
            autoAppliedPaths.push(edit.path);
          }
          autoApplied = true;
          logger.info(
            { projectId: focusProjectId, count: autoAppliedPaths.length },
            "nexus: auto-applied FILE_EDIT blocks to local workspace",
          );
        } catch (err) {
          logger.warn({ err, projectId: focusProjectId }, "nexus: FILE_EDIT auto-apply failed");
        }
      }

      for (const patch of responseLinePatches) {
        writeStep({ verb: "Patching", target: patch.path, detail: "LINE_PATCH" });
      }

      // Execute GITHUB_PUSH when token present + project focused
      if (githubPushToken && focusProjectId) {
        const gpt = githubPushToken as GithubPushToken;
        writeStep({ verb: "Pushing to", target: gpt.branch, detail: gpt.message });
        const focusProject = projects.find((p) => p.id === focusProjectId) ?? null;
        let effectiveEdits: Array<{ path: string; content: string }> = responseFileEdits.map((fe) => ({
          path: fe.path,
          content: fe.content,
        }));
        if (effectiveEdits.length === 0) {
          const wsDir = projectWorkspaceDir(focusProjectId);
          const IGNORE = new Set(["node_modules", ".git", "dist", ".next", ".cache", ".turbo", "build", "out", "coverage"]);
          const collectFiles = async (dir: string, base: string): Promise<void> => {
            let entries: import("node:fs").Dirent[];
            try {
              entries = await fsPromises.readdir(dir, { withFileTypes: true });
            } catch {
              return;
            }
            for (const entry of entries) {
              if (IGNORE.has(entry.name) || entry.name.startsWith(".")) continue;
              const fullPath = nodePath.join(dir, entry.name);
              const relPath = nodePath.join(base, entry.name);
              if (entry.isDirectory()) {
                await collectFiles(fullPath, relPath);
              } else if (entry.isFile()) {
                try {
                  const content = await fsPromises.readFile(fullPath, "utf-8");
                  effectiveEdits.push({ path: relPath, content });
                } catch {
                  /* skip binary */
                }
              }
            }
          };
          await collectFiles(wsDir, "");
        }

        if (effectiveEdits.length === 0) {
          githubPushResult = {
            branch: gpt.branch,
            message: gpt.message,
            files: [],
            error: "No files found in workspace to push.",
          };
        } else {
          try {
            const repoFull = parseRepoFullName(focusProject?.linkedRepo ?? null) ?? parseRepo(focusProject?.linkedRepo ?? null);
            const ghToken = await resolveGithubTokenForRequest(userId, focusProject?.githubToken ?? null);
            if (repoFull && ghToken) {
              const baseBranch = gpt.base ?? "main";
              const pushBranch = gpt.branch;
              let baseSha: string | null = null;
              let resolvedBase = baseBranch;
              for (const b of [baseBranch, baseBranch === "main" ? "master" : "main"]) {
                const refResp = await fetch(`${GH_API_BASE}/repos/${repoFull}/git/ref/heads/${b}`, {
                  headers: ghApiHeaders(ghToken),
                  signal: AbortSignal.timeout(8_000),
                });
                if (refResp.ok) {
                  const d = (await refResp.json()) as { object: { sha: string } };
                  baseSha = d.object.sha;
                  resolvedBase = b;
                  break;
                }
              }

              const committedFiles: GithubPushResult["files"] = [];

              if (!baseSha) {
                for (const edit of effectiveEdits) {
                  const putBody: Record<string, unknown> = {
                    message: gpt.message,
                    content: Buffer.from(edit.content, "utf-8").toString("base64"),
                    branch: pushBranch,
                  };
                  const putResp = await fetch(`${GH_API_BASE}/repos/${repoFull}/contents/${edit.path}`, {
                    method: "PUT",
                    headers: { ...ghApiHeaders(ghToken), "Content-Type": "application/json" },
                    body: JSON.stringify(putBody),
                    signal: AbortSignal.timeout(15_000),
                  });
                  if (!putResp.ok) {
                    committedFiles.push({ path: edit.path, error: await putResp.text() });
                  } else {
                    const d = (await putResp.json()) as { commit?: { sha?: string; html_url?: string } };
                    committedFiles.push({
                      path: edit.path,
                      commitSha: d.commit?.sha,
                      commitUrl: d.commit?.html_url,
                    });
                  }
                }
              } else {
                const createResp = await fetch(`${GH_API_BASE}/repos/${repoFull}/git/refs`, {
                  method: "POST",
                  headers: { ...ghApiHeaders(ghToken), "Content-Type": "application/json" },
                  body: JSON.stringify({ ref: `refs/heads/${pushBranch}`, sha: baseSha }),
                  signal: AbortSignal.timeout(8_000),
                });
                if (!createResp.ok) {
                  const errText = await createResp.text();
                  if (!errText.includes("already exists")) throw new Error(`Branch creation failed: ${errText}`);
                }

                for (const edit of effectiveEdits) {
                  let currentSha: string | undefined;
                  const existingResp = await fetch(
                    `${GH_API_BASE}/repos/${repoFull}/contents/${edit.path}?ref=${pushBranch}`,
                    { headers: ghApiHeaders(ghToken), signal: AbortSignal.timeout(8_000) },
                  );
                  if (existingResp.ok) {
                    const d = (await existingResp.json()) as { sha?: string };
                    currentSha = d.sha;
                  }

                  const putBody: Record<string, unknown> = {
                    message: gpt.message,
                    content: Buffer.from(edit.content, "utf-8").toString("base64"),
                    branch: pushBranch,
                  };
                  if (currentSha) putBody.sha = currentSha;

                  const putResp = await fetch(`${GH_API_BASE}/repos/${repoFull}/contents/${edit.path}`, {
                    method: "PUT",
                    headers: { ...ghApiHeaders(ghToken), "Content-Type": "application/json" },
                    body: JSON.stringify(putBody),
                    signal: AbortSignal.timeout(15_000),
                  });
                  if (!putResp.ok) {
                    committedFiles.push({ path: edit.path, error: await putResp.text() });
                  } else {
                    const d = (await putResp.json()) as { commit?: { sha?: string; html_url?: string } };
                    committedFiles.push({
                      path: edit.path,
                      commitSha: d.commit?.sha,
                      commitUrl: d.commit?.html_url,
                    });
                  }
                }
              }

              const effectivePushBranch = !baseSha
                ? pushBranch !== baseBranch
                  ? pushBranch
                  : resolvedBase
                : pushBranch;
              githubPushResult = {
                branch: effectivePushBranch,
                message: gpt.message,
                files: committedFiles,
              };

              if (gpt.openPr) {
                const prTitle = gpt.prTitle ?? gpt.message;
                const prBody =
                  gpt.prBody ??
                  `Automated commit by Atlas\n\nFiles changed:\n${effectiveEdits.map((e) => `- \`${e.path}\``).join("\n")}`;
                const prResp = await fetch(`${GH_API_BASE}/repos/${repoFull}/pulls`, {
                  method: "POST",
                  headers: { ...ghApiHeaders(ghToken), "Content-Type": "application/json" },
                  body: JSON.stringify({ title: prTitle, body: prBody, head: pushBranch, base: baseBranch }),
                  signal: AbortSignal.timeout(10_000),
                });
                if (prResp.ok) {
                  const pr = (await prResp.json()) as { html_url?: string; number?: number };
                  githubPushResult.prUrl = pr.html_url;
                  githubPushResult.prNumber = pr.number;
                }
              }

              // Ledger release entry for successful push
              const commitSha =
                committedFiles.find((f) => f.commitSha)?.commitSha ?? null;
              if (commitSha && !committedFiles.some((f) => f.error)) {
                try {
                  const [ledgerRow] = await db
                    .insert(entriesTable)
                    .values({
                      projectId: focusProjectId,
                      sessionId,
                      title: `Pushed to ${effectivePushBranch}`,
                      summary: gpt.message,
                      details: `Commit ${commitSha.slice(0, 7)} — ${committedFiles.length} file(s)`,
                      status: "committed",
                      severity: "committed",
                      mode: "build",
                      amField: "buildState",
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    })
                    .returning({ id: entriesTable.id });
                  if (ledgerRow) {
                    githubPushDone = {
                      commitSha,
                      ledgerEntryId: String(ledgerRow.id),
                    };
                  }
                } catch (ledgerErr) {
                  logger.warn({ err: ledgerErr }, "nexus: GITHUB_PUSH ledger entry failed — non-fatal");
                  if (commitSha) {
                    githubPushDone = { commitSha, ledgerEntryId: "" };
                  }
                }
              }
            } else {
              githubPushResult = {
                branch: gpt.branch,
                message: gpt.message,
                files: [],
                error: "No linked repo or GitHub token found for this project.",
              };
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            githubPushResult = {
              branch: gpt.branch,
              message: gpt.message,
              files: [],
              error: msg,
            };
            logger.warn({ err }, "nexus: GITHUB_PUSH execution failed");
          }
        }

        if (githubPushResult) {
          const gpr = githubPushResult;
          if (gpr.error) {
            visibleContent =
              visibleContent.trimEnd() +
              `\n\n❌ **GitHub push failed** to \`${gpr.branch}\`: ${gpr.error}`;
            writeStep({ verb: "Push failed", target: gpr.branch, detail: gpr.error, status: "fail" });
          } else {
            const fileLines = gpr.files
              .map((f) => (f.error ? `- ❌ \`${f.path}\` — ${f.error}` : `- ✅ \`${f.path}\``))
              .join("\n");
            const prLine = gpr.prUrl ? `\n🔗 **PR opened:** [#${gpr.prNumber}](${gpr.prUrl})` : "";
            visibleContent =
              visibleContent.trimEnd() +
              `\n\n✅ **Pushed ${gpr.files.length} file${gpr.files.length !== 1 ? "s" : ""} to** \`${gpr.branch}\`${prLine}\n${fileLines}`;
            writeStep({
              verb: "Pushed",
              target: gpr.branch,
              detail: `${gpr.files.length} file(s)`,
            });
          }
        }
      }
    } else if (githubPushToken || parsedFileEdits.length > 0 || parsedLinePatches.length > 0) {
      // Non-BUILD: tokens already scrubbed on CHAT; on DECIDE strip silently if any leaked.
      logger.info(
        {
          intent,
          hadPush: !!githubPushToken,
          fileEditCount: parsedFileEdits.length,
          linePatchCount: parsedLinePatches.length,
        },
        "nexus outputGuard: ignored builder tokens on non-BUILD turn",
      );
    }

    // Guard: if all content was stripped down to signal tokens with nothing left,
    // do NOT persist a blank message to the thread — it replays as an empty
    // assistant turn that confuses the model on the next request.
    //
    // Recovery path: when structured output exists (TRADEOFF or CLARIFY blocks
    // were produced but no prose accompanies them), synthesize a minimal prose
    // hook so the structured card has something to anchor to. The frontend already
    // has TradeoffMatrixCard and ClarifyCard — we just need a non-empty
    // visibleContent so the message is persisted and the card renders correctly.
    // This is preferable to a full retry (another model call).
    //
    // Failure path: when no structured output exists to recover from, persist a
    // durable failed execution record (queryable by intent, failure reason, and
    // structured block diagnostics) then surface an error to the client.
    if (!visibleContent.trim()) {
      const hadTradeoff = !!tradeoff;
      const hadClarify = !!clarify;
      const hadMemoryChips = (aiMemoryChips?.length ?? 0) > 0;
      const hadRawContent = rawContent.trim().length > 0;

      const failureReason = hadTradeoff
        ? "structured_blocks_only_tradeoff"
        : hadClarify
        ? "structured_blocks_only_clarify"
        : hadMemoryChips
        ? "memory_chips_only"
        : hadRawContent
        ? "content_fully_scrubbed"
        : "model_no_output";

      req.log.warn(
        {
          focusProjectId,
          conversationId: effectiveConversationId,
          intent,
          failureReason,
          hadTradeoff,
          hadClarify,
          hadMemoryChips,
          rawContentLength: rawContent.length,
        },
        "nexus: empty response after token stripping — attempting recovery"
      );

      if (hadTradeoff) {
        // ── Recovery: TRADEOFF card exists, synthesize prose hook ─────────
        // The TradeoffMatrixCard will render the structured data; we only need
        // a non-empty prose anchor so the message is persisted and the card
        // attaches to a real assistant turn.
        visibleContent = "Here's a comparison of the options:";
        req.log.info(
          { focusProjectId, intent, failureReason },
          "nexus: recovered empty response — synthesized prose hook for tradeoff card"
        );
        writeStep({ verb: "Recovered", target: "response", detail: "Prose hook synthesized for tradeoff card", status: "ok" });
        // No return — visibleContent is now non-empty; execution continues to the
        // normal persist + done-event path below.
      } else if (hadClarify) {
        // ── Recovery: CLARIFY card exists, synthesize prose hook ──────────
        visibleContent = "I need a bit more information to give you the best answer:";
        req.log.info(
          { focusProjectId, intent, failureReason },
          "nexus: recovered empty response — synthesized prose hook for clarify card"
        );
        writeStep({ verb: "Recovered", target: "response", detail: "Prose hook synthesized for clarify card", status: "ok" });
        // No return — continue to normal persist path.
      } else {
        // ── Failure: no recoverable structured output ─────────────────────
        // Log a durable failed execution record so this is queryable and not
        // silently dropped. Fields: intent, failure reason, structured block
        // diagnostics (hadMemoryChips, rawContentLength).
        writeStep({ verb: "Failed", target: "response", detail: `Empty after stripping: ${failureReason}`, status: "fail" });

        if (focusProjectId != null) {
          persistNexusExecutionRun({
            runId: activeRunId,
            projectId: focusProjectId,
            sessionId,
            conversationId: effectiveConversationId,
            userMessage: message,
            atlasResponse: `[EMPTY — ${failureReason}]`,
            runActions,
            startedAt: turnStartedAt,
            intent,
            mode: allowBuildSideEffects ? "build" : intent === "DECIDE" ? "decide" : "conversation",
          }).catch((err) =>
            req.log.warn({ err }, "nexus: failed to persist empty-response failure record")
          );
        } else {
          req.log.warn(
            { intent, failureReason, conversationId: effectiveConversationId },
            "nexus: empty response without projectId — skipping failure record persist"
          );
        }

        if (!res.writableEnded && !res.destroyed) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: "empty_response", message: "Atlas didn't generate a response. Please try again." })}\n\n`);
          res.end();
        }
        return;
      }
    }

    writeStep({ verb: "Saved", target: "response", detail: "Thread updated" });

    // Execute BROWSER_VISIT if Atlas emitted one — emit visiting step so UI shows the globe indicator
    if (browserVisitToken) {
      const bvt = browserVisitToken as BrowserVisitToken;
      writeStep({ verb: "Visiting", target: bvt.url });
      try {
        const endpointMap: Record<BrowserVisitToken["mode"], string> = {
          screenshot: "screenshot",
          scrape: "scrape",
          health: "health",
          monitor: "monitor",
        };
        const bodyByMode: Record<BrowserVisitToken["mode"], Record<string, unknown>> = {
          screenshot: { url: bvt.url, analyze: true },
          scrape: { url: bvt.url, maxLength: 6000, analyze: true },
          health: { url: bvt.url },
          monitor: { url: bvt.url, checkResources: true },
        };
        const bvRes = await fetch(
          `${req.protocol}://${req.get("host")}/api/browser/${endpointMap[bvt.mode]}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.cookie ?? "" },
            body: JSON.stringify(bodyByMode[bvt.mode]),
            signal: AbortSignal.timeout(60_000),
          }
        );
        if (bvRes.ok) {
          const bvData = await bvRes.json() as {
            screenshotBase64?: string; analysis?: string; isHealthy?: boolean; issues?: string[];
            hasErrors?: boolean; summary?: string; title?: string; headings?: string[];
          };
          const lines: string[] = [];
          if (bvt.mode === "health") {
            const badge = bvData.isHealthy ? "✅ Healthy" : `⚠️ ${bvData.issues?.length ?? 0} issue(s) found`;
            lines.push(`**Site check — ${bvt.url}**\n${badge}`);
            if (bvData.issues?.length) lines.push(bvData.issues.map((i: string) => `- ${i}`).join("\n"));
            if (bvData.analysis) lines.push(bvData.analysis);
          } else if (bvt.mode === "monitor") {
            const badge = bvData.hasErrors ? "⚠️ Errors detected" : "✅ No errors found";
            lines.push(`**Monitor — ${bvt.url}**\n${badge}`);
            if (bvData.summary) lines.push(bvData.summary);
          } else if (bvt.mode === "scrape") {
            lines.push(`**${bvData.title ?? bvt.url}**  \`${bvt.url}\``);
            if (bvData.analysis) lines.push(bvData.analysis);
            if (bvData.headings && bvData.headings.length > 0) {
              lines.push(`**Key sections:** ${bvData.headings.slice(0, 6).join(" · ")}`);
            }
          } else if (bvData.analysis) {
            lines.push(`**Screenshot — ${bvt.url}**\n${bvData.analysis}`);
          }
          if (lines.length > 0) {
            const appendText = "\n\n" + lines.join("\n\n");
            visibleContent = visibleContent.trimEnd() + appendText;
            // Send the browser result as a token so the streaming message shows it
            if (!res.writableEnded && !res.destroyed) {
              res.write(`event: token\ndata: ${JSON.stringify(appendText)}\n\n`);
            }
          }
        }
      } catch (err) {
        logger.warn({ err: String(err), url: bvt.url, mode: bvt.mode }, "BROWSER_VISIT execution failed in nexus");
      }
    }

    // Execute DECISION_ARTIFACT tokens — generate + persist tradeoff matrix / decision
    // tree / deviation log artifacts requested by Atlas, then attach to the done event
    // so the frontend can render them inline as cards.
    const decisionArtifactResults: Array<Awaited<ReturnType<typeof saveDecisionArtifact>>> = [];
    if (decisionArtifactTokens.length > 0 && focusProjectId) {
      const decisionContext = await buildContextFromMessages(conversationHistory);
      for (const token of decisionArtifactTokens.slice(0, 2)) {
        try {
          let payload: Record<string, unknown> | null = null;
          if (token.kind === "tradeoff_matrix") payload = await generateTradeoffMatrixPayload(decisionContext);
          else if (token.kind === "decision_tree") payload = await generateDecisionTreePayload(decisionContext);
          else payload = await generateDeviationLogPayload(decisionContext, {
            recommended: token.recommended, chosen: token.chosen, reason: token.reason,
          });
          if (!payload) continue;
          const saved = await saveDecisionArtifact({
            projectId: focusProjectId,
            sessionId: sessionId ?? null,
            type: token.kind,
            payload,
          });
          decisionArtifactResults.push(saved);
        } catch (err) {
          logger.warn({ err: String(err), kind: token.kind }, "DECISION_ARTIFACT generation failed in nexus — non-fatal");
        }
      }
    }

    const runMetadata = buildRunMetadata(visibleContent, {
      ...modelUsage,
      runActions: runActions.length > 0 ? runActions : null,
    });

    // Detect active mode from Atlas's response
    const lowerContent = visibleContent.toLowerCase();
    const detectedMode: string = (() => {
      const auditSignals = ["broken", "gap", "risk", "fragile", "inconsistent", "conflict", "missing", "dead end", "what's wrong", "fix", "⚠️"];
      const deepSignals = ["let's go deeper", "specifically", "zoom in", "focused on", "only this", "this one"];
      const auditScore = auditSignals.filter(s => lowerContent.includes(s)).length;
      const deepScore = deepSignals.filter(s => lowerContent.includes(s)).length;
      if (auditScore >= 2) return "audit";
      if (deepScore >= 2) return "deep-dive";
      return "strategic";
    })();

    // Detect if Atlas keeps referencing one project and suggest focus
    const projectMentions = ideaMode ? [] : projects.map(p => ({
      id: p.id,
      name: p.name,
      count: (lowerContent.match(new RegExp(p.name.toLowerCase(), "g")) ?? []).length
    })).filter(p => p.count >= 2).sort((a, b) => b.count - a.count);

    const focusSuggestion = !focusProjectId && projectMentions.length > 0
      ? { projectId: projectMentions[0].id, projectName: projectMentions[0].name }
      : null;

    // R2: detectHomeHandoff() removed — PROJECT_READY token is the sole project-creation signal.
    // The frontend synthesises a CommitPill from projectReadyToken when no handoffSignal is present,
    // so the UX is preserved while eliminating the competing-signal FM-3 failure mode.
    // Capture cards fire on Commit (or BUILD), never on CHAT / DECIDE-classification alone.
    const allowCaptureCards = !isChatTurn && (
      allowBuildSideEffects || isExplicitCommitTurn(message, convState)
    );
    // DECIDE turns also get draft capture — user sees a confirm chip, nothing is auto-committed.
    const allowDecideDraft = intent === "DECIDE" && !isChatTurn && focusProjectId != null;
    let surface = ideaMode || isChatTurn
      ? null
      : detectSurfaceSignal({
          content: visibleContent,
          userMessage: message,
          recentMessages: conversationHistory,
        });
    if (surface?.type === "DECISION" && !allowCaptureCards && !allowDecideDraft) {
      surface = null;
    }

    let catchPayload: Awaited<ReturnType<typeof detectDecisionCatch>> = null;
    if (focusProjectId && !isChatTurn) {
      try {
        catchPayload = await detectDecisionCatch({
          projectId: focusProjectId,
          userId,
          userText: message,
          assistantText: visibleContent,
          intent,
          confidence: whisperConfidence,
          sessionId,
        });
      } catch (err) {
        logger.warn({ err: String(err) }, "decisionCatch: nexus detection failed");
      }
    }

    // Persist the assistant response — workspace session thread for in-project Ask Atlas,
    // otherwise the Nexus Living Thread (with optional mirror into chat_messages).
    let nexusMsgId: number | null = null;
    let sourceChatMessageId: number | null = null;
    if (isInProjectAskAtlas && sessionId) {
      try {
        const [chatMsg] = await db
          .insert(chatMessagesTable)
          .values({
            sessionId,
            role: "assistant",
            content: visibleContent,
            catchPayload: catchPayload ?? undefined,
            executionTimeMs: runMetadata.executionTimeMs,
            inputTokens: runMetadata.inputTokens,
            outputTokens: runMetadata.outputTokens,
            costUsd: runMetadata.costUsd != null ? runMetadata.costUsd.toFixed(5) : null,
            runStatus: runMetadata.runStatus,
            runSummary: runMetadata.runSummary,
            runActions: runMetadata.runActions,
            runArtifacts: runMetadata.runArtifacts,
            ...(responseFileEdits.length > 0
              ? { fileEditsJson: JSON.stringify(responseFileEdits) }
              : {}),
            ...(responseLinePatches.length > 0
              ? { linePatchesJson: JSON.stringify(responseLinePatches) }
              : {}),
          })
          .returning({ id: chatMessagesTable.id });
        sourceChatMessageId = chatMsg?.id ?? null;
        await db
          .update(sessionsTable)
          .set({
            messageCount: sql`${sessionsTable.messageCount} + 1`,
            ...runMetadata,
          })
          .where(eq(sessionsTable.id, sessionId));
      } catch (dbErr) {
        logger.warn({ err: dbErr }, "nexus: failed to persist in-project Ask Atlas assistant turn");
      }
    } else {
    try {
      const [nexusMsg] = await db.insert(nexusMessagesTable).values({
        userId,
        role: "assistant",
        content: visibleContent,
        projectId: focusProjectId ?? null,
        sessionId,
        conversationId: effectiveConversationId,
        ...(hasMessageType ? { messageType: "message" } : {}),
      }).returning({ id: nexusMessagesTable.id });
      nexusMsgId = nexusMsg?.id ?? null;
    } catch (dbErr: any) {
      const errMsg = dbErr?.message ?? "";
      const isMissingColumn = errMsg.includes("column") && errMsg.includes("does not exist");
      if (isMissingColumn) {
        logger.warn({ dbErr: errMsg }, "DB schema behind on nexus assistant insert — falling back to core insert");
        const [nexusMsg] = await db.insert(nexusMessagesTable).values({
          userId,
          role: "assistant",
          content: visibleContent,
          projectId: focusProjectId ?? null,
          sessionId,
          conversationId: effectiveConversationId,
        }).returning({ id: nexusMessagesTable.id });
        nexusMsgId = nexusMsg?.id ?? null;
      } else {
        throw dbErr;
      }
    }
    }
    await updateSessionRunMetadata(sessionId, runMetadata).catch((err) => {
      logger.warn({ err }, "updateSessionRunMetadata failed — continuing");
    });

    // Persist conversation turn to execution_runs + execution_run_steps so the Timeline
    // in ViewChangesPanel shows this turn's activity (file reads, summary, non-code changes).
    // CHAT / Just Talk never write an execution_run row.
    // BUILD always may persist. DECIDE persists when there is timeline-worthy activity
    // (questions, DNA updates, decisions) so QUESTION_ASKED / DECISION_RECORDED appear.
    const extractTrailingQuestion = (text: string): string | null => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      for (let i = paragraphs.length - 1; i >= 0; i--) {
        const p = paragraphs[i];
        if (p.endsWith("?") && p.length >= 12 && p.length <= 600 && !p.includes("```")) {
          const sentences = p.split(/(?<=\?)\s+/).filter((s) => s.trim().endsWith("?"));
          return (sentences[sentences.length - 1] ?? p).trim().slice(0, 800);
        }
      }
      const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.endsWith("?") && line.length >= 12 && line.length <= 400) return line;
      }
      return null;
    };

    if (intent === "DECIDE" && !isChatTurn) {
      const q = extractTrailingQuestion(visibleContent);
      if (q) {
        _nexusNonCodeSteps.push({
          verb: "QUESTION_ASKED",
          target: null,
          detail: null,
          content: q,
        });
      }
    }

    if (surface?.type === "DECISION" && !isChatTurn) {
      _nexusNonCodeSteps.push({ verb: "DECISION_RECORDED", target: null, detail: "captured to ledger", content: null });
    }

    // Merge any ARTIFACT_CREATED steps accumulated on sharedSideEffects that
    // weren't already pushed via writeStep (defensive — generate_deliverable
    // writes both timelineSteps and calls writeStep).
    for (const step of sharedSideEffects.timelineSteps) {
      const already = _nexusNonCodeSteps.some(
        (s) => s.verb === step.verb && s.target === step.target && s.artifactUrl === step.artifactUrl,
      );
      if (!already) _nexusNonCodeSteps.push(step);
    }

    // Persist a run row for EVERY completed project-scoped turn so Timeline is
    // a complete account of the thread (PROMPT / THOUGHT / FILE_READ / DECISION
    // / SUMMARY / etc.). Skip only pure CHAT greetings and off-project Ask Atlas
    // turns. Receipt eligibility is a SEPARATE concern handled by the frontend
    // via a verb-based classifier in WorkspaceRunCard — not by whether we
    // persisted or by the `mode` field alone.
    const shouldPersistRun = !!focusProjectId && !isChatTurn;
    if (shouldPersistRun && focusProjectId) {
      const RECEIPT_WORTHY_VERBS = new Set([
        "ARTIFACT_CREATED", "DNA_UPDATED", "GITHUB_PUSH",
        "BUILD_COMPLETED", "TEST_COMPLETED", "DEPLOY_COMPLETED", "DATABASE_CHANGE",
      ]);
      const DECISION_VERBS = new Set(["DECISION_RECORDED", "PLAN_RECORDED"]);
      const hasBuildish = allowBuildSideEffects
        || sharedSideEffects.generatedArtifacts.length > 0
        || _nexusNonCodeSteps.some((s) => RECEIPT_WORTHY_VERBS.has(s.verb));
      const hasDecision = _nexusNonCodeSteps.some((s) => DECISION_VERBS.has(s.verb));
      const runMode = hasBuildish ? "build" : hasDecision ? "decide" : "conversation";
      void persistNexusExecutionRun({
        runId: activeRunId,
        projectId: focusProjectId,
        sessionId,
        conversationId: effectiveConversationId,
        userMessage: body.message ?? "",
        atlasResponse: visibleContent,
        runActions,
        nonCodeSteps: _nexusNonCodeSteps,
        startedAt: turnStartedAt,
        intent,
        messageId: nexusMsgId ?? sourceChatMessageId,
        mode: runMode,
        // Mark as awaiting_approval when the turn proposed file changes that still
        // need a GitHub push.  The frontend sets the run to "succeeded" via
        // PATCH /api/runs/:id once the push is confirmed.
        pendingApproval: responseFileEdits.length > 0 && !githubPushDone,
      });
      runTerminalized = true;
    }

    // Background genome extraction — non-blocking, rate-limited. Skip on CHAT.
    if (!isChatTurn) {
      void maybeExtractGenome(focusProjectId ?? null, nexusMsgId);
    }

    // Conversational Timeline milestones (MILESTONE_REQUIREMENTS/DECISION/DESIGN/PLAN,
    // ARTIFACT_GENERATED) — fire-and-forget post-turn classifier.
    // Previously gated on `!isChatTurn`, which dropped real decisions/plans
    // that landed inside a CHAT-tagged turn (e.g. "let's go with Postgres").
    // The classifier's own prompt is already conservative about returning
    // zero milestones for small talk, so that gate was a false-negative
    // source rather than a safety net — loosened to match the chat.ts fix.
    if (focusProjectId) {
      void maybeEmitMilestones({
        projectId: focusProjectId,
        threadId: sessionId ?? null,
        messageId: nexusMsgId ?? sourceChatMessageId ?? null,
        conversationId: effectiveConversationId ?? null,
        userText: body.message ?? "",
        assistantText: visibleContent,
        intent,
        startedAt: turnStartedAt,
      });
    }

    // Thinking receipt extraction — global Ask Atlas turns only (no project focus).
    // CHAT greetings must not write memory.
    if (!isChatTurn && !isInProjectAskAtlas && !focusProjectId && effectiveConversationId) {
      void maybeExtractThinkingReceipts({
        userId,
        conversationId: effectiveConversationId,
        turnIndex: Math.floor(dbMessages.length / 2),
        userMessage: body.message ?? "",
        atlasResponse: visibleContent,
        stable: thinkingStable,
      });
    }

    // Tier 1 slot extraction — BUILD turns only (fire-and-forget).
    // CHAT/DECIDE/Just Talk must never trigger Tier1 field writes.
    if (allowBuildSideEffects && focusProjectId && userId && (body.message ?? "").length > 0) {
      void maybeExtractTier1Slots({
        projectId: focusProjectId,
        userId,
        turnIndex: Math.floor(dbMessages.length / 2),
        recentTurns: [
          ...dbMessages.slice(-7).map((m: { role: unknown; content: unknown }) => ({
            role: String(m.role),
            content: String(m.content),
          })),
          { role: "assistant", content: visibleContent },
        ],
      });
    }

    // Global narrative synthesis — skip CHAT and in-project workspace turns
    if (!isChatTurn && !isInProjectAskAtlas) {
      void synthesizeGlobalNarrative({
        userId,
        userMessage: body.message ?? "",
        atlasResponse: visibleContent,
      });
      // Identity profile synthesis — fire alongside narrative, uses longer cooldown.
      // Captures who the person IS (name, tone, work style), not what they're working on.
      void synthesizeUserIdentity({
        userId,
        userName: (userNarrativeRow as any)?.name ?? null,
      });
    }

    // Mirror assistant turn into workspace chat_messages when a session is linked
    // on a global Nexus turn (in-project turns persist directly above).
    if (!isInProjectAskAtlas && sessionId) {
      try {
        const [chatMsg] = await db
          .insert(chatMessagesTable)
          .values({
            sessionId,
            role: "assistant",
            content: visibleContent,
            catchPayload: catchPayload ?? undefined,
            executionTimeMs: runMetadata.executionTimeMs,
            inputTokens: runMetadata.inputTokens,
            outputTokens: runMetadata.outputTokens,
            costUsd: runMetadata.costUsd != null ? runMetadata.costUsd.toFixed(5) : null,
            runStatus: runMetadata.runStatus,
            runSummary: runMetadata.runSummary,
            runActions: runMetadata.runActions,
            runArtifacts: runMetadata.runArtifacts,
            ...(responseFileEdits.length > 0
              ? { fileEditsJson: JSON.stringify(responseFileEdits) }
              : {}),
            ...(responseLinePatches.length > 0
              ? { linePatchesJson: JSON.stringify(responseLinePatches) }
              : {}),
          })
          .returning({ id: chatMessagesTable.id });
        sourceChatMessageId = chatMsg?.id ?? null;
      } catch (dbErr) {
        logger.warn({ err: dbErr }, "nexus: failed to mirror assistant message to chat_messages");
      }
    }

    // Draft-capture DECISION signal to Ledger — fires on BUILD+commit turns (allowCaptureCards)
    // AND on DECIDE turns (allowDecideDraft). Creates a parked entry; user confirms via inline
    // chip. Nothing is auto-committed without explicit user action.
    //
    // Two triggers:
    //   A) surface?.type === "DECISION" — assistant response contains decision markers
    //   B) allowDecideDraft + user message has explicit commitment language
    //      (catches "I've decided to go with X" even when Atlas gives a brief ack)
    const USER_COMMIT_RE = /\b(i('ve| have) decided|we('re| are) going with|going with|settling on|settled on|committing to|committed to|decided on|off the table|that's settled|it's decided|no more.*debate)\b/i;
    const userHasCommitmentSignal = USER_COMMIT_RE.test(message);
    const shouldCaptureDraft = focusProjectId &&
      (allowCaptureCards || allowDecideDraft) &&
      (surface?.type === "DECISION" || (allowDecideDraft && userHasCommitmentSignal));

    let decisionDraft: { entryId: number; title: string } | null = null;
    if (shouldCaptureDraft && focusProjectId) {
      decisionDraft = await draftCaptureLedgerDecision({
        projectId: focusProjectId,
        userId,
        sessionId,
        content: visibleContent,
        sourceMessageId: sourceChatMessageId,
      });
    }

    await emitConversationTitle(visibleContent);

    // ── v1.4 Server-driven execution state auto-advance ─────────────────────
    // Anthropic streaming turns are TEXT-OR-TOOLS, never both in sequence.
    // When the model emits LINE_PATCH via the text-stream protocol it cannot
    // also call advance_execution_state as a tool call in the same turn.
    // If the model skipped the tool but we have direct evidence in runActions,
    // the server advances the state machine here so the done event carries a
    // real RunOutcome (which the AssistantBubble renders as the outcome footer).
    // This is a trusted server path — evidence validation is bypassed (isServerDriven).
    if (!lastExecutionState && activeRunId && allowBuildSideEffects && focusProjectId && userId) {
      try {
        const hasFileRead = runActions.some(
          a => (a.verb === "Read" || a.verb === "Reading") && a.target && !a.target.includes(" "),
        );
        const hasPatch = runActions.some(a => ["Patching", "Writing", "Written"].includes(a.verb));
        const hasTypecheck = runActions.some(
          a => a.verb === "Typechecking" && a.status !== "fail",
        );

        if (hasFileRead || hasPatch) {
          // Initialize the contract (UNKNOWN → same required steps as SERVER_ROUTING).
          await initializeRunContract({ runId: activeRunId, issueType: "UNKNOWN" });

          // Drive through the state chain based on evidence observed in runActions.
          const steps: Array<{ toState: Parameters<typeof advanceRunExecutionState>[0]["toState"]; summary: string }> = [];
          if (hasFileRead) {
            steps.push({ toState: "INVESTIGATING",   summary: "File inspection in progress" });
            steps.push({ toState: "CAUSE_CONFIRMED", summary: "Cause identified from file inspection" });
          }
          if (hasPatch) {
            if (!hasFileRead) {
              // No investigation steps — still need to reach CAUSE_CONFIRMED first.
              steps.push({ toState: "INVESTIGATING",   summary: "File inspection (inferred)" });
              steps.push({ toState: "CAUSE_CONFIRMED", summary: "Cause identified (inferred)" });
            }
            // CAUSE_CONFIRMED → CHANGE_PROPOSED → CHANGE_APPLIED (topology requires intermediate)
            steps.push({ toState: "CHANGE_PROPOSED", summary: "Patch plan identified" });
            steps.push({ toState: "CHANGE_APPLIED",  summary: "Patch applied via LINE_PATCH" });
          }
          if (hasTypecheck) {
            steps.push({ toState: "BUILD_VERIFIED", summary: "Build passed" });
          }

          let lastResult: Awaited<ReturnType<typeof advanceRunExecutionState>> | null = null;
          const conversationIdForSM = effectiveConversationId ?? `run-${activeRunId}`;
          for (const step of steps) {
            const result = await advanceRunExecutionState({
              runId: activeRunId,
              conversationId: conversationIdForSM,
              userId,
              toState: step.toState,
              issueType: "UNKNOWN",
              evidenceRefs: [],
              summary: step.summary,
              isServerDriven: true,
            });
            if (result.ok) {
              lastResult = result;
            } else {
              // State machine may reject duplicate/invalid transitions — stop the chain.
              req.log.warn({ runId: activeRunId, step: step.toState, err: result.error },
                "nexus: server auto-advance halted at step");
              break;
            }
          }

          if (lastResult?.ok) {
            lastExecutionState = lastResult.executionState;
            lastRunOutcome = lastResult.outcome ?? null;
          }
        }
      } catch (autoAdvErr) {
        req.log.warn({ err: autoAdvErr }, "nexus: server auto-advance failed — non-fatal");
      }
    }
    // ── end server-driven auto-advance ───────────────────────────────────────

    // Navigation intent is sent as structured data in the done event — never as a text token.
    // The frontend renders a suggestion card; the user decides when to navigate.
    // Send done immediately — HUD clears now regardless of image generation speed.
    // Builder fields (memoryChips, linePatches, fileEdits, githubPush, githubPushResult)
    // match chat.ts done-event field names exactly for frontend parity.
    const fileEditSummaries =
      responseFileEdits.length > 0 ? summarizeFileEdits(responseFileEdits) : undefined;
    res.write(`event: done\ndata: ${JSON.stringify({
      content: visibleContent,
      runId: activeRunId,
      ...(lastExecutionState ? { executionState: lastExecutionState, executionOutcome: lastRunOutcome } : {}),
      modelUsed,
      surface,
      memoryUpdated,
      detectedMode,
      focusSuggestion,
      ...(isInProjectAskAtlas
        ? { sessionId, projectId: requestedProjectId, inProjectAskAtlas: true }
        : { conversationId: effectiveConversationId }),
      convState,
      catchPayload: catchPayload ?? undefined,
      ...(clarify ? { clarify } : {}),
      ...(tradeoff ? { tradeoff } : {}),
      ...(decisionArtifactResults.length > 0 ? { decisionArtifacts: decisionArtifactResults } : {}),
      ...(sharedSideEffects.generatedArtifacts.length > 0
        ? { generatedArtifacts: sharedSideEffects.generatedArtifacts }
        : {}),
      ...(decisionDraft ? { decisionDraft } : {}),
      ...(nextSuggestions ? { nextSuggestions } : {}),
      ...(thinkingStable ? { thinkingStable: true } : {}),
      ...(pendingNavProjectId !== null
        ? {
            navigateTo: {
              // Prefer /workspace/<conversationId> so the workspace mounts with
              // the adopted Ask Atlas thread pre-selected — no race between
              // navigation and the DB adoption UPDATE.
              route: effectiveConversationId
                ? `/workspace/${effectiveConversationId}`
                : `/project/${pendingNavProjectId}`,
              projectId: pendingNavProjectId,
              projectName: pendingNavProjectName,
            },
          }
        : {}),
      ...(projectReadyToken ? { projectReady: projectReadyToken } : {}),
      // Builder emitters — same field names as /api/chat
      ...(allChips.length > 0 ? { memoryChips: allChips } : {}),
      ...(responseFileEdits.length > 0
        ? { fileEdits: responseFileEdits, fileEdit: responseFileEdits[0] }
        : {}),
      ...(fileEditSummaries ? { fileEditSummaries } : {}),
      ...(responseLinePatches.length > 0 ? { linePatches: responseLinePatches } : {}),
      ...(githubPushResult ? { githubPushResult } : {}),
      ...(githubPushDone ? { githubPush: githubPushDone } : {}),
      ...(autoApplied ? { autoApplied: true, autoAppliedPaths } : {}),
      ...runMetadata,
    })}\n\n`);

    // Persist conv_state to project so workspace always opens with the correct posture.
    // Non-blocking: runs after SSE done is flushed so it never delays the stream.
    const convStateProjectId = pendingNavProjectId ?? focusProjectId;
    if (convStateProjectId) {
      db.update(projectsTable).set({ convState: convState.toLowerCase() }).where(eq(projectsTable.id, convStateProjectId)).catch((err: unknown) => {
        logger.warn({ err }, "nexus conv_state persist failed — non-fatal");
      });
    }

    // R7: Bidirectional ideaMode — unset when user commits so future Nexus turns don't
    // re-enter idea-posture for a conversation that has already reached COMMIT state.
    // Cast needed: TS control-flow narrows convState at this point; runtime value is correct.
    if (ideaMode && (convState as string) === "COMMIT" && sessionId) {
      db.update(sessionsTable).set({ ideaMode: false }).where(eq(sessionsTable.id, sessionId)).catch((err: unknown) => {
        logger.warn({ err }, "ideaMode unset on COMMIT failed — non-fatal");
      });
    }

    // Generate image AFTER done — client keeps the connection open for this event.
    // runImageGen has a 20 s internal timeout so it can never hang the stream.
    if (imageGenTokens.length > 0 && !res.writableEnded && !res.destroyed) {
      // Tell the HUD exactly what's happening instead of going silent.
      writeStep({ verb: "Sketching", target: "concept sketch" });
      const nexusImageGenResult = await runImageGen();
      if (nexusImageGenResult && !res.writableEnded && !res.destroyed) {
        res.write(`event: image\ndata: ${JSON.stringify(nexusImageGenResult)}\n\n`);
      }
      // Persist nexus AI images as project assets — fire-and-forget.
      // Also inserts into gallery_images so Visual Vault can display them.
      if (nexusImageGenResult && focusProjectId && sessionId) {
        void (async () => {
          try {
            for (const img of nexusImageGenResult.images) {
              const b64Match = img.imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
              if (!b64Match) continue;
              const [inserted] = await db.insert(imageVersionsTable).values({
                sessionId,
                projectId: focusProjectId,
                prompt: img.prompt,
                imageB64: b64Match[2],
                imageMimeType: b64Match[1],
                model: img.model,
                mode: img.mode,
              } as typeof imageVersionsTable.$inferInsert).returning({ id: imageVersionsTable.id });
              // Bridge to Visual Vault: register a gallery_images record pointing to the
              // serve endpoint so /api/gallery (and VisualVault) can find this image.
              if (inserted?.id) {
                await db.insert(galleryImagesTable).values({
                  userId,
                  projectId: focusProjectId,
                  objectPath: `/api/images/${inserted.id}`,
                  label: img.prompt ? img.prompt.slice(0, 200) : null,
                });
              }
            }
          } catch (err) {
            logger.warn({ err }, "nexus imageVersion persist failed — non-fatal");
          }
        })();
      }

      // Persist imageGen payload to the message so sketches survive thread reload (P3).
      // Find the most-recently inserted assistant message for this conversation, then UPDATE it.
      if (nexusImageGenResult && effectiveConversationId) {
        (async () => {
          try {
            const [latest] = await db
              .select({ id: nexusMessagesTable.id })
              .from(nexusMessagesTable)
              .where(
                and(
                  eq(nexusMessagesTable.conversationId, effectiveConversationId),
                  eq(nexusMessagesTable.role, "assistant"),
                  eq(nexusMessagesTable.userId, userId),
                )
              )
              .orderBy(desc(nexusMessagesTable.createdAt))
              .limit(1);
            if (latest) {
              await db
                .update(nexusMessagesTable)
                .set({ metadata: { imageGen: nexusImageGenResult } })
                .where(eq(nexusMessagesTable.id, latest.id));
            }
          } catch (err: unknown) {
            logger.warn({ err }, "imageGen metadata persist failed — non-fatal");
          }
        })();
      }
    }

    // Persist decisionArtifacts to the message so cards survive thread reload.
    if (decisionArtifactResults.length > 0 && effectiveConversationId) {
      (async () => {
        try {
          const [latest] = await db
            .select({ id: nexusMessagesTable.id, metadata: nexusMessagesTable.metadata })
            .from(nexusMessagesTable)
            .where(
              and(
                eq(nexusMessagesTable.conversationId, effectiveConversationId),
                eq(nexusMessagesTable.role, "assistant"),
                eq(nexusMessagesTable.userId, userId),
              )
            )
            .orderBy(desc(nexusMessagesTable.createdAt))
            .limit(1);
          if (latest) {
            await db
              .update(nexusMessagesTable)
              .set({ metadata: { ...(latest.metadata ?? {}), decisionArtifacts: decisionArtifactResults } })
              .where(eq(nexusMessagesTable.id, latest.id));
          }
        } catch (err: unknown) {
          logger.warn({ err }, "decisionArtifacts metadata persist failed — non-fatal");
        }
      })();
    }

    res.end();
  };

  const failStream = async (summary: string, status: RunStatus = "failed") => {
    if (streamDone || res.writableEnded || res.destroyed) return;
    streamDone = true;
    writeStep({ verb: status === "cancelled" ? "Cancelled" : "Failed", target: "Atlas response", status: status === "cancelled" ? "warn" : "fail" });

    if (status === "cancelled") {
      const metadata = failedRunMetadata(summary, status);
      res.write(`event: done\ndata: ${JSON.stringify({
        content: "",
        surface: null,
        memoryUpdated: false,
        detectedMode: "strategic",
        ...metadata,
      })}\n\n`);
      res.end();
      return;
    }

    // Real failure — emit error event so the frontend shows the reason
    // instead of rendering a blank bubble.
    res.write(`event: error\ndata: ${JSON.stringify(summary || "Atlas ran into an issue. Please try again.")}\n\n`);
    res.end();
  };
  req.on("aborted", () => {
    void failStream("Run cancelled by the user.", "cancelled");
  });

  // Call the selected model
  if (activeModel === "gemini") {
    let rawContent = "";
    const combinedText = [
      ...conversationHistory.map(m => `${m.role === "user" ? "User" : "Atlas"}: ${m.content}`),
      `User: ${message}`,
    ].join("\n\n");
    const geminiAtlasVerb = mode === "audit" ? "Auditing"
      : mode === "deep_dive" ? "Deep analysis"
      : dbMessages.length === 0 ? "Capturing intent"
      : dbMessages.length <= 3 ? "Pressure testing"
      : dbMessages.length <= 7 ? "Structuring"
      : "Building strategy";
    const geminiAtlasTarget = focusProjectId ? focusLabel : "your portfolio";
    writeStep({ verb: geminiAtlasVerb, target: geminiAtlasTarget });
    modelStartedAt = performance.now();
    const geminiContents = allAttachments.length > 0
      ? [{ role: "user" as const, parts: [{ text: combinedText }, { inlineData: { mimeType: allAttachments[0].mediaType, data: allAttachments[0].base64 } }] }]
      : combinedText;
    try {
      const stream = await genai.models.generateContentStream({
        model: "gemini-2.5-pro",
        contents: geminiContents,
        config: { systemInstruction: systemPrompt },
      });
      let usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          rawContent += text;
          if (!res.writableEnded && !res.destroyed) {
            res.write(`event: token\ndata: ${JSON.stringify(text)}\n\n`);
          }
        }
        if ((chunk as any).usageMetadata) usageMetadata = (chunk as any).usageMetadata;
      }
      const inputTokens = nullableNumber(usageMetadata?.promptTokenCount);
      const outputTokens = nullableNumber(usageMetadata?.candidatesTokenCount)
        ?? (usageMetadata?.totalTokenCount != null && inputTokens != null ? Math.max(usageMetadata.totalTokenCount - inputTokens, 0) : null);
      modelUsage = {
        executionTimeMs: Math.max(1, Math.round(performance.now() - modelStartedAt)),
        inputTokens,
        outputTokens,
        costUsd: calculateModelCostUsd("gemini-2.5-pro", inputTokens, outputTokens),
      };
    } catch (geminiErr) {
      logger.warn({ err: geminiErr }, "Gemini stream failed in nexus — falling through to error");
      await failStream("Atlas ran into an issue with Gemini. Try switching to Claude.");
      return;
    }
    await finishStream(rawContent);
    return;
  }

  // Build user content — plain text or vision block when an image is attached
  // Vault images are prepended ahead of any user-attached image
  type VaultBlock = Anthropic.ImageBlockParam;
  type TextBlock = Anthropic.TextBlockParam;

  const contentParts: Array<VaultBlock | TextBlock> = [];

  // 1. Vault images (project visual context) — injected first so Atlas sees them before the user's message
  for (const vb of vault.imageBlocks) {
    // Skip vault images that exceed Claude's dimension limit
    const vaultImage = { base64: vb.source.data };
    if (vaultImage.base64 && vaultImage.base64.length > MAX_VAULT_B64_SIZE) {
      console.warn(`Vault image skipped — too large: ${vaultImage.base64.length} chars`);
      continue;
    }
    contentParts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: vb.source.media_type,
        data: vb.source.data,
      },
    } as VaultBlock);
  }

  // 2. Live URL screenshots (captured from URLs detected in this message)
  for (const ub of urlBlocks) {
    contentParts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: ub.source.media_type,
        data: ub.source.data,
      },
    } as VaultBlock);
  }

  // 3. User-attached images (attachments array — supports multiple)
  for (const att of allAttachments) {
    if (att.base64.length > MAX_VAULT_B64_SIZE) {
      logger.warn({ size: att.base64.length }, "User attachment too large — skipped");
      continue;
    }
    contentParts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: att.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: att.base64,
      },
    } as VaultBlock);
  }

  // 3. User text
  contentParts.push({ type: "text", text: message });

  const userContent: Anthropic.MessageParam["content"] =
    contentParts.length === 1 ? message : contentParts;

  const anthropicMessages: Anthropic.MessageParam[] = [
    ...conversationHistory,
    { role: "user", content: userContent },
  ];

  modelStartedAt = performance.now();
  const claudeAtlasVerb = mode === "audit" ? "Auditing"
    : mode === "deep_dive" ? "Deep analysis"
    : dbMessages.length === 0 ? "Capturing intent"
    : dbMessages.length <= 3 ? "Pressure testing"
    : dbMessages.length <= 7 ? "Structuring"
    : "Building strategy";
  const claudeAtlasTarget = focusProjectId ? focusLabel : "your portfolio";
  writeStep({ verb: claudeAtlasVerb, target: claudeAtlasTarget });

  let fullText = "";
  let pendingNavProjectId: number | null = null;
  let pendingNavProjectName: string | null = null;

  // Presentation-layer fix (task #162): IMAGE_GEN is emitted by the model as raw
  // JSON at the end of its response ("\nIMAGE_GEN:{...}"). Streaming that text
  // verbatim to the client makes the raw prompt/description flash as prose
  // before the image swaps in. Mirror chat.ts's marker-suppression pattern here:
  // hold back the tail of the stream so a partial "\nIMAGE_GEN:" prefix never
  // reaches the client, and once the full marker is seen, stop emitting text
  // for the rest of the turn and tell the client an image is coming instead.
  let emitPtr = 0;
  let imagePendingSent = false;
  const IG_MARKER = "\nIMAGE_GEN:";
  const IG_BOF = "IMAGE_GEN:"; // when the marker is the very first thing in the response
  const IG_LOOKAHEAD = IG_MARKER.length + 1;

  const flushNexusText = () => {
    if (imagePendingSent) return;

    let markerIdx = fullText.indexOf(IG_MARKER, emitPtr);
    if (markerIdx === -1 && emitPtr === 0 && fullText.startsWith(IG_BOF)) {
      markerIdx = 0;
    }

    if (markerIdx !== -1) {
      // Found the marker (or its start) — emit any clean text before it, then
      // switch to the loading signal. IMAGE_GEN is always the last token per
      // the system prompt, so no further text needs to be scanned this turn.
      if (markerIdx > emitPtr) {
        const before = fullText.slice(emitPtr, markerIdx);
        if (before) res.write(`event: token\ndata: ${JSON.stringify(before)}\n\n`);
      }
      emitPtr = fullText.length;
      imagePendingSent = true;
      res.write(`event: image_pending\ndata: ${JSON.stringify({ pending: true })}\n\n`);
      return;
    }

    // No marker found yet — emit everything except a tail long enough to hold
    // a partial "\nIMAGE_GEN:" prefix that might still be arriving in pieces.
    const safeEnd = Math.max(emitPtr, fullText.length - IG_LOOKAHEAD);
    if (safeEnd > emitPtr) {
      const toEmit = fullText.slice(emitPtr, safeEnd);
      res.write(`event: token\ndata: ${JSON.stringify(toEmit)}\n\n`);
      emitPtr = safeEnd;
    }
  };

  const appendClaudeUsage = (finalMessage: Anthropic.Message, startedAt: number) => {
    const inputTokens = nullableNumber((finalMessage as any)?.usage?.input_tokens);
    const outputTokens = nullableNumber((finalMessage as any)?.usage?.output_tokens);
    modelUsage = mergeModelUsage(modelUsage, {
      executionTimeMs: Math.max(1, Math.round(performance.now() - startedAt)),
      inputTokens,
      outputTokens,
      costUsd: calculateModelCostUsd("claude-sonnet-4-6", inputTokens, outputTokens),
    });
  };

  const tier1ContextMessages = [
    ...conversationHistory,
    { role: "user" as const, content: message },
  ];

  const extractToolUses = (finalMessage: Anthropic.Message): Anthropic.ToolUseBlock[] =>
    finalMessage.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");

  const runTier1UpsertFieldTool = async (toolUse: Anthropic.ToolUseBlock) => {
    const input = isRecord(toolUse.input) ? toolUse.input : {};
    const field = input.field;
    const value = typeof input.value === "string" ? input.value : "";
    const confidence = input.confidence;
    if (
      typeof field !== "string"
      || !TIER1_FIELD_KEYS.includes(field as Tier1FieldKey)
      || !value.trim()
      || (confidence !== "explicit" && confidence !== "inferred")
    ) {
      return { ok: false as const, error: "invalid_input" };
    }

    req.log.info({
      tool: "tier1_upsert_field",
      field,
      confidence,
      projectId: tier1ProjectId,
      conversationId: effectiveConversationId,
    }, "nexus tier1 upsert");

    if (confidence === "inferred" && !canPersistInferredConfidence(tier1ContextMessages)) {
      return { ok: false as const, error: "needs_confirmation" };
    }

    if (tier1ProjectId) {
      const result = await upsertTier1Field(tier1ProjectId, userId, field as Tier1FieldKey, value);
      if (result?.ok !== false) {
        _nexusNonCodeSteps.push({ verb: "DNA_UPDATED", target: field, detail: value.slice(0, 200), content: null });
      }
      return result;
    }
    if (!effectiveConversationId) {
      return { ok: false as const, error: "no_conversation" };
    }
    const bufResult = await upsertNexusTier1BufferField(
      effectiveConversationId,
      userId,
      field as Tier1FieldKey,
      value,
      confidence,
    );
    if (bufResult?.ok !== false) {
      _nexusNonCodeSteps.push({ verb: "DNA_UPDATED", target: field, detail: value.slice(0, 200), content: null });
    }
    return bufResult;
  };

  const runTier1MarkSkippedTool = async () => {
    req.log.info({
      tool: "tier1_mark_skipped",
      projectId: tier1ProjectId,
      conversationId: effectiveConversationId,
    }, "nexus tier1 mark skipped");

    if (tier1ProjectId) {
      return markTier1Skipped(tier1ProjectId, userId);
    }
    if (!effectiveConversationId) {
      return { ok: false as const, error: "no_conversation" };
    }
    return markNexusTier1Skipped(effectiveConversationId, userId);
  };

  const findCreateProjectToolUse = (finalMessage: Anthropic.Message): Anthropic.ToolUseBlock | null => {
    for (const block of finalMessage.content) {
      if (block.type === "tool_use" && block.name === "create_project") {
        return block as Anthropic.ToolUseBlock;
      }
    }
    return null;
  };

  const extractNarratedToolCall = (text: string): { name: string; summary: string } | null => {
    const match = text.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      if (parsed.name !== "create_project") return null;
      const params = (parsed.parameters ?? parsed.input ?? {}) as Record<string, unknown>;
      const name = typeof params.name === "string" && params.name.trim() ? params.name.trim() : null;
      const summary = typeof params.summary === "string" && params.summary.trim()
        ? params.summary.trim()
        : typeof params.description === "string" && params.description.trim()
          ? params.description.trim()
          : "";
      if (!name) return null;
      return { name, summary };
    } catch {
      return null;
    }
  };

  const runCreateProjectTool = async (toolUse: Anthropic.ToolUseBlock) => {
    const parsedInput = parseCreateProjectToolInput(toolUse.input);
    if (!parsedInput) {
      return {
        ok: false as const,
        message: "create_project requires both a non-empty name and summary.",
      };
    }

    writeStep({ verb: "Creating", target: parsedInput.name, detail: "Project workspace" });
    try {
      const project = await createProjectForUser({
        userId,
        authUser,
        name: parsedInput.name,
        description: parsedInput.summary,
        entityType: "project",
        memory: buildInitialProjectMemory(parsedInput.summary),
      });

      // Activate immediately: set status="committed" and seed genome + session + entry.
      // This prevents the workspace from showing "Not yet a workspace" on arrival.
      const effectiveBuildIntent = parsedInput.buildIntent ?? null;
      await Promise.all([
        db.update(projectsTable).set({ status: "committed" }).where(eq(projectsTable.id, project.id)),
        getOrCreateProjectDNA(project.id),
        ensureProjectWorkspaceDir(project.id),
      ]);
      // Seed session with blank title — first user message will auto-title it.
      // No entry seeded; conversation history is empty until the user speaks.
      await db
        .insert(sessionsTable)
        .values({
          projectId: project.id,
          title: "",
          status: "active",
          buildIntent: effectiveBuildIntent,
        })
        .returning({ id: sessionsTable.id });

      const projectCreated = {
        id: project.id,
        name: project.name,
        summary: project.description ?? parsedInput.summary,
        conversationId: effectiveConversationId,
      };
      writeStep({ verb: "Created", target: project.name, detail: `Project ${project.id}` });
      pendingNavProjectId = project.id;
      pendingNavProjectName = project.name;

      // Adopt the Ask Atlas conversation into this new project — transactional
      // so we never leave a project created without its conversation attached.
      // Both statements are idempotent (scoped to conversation_id + user_id +
      // project_id IS NULL / equal target) so retrying handoff cannot detach,
      // duplicate, or reassign messages.
      if (effectiveConversationId) {
        try {
          await db.transaction(async (tx) => {
            await tx.execute(sql`
              UPDATE projects
              SET conversation_id = ${effectiveConversationId}
              WHERE id = ${project.id}
                AND user_id = ${userId}
                AND conversation_id IS NULL
            `);
            // Adopt every orphaned Ask Atlas message from this exact conversation
            // for this exact user into the new project. Scoping to project_id IS
            // NULL keeps this idempotent and prevents cross-project bleed.
            await tx.execute(sql`
              UPDATE nexus_messages
              SET project_id = ${project.id}
              WHERE conversation_id = ${effectiveConversationId}
                AND user_id = ${userId}
                AND project_id IS NULL
            `);
          });
        } catch (adoptErr) {
          logger.error(
            { err: String(adoptErr), projectId: project.id, conversationId: effectiveConversationId, userId },
            "Ask Atlas conversation adoption failed — project created but thread not linked",
          );
          throw adoptErr;
        }
        await flushNexusTier1BufferToProject(effectiveConversationId, project.id, userId);
      }

      // Attempt GitHub repo creation — BUILD turns only; graceful degradation if no token or API error
      let githubRepo: string | null = null;
      let githubHtmlUrl: string | null = null;
      if (allowBuildSideEffects) {
        try {
          const ghToken = await getGithubTokenForUser(userId);
          if (ghToken) {
            writeStep({ verb: "Creating", target: "GitHub repo", detail: parsedInput.name });
            const bootstrapResult = await bootstrapGitHubRepo({
              token: ghToken,
              projectId: project.id,
              projectName: parsedInput.name,
            });
            if (bootstrapResult.ok) {
              githubRepo = bootstrapResult.linkedRepo;
              githubHtmlUrl = bootstrapResult.htmlUrl;
              writeStep({ verb: "Created", target: "GitHub repo", detail: bootstrapResult.linkedRepo });
            } else {
              logger.warn({ err: bootstrapResult.error, projectId: project.id }, "GitHub repo bootstrap failed — continuing without repo");
              writeStep({ verb: "Skipped", target: "GitHub repo", detail: bootstrapResult.error, status: "warn" });
            }
          }
        } catch (ghErr) {
          logger.warn({ err: String(ghErr), projectId: project.id }, "GitHub bootstrap threw unexpectedly — continuing without repo");
        }
      }

      const repoNote = githubRepo
        ? ` GitHub repo created at https://github.com/${githubRepo}.`
        : " No GitHub account connected, so no repo was created — the user can link one from the workspace.";

      return {
        ok: true as const,
        project: projectCreated,
        githubRepo,
        githubHtmlUrl,
        instruction: `Project "${project.name}" created with id ${project.id}.${repoNote} Write ONE short sentence confirming the project was created (e.g. "The Obsidian Ledger is ready — opening the workspace now."). Then STOP. Do NOT write any code, HTML, CSS, files, or file contents. Do NOT start building. Do NOT include NAVIGATE_TO — navigation is handled automatically via the done event. The actual build happens inside the workspace, not here.`,
      };
    } catch (error) {
      const message = error instanceof ProjectLimitReachedError
        ? `${error.message} Upgrade is required before creating another project.`
        : "Project creation failed unexpectedly.";
      writeStep({ verb: "Create", target: parsedInput.name, detail: message, status: "fail" });
      logger.warn({ err: String(error), projectName: parsedInput.name }, "create_project tool failed");
      return {
        ok: false as const,
        message,
      };
    }
  };

  const runReadFileTool = async (toolUse: Anthropic.ToolUseBlock): Promise<Record<string, unknown>> => {
    const input = isRecord(toolUse.input) ? toolUse.input : {};
    const filePath = typeof input.path === "string" ? input.path.trim() : "";
    if (!filePath) return { ok: false, error: "path_required" };
    if (!focusProjectId) return { ok: false, error: "no_project_context" };

    // Show the user Atlas is actively reading — not silent
    writeStep({ verb: "Reading", target: filePath });

    try {
      const workspaceDir = await ensureProjectWorkspaceDir(focusProjectId);
      let absPath: string;
      try {
        absPath = resolveWorkspacePath(workspaceDir, filePath);
      } catch {
        writeStep({ verb: "Invalid path", target: filePath, status: "fail" });
        return { ok: false, error: "invalid_path", path: filePath };
      }

      const content = await fsPromises.readFile(absPath, "utf-8");
      // Cap at ~200KB to avoid context blowout; signal truncation so Atlas knows
      const MAX_BYTES = 200_000;
      const truncated = Buffer.byteLength(content, "utf-8") > MAX_BYTES;
      const safeContent = truncated ? content.slice(0, MAX_BYTES) + "\n\n[...file truncated — first 200KB shown]" : content;
      req.log.info({ projectId: focusProjectId, path: filePath, truncated }, "nexus read_file tool");
      writeStep({ verb: "Read", target: filePath, detail: `${content.split("\n").length} lines` });
      return { ok: true, path: filePath, content: safeContent, truncated };
    } catch (err: any) {
      const notFound = err?.code === "ENOENT";
      writeStep({ verb: "Not found", target: filePath, status: "warn" });
      return {
        ok: false,
        error: notFound ? "file_not_found" : "read_error",
        path: filePath,
        message: notFound
          ? `File '${filePath}' does not exist in the workspace directory. In your response, tell the user you looked for it and couldn't find it at that path, then try a common alternative path by calling read_file again (e.g. if you tried src/pages/X try src/components/X or just X). Only ask the user to locate it after at least one retry.`
          : String(err?.message ?? err),
      };
    }
  };

  // Real per-request context for the shared agent-tools registry. Built lazily
  // (workspaceDir requires an async fs call) and reused across every shared
  // tool invocation in this turn. `projectId` falls back to 0 for home-scope
  // tools (search_all_projects, architecture_diff, project_knowledge,
  // component_registry) which are keyed by userId, not the active project.
  let sharedAgentCtxPromise: Promise<AgentToolContext> | null = null;
  const getSharedAgentCtx = (): Promise<AgentToolContext> => {
    if (!sharedAgentCtxPromise) {
      sharedAgentCtxPromise = (async () => ({
        projectId: focusProjectId ?? 0,
        userId,
        workspaceDir: focusProjectId ? await ensureProjectWorkspaceDir(focusProjectId) : "",
        res,
        sideEffects: sharedSideEffects,
        planState: createPlanState(),
        structuredPlanEnabled: false,
        messages: tier1ContextMessages,
        stepId: () => `nexus-${Date.now()}`,
        emitToolCall: (name, args) => writeStep({ verb: "Running", target: name, detail: JSON.stringify(args).slice(0, 200) }),
        emitToolResult: (name, ok) => writeStep({ verb: ok ? "Completed" : "Failed", target: name, status: ok ? "ok" : "fail" }),
        emitNamedEvent: (event, data) => {
          if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        // v1.4: truth-layer context — server-provided, never from model input
      activeExecutionRunId: activeRunId,
      runMode: allowBuildSideEffects
        ? ("EXECUTE" as import("@workspace/run-contract").RunMode)
        : ("EXPLORE" as import("@workspace/run-contract").RunMode),
      writeStep: (s) => {
          // Promote ARTIFACT_CREATED into non-code timeline steps (not run-card
          // "Running/Completed" noise). Emit even on DECIDE — Outputs must be
          // openable from Timeline regardless of WhisperGate intent.
          if (s.verb === "ARTIFACT_CREATED") {
            const meta = sharedSideEffects.generatedArtifacts[sharedSideEffects.generatedArtifacts.length - 1];
            const detail = meta
              ? `${meta.type.toUpperCase()} · ${meta.extension}`
              : (s as { detail?: string }).detail ?? null;
            const already = _nexusNonCodeSteps.some(
              (step) =>
                step.verb === "ARTIFACT_CREATED" &&
                step.artifactUrl === (meta ? `artifact://${meta.artifactId}` : null) &&
                step.target === (s.target ?? meta?.title ?? null),
            );
            if (!already) {
              _nexusNonCodeSteps.push({
                verb: "ARTIFACT_CREATED",
                target: s.target ?? meta?.title ?? null,
                detail,
                content: meta?.summary ?? null,
                artifactUrl: meta ? `artifact://${meta.artifactId}` : null,
              });
            }
            const liveStep = {
              verb: "ARTIFACT_CREATED",
              target: s.target ?? meta?.title,
              detail: detail ?? undefined,
              status: "ok" as const,
            };
            runActions.push(liveStep);
            if (!res.writableEnded && !res.destroyed) {
              res.write(`event: step\ndata: ${JSON.stringify(liveStep)}\n\n`);
            }
            return;
          }
          writeStep(s as RunAction);
        },
      }))();
    }
    return sharedAgentCtxPromise;
  };

  const SHARED_TOOL_NAME_SET = new Set([...SHARED_HOME_TOOL_NAMES, ...SHARED_WORKSPACE_TOOL_NAMES]);

  // Investigation tools that justify EXPLORE→INVESTIGATE escalation on DECIDE turns.
  const INVESTIGATION_TOOL_NAMES = new Set([
    "search_codebase", "search_all_projects", "architecture_diff",
    "read_file", "list_reference_project_dir", "read_reference_project_file",
    "project_knowledge", "component_registry",
  ]);

  const runNexusTool = async (toolUse: Anthropic.ToolUseBlock): Promise<Record<string, unknown>> => {
    const startedAt = performance.now();

    // v1.4: escalate mode BEFORE executing investigation tools on DECIDE turns.
    // Ordering: escalate → update tool context → execute tool.
    if (
      intent === "DECIDE" &&
      activeRunId &&
      !escalatedToInvestigate &&
      INVESTIGATION_TOOL_NAMES.has(toolUse.name)
    ) {
      escalatedToInvestigate = true;
      void recordModeEscalation(activeRunId, "EXPLORE", "INVESTIGATE").catch(() => { /* non-fatal */ });
      req.log.info({ runId: activeRunId, tool: toolUse.name }, "nexus: escalated DECIDE run to INVESTIGATE before tool");
    }

    const result = await (async (): Promise<Record<string, unknown>> => {
      switch (toolUse.name) {
        case "create_project":
          return runCreateProjectTool(toolUse);
        case "tier1_upsert_field":
          return runTier1UpsertFieldTool(toolUse);
        case "tier1_mark_skipped":
          return runTier1MarkSkippedTool();
        case "read_file":
          return runReadFileTool(toolUse);
        default: {
          if (SHARED_TOOL_NAME_SET.has(toolUse.name)) {
            const ctx = await getSharedAgentCtx();
            const input = isRecord(toolUse.input) ? toolUse.input : {};
            return executeSharedAgentTool(ctx, toolUse.name, input);
          }
          return { ok: false, error: "unknown_tool" };
        }
      }
    })();

    // v1.4: capture advance_execution_state results so the done event can
    // surface the backend-derived outcome to the frontend.
    if (toolUse.name === "advance_execution_state") {
      const advResult = result as { ok?: boolean; executionState?: string; outcome?: unknown };
      if (advResult.ok === true && typeof advResult.executionState === "string") {
        lastExecutionState = advResult.executionState;
        lastRunOutcome = advResult.outcome ?? null;
      }
    }

    // Permanent telemetry: this is the only place every tool call (shared
    // registry + nexus-local) funnels through. Without it there was no way
    // to distinguish "the model called the tool and got an empty result"
    // from "the model never called the tool at all" — a real diagnostic gap
    // uncovered when DECIDE-turn tool access was widened.
    req.log.info(
      { tool: toolUse.name, ok: result.ok !== false, ms: Math.round(performance.now() - startedAt), focusProjectId },
      "nexus: tool executed",
    );
    return result;
  };

  const buildToolResultBlocks = async (
    toolUses: Anthropic.ToolUseBlock[],
  ): Promise<Anthropic.ToolResultBlockParam[]> => {
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await runNexusTool(toolUse);
      const ok = result.ok !== false;
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        ...(!ok ? { is_error: true } : {}),
      });
    }
    return results;
  };

  const streamClaude = async (
    messagesForClaude: Anthropic.MessageParam[],
    options: {
      tools: boolean;
      startedAt: number;
      forceCreate?: boolean;
      retryCount?: number;
      toolHopCount?: number;
      /** Incremented on each automatic plan-continuation pass. Hard-capped at 1. */
      continuationHopCount?: number;
      /** First-pass cleaned text to prepend when finishStream is called on the
       * continuation pass — produces one combined message rather than two. */
      continuationPrefix?: string;
    },
  ): Promise<void> => {
    if (options.forceCreate) {
      try {
        const forcedMessage = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: messagesForClaude,
          tools: [CREATE_PROJECT_TOOL],
          tool_choice: { type: "tool", name: "create_project" },
        });
        appendClaudeUsage(forcedMessage, options.startedAt);
        const toolUse = findCreateProjectToolUse(forcedMessage);
        if (toolUse) {
          const toolResult = await runCreateProjectTool(toolUse);
          const continuationMessages: Anthropic.MessageParam[] = [
            ...messagesForClaude,
            { role: "assistant", content: forcedMessage.content as Anthropic.MessageParam["content"] },
            {
              role: "user",
              content: [{
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify(toolResult),
                ...(!toolResult.ok ? { is_error: true } : {}),
              } as Anthropic.ToolResultBlockParam],
            },
          ];
          streamClaude(continuationMessages, { tools: false, startedAt: performance.now() });
          return;
        }
        await finishStream("");
      } catch (err) {
        req.log.error({ err }, "forced create_project call failed");
        await failStream("Atlas ran into an issue creating the project. Please try again.");
      }
      return;
    }

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: messagesForClaude,
      ...(options.tools ? { tools: focusProjectId ? NEXUS_WORKSPACE_TOOLS : NEXUS_AGENT_TOOLS } : {}),
    });

    stream.on("text", (text) => {
      fullText += text;
      flushNexusText();
    });

    stream.on("error", (err) => {
      const cancelled = /\b(abort|cancel|cancelled|canceled)\b/i.test(err.message);
      writeStep({ verb: "Stream", target: "Claude", status: cancelled ? "warn" : "fail" });
      void failStream(err.message || "Atlas ran into an issue.", cancelled ? "cancelled" : "failed");
    });

    stream.on("finalMessage", async (finalMessage) => {
      try {
        appendClaudeUsage(finalMessage, options.startedAt);

        // Robustness: the model occasionally returns a stop with no text and no tool
        // use at all (observed recurring in long conversations — see must-fix #3 in
        // the v1 readiness report). Retry once, silently, with the exact same request
        // before surfacing "Model returned no content" to the user — most instances
        // are a transient blip on the same turn, not a real content failure.
        const hadToolUse = options.tools && extractToolUses(finalMessage).length > 0;
        if (!hadToolUse && !fullText.trim() && (options.retryCount ?? 0) < 1) {
          req.log.warn(
            { focusProjectId, conversationId: effectiveConversationId, retryCount: (options.retryCount ?? 0) + 1 },
            "nexus: model returned empty response — retrying once before surfacing error",
          );
          writeStep({ verb: "Retrying", target: "response", detail: "Empty model response, retrying" });
          streamClaude(messagesForClaude, { ...options, retryCount: (options.retryCount ?? 0) + 1 });
          return;
        }

        const toolUses = options.tools ? extractToolUses(finalMessage) : [];
        if (toolUses.length > 0) {
          const toolResults = await buildToolResultBlocks(toolUses);
          const continuationMessages: Anthropic.MessageParam[] = [
            ...messagesForClaude,
            { role: "assistant", content: finalMessage.content as Anthropic.MessageParam["content"] },
            { role: "user", content: toolResults },
          ];
          // Multi-hop tool loop: this used to hardcode tools:false on the
          // continuation, so a turn that called tier1_upsert_field first
          // (a very common pattern — Atlas logs the field before acting)
          // had no way to follow up with generate_deliverable in the same
          // turn. The model would want to call it, find no tools available,
          // and return an empty response instead — surfaced to the user as
          // "Atlas didn't generate a response." Keep tools on for follow-up
          // hops (still gated by the original BUILD/DECIDE allowToolAccess
          // check via options.tools), capped so a stuck loop can't run away.
          const nextHop = (options.toolHopCount ?? 0) + 1;
          const MAX_TOOL_HOPS = 6;
          streamClaude(continuationMessages, {
            ...options,
            tools: options.tools && nextHop < MAX_TOOL_HOPS,
            toolHopCount: nextHop,
            startedAt: performance.now(),
            retryCount: 0,
          });
          return;
        }

        // Intercept narrated <tool_call> — Claude wrote the call as text instead of using the API mechanism.
        // Skip entirely when focusProjectId is set: create_project is a home/Ask-Atlas
        // action only — inside an existing workspace it must never fire, narrated or not.
        if (options.tools && !focusProjectId) {
          const narrated = extractNarratedToolCall(fullText);
          if (narrated) {
            req.log.info({ name: narrated.name }, "nexus/chat: intercepted narrated tool_call — executing create_project");
            const fakeToolUse = {
              type: "tool_use",
              id: "narrated-intercept",
              name: "create_project",
              input: { name: narrated.name, summary: narrated.summary },
            } as unknown as Anthropic.ToolUseBlock;
            const toolResult = await runCreateProjectTool(fakeToolUse);
            if (toolResult.ok) {
              pendingNavProjectId = toolResult.project.id;
              pendingNavProjectName = toolResult.project.name;
            }
            await finishStream(fullText);
            return;
          }
        }

        // ── Plan continuation engine ─────────────────────────────────────────
        // Runs on the FIRST pass only (not during a continuation second pass).
        // Parses the PLAN_CONTINUATION block the model may emit after a roadmap,
        // validates the envelope against the server-side allowlist, and — if
        // approved — launches a read-only investigation continuation before
        // finishStream is called on the first pass.
        //
        // Contract: model proposes via structured envelope; server authorizes
        // via allowlist. If the envelope is invalid or blocked, execution falls
        // through to the normal finishStream path (safety strip handles cleanup).
        const MAX_CONTINUATION_HOPS = 1;
        if ((options.continuationHopCount ?? 0) < MAX_CONTINUATION_HOPS && !options.continuationPrefix) {
          const contMatch = fullText.match(
            /\nPLAN_CONTINUATION_START\s*([\s\S]*?)\s*PLAN_CONTINUATION_END(?:\n|$)/,
          );
          if (contMatch) {
            let contEnvelope: ContinuationEnvelope | null = null;
            try {
              const parsed = JSON.parse(contMatch[1].trim()) as unknown;
              if (isValidContinuationEnvelope(parsed)) {
                contEnvelope = parsed;
              } else {
                req.log.warn(
                  { preview: contMatch[1].slice(0, 300) },
                  "nexus: PLAN_CONTINUATION failed shape validation — skipping auto-continuation",
                );
              }
            } catch (err) {
              req.log.warn(
                { err: String(err), preview: contMatch[1].slice(0, 300) },
                "nexus: PLAN_CONTINUATION JSON parse failed — skipping auto-continuation",
              );
            }

            if (contEnvelope) {
              if (isContinuationAllowlisted(contEnvelope)) {
                // Strip the continuation block from the first-pass text before
                // persisting it — the block is an internal signal, not prose.
                const cleanedFirstPass = fullText
                  .replace(contMatch[0], "\n")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();

                // Signal to the client so the user can see Atlas is continuing.
                writeStep({
                  verb: "Continuing automatically",
                  target: "read-only audit",
                  detail: contEnvelope.reason,
                  status: "ok",
                });
                if (!res.writableEnded && !res.destroyed) {
                  res.write(
                    `event: continuation\ndata: ${JSON.stringify({
                      action: contEnvelope.action,
                      reason: contEnvelope.reason,
                      risk: contEnvelope.risk,
                    })}\n\n`,
                  );
                }

                // Build the continuation turn: assistant turn = cleaned first-pass
                // plan, user turn = auto-continuation prompt with strict findings contract.
                const continuationMessages: Anthropic.MessageParam[] = [
                  ...messagesForClaude,
                  { role: "assistant", content: cleanedFirstPass },
                  {
                    role: "user",
                    content: `AUTO-CONTINUATION — Read-only investigation.

You proposed: ${contEnvelope.action.replace(/_/g, " ")}
Reason: ${contEnvelope.reason}
Tools available for this investigation: ${contEnvelope.tools_required.join(", ")}

Execute this investigation now. Return ALL of the following — do not skip any section:
1. What was inspected — exact file paths, routes, components
2. Evidence — relevant code structure, key observations, quotes where helpful
3. Classification for each surface inspected: production-ready | extendable | prototype | stub | dead-code
4. Unresolved questions — genuine gaps that need external knowledge or a decision
5. Next gate — exactly one of:
   - "decision: [state the specific product or architecture decision needed]"
   - "execution: [state the next safe read-only step you can run immediately]"

Do NOT produce another roadmap. Do NOT say "I'll inspect." Execute and return findings now.`,
                  },
                ];

                req.log.info(
                  {
                    focusProjectId,
                    intent,
                    action: contEnvelope.action,
                    tools: contEnvelope.tools_required,
                    continuationHopCount: (options.continuationHopCount ?? 0) + 1,
                  },
                  "nexus: plan continuation approved — launching read-only investigation",
                );

                streamClaude(continuationMessages, {
                  ...options,
                  tools: true,
                  continuationHopCount: (options.continuationHopCount ?? 0) + 1,
                  continuationPrefix: cleanedFirstPass,
                  startedAt: performance.now(),
                  retryCount: 0,
                });
                return; // First pass: do NOT call finishStream — second pass handles it
              } else {
                req.log.warn(
                  {
                    action: contEnvelope.action,
                    risk: contEnvelope.risk,
                    gate: contEnvelope.gate,
                    tools: contEnvelope.tools_required,
                  },
                  "nexus: PLAN_CONTINUATION failed allowlist check — skipping auto-continuation, falling through to finishStream",
                );
              }
            }
          }
        }

        // Normal finish path — also handles the continuation second pass, where
        // continuationPrefix holds the first-pass plan text and fullText is the
        // investigation findings. Combined into one persisted message so the
        // thread contains the complete plan + findings as a single assistant turn.
        const rawForFinish = options.continuationPrefix
          ? `${options.continuationPrefix}\n\n---\n\n${fullText}`
          : fullText;
        await finishStream(rawForFinish);
      } catch (err) {
        req.log.error({ err }, "nexus/chat stream finalization error");
        await failStream("Atlas ran into an issue. Please try again.", "failed");
      }
    });
  };

  // Explicit commit signals — require clear project/workspace intent to avoid false positives.
  // Intentionally excludes context-free phrases like "do it", "set it up", "make it",
  // "go ahead", "yes", "ok", "sure" — these need object context ("set up a table" ≠ commit).
  const EXPLICIT_CREATE_SIGNALS = [
    "let's build it", "lets build it",
    "let's build this", "lets build this",
    "create the workspace", "start the project",
    "create the project", "create a workspace",
    "move this into a project", "turn this into a project",
    "move this to a workspace", "create it",
    "please create", "build this project",
    // Direct build-intent phrases (e.g. "build a habit tracker", "build me a dashboard")
    "build a ", "build an ", "build me", "build the ",
    "create a ", "create an ", "create me",
    "make a ", "make an ", "make me",
  ];
  const messageLC = message.toLowerCase();
  const isExplicitCreate = EXPLICIT_CREATE_SIGNALS.some(s => messageLC.includes(s));

  // create_project is a home/Ask-Atlas action only. Once a conversation is already
  // scoped to a project (focusProjectId set), Atlas must NEVER spin up another one —
  // build-flavored phrasing like "build the X now" / "create the Y" inside an active
  // workspace turn must not be mistaken for a request to create a NEW project.
  // Guard forceCreate on focusProjectId being unset, not just on message phrasing.
  const shouldForceCreate = allowBuildSideEffects && isExplicitCreate && !focusProjectId;
  if (allowBuildSideEffects && isExplicitCreate && focusProjectId) {
    req.log.warn(
      { focusProjectId, messagePreview: message.slice(0, 120) },
      "nexus/chat: suppressed forceCreate — explicit-create phrasing matched inside an already-active project conversation",
    );
  }

  // Tools are BUILD- and DECIDE-only (read/generate registry, no file edits).
  // forceCreate is BUILD-only. CHAT, Just Talk, and Conversation Mode must
  // never enter the tool loop.
  streamClaude(anthropicMessages, {
    tools: allowToolAccess,
    startedAt: modelStartedAt,
    forceCreate: shouldForceCreate,
  });

  return;

  } catch (err) {
    req.log.error({ err }, "nexus/chat error");
    if (res.headersSent && !res.writableEnded) {
      // Stream already started — send error event so the frontend shows it
      const msg = err instanceof Error ? err.message : "Atlas ran into an issue. Please try again.";
      res.write(`event: error\ndata: ${JSON.stringify(msg)}\n\n`);
      res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: "Atlas ran into an issue. Please try again." });
    }
  }
});

router.post("/nexus/handoff", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const { messages, projectId, sessionId, ideaMode, conversationId, conversation_id: conversationIdSnake } = req.body as {
      messages: { role: string; content: string }[];
      projectId?: number;
      sessionId?: number;
      ideaMode?: boolean;
      conversationId?: string | null;
      conversation_id?: string | null;
    };
    const rawConversationId = conversationId ?? conversationIdSnake;
    const handoffConversationId = typeof rawConversationId === "string" && rawConversationId.trim().length > 0
      ? rawConversationId.trim()
      : null;

    if (!messages?.length) {
      res.status(400).json({ error: "No messages provided" });
      return;
    }

    const briefResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1536,
      system: `You are extracting a project brief from a conversation between a founder and Atlas.

Extract and return ONLY a JSON object with this exact shape — no markdown, no explanation:
{
  "projectName": "short name for the project (max 4 words)",
  "description": "one sentence describing what this project does",
  "blueprint": "2-3 sentences covering what was decided: what to build, key components identified, approach agreed on",
  "firstStep": "the single most important first thing to do in the workspace",
  "backendSpec": {
    "endpoints": [{"method": "GET|POST|PUT|DELETE|PATCH", "path": "/api/...", "purpose": "one sentence"}],
    "models": [{"name": "ModelName", "keyFields": ["field1", "field2"]}],
    "stack": "recommended backend stack in one phrase (e.g. Node.js + PostgreSQL)",
    "scope": "one sentence describing the Phase 1 scope boundary"
  }
}

If no clear project name was discussed, use "New Project".
For backendSpec: infer it from the conversation — what data needs to persist, what actions need an API, what the data model looks like. If the conversation has no technical signal at all, set backendSpec to null.`,
      messages: [
        {
          role: "user",
          content: `Here is the conversation:\n\n${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}\n\nExtract the project brief.`,
        },
      ],
    });

    const rawText = briefResponse.content[0]?.type === "text" ? briefResponse.content[0].text : "{}";
    let brief: { projectName: string; description: string; blueprint: string; firstStep: string; backendSpec?: { endpoints: Array<{ method: string; path: string; purpose: string }>; models: Array<{ name: string; keyFields: string[] }>; stack: string; scope: string } | null };
    try {
      brief = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      brief = { projectName: "New Project", description: "", blueprint: rawText, firstStep: "" };
    }

    let targetProjectId = projectId;
    let ideaModeActive = ideaMode === true || messages.some((m) => (
      m.role === "user" && (hasIdeaModeSignal(m.content) || hasExplicitIdeaModeSignal(m.content))
    ));
    if (!ideaModeActive && Number.isInteger(sessionId) && Number(sessionId) > 0) {
      const [session] = await db
        .select({ ideaMode: sessionsTable.ideaMode })
        .from(sessionsTable)
        .innerJoin(projectsTable, eq(sessionsTable.projectId, projectsTable.id))
        .where(and(eq(sessionsTable.id, Number(sessionId)), eq(projectsTable.userId, userId)))
        .limit(1);
      ideaModeActive = session?.ideaMode === true;
    }
    if (!targetProjectId) {
      const [newProject] = await db
        .insert(projectsTable)
        .values({
          name: brief.projectName,
          description: brief.description,
          entityType: ideaModeActive ? "idea" : "project",
          userId,
        })
        .returning();
      targetProjectId = newProject.id;
    }

    const [targetProject] = await db
      .select({ memory: projectsTable.memory })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, targetProjectId), eq(projectsTable.userId, userId)))
      .limit(1);
    if (!targetProject) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const handoffTimestamp = new Date().toISOString();
    const existingMemory = parseMemoryStore(targetProject.memory ?? null);
    const nextEntries: MemoryEntry[] = [
      ...existingMemory.entries,
      {
        tier: 1,
        text: `Project brief from home conversation: ${brief.blueprint}`,
        createdAt: handoffTimestamp,
        retrievalCount: 0,
        lastRetrievedAt: null,
      },
      ...(brief.firstStep ? [{
        tier: 4 as const,
        text: `First step: ${brief.firstStep}`,
        createdAt: handoffTimestamp,
        retrievalCount: 0,
        lastRetrievedAt: null,
      }] : []),
      ...(brief.backendSpec ? [{
        tier: 2 as const,
        text: `Backend spec (inferred at handoff): stack=${brief.backendSpec.stack}. Scope: ${brief.backendSpec.scope}. Endpoints: ${brief.backendSpec.endpoints.map(e => `${e.method} ${e.path}`).join(", ")}. Models: ${brief.backendSpec.models.map(m => m.name).join(", ")}.`,
        createdAt: handoffTimestamp,
        retrievalCount: 0,
        lastRetrievedAt: null,
      }] : []),
    ];

    if (
      handoffConversationId
      && !memoryHasConversationContext(targetProject.memory ?? null, existingMemory, handoffConversationId)
    ) {
      const hasMessageType = await hasNexusMessageTypeColumn();
      const recentConversationMessages = await loadRecentNexusMessagesForConversation(
        userId,
        handoffConversationId,
        hasMessageType,
      );
      if (recentConversationMessages.length > 0) {
        nextEntries.push({
          tier: 3,
          text: buildConversationContextBlock(
            handoffConversationId,
            handoffTimestamp,
            recentConversationMessages,
          ),
          createdAt: handoffTimestamp,
          retrievalCount: 0,
          lastRetrievedAt: null,
        });
      }
    }

    const memoryEntry: MemoryStore = {
      v: 2,
      entries: nextEntries,
    };

    await db
      .update(projectsTable)
      .set({ memory: JSON.stringify(memoryEntry) })
      .where(and(eq(projectsTable.id, targetProjectId), eq(projectsTable.userId, userId)));

    if (handoffConversationId) {
      await flushNexusTier1BufferToProject(handoffConversationId, targetProjectId, userId);
    }

    res.json({ projectId: targetProjectId, projectName: brief.projectName, brief });
  } catch (err) {
    req.log?.error({ err }, "Handoff error");
    res.status(500).json({ error: "Handoff failed" });
  }
});

// ── Manifest helpers ──────────────────────────────────────────────────────
type AnchorCompleteness = "absent" | "thin" | "sufficient" | "locked";

function anchorCompleteness(value: string | null | undefined): AnchorCompleteness {
  if (!value?.trim()) return "absent";
  if (value.trim().length < 30) return "thin";
  return "sufficient";
}

type DnaAnchor = {
  label: string;
  question: string;
  value: string | null;
  completeness: AnchorCompleteness;
};

type BuildTarget = {
  id: string;
  label: string;
  unlocked: boolean;
  reason: string | null;
};

function buildManifestTargets(anchors: {
  coreIntent: AnchorCompleteness;
  surfaceStrategy: AnchorCompleteness;
  coreAudience: AnchorCompleteness;
  brandPosture: AnchorCompleteness;
}): BuildTarget[] {
  const hasIntent = anchors.coreIntent !== "absent";
  const intentSufficient = anchors.coreIntent === "sufficient" || anchors.coreIntent === "locked";
  const hasSurface = anchors.surfaceStrategy !== "absent";
  const surfaceSufficient = anchors.surfaceStrategy === "sufficient" || anchors.surfaceStrategy === "locked";
  const hasAudience = anchors.coreAudience !== "absent";

  return [
    {
      id: "landing-page",
      label: "Landing Page",
      unlocked: hasIntent && hasSurface,
      reason: hasIntent && hasSurface ? null : "Requires Core Intent and Surface Strategy",
    },
    {
      id: "web-app",
      label: "Web App",
      unlocked: intentSufficient && surfaceSufficient,
      reason: intentSufficient && surfaceSufficient ? null : "Core Intent and Surface Strategy must reach sufficient detail",
    },
    {
      id: "mobile-app",
      label: "Mobile App",
      unlocked: surfaceSufficient,
      reason: surfaceSufficient ? null : "Requires a fully described Surface Strategy",
    },
    {
      id: "database-schema",
      label: "Database Schema",
      unlocked: hasIntent && hasSurface,
      reason: hasIntent && hasSurface ? null : "Requires Core Intent and Surface Strategy",
    },
    {
      id: "investor-pitch",
      label: "Investor Pitch",
      unlocked: intentSufficient && hasAudience,
      reason: intentSufficient && hasAudience ? null : "Requires Core Intent and Core Audience",
    },
    {
      id: "api-backend",
      label: "API / Backend",
      unlocked: hasSurface,
      reason: hasSurface ? null : "Requires Surface Strategy",
    },
  ];
}

function computeConfidenceScore(anchors: {
  coreIntent: AnchorCompleteness;
  surfaceStrategy: AnchorCompleteness;
  coreAudience: AnchorCompleteness;
  brandPosture: AnchorCompleteness;
}): number {
  const score = (Object.values(anchors) as AnchorCompleteness[]).reduce((sum, c) => {
    if (c === "sufficient" || c === "locked") return sum + 25;
    if (c === "thin") return sum + 10;
    return sum;
  }, 0);
  return Math.min(100, score);
}

// GET /api/nexus/manifest/:projectId — Manifest consumption layer
router.get("/nexus/manifest/:projectId", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }

    // 1. Verify project exists and belongs to this user
    const [project] = await db
      .select({ id: projectsTable.id, name: projectsTable.name, userId: projectsTable.userId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (project.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // 2. Fetch DNA from Application Model (canonical source of truth)
    const genome = await getOrCreateProjectDNA(projectId);

    // 3. Map genome fields → 4 anchors with completeness gradient
    const coreIntentValue = genome.purpose;
    const surfaceStrategyValue = genome.surfaceStrategy;
    const coreAudienceValue = genome.audience;
    const brandPostureValue = [genome.identity, genome.coreEmotion].filter(Boolean).join(" — ") || null;

    const anchors = {
      coreIntent: anchorCompleteness(coreIntentValue),
      surfaceStrategy: anchorCompleteness(surfaceStrategyValue),
      coreAudience: anchorCompleteness(coreAudienceValue),
      brandPosture: anchorCompleteness(brandPostureValue),
    };

    const dnaAnchors: { coreIntent: DnaAnchor; surfaceStrategy: DnaAnchor; coreAudience: DnaAnchor; brandPosture: DnaAnchor } = {
      coreIntent: {
        label: "Core Intent",
        question: "What is this, why does it matter, and what makes it different?",
        value: coreIntentValue ?? null,
        completeness: anchors.coreIntent,
      },
      surfaceStrategy: {
        label: "Surface Strategy",
        question: "What are we trying to create first, and what does the user actually do?",
        value: surfaceStrategyValue ?? null,
        completeness: anchors.surfaceStrategy,
      },
      coreAudience: {
        label: "Core Audience",
        question: "Who is it for, and what emotional or practical need drives them?",
        value: coreAudienceValue ?? null,
        completeness: anchors.coreAudience,
      },
      brandPosture: {
        label: "Brand Posture",
        question: "How should it feel, sound, and present itself?",
        value: brandPostureValue,
        completeness: anchors.brandPosture,
      },
    };

    const confidenceScore = computeConfidenceScore(anchors);
    const buildTargets = buildManifestTargets(anchors);

    res.json({
      projectId: project.id,
      projectName: project.name,
      stage: genome.stage,
      confidenceScore,
      anchors: dnaAnchors,
      openQuestions: genome.openQuestions ?? [],
      buildTargets,
      lastExtractedAt: genome.lastExtractedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "GET /nexus/manifest/:projectId failed");
    res.status(500).json({ error: "Failed to load manifest" });
  }
});

// GET /api/nexus/resume — Atlas-written structured brief (4-section continuity engine)
router.get("/nexus/resume", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;

    // Serve from cache if fresh (unless ?bust=1 forces re-generation)
    const bustCache = req.query.bust === "1";
    const cached = resumeCache.get(userId);
    if (!bustCache && cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    // DB fallback — survive server restarts (2-hour TTL)
    const DB_RESUME_TTL_MS = 2 * 60 * 60 * 1000;
    if (!bustCache) {
      try {
        const [snap] = await db
          .select()
          .from(userResumeSnapshotsTable)
          .where(eq(userResumeSnapshotsTable.userId, userId))
          .limit(1);
        if (snap && Date.now() - snap.generatedAt.getTime() < DB_RESUME_TTL_MS) {
          const data = JSON.parse(snap.dataJson) as ResumeData;
          resumeCache.set(userId, { data, expiresAt: Date.now() + RESUME_CACHE_TTL_MS });
          res.json(data);
          return;
        }
      } catch {
        // Non-fatal — fall through to LLM generation
      }
    }

    // 1. Fetch user's projects
    const projects = await db
      .select({ id: projectsTable.id, name: projectsTable.name, status: projectsTable.status, description: projectsTable.description, updatedAt: projectsTable.updatedAt })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId))
      .orderBy(desc(projectsTable.updatedAt))
      .limit(20);

    if (projects.length === 0) {
      const empty: ResumeData = {
        whatMoved: [],
        whatEmerged: "",
        waitingOnYou: "",
        suggestedNextMove: "",
      };
      res.json(empty);
      return;
    }

    const projectIds = projects.map(p => p.id);
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // 2. Fetch context in parallel: committed decisions, genomes, recent sessions, recent home messages
    const [committedDecisions, genomes, recentSessions, recentMessages] = await Promise.all([
      db
        .select({ projectId: entriesTable.projectId, title: entriesTable.title, summary: entriesTable.summary, createdAt: entriesTable.createdAt })
        .from(entriesTable)
        .where(and(inArray(entriesTable.projectId, projectIds), eq(entriesTable.status, "committed")))
        .orderBy(desc(entriesTable.createdAt))
        .limit(15),
      getMultipleProjectDNA(projectIds),
      db
        .select({ projectId: sessionsTable.projectId, title: sessionsTable.title, createdAt: sessionsTable.createdAt })
        .from(sessionsTable)
        .where(and(inArray(sessionsTable.projectId, projectIds), gte(sessionsTable.createdAt, since48h)))
        .orderBy(desc(sessionsTable.createdAt))
        .limit(10),
      db
        .select({ role: nexusMessagesTable.role, content: nexusMessagesTable.content, createdAt: nexusMessagesTable.createdAt })
        .from(nexusMessagesTable)
        .where(and(eq(nexusMessagesTable.userId, userId), isNull(nexusMessagesTable.projectId)))
        .orderBy(desc(nexusMessagesTable.createdAt))
        .limit(10),
    ]);

    // 3. Build context string for Claude
    const projectNameById = new Map(projects.map(p => [p.id, p.name]));
    const genomeByProjectId = genomes; // Map<number, ProjectDNA> from getMultipleProjectDNA

    const projectContext = projects.map(p => {
      const genome = genomeByProjectId.get(p.id);
      const parts = [`• ${p.name} (${p.status})`];
      if (genome?.stage) parts.push(`  Stage: ${genome.stage}`);
      if (genome?.purpose) parts.push(`  Purpose: ${genome.purpose}`);
      if (genome?.audience) parts.push(`  Who: ${genome.audience}`);
      if (genome?.wedge) parts.push(`  Wedge: ${genome.wedge}`);
      if (genome?.differentiator) parts.push(`  Differentiator: ${genome.differentiator}`);
      if (genome?.openQuestions?.length) parts.push(`  Open questions: ${genome.openQuestions.slice(0, 2).join("; ")}`);
      return parts.join("\n");
    }).join("\n\n");

    const decisionsContext = committedDecisions.length > 0
      ? committedDecisions.map(d => `• [${projectNameById.get(d.projectId) ?? "Unknown"}] ${d.title}${d.summary ? ` — ${d.summary}` : ""}`).join("\n")
      : "No committed decisions yet.";

    const sessionsContext = recentSessions.length > 0
      ? recentSessions.map(s => `• [${projectNameById.get(s.projectId) ?? "Unknown"}] ${s.title} (${s.createdAt.toISOString().slice(0, 10)})`).join("\n")
      : "No sessions in the last 48h.";

    const messagesContext = recentMessages.length > 0
      ? recentMessages
          .slice()
          .reverse()
          .map(m => `${m.role === "user" ? "User" : "Atlas"}: ${m.content.slice(0, 300)}`)
          .join("\n\n")
      : "No recent Ask Atlas conversation.";

    const prompt = `${ATLAS_IDENTITY}

You are generating the Resume — the structured brief Atlas writes at the start of every session to orient the user across their entire portfolio. This is curated continuity, not a raw activity log.

PORTFOLIO:
${projectContext}

COMMITTED DECISIONS (recent):
${decisionsContext}

SESSIONS IN LAST 48H:
${sessionsContext}

RECENT ASK ATLAS CONVERSATION:
${messagesContext}

Generate a structured JSON object with exactly these four fields:

{
  "whatMoved": [array of 2-4 short bullet strings — factual, specific things that changed across projects since last active],
  "whatEmerged": "1-2 sentences max — one key insight or pattern you notice across the portfolio",
  "waitingOnYou": "1 sentence — the one decision or question only the human can answer right now",
  "suggestedNextMove": "1 sentence — exactly one concrete next action, no alternatives"
}

Rules:
- whatMoved bullets: factual and specific, reference real project names, no speculation
- whatEmerged: one genuine insight or tension, not a summary of facts — find the pattern
- waitingOnYou: surface the most blocking open question; if nothing is blocking, surface the most important strategic choice
- suggestedNextMove: be decisive, one action only
- If there is insufficient data, use what you know and keep it honest — do not hallucinate activity
- Respond with ONLY the JSON object. No preamble, no explanation.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    const parsed = raw ? parseJsonObject<ResumeData>(raw) : null;

    if (!parsed) {
      res.json({ whatMoved: [], whatEmerged: "", waitingOnYou: "", suggestedNextMove: "" });
      return;
    }

    const data: ResumeData = {
      whatMoved: Array.isArray(parsed.whatMoved) ? parsed.whatMoved.map(String).filter(Boolean) : [],
      whatEmerged: typeof parsed.whatEmerged === "string" ? parsed.whatEmerged.trim() : "",
      waitingOnYou: typeof parsed.waitingOnYou === "string" ? parsed.waitingOnYou.trim() : "",
      suggestedNextMove: typeof parsed.suggestedNextMove === "string" ? parsed.suggestedNextMove.trim() : "",
    };

    // Cache in-memory for 5 minutes and persist to DB (survives server restarts)
    resumeCache.set(userId, { data, expiresAt: Date.now() + RESUME_CACHE_TTL_MS });
    db.execute(sql`
      INSERT INTO user_resume_snapshots (user_id, data_json, generated_at)
      VALUES (${userId}, ${JSON.stringify(data)}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET data_json = EXCLUDED.data_json, generated_at = EXCLUDED.generated_at
    `).catch((err: unknown) => logger.warn({ err }, "resume snapshot upsert failed — non-fatal"));

    res.json(data);
  } catch (err) {
    req.log?.error({ err }, "Resume generation error");
    res.json({ whatMoved: [], whatEmerged: "", waitingOnYou: "", suggestedNextMove: "" });
  }
});

router.post("/nexus/briefing", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser.id as number;
    const projects = await db
      .select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId));

    if (projects.length === 0) {
      res.json({ briefing: null, isBriefing: true });
      return;
    }

    const projectIds = projects.map(p => p.id);
    const recentEntries = projectIds.length > 0
      ? await db
          .select({ projectId: entriesTable.projectId, title: entriesTable.title, status: entriesTable.status })
          .from(entriesTable)
          .where(inArray(entriesTable.projectId, projectIds))
          .orderBy(desc(entriesTable.createdAt))
          .limit(10)
      : [];

    const projectNameById = new Map(projects.map(p => [p.id, p.name]));
    const recentActivity = recentEntries
      .map(e => `${projectNameById.get(e.projectId) ?? "Unknown"}: ${e.title} (${e.status})`)
      .join("\n");
    const projectList = projects.map(p => `• ${p.name}`).join("\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 120,
      messages: [{
        role: "user",
        content: `You are Atlas, a strategic AI partner. Portfolio:\n${projectList}\n\nRecent activity:\n${recentActivity || "No recent activity"}\n\nWrite exactly two sentences. Sentence 1: current state of the portfolio. Sentence 2: one specific next move. Reference real project names. Under 20 words each. No greeting, no labels.`
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    res.json({ briefing: text, isBriefing: true });
  } catch (err) {
    req.log?.error({ err }, "Briefing error");
    res.json({ briefing: null, isBriefing: true });
  }
});

// GET /api/nexus/activity — unified activity feed (commits + decisions + sessions)
router.get("/nexus/activity", async (req, res): Promise<void> => {
  const userId = (req as any).authUser.id as number;

  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, linkedRepo: projectsTable.linkedRepo })
    .from(projectsTable)
    .where(eq(projectsTable.userId, userId));

  const projectIds = projects.map(p => p.id);
  if (projectIds.length === 0) { res.json({ items: [] }); return; }

  const projectNameById = new Map(projects.map(p => [p.id, p.name]));

  type ActivityItem = {
    type: "commit" | "decision" | "session";
    projectId: number;
    projectName: string;
    title: string;
    subtitle?: string;
    url?: string;
    sha?: string;
    timestamp: string;
  };

  const items: ActivityItem[] = [];
  const ghToken = process.env.GITHUB_TOKEN ?? null;
  const linkedProjects = projects.filter(p => p.linkedRepo);

  // Fetch commits for all linked repos in parallel (with timeout)
  if (ghToken && linkedProjects.length > 0) {
    const commitResults = await Promise.allSettled(
      linkedProjects.map(async (p) => {
        const repoFull = parseRepo(p.linkedRepo ?? null);
        if (!repoFull) return [];
        const r = await fetch(
          `https://api.github.com/repos/${repoFull}/commits?per_page=6`,
          {
            headers: {
              Authorization: `Bearer ${ghToken}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "Atlas-Activity/1.0",
            },
            signal: AbortSignal.timeout(7000),
          }
        );
        if (!r.ok) return [];
        const data = await r.json() as any[];
        return data.map((c: any): ActivityItem => ({
          type: "commit",
          projectId: p.id,
          projectName: p.name,
          title: ((c.commit?.message ?? "") as string).split("\n")[0].slice(0, 120),
          sha: (c.sha as string)?.slice(0, 7),
          url: c.html_url as string,
          timestamp: c.commit?.author?.date ?? new Date().toISOString(),
        }));
      })
    );
    for (const r of commitResults) {
      if (r.status === "fulfilled") items.push(...r.value);
    }
  }

  // Fetch decisions + sessions from DB in parallel
  const [dbEntries, dbSessions] = await Promise.all([
    db
      .select({ id: entriesTable.id, projectId: entriesTable.projectId, title: entriesTable.title, summary: entriesTable.summary, createdAt: entriesTable.createdAt })
      .from(entriesTable)
      .where(and(inArray(entriesTable.projectId, projectIds), eq(entriesTable.status, "committed")))
      .orderBy(desc(entriesTable.createdAt))
      .limit(30),
    db
      .select({ id: sessionsTable.id, projectId: sessionsTable.projectId, title: sessionsTable.title, messageCount: sessionsTable.messageCount, createdAt: sessionsTable.createdAt })
      .from(sessionsTable)
      .where(inArray(sessionsTable.projectId, projectIds))
      .orderBy(desc(sessionsTable.createdAt))
      .limit(20),
  ]);

  for (const e of dbEntries) {
    items.push({
      type: "decision",
      projectId: e.projectId,
      projectName: projectNameById.get(e.projectId) ?? "Unknown",
      title: e.title,
      subtitle: e.summary ?? undefined,
      timestamp: e.createdAt.toISOString(),
    });
  }
  for (const s of dbSessions) {
    items.push({
      type: "session",
      projectId: s.projectId,
      projectName: projectNameById.get(s.projectId) ?? "Unknown",
      title: s.title,
      subtitle: s.messageCount > 0 ? `${s.messageCount} msg` : undefined,
      timestamp: s.createdAt.toISOString(),
    });
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json({ items: items.slice(0, 40) });
});

// POST /api/nexus/visualize — generate an image from a prompt (called by useNexusChatStream)
router.post("/nexus/visualize", async (req, res): Promise<void> => {
  const userId = (req as any).authUser?.id as number | undefined;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { prompt } = req.body as { prompt?: string };
  if (!prompt?.trim()) { res.status(400).json({ error: "prompt required" }); return; }

  try {
    const enginePrompt = `${prompt.trim()} Ultra-premium, cinematic quality. Sleek dark-mode aesthetic with obsidian depth, luxury glassmorphism elements, subtle amber/gold accent glows. Sophisticated editorial lighting, presentation-ready professional finish.`;
    const r = await genai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: enginePrompt,
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });
    const parts = r.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
    if (imagePart?.inlineData?.data) {
      res.json({ imageBase64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType });
    } else {
      res.status(502).json({ error: "Image generation returned no image" });
    }
  } catch (err) {
    logger.warn({ err }, "nexus/visualize image generation failed");
    res.status(502).json({ error: "Image generation failed" });
  }
});

// Shared handler: generate a short project/conversation title from a message or transcript.
// Stateless NLP utility — no surface dependency. Registered at both /atlas/name (canonical)
// and /nexus/name (legacy alias, kept for backwards compatibility).
const handleGenerateName: import("express").RequestHandler = async (req, res): Promise<void> => {
  const body = req.body as { message?: string; messages?: Array<{ role: string; content: string }> };

  // Build context string — prefer full transcript over single message
  let context = "";
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    context = body.messages
      .slice(-12)
      .map((m) => `${m.role === "user" ? "User" : "Atlas"}: ${String(m.content ?? "").slice(0, 600)}`)
      .join("\n\n")
      .slice(0, 3000);
  } else if (body.message?.trim()) {
    context = body.message.slice(0, 800);
  }

  if (!context) { res.json({ name: "" }); return; }

  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 20,
      messages: [{
        role: "user",
        content: `Read this conversation and generate a concise, memorable project name for what is being built.\n\nRules:\n- 2-5 words maximum\n- Title case\n- Evocative and specific — capture the idea, not the category\n- No punctuation\n- Avoid generic words like "Project", "App", "Platform" unless they are essential to the concept\n- Examples of good names: "Living Legacy Box", "Founder Decision Log", "Atlas Memory Layer"\n\nConversation:\n${context}\n\nRespond with only the project name, nothing else.`,
      }],
    });
    const raw = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
    const name = raw.replace(/["""''`]/g, "").replace(/[.!?]$/, "").trim();
    res.json({ name: name || "" });
  } catch {
    res.json({ name: "" });
  }
};

// POST /api/atlas/name — canonical path (surface-neutral title generator)
router.post("/atlas/name", handleGenerateName);

// POST /api/nexus/name — legacy alias; kept so old call sites and Cloud Run proxy
// routes continue to work without a flag day. Remove after all clients migrate.
router.post("/nexus/name", handleGenerateName);

// POST /api/nexus/write-file — nexus-layer file write (auth + ownership validated here)
// Body: { projectId: number, path: string, content: string }
// Returns: { ok: true, path: string, lines: number, existed: boolean }
router.post("/nexus/write-file", async (req, res): Promise<void> => {
  try {
    const userId = (req as any).authUser?.id as number | undefined;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { projectId, path: userPath, content } = req.body as {
      projectId?: unknown; path?: unknown; content?: unknown;
    };

    const numericProjectId = Number(projectId);
    if (!numericProjectId || !Number.isFinite(numericProjectId)) {
      res.status(400).json({ error: "Invalid project id" }); return;
    }
    if (typeof userPath !== "string" || !userPath.trim()) {
      res.status(400).json({ error: "Missing path" }); return;
    }
    if (typeof content !== "string") {
      res.status(400).json({ error: "Missing content" }); return;
    }
    if (Buffer.byteLength(content, "utf-8") > 512_000) {
      res.status(413).json({ error: "Content too large (max 500 KB)" }); return;
    }

    if (!await assertProjectOwner(numericProjectId, userId)) {
      res.status(404).json({ error: "Project not found" }); return;
    }

    const workspaceDir = await ensureProjectWorkspaceDir(numericProjectId);
    let absPath: string;
    try {
      absPath = resolveWorkspacePath(workspaceDir, userPath);
    } catch {
      res.status(400).json({ error: "Invalid path" }); return;
    }

    let existed = false;
    try {
      await fsPromises.access(absPath);
      existed = true;
    } catch { /* new file */ }

    await fsPromises.mkdir(nodePath.dirname(absPath), { recursive: true });
    await fsPromises.writeFile(absPath, content, "utf-8");

    const lines = content.split("\n").length;
    logger.info({ userId, projectId: numericProjectId, path: userPath, lines, existed }, "nexus write-file");
    res.json({ ok: true, path: userPath, lines, existed });
  } catch (err) {
    logger.error({ err }, "nexus write-file error");
    res.status(500).json({ error: "Failed to write file" });
  }
});

export default router;
