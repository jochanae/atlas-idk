import type Anthropic from "@anthropic-ai/sdk";
import { asSchema } from "ai";
import type { AgentToolContext } from "./context";
import { buildAgentTools } from "./index";

/**
 * Single source of truth bridge: converts the shared `lib/agent-tools`
 * registry (Vercel AI SDK `tool()` definitions, consumed by the agent loop
 * via `streamText`) into the `Anthropic.Tool` shape the raw
 * `@anthropic-ai/sdk` streaming calls in routes/nexus.ts expect.
 *
 * This exists so nexus.ts never re-declares a capability's name/description/
 * schema by hand — it always derives the tool list from buildAgentTools().
 */

type SharedToolSet = ReturnType<typeof buildAgentTools>;

/**
 * Build Anthropic.Tool schema entries for a subset of the shared registry.
 * `ctx` only needs to be valid enough to construct the tools (schemas and
 * descriptions never depend on per-request runtime values) — a placeholder
 * context is fine here since `.execute` is never called through this path.
 */
export function toAnthropicTools(ctx: AgentToolContext, names: string[]): Anthropic.Tool[] {
  const tools = buildAgentTools(ctx);
  const out: Anthropic.Tool[] = [];
  for (const name of names) {
    const t = (tools as SharedToolSet)[name as keyof SharedToolSet];
    if (!t) continue;
    const schema = asSchema(t.inputSchema as any).jsonSchema;
    const description = typeof t.description === "string" ? t.description : name;
    out.push({
      name,
      description,
      input_schema: schema as Anthropic.Tool["input_schema"],
    });
  }
  return out;
}

/**
 * Execute a shared registry tool by name against a REAL per-request context.
 * Used by nexus.ts's tool loop for any tool name that isn't one of the
 * nexus-specific dual-mode tools (create_project, and the pre-project buffer
 * branches of tier1_upsert_field / tier1_mark_skipped).
 */
export async function executeSharedAgentTool(
  ctx: AgentToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tools = buildAgentTools(ctx);
  const t = (tools as SharedToolSet)[name as keyof SharedToolSet];
  if (!t || typeof t.execute !== "function") {
    return { ok: false, error: "unknown_tool" };
  }
  const result = await t.execute(input as never, {
    toolCallId: `nexus-${Date.now()}`,
    messages: [],
  } as never);
  return (result ?? {}) as Record<string, unknown>;
}

export const SHARED_HOME_TOOL_NAMES = [
  "search_all_projects",
  "list_user_projects",
  "architecture_diff",
  "project_knowledge",
  "component_registry",
  "generate_deliverable",
];

export const SHARED_WORKSPACE_TOOL_NAMES = [
  "read_file",
  "generate_deliverable",
  "run_browser_flow",
  "search_all_projects",
  "search_codebase",
  "list_reference_project_dir",
  "read_reference_project_file",
  "architecture_diff",
  "project_knowledge",
  "component_registry",
];
