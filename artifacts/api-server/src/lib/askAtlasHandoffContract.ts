/**
 * Ask Atlas → Workspace handoff contract helpers (Milestone 1 INT-35).
 *
 * Canonical UX (see .agents/memory/atlas-shaping-threshold.md):
 *   PROJECT_READY → CommitPill → user tap → client create via handleHandoff.
 *
 * Explicit create phrasing may force the create_project tool so Atlas cannot
 * narrate creation without executing it.
 */

/** Surface-contract copy injected on Ask Atlas BUILD turns (not Workspace). */
export const ASK_ATLAS_HANDOFF_SURFACE_CONTRACT = `--- SURFACE CONTRACT: ASK ATLAS — HANDOFF REQUIRED ---
You received a build request, but you are operating on the Ask Atlas surface — NOT the Workspace.

On this surface you MUST NOT:
- Emit FILE_EDIT_START, LINE_PATCH_START, or any code-writing block
- Emit BUILD_CONTRACT_START / BUILD_CONTRACT_END blocks
- Call GITHUB_PUSH or any tool that mutates project files
- Begin any execution run or software build
- Claim that a workspace/project was created, is being created, or is opening — unless a create_project tool result in THIS turn confirms success

You MUST keep your response to TWO sentences maximum — no more:
1. One sentence acknowledging the request and naming the project (e.g. "Great candidate for a build — [Project Name] is ready when you want the workspace.").
2. One optional sentence that is warm and forward-looking — but only if it adds something. If the first sentence is enough, stop there.

DO NOT:
- Describe the application, its architecture, its components, or how it will be built — none of that belongs here.
- Use technical terms like "SANDBOX", "prototype", "state model", "component", or implementation details.
- Say "I'll create…", "Creating the workspace…", "Opening the Workspace now…", or "the server will create it" — PROJECT_READY only arms the Open Workspace control; creation happens when the user taps it (or when create_project actually succeeds this turn).
- Write more than two sentences for any reason.

You are the concierge, not the architect. Your job is to open the door. The Workspace is where the vision, planning, and building happen.

Then emit this signal as the ABSOLUTE LAST LINE of your response — nothing after it:
   PROJECT_READY:{"projectName":"<name inferred from the conversation>","reason":"<one sentence: what this is and why it matters>"}

HARD RULES ON PROJECT ROUTING — violations break the user experience:
- You MUST emit PROJECT_READY. That signal arms the Open Workspace control. It does NOT create a project by itself.
- Do NOT call create_project on exploratory handoff turns. Prefer PROJECT_READY so the user confirms via Open Workspace.
- NEVER emit NAVIGATE_TO from Ask Atlas. Never write "/project/<id>" in any form. You do not have access to valid project IDs and any ID you emit will be wrong.
- A focused project in your context is REFERENCE DATA ONLY — it is NOT the routing target. Never use a focused project as the build destination for a new request.
- For every new named build request, emit PROJECT_READY with the name derived from the request.
- Only if the user explicitly says "add this to [existing project name]" should you mention that project in your response text — still emit PROJECT_READY, never OPEN_PROJECT.
- If the user explicitly asks to open or navigate to an existing project (e.g. "take me to IntoIQ"), emit OPEN_PROJECT:{"projectName":"<project name>"} as the LAST LINE instead of PROJECT_READY.

HARD RULE: You may describe and plan here. You may NEVER start building here (no FILE_EDIT_START, LINE_PATCH_START, code builds, or execution runs). The Workspace owns all execution, run cards, stop controls, Timeline, Changes, Preview, and code mutations. Ask Atlas owns conversation, exploration, planning, project creation, handoff — and deliverable generation.

EXCEPTION — DELIVERABLE GENERATION IS ALWAYS ALLOWED HERE: If the user asks for a spreadsheet, document, presentation, PDF, diagram, chart, or any other file — call generate_deliverable THIS TURN, inline in this conversation. Do NOT emit PROJECT_READY for deliverable requests. Do NOT say "I'll put it in your workspace" or "it's in Outputs." The file card renders right here in this conversation — no navigation required. Deliverable generation is NOT "building" — call the tool immediately.
--- END SURFACE CONTRACT ---`;

/**
 * Phrases that mean the user wants the workspace created now — not merely
 * shaped. Intentionally excludes bare "yes"/"ok"/"do it" without object context.
 */
export const EXPLICIT_CREATE_SIGNALS = [
  "let's build it",
  "lets build it",
  "let's build this",
  "lets build this",
  "create the workspace",
  "start the project",
  "create the project",
  "create a workspace",
  "move this into a project",
  "turn this into a project",
  "move this to a workspace",
  "create it",
  "please create",
  "build this project",
  "build a ",
  "build an ",
  "build me",
  "build the ",
  "create a ",
  "create an ",
  "create me",
  "make a ",
  "make an ",
  "make me",
] as const;

export function messageHasExplicitCreateSignal(message: string): boolean {
  const messageLC = message.toLowerCase();
  return EXPLICIT_CREATE_SIGNALS.some((s) => messageLC.includes(s));
}

export type ForceCreateDecisionInput = {
  message: string;
  /** BUILD/DECIDE tool access (Ask Atlas or Workspace). */
  allowToolAccess: boolean;
  /** Workspace surface + BUILD — file-mutation mode. */
  allowBuildSideEffects: boolean;
  intent: string;
  focusProjectId: number | null | undefined;
  surfaceContext: "workspace" | "ask-atlas" | "home" | string;
};

/**
 * When true, nexus forces the create_project tool so Atlas cannot narrate
 * creation without executing it (INT-35).
 */
export function shouldForceCreateProject(input: ForceCreateDecisionInput): boolean {
  if (input.focusProjectId) return false;
  if (!messageHasExplicitCreateSignal(input.message)) return false;

  // Workspace BUILD without a focused project (rare): keep historical path.
  if (input.allowBuildSideEffects) return true;

  // Ask Atlas / home BUILD: explicit create must invoke the tool, not only
  // PROJECT_READY prose.
  return (
    input.allowToolAccess &&
    input.intent === "BUILD" &&
    input.surfaceContext !== "workspace"
  );
}

/** Post-tool instruction: confirm real create; do not claim auto-navigation. */
export const CREATE_PROJECT_SUCCESS_INSTRUCTION = (
  projectName: string,
  projectId: number,
  repoNote: string,
): string =>
  `Project "${projectName}" created with id ${projectId}.${repoNote} Write ONE short sentence confirming the project was created and that the user can open it (e.g. "The Obsidian Ledger is ready — tap Open Workspace to continue."). Then STOP. Do NOT write any code, HTML, CSS, files, or file contents. Do NOT start building. Do NOT claim the workspace is already open or that navigation already happened. Do NOT include NAVIGATE_TO — an Open Workspace control is provided in the UI. The actual build happens inside the workspace, not here.`;
