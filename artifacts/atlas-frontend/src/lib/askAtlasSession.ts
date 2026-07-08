/**
 * askAtlasSession — remaining conversation-id cleanup helper.
 *
 * Ask Atlas (the standalone home-page chat surface) has been removed —
 * Workspace is now the single conversation surface (see Conversation Mode /
 * Build Mode toggle in workspace.tsx). This module only retains the
 * conversation-id storage cleanup used when logging out / switching users,
 * so any stale id from a pre-migration session doesn't leak forward.
 */

const CONV_KEY = "atlas-ask-atlas-conversation-id";

function safeLocalRemove(key: string) {
  try { localStorage.removeItem(key); } catch {}
}
function safeSessionRemove(key: string) {
  try { sessionStorage.removeItem(key); } catch {}
}

export const askAtlasSession = {
  clearConversationId() {
    safeLocalRemove(CONV_KEY);
    safeSessionRemove(CONV_KEY);
  },
};
