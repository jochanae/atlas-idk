/**
 * Feature flag for the Atlas agent loop.
 * USE_AGENT_LOOP=true enables the loop for users in AGENT_LOOP_USER_ALLOWLIST.
 */
export function shouldUseAgentLoop(userId?: number): boolean {
  if (process.env.USE_AGENT_LOOP !== "true") return false;
  const raw = process.env.AGENT_LOOP_USER_ALLOWLIST ?? "";
  const allowlist = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (allowlist.length === 0) return false;
  if (!userId) return false;
  return allowlist.includes(String(userId));
}

/**
 * Feature flag for structured plan tool output.
 * USE_STRUCTURED_PLAN=true enables propose_plan / revise_plan / commit_plan for allowlisted users.
 */
export function shouldUseStructuredPlan(userId?: number): boolean {
  if (process.env.USE_STRUCTURED_PLAN !== "true") return false;
  const raw = process.env.STRUCTURED_PLAN_USER_ALLOWLIST ?? process.env.AGENT_LOOP_USER_ALLOWLIST ?? "";
  const allowlist = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (allowlist.length === 0) return false;
  if (!userId) return false;
  return allowlist.includes(String(userId));
}
