/**
 * Module-level Ask Atlas composer draft.
 *
 * Survives soft React remounts (ErrorBoundary auto-reset, surface open flip)
 * without serializing File bytes. Cleared intentionally on successful send.
 */

export type AskAtlasComposerDraft = {
  input: string;
  files: File[];
  conversationId: string | null;
  updatedAt: number;
};

let draft: AskAtlasComposerDraft = {
  input: "",
  files: [],
  conversationId: null,
  updatedAt: 0,
};

export function getAskAtlasComposerDraft(): AskAtlasComposerDraft {
  return draft;
}

export function setAskAtlasComposerDraft(
  next: Partial<Pick<AskAtlasComposerDraft, "input" | "files" | "conversationId">>,
): AskAtlasComposerDraft {
  draft = {
    input: next.input !== undefined ? next.input : draft.input,
    files: next.files !== undefined ? next.files : draft.files,
    conversationId:
      next.conversationId !== undefined ? next.conversationId : draft.conversationId,
    updatedAt: Date.now(),
  };
  return draft;
}

export function clearAskAtlasComposerDraft(): void {
  draft = { input: "", files: [], conversationId: null, updatedAt: Date.now() };
}
