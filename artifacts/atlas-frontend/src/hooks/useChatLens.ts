import { useState, useRef, useEffect, useCallback } from "react";
import {
  type AtlasPerspective,
  type WorkspaceLens,
  normalizePerspective,
  readStoredPerspective,
  writeStoredPerspective,
  emitPerspectiveChange,
  PERSPECTIVE_CHANGE_EVENT,
  type PerspectiveChangeDetail,
} from "@/lib/atlasPerspective";

export type { AtlasPerspective, WorkspaceLens };

export function useChatLens(projectId: number | string | undefined) {
  const [wsModel, setWsModelRaw] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("atlas-ws-model");
      if (stored) return stored;
      const r = localStorage.getItem("atlas-home-context");
      return r ? (JSON.parse(r).model ?? "multi") : "multi";
    } catch {
      return "multi";
    }
  });
  const setWsModel = (m: string) => {
    setWsModelRaw(m);
    try { localStorage.setItem("atlas-ws-model", m); } catch {}
  };

  const initial = readStoredPerspective(projectId);
  const [wsLens, setWsLensState] = useState<AtlasPerspective>(() => initial.perspective);
  const [speculate, setSpeculateState] = useState<boolean>(() => initial.speculate);
  const perspectiveRef = useRef(initial.perspective);
  const speculateRef = useRef(initial.speculate);

  const persist = useCallback((perspective: AtlasPerspective, nextSpeculate: boolean) => {
    writeStoredPerspective(projectId, perspective, nextSpeculate);
    emitPerspectiveChange({ perspective, speculate: nextSpeculate, projectId });
  }, [projectId]);

  const setWsLensRaw = useCallback((lens: AtlasPerspective | string) => {
    const perspective = normalizePerspective(lens);
    perspectiveRef.current = perspective;
    setWsLensState(perspective);
    persist(perspective, speculateRef.current);
  }, [persist]);

  const setSpeculate = useCallback((next: boolean) => {
    speculateRef.current = next;
    setSpeculateState(next);
    persist(perspectiveRef.current, next);
  }, [persist]);

  useEffect(() => {
    const stored = readStoredPerspective(projectId);
    perspectiveRef.current = stored.perspective;
    speculateRef.current = stored.speculate;
    setWsLensState(stored.perspective);
    setSpeculateState(stored.speculate);
  }, [projectId]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<PerspectiveChangeDetail>).detail;
      if (!detail) return;
      if (detail.projectId != null && projectId != null
        && String(detail.projectId) !== String(projectId)) return;
      perspectiveRef.current = detail.perspective;
      speculateRef.current = !!detail.speculate;
      setWsLensState(detail.perspective);
      setSpeculateState(!!detail.speculate);
    };
    window.addEventListener(PERSPECTIVE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(PERSPECTIVE_CHANGE_EVENT, onChange);
  }, [projectId]);

  const [showLensPicker, setShowLensPicker] = useState(false);
  const [detectedLens, setDetectedLens] = useState<AtlasPerspective | null>(null);
  const scenarioStartIdxRef = useRef<number>(-1);
  const [showScenarioPrompt, setShowScenarioPrompt] = useState(false);
  const sendCtxRef = useRef({
    wsLens: initial.perspective as AtlasPerspective,
    speculate: initial.speculate,
    wsModel: "claude",
    githubToken: null as string | null,
  });
  const [pendingLensSwitch, setPendingLensSwitch] = useState<AtlasPerspective | null>(null);
  const [scenarioBuffer, setScenarioBuffer] = useState<Array<{ role: string; content: string }>>([]);
  const [showWsModelSheet, setShowWsModelSheet] = useState(false);

  sendCtxRef.current.wsLens = wsLens;
  sendCtxRef.current.speculate = speculate;
  sendCtxRef.current.wsModel = wsModel;

  return {
    wsModel,
    setWsModel,
    wsLens,
    setWsLensRaw,
    speculate,
    setSpeculate,
    showLensPicker,
    setShowLensPicker,
    detectedLens,
    setDetectedLens,
    showScenarioPrompt,
    setShowScenarioPrompt,
    pendingLensSwitch,
    setPendingLensSwitch,
    scenarioBuffer,
    setScenarioBuffer,
    showWsModelSheet,
    setShowWsModelSheet,
    sendCtxRef,
    scenarioStartIdxRef,
  };
}
