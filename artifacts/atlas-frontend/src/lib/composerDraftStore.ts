/**
 * Ask Atlas composer draft.
 *
 * - Module memory survives soft React remounts (ErrorBoundary / surface flip).
 * - sessionStorage keeps the typed input across hard reloads (Documents/PPTX
 *   pickers on Android often kill the WebView).
 * - File blobs are NOT written to IndexedDB. Copying File.arrayBuffer() on
 *   stage raced the upload PUT and white-screened mobile WebViews (even for
 *   a single attachment). Staged files survive soft remounts via
 *   useStagedAttachments module memory; hard reloads require re-attach.
 */

export type AskAtlasComposerDraft = {
  input: string;
  files: File[];
  conversationId: string | null;
  updatedAt: number;
};

const INPUT_KEY = "atlas-ask-atlas-composer-input";
const META_KEY = "atlas-ask-atlas-composer-meta";
const IDB_NAME = "atlas-ask-atlas-composer";
const IDB_STORE = "files";
const IDB_KEY = "staged";
/**
 * Disabled: IDB blob writes OOM / kill the WebView during attach.
 * Keep false unless a non-blocking, post-upload metadata restore ships.
 */
const PERSIST_FILE_BLOBS = false;

let draft: AskAtlasComposerDraft = {
  input: "",
  files: [],
  conversationId: null,
  updatedAt: 0,
};

let hydratedFromStorage = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();
/** Skip redundant IDB arrayBuffer rewrites when the file set has not changed. */
let lastPersistedFileSig = "";

function fileSetSignature(files: File[]): string {
  return files
    .map((f) => `${f.name}:${f.size}:${f.lastModified}`)
    .join("|");
}

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
    /* ignore */
  }
}

function safeSessionRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

type StoredFile = {
  name: string;
  type: string;
  lastModified: number;
  buffer: ArrayBuffer;
};

async function idbWriteFiles(files: File[]): Promise<void> {
  if (!PERSIST_FILE_BLOBS) return;
  const db = await openDb();
  if (!db) return;
  const payload: StoredFile[] = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      type: f.type,
      lastModified: f.lastModified,
      buffer: await f.arrayBuffer(),
    })),
  );
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(payload, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function idbReadFiles(): Promise<File[]> {
  if (!PERSIST_FILE_BLOBS) return [];
  const db = await openDb();
  if (!db) return [];
  const stored = await new Promise<StoredFile[] | null>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as StoredFile[] | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  if (!stored || !Array.isArray(stored)) return [];
  return stored.map(
    (s) =>
      new File([s.buffer], s.name, {
        type: s.type || "application/octet-stream",
        lastModified: s.lastModified || Date.now(),
      }),
  );
}

async function idbClearFiles(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistChain = persistChain
      .then(() => persistAskAtlasComposerDraft())
      .catch(() => undefined);
  }, 50);
}

async function persistAskAtlasComposerDraft(): Promise<void> {
  safeSessionSet(INPUT_KEY, draft.input);
  safeSessionSet(
    META_KEY,
    JSON.stringify({
      conversationId: draft.conversationId,
      fileCount: PERSIST_FILE_BLOBS ? draft.files.length : 0,
      names: PERSIST_FILE_BLOBS ? draft.files.map((f) => f.name) : [],
      updatedAt: draft.updatedAt,
    }),
  );
  if (!PERSIST_FILE_BLOBS || draft.files.length === 0) {
    lastPersistedFileSig = "";
    await idbClearFiles();
    return;
  }
  const sig = fileSetSignature(draft.files);
  if (sig === lastPersistedFileSig) {
    // Membership unchanged — do not re-read every File into ArrayBuffer.
    // Multi-file upload progress used to trigger this path dozens of times/sec
    // and OOM the WebView (white screen + hard reload).
    return;
  }
  lastPersistedFileSig = sig;
  await idbWriteFiles(draft.files);
}

/** Sync read — module memory, with sessionStorage input fallback. */
export function getAskAtlasComposerDraft(): AskAtlasComposerDraft {
  if (!draft.input) {
    const stored = safeSessionGet(INPUT_KEY);
    if (stored) draft = { ...draft, input: stored };
  }
  return draft;
}

export function setAskAtlasComposerDraft(
  next: Partial<Pick<AskAtlasComposerDraft, "input" | "files" | "conversationId">>,
): AskAtlasComposerDraft {
  draft = {
    input: next.input !== undefined ? next.input : draft.input,
    files: next.files !== undefined ? (PERSIST_FILE_BLOBS ? next.files : []) : draft.files,
    conversationId:
      next.conversationId !== undefined ? next.conversationId : draft.conversationId,
    updatedAt: Date.now(),
  };
  // Keep typed text durable immediately (Documents picker hard-reloads).
  if (next.input !== undefined) safeSessionSet(INPUT_KEY, draft.input);
  schedulePersist();
  return draft;
}

export function clearAskAtlasComposerDraft(): void {
  draft = { input: "", files: [], conversationId: null, updatedAt: Date.now() };
  lastPersistedFileSig = "";
  safeSessionRemove(INPUT_KEY);
  safeSessionRemove(META_KEY);
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistChain = persistChain.then(() => idbClearFiles()).catch(() => undefined);
}

/**
 * Hydrate typed input (and optionally File blobs when PERSIST_FILE_BLOBS) after
 * a hard reload. Safe to call once on mount.
 */
export async function hydrateAskAtlasComposerDraft(): Promise<AskAtlasComposerDraft> {
  if (hydratedFromStorage) return draft;
  hydratedFromStorage = true;
  const storedInput = safeSessionGet(INPUT_KEY);
  if (storedInput && !draft.input) {
    draft = { ...draft, input: storedInput };
  }
  if (!PERSIST_FILE_BLOBS) {
    // Purge legacy blob entries from older builds that wrote File.arrayBuffer.
    try {
      await idbClearFiles();
    } catch {
      /* ignore */
    }
    return draft;
  }
  if (draft.files.length === 0) {
    try {
      const files = await idbReadFiles();
      if (files.length > 0) {
        draft = { ...draft, files, updatedAt: Date.now() };
      }
    } catch {
      /* ignore */
    }
  }
  return draft;
}

/**
 * Test helper — wipes in-memory draft only (simulates hard reload).
 * Does NOT clear sessionStorage / IndexedDB; use clearAskAtlasComposerDraft for that.
 */
export function __resetComposerDraftStoreForTests() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  draft = { input: "", files: [], conversationId: null, updatedAt: 0 };
  lastPersistedFileSig = "";
  hydratedFromStorage = false;
}

/** Test helper — flush debounced IDB/session persist immediately. */
export async function __flushComposerDraftPersistForTests(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    persistChain = persistChain
      .then(() => persistAskAtlasComposerDraft())
      .catch(() => undefined);
  }
  await persistChain;
}
