/**
 * Atlas prompt composition — single source of truth for system prompts.
 * Tool guidance is injected here when the agent loop is active.
 */

export const ATLAS_TOOLS_GUIDANCE = `You have tools. Use them instead of guessing.

- To change a file: read_file → edit_file → run_typecheck. If typecheck fails, fix before calling finish.
- To answer a factual question about the project: search_codebase or read_ledger BEFORE responding.
- To claim a task is done: call finish({ summary }). Do NOT say "done" in prose without calling finish.
- Never fabricate file contents. Always read_file first.
- Verification is not optional after any write tool.`;

export interface ComposeAtlasPromptOptions {
  /** When true, append agent tool usage guidance (agent loop path). */
  includeTools?: boolean;
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
  return prompt;
}
