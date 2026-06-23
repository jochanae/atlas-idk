import { useState, useCallback, useRef } from "react";

interface HistoryEntry<T> {
  state: T;
  timestamp: number;
}

export function useUndoRedo<T>(initial: T) {
  const [history, setHistory] = useState<HistoryEntry<T>[]>([{ state: initial, timestamp: Date.now() }]);
  const [pointer, setPointer] = useState(0);
  const lastPushed = useRef<string>("");

  const current = history[pointer]?.state ?? initial;

  const push = useCallback((state: T) => {
    const serialized = JSON.stringify(state);
    if (serialized === lastPushed.current) return;
    lastPushed.current = serialized;
    setHistory((prev) => {
      const next = prev.slice(0, pointer + 1);
      next.push({ state, timestamp: Date.now() });
      if (next.length > 50) next.shift();
      return next;
    });
    setPointer((p) => Math.min(p + 1, 50));
  }, [pointer]);

  const undo = useCallback(() => {
    setPointer((p) => {
      const next = Math.max(0, p - 1);
      lastPushed.current = JSON.stringify(history[next]?.state);
      return next;
    });
  }, [history]);

  const redo = useCallback(() => {
    setPointer((p) => {
      const next = Math.min(history.length - 1, p + 1);
      lastPushed.current = JSON.stringify(history[next]?.state);
      return next;
    });
  }, [history]);

  const canUndo = pointer > 0;
  const canRedo = pointer < history.length - 1;

  const reset = useCallback((state: T) => {
    const serialized = JSON.stringify(state);
    lastPushed.current = serialized;
    setHistory([{ state, timestamp: Date.now() }]);
    setPointer(0);
  }, []);

  return { current, push, undo, redo, canUndo, canRedo, reset };
}
