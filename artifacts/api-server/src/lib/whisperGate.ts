/**
 * WhisperGate — pre-classifies user chat input BEFORE the main agent loop runs.
 *
 * Purpose: kill the "hello triggers a run card / GitHub write" noise. The main
 * chat pipeline was firing operational side effects (step events, GitHub
 * bootstrap, build ops) on EVERY turn regardless of whether the user was
 * chatting, deciding, or actually asking to build. WhisperGate is the missing
 * front-door: one fast classifier call whose only job is to route the turn.
 *
 * Intents:
 *  - CHAT   → conversational, no tools, no steps, no run card. Just talk.
 *  - DECIDE → structured options / tradeoffs. Model may emit DECIDE blocks,
 *             but still no build ops. No file edits, no GitHub, no steps.
 *  - BUILD  → full agent loop, tools enabled, step events on, run recorded.
 *
 * Design principles:
 *  - Fast: cheap model, minimal context (last 2 turns + current message).
 *  - Cheap: Haiku-tier. No thinking. No streaming.
 *  - Bounded: timeout budget. On timeout or error, fall back to DECIDE —
 *    uncertainty must never cause the system to act. Think, don't build.
 *  - Explicit: returns reason string so we can debug misclassifications.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

export type WhisperIntent = "CHAT" | "DECIDE" | "BUILD";

export interface WhisperResult {
  intent: WhisperIntent;
  confidence: number;   // 0..1
  reason: string;       // short human-readable rationale
  fallback: boolean;    // true if classification failed and we defaulted
  elapsedMs: number;
  model?: string;
}

interface WhisperInput {
  message: string;
  /** Prior turns, oldest first. Only last 2 are used. */
  history?: Array<{ role: string; content: string }>;
  /** Workspace lens hint (BUILD lens biases toward BUILD). */
  workspaceLens?: string;
  /** If user is inside a project workspace vs. Ask Atlas home. */
  hasProjectContext?: boolean;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are WhisperGate, a fast intent classifier for a decision-led builder called Atlas. You do NOT answer the user. You classify their turn into exactly one of three intents.

CHAT — Pure conversation. Greetings, small talk, thinking aloud, venting, meta-questions about Atlas itself, "hello", "how are you", clarifying a prior response, expressing feelings, casual back-and-forth. NO action requested.

DECIDE — User is weighing options, asking for tradeoffs, asking "should I", "what would you recommend", "help me think through", comparing paths, prioritizing. They want structured thinking, not code.

BUILD — User is asking to CREATE, EDIT, GENERATE, FIX, DEPLOY, or PRODUCE something concrete. Includes: "make me a X", "fix the Y", "add Z", "write code that", "generate a slide deck", "create a landing page", "push to github", "deploy this", or explicit affirmation of a prior build proposal ("yes do it", "go ahead", "start" after a build plan).

BUILD requires an explicit action verb from the user in THIS turn, OR an unambiguous affirmation of a prior BUILD proposal from the assistant. Action verbs: build, create, make, fix, wire, implement, deploy, edit, generate, apply, run, add, remove, delete, push, ship, refactor, rename, install.

If the user is describing a problem, expressing a preference, wondering, considering, or asking "should we / could we / maybe we", that is DECIDE — not BUILD, even if it names a concrete change.

Examples:
- "Maybe we should delete Ask Atlas." → DECIDE
- "Delete Ask Atlas." → BUILD
- "Can you help me think through deleting Ask Atlas?" → DECIDE
- "I'm frustrated with this." → CHAT
- "What do you think about X?" → CHAT or DECIDE (never BUILD)

Rules:
- When ambiguous between DECIDE and BUILD, choose DECIDE.
- When ambiguous between CHAT and DECIDE, choose CHAT.
- When ambiguous between CHAT and BUILD, choose CHAT. Building on a false positive is worse than chatting on a false negative.
- "yes" / "go" / "start" / "do it" — look at the prior assistant turn. If the assistant proposed a build, it's BUILD. If it proposed options, it's DECIDE. If it was conversational, it's CHAT.
- Requests to explain, discuss, describe, or analyze are CHAT (or DECIDE if comparing).
- A slide deck, document, image, or file the user explicitly asks you to make IS a BUILD.

Return ONLY a compact JSON object, no prose, no markdown fences:
{"intent":"CHAT|DECIDE|BUILD","confidence":0.0-1.0,"reason":"<10 words"}`;

const CLASSIFICATION_TIMEOUT_MS = 1500;
const WHISPER_MODEL = "claude-haiku-4-5";

/** Boring allowlist for pure greetings / small-talk — skip the LLM classifier.
 *  Tokens may be combined with punctuation/whitespace ("Hey, how are you"). */
const CHAT_TOKEN = String.raw`(?:hey|hi|hello|yo|sup|good\s+(?:morning|afternoon|evening|night)|how\s+(?:are|r)\s+(?:you|u|ya)|what's\s+up|whats\s+up|wassup|thanks|thank\s+you|ty|ok(?:ay)?|cool|nice|great|awesome|lol|haha|👋|🙏)`;
const CHAT_BYPASS = new RegExp(String.raw`^\s*${CHAT_TOKEN}(?:[\s!?.,]+${CHAT_TOKEN})*[\s!?.,]*$`, "i");

function logWhisperTurn(result: Omit<WhisperResult, "reason"> & { reason: string; confidence: number | undefined; model?: string }) {
  const model = result.model ?? WHISPER_MODEL;
  logger.info({
    event: "whisperGate.turn",
    intent: result.intent,
    confidence: result.confidence,
    reason: result.reason,
    fallback: result.fallback,
    elapsedMs: result.elapsedMs,
    model,
  }, result.fallback ? "whisperGate: classification failed, defaulting to DECIDE" : "whisperGate: classified");
}

export async function classifyIntent(input: WhisperInput): Promise<WhisperResult> {
  const startedAt = Date.now();
  const message = (input.message ?? "").trim();

  // Trivial short-circuits — no need to spend a model call.
  if (!message) {
    const result: WhisperResult = { intent: "CHAT", confidence: 1, reason: "empty message", fallback: false, elapsedMs: 0, model: "regex" };
    logWhisperTurn(result);
    return result;
  }

  // Pre-classifier CHAT bypass — greetings / small talk never hit the LLM.
  if (message.length < 40 && CHAT_BYPASS.test(message)) {
    const result: WhisperResult = {
      intent: "CHAT",
      confidence: 1,
      reason: "greeting_bypass",
      fallback: false,
      elapsedMs: 0,
      model: "regex",
    };
    logWhisperTurn(result);
    return result;
  }

  const recent = (input.history ?? []).slice(-2).map((h) => `${h.role.toUpperCase()}: ${String(h.content ?? "").slice(0, 400)}`).join("\n");
  const contextBlock = [
    input.workspaceLens ? `Workspace lens: ${input.workspaceLens}` : null,
    input.hasProjectContext === false ? "Context: Ask Atlas (no project)" : "Context: project workspace",
    recent ? `Recent turns:\n${recent}` : null,
  ].filter(Boolean).join("\n");

  const userBlock = `${contextBlock}\n\nUSER TURN:\n${message.slice(0, 2000)}`;

  try {
    const resp = await Promise.race([
      anthropic.messages.create({
        model: WHISPER_MODEL,
        max_tokens: 80,
        system: SYSTEM,
        messages: [{ role: "user", content: userBlock }],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("whisperGate_timeout")), CLASSIFICATION_TIMEOUT_MS)),
    ]);

    const textBlock = (resp as Anthropic.Message).content.find((c) => c.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no_json_in_response");

    const parsed = JSON.parse(jsonMatch[0]) as { intent?: string; confidence?: number; reason?: string };
    const intent = (parsed.intent ?? "").toUpperCase();
    if (intent !== "CHAT" && intent !== "DECIDE" && intent !== "BUILD") {
      throw new Error(`invalid_intent:${intent}`);
    }

    const elapsedMs = Date.now() - startedAt;
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7;
    const reason = (parsed.reason ?? "").slice(0, 120);
    logWhisperTurn({
      intent: intent as WhisperIntent,
      confidence,
      reason,
      fallback: false,
      elapsedMs,
      model: WHISPER_MODEL,
    });
    return {
      intent: intent as WhisperIntent,
      confidence,
      reason,
      fallback: false,
      elapsedMs,
      model: WHISPER_MODEL,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    // FALLBACK POLICY: default to DECIDE. Uncertainty must never cause the
    // system to act — think, don't build. Acting on a false BUILD is worse
    // than asking the user to clarify a real build request.
    logger.warn({ err: String(err), elapsedMs, message: message.slice(0, 120) }, "whisperGate: classification failed");
    const result: WhisperResult = { intent: "DECIDE", confidence: 0, reason: "classifier_failed", fallback: true, elapsedMs, model: WHISPER_MODEL };
    logWhisperTurn(result);
    return result;
  }
}
