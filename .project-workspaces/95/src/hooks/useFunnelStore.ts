import { useState, useEffect, useCallback } from 'react'
import type { Funnel } from '../types'

const STORAGE_KEY = 'solopreneur_funnels'

function loadFunnels(): Funnel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Funnel[]) : []
  } catch {
    return []
  }
}

function saveFunnels(funnels: Funnel[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(funnels))
}

function generateId(): string {
  return `funnel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function useFunnelStore() {
  const [funnels, setFunnels] = useState<Funnel[]>(loadFunnels)

  useEffect(() => {
    saveFunnels(funnels)
  }, [funnels])

  const addFunnel = useCallback((funnel: Omit<Funnel, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newFunnel: Funnel = {
      ...funnel,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    setFunnels((prev) => [newFunnel, ...prev])
    return newFunnel
  }, [])

  const updateFunnel = useCallback((id: string, updates: Partial<Funnel>) => {
    setFunnels((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f
      )
    )
  }, [])

  const archiveFunnel = useCallback((id: string) => {
    setFunnels((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: 'archived', updatedAt: new Date().toISOString() } : f
      )
    )
  }, [])

  const duplicateFunnel = useCallback(
    (id: string) => {
      const source = funnels.find((f) => f.id === id)
      if (!source) return
      const now = new Date().toISOString()
      const copy: Funnel = {
        ...source,
        id: generateId(),
        name: `${source.name} (copy)`,
        status: 'draft',
        leads: 0,
        conversions: 0,
        createdAt: now,
        updatedAt: now,
      }
      setFunnels((prev) => [copy, ...prev])
    },
    [funnels]
  )

  const deleteFunnel = useCallback((id: string) => {
    setFunnels((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const activeFunnels = funnels.filter((f) => f.status === 'active')
  const draftFunnels = funnels.filter((f) => f.status === 'draft')
  const archivedFunnels = funnels.filter((f) => f.status === 'archived')

  return {
    funnels,
    activeFunnels,
    draftFunnels,
    archivedFunnels,
    addFunnel,
    updateFunnel,
    archiveFunnel,
    duplicateFunnel,
    deleteFunnel,
  }
}