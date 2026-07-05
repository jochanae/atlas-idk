import { useState, useCallback } from "react";

export type WorkspaceLens = "flow" | "build" | "look" | "scenario";

export interface WorkspacePreset {
  id: string;
  name: string;
  model: string;
  lens: WorkspaceLens;
  createdAt: number;
}

const STORAGE_KEY = "atlas-ws-presets";

function loadPresets(): WorkspacePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WorkspacePreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: WorkspacePreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {}
}

export function useWorkspacePresets() {
  const [presets, setPresets] = useState<WorkspacePreset[]>(() => loadPresets());

  const addPreset = useCallback((name: string, model: string, lens: WorkspaceLens): WorkspacePreset => {
    const preset: WorkspacePreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || "Unnamed",
      model,
      lens,
      createdAt: Date.now(),
    };
    setPresets((prev) => {
      const next = [...prev, preset];
      savePresets(next);
      return next;
    });
    return preset;
  }, []);

  const removePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePresets(next);
      return next;
    });
  }, []);

  const applyPreset = useCallback((preset: WorkspacePreset) => {
    window.dispatchEvent(
      new CustomEvent("axiom:apply-preset", {
        detail: { model: preset.model, lens: preset.lens },
      })
    );
  }, []);

  return { presets, addPreset, removePreset, applyPreset };
}
