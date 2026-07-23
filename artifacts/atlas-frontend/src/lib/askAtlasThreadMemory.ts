/**
 * Ask Atlas thread memory — survives soft remounts (ErrorBoundary / surface flip)
 * and hard reloads for the active conversation.
 *
 * Why this exists:
 *   Streaming assistant content lives only in React state until the server
 *   finishStream persist completes. A remount mid-stream (or immediately after
 *   tokens finish but before DB write) rehydrates from /api/nexus/thread, which
 *   may not yet include the assistant turn — and home.tsx used to inject a
 *   synthetic "Welcome back…" message on top. This module keeps the last known
 *   Ask Atlas transcript so restore can recover the real turn instead.
 *
 * Storage:
 *   - Module memory: soft remount survival (same JS realm).
 *   - sessionStorage: hard reload survival (text-only, capped).
 */

export type AskAtlasMemoryMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  streaming?: boolean;
  /** Preserve suggestion pills across remount when present. */
  nextSuggestions?: string[];
};

export type AskAtlasThreadSnapshot = {
  conversationId: string;
  messages: AskAtlasMemoryMessage[];
  isStreaming: boolean;
  activeRunId: string | null;
  updatedAt: number;
};

const SESSION_KEY = "atlas-ask-atlas-thread-memory";
/** Cap stored content so sessionStorage stays bounded. */
const MAX_MESSAGES = 80;
const MAX_CONTENT_CHARS = 24_000;

let memory: AskAtlasThreadSnapshot | null = null;

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function safeSessionRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) return content;
  return content.slice(0, MAX_CONTENT_CHARS);
}

function sanitizeMessages(messages: AskAtlasMemoryMessage[]): AskAtlasMemoryMessage[] {
  const trimmed = messages.slice(-MAX_MESSAGES);
  return trimmed.map((m) => ({
    id: typeof m.id === "string" ? m.id : undefined,
    role: m.role,
    content: truncateContent(typeof m.content === "string" ? m.content : ""),
    createdAt: typeof m.createdAt === "string" ? m.createdAt : undefined,
    streaming: m.streaming === true ? true : undefined,
    nextSuggestions: Array.isArray(m.nextSuggestions)
      ? m.nextSuggestions.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 8)
      : undefined,
  }));
}

function persistToSession(snapshot: AskAtlasThreadSnapshot | null) {
  if (!snapshot || snapshot.messages.length === 0) {
    safeSessionRemove(SESSION_KEY);
    return;
  }
  safeSessionSet(SESSION_KEY, JSON.stringify(snapshot));
}

function readFromSession(): AskAtlasThreadSnapshot | null {
  const raw = safeSessionGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AskAtlasThreadSnapshot;
    if (!parsed || typeof parsed.conversationId !== "string" || !Array.isArray(parsed.messages)) {
      return null;
    }
    return {
      conversationId: parsed.conversationId,
      messages: sanitizeMessages(parsed.messages as AskAtlasMemoryMessage[]),
      isStreaming: parsed.isStreaming === true,
      activeRunId: typeof parsed.activeRunId === "string" ? parsed.activeRunId : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/** True while Ask Atlas is actively generating — used to discourage remount/reload. */
let generationActive = false;

export function setAskAtlasGenerationActive(active: boolean) {
  generationActive = active;
}

export function isAskAtlasGenerationActive(): boolean {
  return generationActive;
}

export function setAskAtlasThreadMemory(input: {
  conversationId: string | null | undefined;
  messages: AskAtlasMemoryMessage[];
  isStreaming?: boolean;
  activeRunId?: string | null;
}): AskAtlasThreadSnapshot | null {
  const conversationId = typeof input.conversationId === "string" ? input.conversationId.trim() : "";
  if (!conversationId) return memory;

  const snapshot: AskAtlasThreadSnapshot = {
    conversationId,
    messages: sanitizeMessages(input.messages),
    isStreaming: input.isStreaming === true,
    activeRunId: input.activeRunId ?? null,
    updatedAt: Date.now(),
  };
  memory = snapshot;
  setAskAtlasGenerationActive(snapshot.isStreaming);
  persistToSession(snapshot);
  return snapshot;
}

export function getAskAtlasThreadMemory(conversationId?: string | null): AskAtlasThreadSnapshot | null {
  if (!memory) {
    memory = readFromSession();
  }
  if (!memory) return null;
  if (conversationId && memory.conversationId !== conversationId) return null;
  return memory;
}

export function clearAskAtlasThreadMemory(conversationId?: string | null) {
  if (conversationId && memory && memory.conversationId !== conversationId) return;
  memory = null;
  setAskAtlasGenerationActive(false);
  safeSessionRemove(SESSION_KEY);
}

/**
 * Merge server thread with local memory.
 * Prefer memory's trailing assistant content when the server is missing it
 * (in-flight or just-finished race), otherwise prefer the longer/newer server thread.
 */
export function mergeAskAtlasThread(
  serverMessages: AskAtlasMemoryMessage[],
  snapshot: AskAtlasThreadSnapshot | null,
): { messages: AskAtlasMemoryMessage[]; recoveredFromMemory: boolean; awaitingServerAssistant: boolean } {
  if (!snapshot || snapshot.messages.length === 0) {
    const last = serverMessages[serverMessages.length - 1];
    return {
      messages: serverMessages,
      recoveredFromMemory: false,
      awaitingServerAssistant: last?.role === "user",
    };
  }

  const mem = snapshot.messages;
  const serverLast = serverMessages[serverMessages.length - 1];
  const memLast = mem[mem.length - 1];

  // Server already has a complete assistant after the same trailing user turn.
  if (
    serverLast?.role === "assistant" &&
    typeof serverLast.content === "string" &&
    serverLast.content.trim().length > 0
  ) {
    // If memory has a longer assistant (client saw more than DB wrote), prefer memory tail.
    if (
      memLast?.role === "assistant" &&
      memLast.content.trim().length > serverLast.content.trim().length
    ) {
      return {
        messages: [...serverMessages.slice(0, -1), { ...serverLast, content: memLast.content, streaming: false }],
        recoveredFromMemory: true,
        awaitingServerAssistant: false,
      };
    }
    return {
      messages: serverMessages,
      recoveredFromMemory: false,
      awaitingServerAssistant: false,
    };
  }

  // Server ends on user (or empty) but memory has a partial/complete assistant — recover it.
  if (memLast?.role === "assistant" && memLast.content.trim().length > 0) {
    // Align on the trailing user message when possible.
    const memUser = [...mem].reverse().find((m) => m.role === "user");
    const serverUser = [...serverMessages].reverse().find((m) => m.role === "user");
    const sameUser =
      !memUser ||
      !serverUser ||
      memUser.content.trim() === serverUser.content.trim();

    if (sameUser || serverMessages.length === 0) {
      const base =
        serverMessages.length > 0
          ? serverLast?.role === "user"
            ? serverMessages
            : serverMessages
          : mem.slice(0, -1);
      // Ensure the recovered assistant follows the last user turn.
      const withoutTrailingAssistant =
        base.length > 0 && base[base.length - 1]?.role === "assistant" ? base.slice(0, -1) : base;
      return {
        messages: [
          ...withoutTrailingAssistant,
          {
            ...memLast,
            streaming: false,
            id: memLast.id ?? `aa-recovered-${snapshot.updatedAt}`,
          },
        ],
        recoveredFromMemory: true,
        awaitingServerAssistant: snapshot.isStreaming,
      };
    }
  }

  // Memory has the user turn the server also has, but no assistant yet — keep server, poll.
  if (serverLast?.role === "user") {
    return {
      messages: serverMessages.length >= mem.length ? serverMessages : mem.map((m) => ({ ...m, streaming: false })),
      recoveredFromMemory: serverMessages.length < mem.length,
      awaitingServerAssistant: true,
    };
  }

  // Prefer whichever side has more turns.
  if (mem.length > serverMessages.length) {
    return {
      messages: mem.map((m) => ({ ...m, streaming: false })),
      recoveredFromMemory: true,
      awaitingServerAssistant: false,
    };
  }

  return {
    messages: serverMessages,
    recoveredFromMemory: false,
    awaitingServerAssistant: false,
  };
}

// Legacy `shouldInjectAskAtlasWelcomeBack` removed — resume greeting is now an
// ephemeral UI card owned by home.tsx (`askAtlasResumeGreeting` state), never
// inserted into the transcript.


/** Test helper */
export function __resetAskAtlasThreadMemoryForTests() {
  memory = null;
  generationActive = false;
  safeSessionRemove(SESSION_KEY);
}
