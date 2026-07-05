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
