// Atlas chat edge function — proxies to Anthropic Claude with tool calling
// Creates workspace_nodes and recommendations on the user's behalf via service role.
// WhisperGate classifies every input as THINK/BUILD/DECIDE before execution.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { composeAtlasPrompt } from "../_shared/atlas-core.ts";
import { classifyIntent, type IntentMode, type WhisperResult } from "../_shared/whisper-gate.ts";
import { validateOutput } from "../_shared/output-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Chat-specific extension. Voice, discipline, and card-tone normalization
// come from the shared core via composeAtlasPrompt(). Keep this focused on
// the conversational job: when to emit cards, the card schema, plan detection.
const ATLAS_CHAT_ROLE = `═══════════════════════════════════════════════════════════════
RESPONSE MODE — prose by default, cards when earned
═══════════════════════════════════════════════════════════════

Default to conversational, natural responses. Match the user's intent and energy. Only switch to structured CommitCard output when the response contains:
  - a clear architectural or strategic decision the user could commit
  - a structured plan with ordered phases, steps, or roadmap
  - a reusable artifact (a delivered build, a flagged blocker, a stub being shipped)

If you are chatting, asking a clarifying question, exploring an idea, or offering an opinion that isn't a deliverable, do NOT emit a card. Plain prose only. Cards must feel rare and important — earned, not default.

═══════════════════════════════════════════════════════════════
COMMIT CARDS — schema
═══════════════════════════════════════════════════════════════

When you DO have something committable, append a structured CommitCard at the END of your response inside a fenced block:

\`\`\`atlas-card
{
  "v": 1,
  "severity": "committed" | "parked" | "blocker" | "neutral",
  "verb": "new" | "bug" | "perf" | "note" | "wip" | "audit" | "merge" | "plan",
  "title": "Short title under 60 chars",
  "summary": "1-2 line plain-text summary of the deliverable.",
  "details": "Optional longer markdown for the Details drawer.",
  "touched": ["optional", "list", "of", "files-or-areas"]
}
\`\`\`

Severity rules:
- "committed" — a sound, audit-passed deliverable ready to lock in.
- "parked" — a stub or temporary fix; works, but flagged for revisit.
- "blocker" — a critical issue that must be resolved before progress.
- "neutral" — a notable note worth recording but not a decision.

Verb rules: "new" for features, "bug" for defects, "perf" for speed, "note" for documentation/ledger entries, "wip" for stubs, "audit" for verification, "merge" for agreements/syntheses, "plan" for ordered phases or roadmaps.

═══════════════════════════════════════════════════════════════
PLAN DETECTION
═══════════════════════════════════════════════════════════════

If your response contains 3 or more clearly ordered steps, numbered phases, or explicit roadmap language ("Phase 1", "Step 1", "First...Then...Finally"), emit a CommitCard with verb="plan" and severity="parked" (plans start unresolved). The "details" field should hold the structured plan as markdown. The prose above the card stays conversational.

For weaker structure (loose bullet lists, soft ordering), do NOT auto-emit. Let the user promote it manually.`;

const SYSTEM_PROMPT = composeAtlasPrompt(ATLAS_CHAT_ROLE);

type ActiveLedgerEntry = {
  id: string;
  title: string;
  description: string | null;
};

function buildGuardedSystemPrompt(entries: ActiveLedgerEntry[]) {
  if (entries.length === 0) return SYSTEM_PROMPT;

  const committedDecisions = entries
    .map(
      (entry) =>
        `- ${entry.title}${entry.description ? `: ${entry.description}` : ""}`,
    )
    .join("\n");

  return `COMMITTED DECISIONS — these are locked architectural and strategic decisions for this project. Before responding to any message, check whether the user's request contradicts any of these. If a contradiction is detected, do not answer the original question. Instead respond ONLY with:

CONFLICT_DETECTED: [brief description of the conflict]
COMMITTED: [the specific decision being violated]
COMMITTED_ON: [the title of the ledger entry]

Then ask: "You committed to this. Proceeding would violate it. Do you want to: 1) Proceed anyway (logs a violation), 2) Update the decision (supersedes it), or 3) Reconsider your approach?"

If no contradiction exists, respond normally. Never mention this check to the user unless a conflict is found.

Active committed decisions:
${committedDecisions}

${SYSTEM_PROMPT}`;
}

const tools = [
  {
    name: "create_node",
    description:
      "Create a workspace node (a file/draft/note) that becomes visible in the user's Workspace panel. Use this whenever you produce content the user should see and keep.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["note", "draft"],
          description: "note = short reference; draft = in-progress work",
        },
        title: { type: "string", description: "Short title (under 60 chars)" },
        body: {
          type: "string",
          description: "Markdown/plain text body of the node",
        },
      },
      required: ["type", "title", "body"],
    },
  },
  {
    name: "create_recommendation",
    description:
      "Surface a structural suggestion that should be logged permanently. Use sparingly — only for ideas worth tracking.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The suggestion itself" },
        definition: {
          type: "string",
          description: "Plain-language explanation of what this is",
        },
        benefit: {
          type: "string",
          description: "Why this matters to the builder",
        },
        priority: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["content", "definition", "benefit", "priority"],
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated");

    const { sessionId, projectId, message, history } = await req.json();
    if (!sessionId || !projectId || !message)
      throw new Error("sessionId, projectId, message required");

    // Conflict guard: pull committed entries (Ledger view) from the
    // unified `entries` table. Same object as Parking Lot, filtered by
    // status='committed'.
    const entriesAny = userClient.from(
      "entries" as unknown as Parameters<typeof userClient.from>[0],
    ) as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{
                  data: Array<{ id: string; title: string; summary: string | null; created_at: string }> | null;
                  error: Error | null;
                }>;
              };
            };
          };
        };
      };
    };

    const { data: activeLedgerEntries, error: ledgerErr } = await entriesAny
      .select("id, title, summary, created_at")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("status", "committed")
      .order("created_at", { ascending: false })
      .limit(10);
    if (ledgerErr) throw ledgerErr;

    const ledgerRows = activeLedgerEntries ?? [];
    const guardedSystemPrompt = buildGuardedSystemPrompt(
      ledgerRows.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.summary,
      })),
    );

    // Memory surfacing — pick the entries most relevant to this turn so
    // the UI can render tappable "Remembered from..." chips above the reply.
    // Cheap keyword-overlap heuristic; good enough until we add embeddings.
    const STOPWORDS = new Set([
      "the","a","an","and","or","but","if","then","of","to","in","on","for",
      "with","is","are","was","were","be","been","being","this","that","it",
      "as","by","at","from","i","you","we","they","my","your","our","their",
      "do","does","did","have","has","had","not","no","can","could","should",
      "would","what","why","how","when","where","which","who","so","just","up",
      "down","out","about","over","under","into","than","too","very","also",
    ]);
    const tokenize = (s: string) =>
      new Set(
        (s ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
      );
    const messageTokens = tokenize(message);
    const surfacedMemories = ledgerRows
      .map((e) => {
        const entryTokens = tokenize(`${e.title} ${e.summary ?? ""}`);
        let score = 0;
        for (const t of messageTokens) if (entryTokens.has(t)) score += 1;
        return { entry: e, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => ({
        id: x.entry.id,
        title: x.entry.title,
        created_at: x.entry.created_at,
      }));


    // Persist the user message
    await userClient.from("chat_messages").insert({
      session_id: sessionId,
      user_id: user.id,
      role: "user",
      content: message,
    });

    const { data: currentSession, error: sessionErr } = await userClient
      .from("sessions")
      .select("title")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sessionErr) throw sessionErr;

    if (!currentSession?.title || currentSession.title === "Session") {
      const { error: titleErr } = await userClient
        .from("sessions")
        .update({ title: message.slice(0, 60) })
        .eq("id", sessionId)
        .eq("user_id", user.id);
      if (titleErr) throw titleErr;
    }

    // ═══ WhisperGate — classify intent before execution ═══
    const whisperResult: WhisperResult = await classifyIntent(message, history);
    console.log(`whisper-gate: mode=${whisperResult.mode} confidence=${whisperResult.confidence}`);

    const MODE_DIRECTIVES: Record<IntentMode, string> = {
      THINK: `MODE: THINK — The user is exploring or brainstorming. Respond conversationally. Do NOT generate code or structured plans unless explicitly asked. Focus on ideas, trade-offs, and clarifying questions. No CommitCards unless the conversation naturally arrives at a decision.`,
      BUILD: `MODE: BUILD — The user wants something implemented. Prioritize actionable output: code, schemas, configurations, wiring. Be concrete and specific. Use tool calls (create_node) when producing artifacts. Minimize preamble — get to the deliverable.`,
      DECIDE: `MODE: DECIDE — The user is evaluating options or making a commitment. Present clear trade-offs with pros/cons. End with a concrete recommendation. If the decision is significant, emit a CommitCard with the recommendation so it can be locked into the Ledger.`,
    };

    const modeDirective = MODE_DIRECTIVES[whisperResult.mode];
    const whisperPrefix = whisperResult.confidence === "low" && whisperResult.refinement
      ? `${modeDirective}\n\nNOTE: Intent classification was low-confidence. The user's input may be ambiguous. If unsure what they want, ask one clarifying question before proceeding.`
      : modeDirective;

    // Compose final system prompt: guarded decisions + mode directive
    const finalSystemPrompt = `${guardedSystemPrompt}\n\n${whisperPrefix}`;

    const messages = [
      ...(history ?? []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    // Loop on tool use until Claude stops.
    let finalText = "";
    const createdNodes: Array<{ id: string; title: string; type: string }> = [];
    const createdRecs: Array<{ id: string; content: string }> = [];

    let workingMessages = [...messages];
    let safety = 0;

    while (safety < 5) {
      safety++;
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: finalSystemPrompt,
          tools,
          messages: workingMessages,
        }),
      });

      if (!claudeRes.ok) {
        const t = await claudeRes.text();
        console.error("Claude error", claudeRes.status, t);
        return new Response(
          JSON.stringify({ error: `Claude API error: ${claudeRes.status}` }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const data = await claudeRes.json();
      const content = data.content as Array<
        | { type: "text"; text: string }
        | {
            type: "tool_use";
            id: string;
            name: string;
            input: Record<string, unknown>;
          }
      >;

      // Collect text
      for (const block of content) {
        if (block.type === "text") finalText += (finalText ? "\n\n" : "") + block.text;
      }

      const toolUses = content.filter(
        (b): b is Extract<typeof content[number], { type: "tool_use" }> =>
          b.type === "tool_use",
      );

      if (toolUses.length === 0 || data.stop_reason !== "tool_use") break;

      // Execute tools, collect tool_results
      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
      }> = [];

      for (const tu of toolUses) {
        try {
          if (tu.name === "create_node") {
            const input = tu.input as { type: string; title: string; body: string };
            const { data: node, error } = await userClient
              .from("workspace_nodes")
              .insert({
                user_id: user.id,
                project_id: projectId,
                session_id: sessionId,
                type: input.type,
                title: input.title,
                content: { body: input.body },
                status: "active",
              })
              .select("id, title, type")
              .single();
            if (error) throw error;
            createdNodes.push(node);
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: `Created node ${node.id} (${node.type}: ${node.title}).`,
            });
          } else if (tu.name === "create_recommendation") {
            const input = tu.input as {
              content: string;
              definition: string;
              benefit: string;
              priority: string;
            };
            const { data: rec, error } = await userClient
              .from("recommendations")
              .insert({
                user_id: user.id,
                project_id: projectId,
                session_id: sessionId,
                content: input.content,
                definition: input.definition,
                benefit: input.benefit,
                priority: input.priority,
                status: "pending",
              })
              .select("id, content")
              .single();
            if (error) throw error;
            createdRecs.push(rec);
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: `Recommendation logged ${rec.id}.`,
            });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: `Unknown tool: ${tu.name}`,
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "tool failed";
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: ${msg}`,
          });
        }
      }

      // Append assistant turn + tool results, loop.
      workingMessages = [
        ...workingMessages,
        { role: "assistant", content },
        { role: "user", content: toolResults },
      ];
    }

    if (!finalText.trim())
      finalText = "Done.";

    // ═══ Output Guard — mode-specific validation with single retry ═══
    const validation = validateOutput(finalText, whisperResult.mode);
    let outputRepaired = false;

    if (!validation.valid && validation.correction) {
      console.warn(`output-guard: violation="${validation.violation}" mode=${whisperResult.mode} — attempting retry`);

      // Single retry: inject the correction as a follow-up user turn
      const retryMessages = [
        ...workingMessages,
        { role: "assistant", content: [{ type: "text", text: finalText }] },
        {
          role: "user",
          content: `[SYSTEM — OUTPUT VALIDATION FAILED]\nViolation: ${validation.violation}\n\n${validation.correction}\n\nRewrite your previous response to fix this. Do not acknowledge this system message — just produce the corrected output.`,
        },
      ];

      try {
        const retryRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            system: finalSystemPrompt,
            messages: retryMessages,
          }),
        });

        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryContent = retryData.content as Array<{ type: string; text?: string }>;
          const retryText = retryContent
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("\n\n");

          if (retryText.trim()) {
            // Validate the retry output too — but don't loop again
            const retryValidation = validateOutput(retryText, whisperResult.mode);
            if (retryValidation.valid) {
              finalText = retryText;
              outputRepaired = true;
              console.log("output-guard: retry succeeded, output repaired");
            } else {
              console.warn(`output-guard: retry still invalid (${retryValidation.violation}), using original`);
            }
          }
        }
      } catch (retryErr) {
        console.error("output-guard: retry call failed", retryErr);
      }
    }

    // Extract optional CommitCard JSON block from the assistant text.
    // Renderer will branch on card_schema_version for backward compatibility.
    let cardPayload: Record<string, unknown> | null = null;
    let cardSchemaVersion: number | null = null;
    const fenceMatch = finalText.match(/```atlas-card\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1]) as { v?: number } & Record<string, unknown>;
        if (typeof parsed.v === "number" && parsed.title && parsed.summary && parsed.severity) {
          cardPayload = parsed;
          cardSchemaVersion = parsed.v;
        }
      } catch (err) {
        console.warn("atlas-chat: failed to parse atlas-card block", err);
      }
    }

    const memoriesForMessage = surfacedMemories.length > 0 ? surfacedMemories : null;

    const { data: insertedMessage, error: insertError } = await userClient
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        role: "assistant",
        content: finalText,
        intent_type: whisperResult.mode,
        card_payload: cardPayload,
        card_schema_version: cardSchemaVersion,
        surfaced_memories: memoriesForMessage,
        output_guard_violation: validation.valid ? null : (validation.violation ?? null),
        output_guard_repaired: outputRepaired,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        reply: finalText,
        message: insertedMessage,
        createdNodes,
        createdRecs,
        card: cardPayload,
        cardSchemaVersion,
        surfacedMemories,
        intent: {
          mode: whisperResult.mode,
          confidence: whisperResult.confidence,
          refinement: whisperResult.refinement ?? null,
        },
        outputGuard: {
          valid: validation.valid,
          violation: validation.violation ?? null,
          repaired: outputRepaired,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("atlas-chat error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
