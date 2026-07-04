import { useState, useEffect, useCallback } from 'react'
import type { SocialLink } from '../types'

const STORAGE_KEY = 'solopreneur_links'

const DEFAULT_LINKS: SocialLink[] = [
  { id: 'link_1', platform: 'Instagram', url: 'https://instagram.com', label: '@yourhandle', active: true, clicks: 0 },
  { id: 'link_2', platform: 'Twitter / X', url: 'https://x.com', label: '@yourhandle', active: true, clicks: 0 },
  { id: 'link_3', platform: 'LinkedIn', url: 'https://linkedin.com', label: 'Your Name', active: false, clicks: 0 },
  { id: 'link_4', platform: 'Newsletter', url: 'https://yoursubstack.com', label: 'Weekly drops', active: true, clicks: 0 },
]

function loadLinks(): SocialLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SocialLink[]) : DEFAULT_LINKS
  } catch {
    return DEFAULT_LINKS
  }
}

function saveLinks(links: SocialLink[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links))
}

export function useLinkStore() {
  const [links, setLinks] = useState<SocialLink[]>(loadLinks)

  useEffect(() => {
    saveLinks(links)
  }, [links])

  const toggleLink = useCallback((id: string) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l)))
  }, [])

  const updateLink = useCallback((id: string, updates: Partial<SocialLink>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)))
  }, [])

  const addLink = useCallback((link: Omit<SocialLink, 'id' | 'clicks'>) => {
    const newLink: SocialLink = {
      ...link,
      id: `link_${Date.now()}`,
      clicks: 0,
    }
    setLinks((prev) => [...prev, newLink])
  }, [])

  const removeLink = useCallback((id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id))
  }, [])

  const recordClick = useCallback((id: string) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, clicks: l.clicks + 1 } : l)))
  }, [])

  return { links, toggleLink, updateLink, addLink, removeLink, recordClick }
}