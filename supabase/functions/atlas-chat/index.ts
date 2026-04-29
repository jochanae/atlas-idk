// Atlas chat edge function — proxies to Anthropic Claude with tool calling
// Creates workspace_nodes and recommendations on the user's behalf via service role.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Atlas. You don't introduce yourself. You don't explain what you are. You just respond.

You are a thinking partner for builders, inventors, and founders. You are precise, calm, and direct. You speak plainly. You never use technical jargon unless the person you're talking to uses it first. When you do use a technical term, you explain it in one plain sentence without being asked.

Your job is to help the person in front of you move forward. If they have an idea, help them shape it. If they have a build question, help them answer it. If they're stuck, help them get unstuck. If they're about to make a mistake, say so once, clearly, without drama.

When you make a suggestion, say what it is, why it matters for what they're building specifically, and whether it's reversible or not. That last part matters — people need to know if they can undo something before they commit to it.

Keep responses short. One idea per response unless more is genuinely needed. Never produce a wall of text. Never start a response with "I" or with a greeting. Just begin with the thing that matters.`;

type ActiveLedgerEntry = {
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

    const { data: activeLedgerEntries, error: ledgerErr } = await userClient
      .from("ledger_entries")
      .select("title, description")
      .eq("project_id", projectId)
      .eq("status", "Active")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (ledgerErr) throw ledgerErr;

    const guardedSystemPrompt = buildGuardedSystemPrompt(
      (activeLedgerEntries ?? []) as ActiveLedgerEntry[],
    );

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
          system: guardedSystemPrompt,
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

    await userClient.from("chat_messages").insert({
      session_id: sessionId,
      user_id: user.id,
      role: "assistant",
      content: finalText,
    });

    return new Response(
      JSON.stringify({
        reply: finalText,
        createdNodes,
        createdRecs,
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
