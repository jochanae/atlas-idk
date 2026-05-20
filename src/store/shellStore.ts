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

export interface ActiveThread {
  conversationId: string | null;
  projectId: number | null;
  source: ThreadSource;
  messages: ChatMessage[];
  draft: string;
  scrollPosition: number;
}

interface ShellStore {
  activeThread: ActiveThread;
  setActiveThread: (thread: Partial<ActiveThread>) => void;
  setConversationId: (conversationId: string | null) => void;
  setProjectId: (projectId: number | null) => void;
  updateMessages: (messages: ChatMessage[]) => void;
  updateDraft: (draft: string) => void;
  updateScrollPosition: (pos: number) => void;
  clearThread: () => void;
}

const emptyThread: ActiveThread = {
  conversationId: null,
  projectId: null,
  source: null,
  messages: [],
  draft: '',
  scrollPosition: 0,
};

export const useShellStore = create<ShellStore>((set) => ({
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
  clearThread: () => set({ activeThread: emptyThread }),
}));
