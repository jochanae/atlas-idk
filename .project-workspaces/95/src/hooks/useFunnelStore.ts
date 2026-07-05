import { useState, useEffect } from 'react';
import { Funnel } from '../types';

const STORAGE_KEY = 'funnelos_funnels';

function load(): Funnel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(funnels: Funnel[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(funnels));
}

export function useFunnelStore() {
  const [funnels, setFunnels] = useState<Funnel[]>(load);

  useEffect(() => {
    save(funnels);
  }, [funnels]);

  const addFunnel = (funnel: Funnel) => {
    setFunnels((prev) => [funnel, ...prev]);
  };

  const updateFunnel = (id: string, updates: Partial<Funnel>) => {
    setFunnels((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f
      )
    );
  };

  const archiveFunnel = (id: string) => {
    setFunnels((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, archived: !f.archived, updatedAt: new Date().toISOString() } : f
      )
    );
  };

  const duplicateFunnel = (id: string) => {
    const original = funnels.find((f) => f.id === id);
    if (!original) return;
    const copy: Funnel = {
      ...original,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `${original.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: false,
    };
    setFunnels((prev) => [copy, ...prev]);
  };

  const deleteFunnel = (id: string) => {
    setFunnels((prev) => prev.filter((f) => f.id !== id));
  };

  return { funnels, addFunnel, updateFunnel, archiveFunnel, duplicateFunnel, deleteFunnel };
}