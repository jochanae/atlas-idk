import { create } from 'zustand';

// Loose ChatMessage shape — kept permissive so home/workspace can use their own types
// without forcing a refactor at the foundation stage.
export type ChatMessage = {
  id?: string;
  role?: string;
  content?: string;
  [key: string]: unknown;
};

export type ThreadSource = 'home' | 'project' | null;

// Shell mode: where the user is standing in the app surface.
//   ambient     = Nexus home, no active conversation yet
//   active      = Nexus home chat has started, shaping happening
//   operational = workspace / Forge / Map / build surfaces
//
// Independent of a project's own `status` (shaping | committed | archived)
// and `surface_mode` (ambient | operational). See .lovable/plan.md
// "Shaping → Committed: One Object, Two States (+ Shell Mode)".
export type ShellMode = 'ambient' | 'active' | 'operational';

// Shaping → Commit handoff state machine.
//   idle          = no commit in flight (baseline)
//   shaping       = Atlas is mid-stream forming the idea; pill visible but non-interactive
//   ready         = stream done, Atlas finished goodbye; CommitPill glowing, waiting for tap
//   packaging     = user tapped; handleHandoff running in background
//   opening       = handoff complete, navigating; pill shows "Opening Workspace…"
//   transitioning = legacy alias kept for backward compat; behaves like packaging
// Header MUST NOT render workspace title while isHandoff() === true.
export type ShapingStatus = 'idle' | 'shaping' | 'ready' | 'packaging' | 'opening' | 'transitioning';

export interface ActiveThread {
  conversationId: string | null;
  projectId: number | null;
  source: ThreadSource;
  messages: ChatMessage[];
  draft: string;
  scrollPosition: number;
}

// Composer visibility (see mem://design/composer-modes and
// hooks/useComposerVisibility.ts). Stage artifacts and reading-density
// hints register claims; the highest-priority claim wins:
//   hidden > compact > full.
export type ComposerVisibility = 'full' | 'compact' | 'hidden';
export interface ComposerClaim {
  source: 'stage' | 'reading';
  kind: string;
  visibility: ComposerVisibility;
}

function resolveVisibility(claims: Record<string, ComposerClaim>): ComposerVisibility {
  let best: ComposerVisibility = 'full';
  for (const c of Object.values(claims)) {
    if (c.visibility === 'hidden') return 'hidden';
    if (c.visibility === 'compact') best = 'compact';
  }
  return best;
}

interface ShellStore {
  shellMode: ShellMode;
  setShellMode: (mode: ShellMode) => void;
  shapingStatus: ShapingStatus;
  pendingWorkspaceId: number | null;
  pendingWorkspaceTitle: string | null;
  handoffStage: string;
  setShapingStatus: (status: ShapingStatus) => void;
  setPendingWorkspace: (id: number | null, title?: string | null) => void;
  setHandoffStage: (stage: string) => void;
  resetHandoff: () => void;
  isHandoff: () => boolean;
  activeThread: ActiveThread;
  setActiveThread: (thread: Partial<ActiveThread>) => void;
  setConversationId: (conversationId: string | null) => void;
  setProjectId: (projectId: number | null) => void;
  updateMessages: (messages: ChatMessage[]) => void;
  updateDraft: (draft: string) => void;
  updateScrollPosition: (pos: number) => void;
  clearThread: () => void;
  // Composer visibility
  composerClaims: Record<string, ComposerClaim>;
  composerVisibility: ComposerVisibility;
  registerComposerClaim: (id: string, claim: ComposerClaim) => void;
  releaseComposerClaim: (id: string) => void;
  /** Forces composer back to `full` and drops all stage claims.
   *  Wired to the gold "A" (atlas:focus-composer) and to send. */
  restoreComposer: () => void;
}

const emptyThread: ActiveThread = {
  conversationId: null,
  projectId: null,
  source: null,
  messages: [],
  draft: '',
  scrollPosition: 0,
};

export const useShellStore = create<ShellStore>((set, get) => ({
  shellMode: 'ambient',
  setShellMode: (shellMode) => set({ shellMode }),
  shapingStatus: 'idle',
  pendingWorkspaceId: null,
  pendingWorkspaceTitle: null,
  handoffStage: '',
  setShapingStatus: (shapingStatus) => set({ shapingStatus }),
  setPendingWorkspace: (id, title = null) =>
    set({ pendingWorkspaceId: id, pendingWorkspaceTitle: title }),
  setHandoffStage: (handoffStage) => set({ handoffStage }),
  resetHandoff: () =>
    set({ shapingStatus: 'idle', pendingWorkspaceId: null, pendingWorkspaceTitle: null, handoffStage: '' }),
  isHandoff: () => {
    const s = get().shapingStatus;
    return s === 'shaping' || s === 'ready' || s === 'packaging' || s === 'opening' || s === 'transitioning';
  },
  activeThread: emptyThread,
  setActiveThread: (thread) =>
    set((state) => ({ activeThread: { ...state.activeThread, ...thread } })),
  setConversationId: (conversationId) =>
    set((state) => ({ activeThread: { ...state.activeThread, conversationId } })),
  setProjectId: (projectId) =>
    set((state) => ({ activeThread: { ...state.activeThread, projectId } })),
  updateMessages: (messages) =>
    set((state) => ({ activeThread: { ...state.activeThread, messages } })),
  updateDraft: (draft) =>
    set((state) => ({ activeThread: { ...state.activeThread, draft } })),
  updateScrollPosition: (pos) =>
    set((state) => ({ activeThread: { ...state.activeThread, scrollPosition: pos } })),
  clearThread: () => set({ activeThread: emptyThread, shellMode: 'ambient' }),
}));

