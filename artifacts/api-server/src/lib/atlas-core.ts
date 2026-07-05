/**
 * Atlas prompt composition — single source of truth for system prompts.
 * Tool guidance is injected here when the agent loop is active.
 */

export const ATLAS_TOOLS_GUIDANCE = `You have tools. Use them instead of guessing.

- To change a file: read_file → edit_file → run_typecheck. If typecheck fails, fix before calling finish.
- To answer a factual question about the project: search_codebase or read_ledger BEFORE responding.
- To claim a task is done: call finish({ summary }). Do NOT say "done" in prose without calling finish.
- Never fabricate file contents. Always read_file first.
- Verification is not optional after any write tool.
- When foundational project context is incomplete, use tier1_upsert_field to capture answers the user volunteers. Use tier1_mark_skipped if they ask you to stop.`;

export const ATLAS_PLANNING_GUIDANCE = `Planning discipline:
- Multi-file or cross-layer work REQUIRES propose_plan before any write tool.
- Step titles must be actionable ("Add /agent_runs table", not "database work").
- Each step should name what would prove it done in the verification field.
- Never describe the plan in prose after calling propose_plan — the artifact IS the plan.
- After user commits (commit_plan approved), execute steps in order. Skip a step only by revising the plan.
- Limits: step title ≤ 80 chars, detail ≤ 400 chars, ≤ 12 steps. Split into multiple plans if larger.`;

export interface ComposeAtlasPromptOptions {
  /** When true, append agent tool usage guidance (agent loop path). */
  includeTools?: boolean;
  /** When true, append structured plan discipline (USE_STRUCTURED_PLAN path). */
  includePlanning?: boolean;
}

/**
 * Compose the final Atlas system prompt from a base prompt and optional role-specific sections.
 */
export function composeAtlasPrompt(
  basePrompt: string,
  roleSpecific?: ComposeAtlasPromptOptions,
): string {
  let prompt = basePrompt;
  if (roleSpecific?.includeTools) {
    prompt += `\n\n--- AGENT TOOLS ---\n${ATLAS_TOOLS_GUIDANCE}\n--- END AGENT TOOLS ---`;
  }
  if (roleSpecific?.includePlanning) {
    prompt += `\n\n--- PLANNING ---\n${ATLAS_PLANNING_GUIDANCE}\n--- END PLANNING ---`;
  }
  return prompt;
}
