import { useState, useCallback } from 'react'

export interface SocialLink {
  id: string
  platform: string
  handle: string
  url: string
  active: boolean
  clicks: number
  icon: string
  color: string
}

const INITIAL_LINKS: SocialLink[] = [
  {
    id: 'link-ig',
    platform: 'Instagram',
    handle: '@yourhandle',
    url: 'https://instagram.com',
    active: true,
    clicks: 847,
    icon: '📸',
    color: 'rgba(225, 48, 108, 0.15)',
  },
  {
    id: 'link-tk',
    platform: 'TikTok',
    handle: '@yourhandle',
    url: 'https://tiktok.com',
    active: true,
    clicks: 412,
    icon: '🎵',
    color: 'rgba(0, 242, 234, 0.1)',
  },
  {
    id: 'link-li',
    platform: 'LinkedIn',
    handle: 'Your Name',
    url: 'https://linkedin.com',
    active: false,
    clicks: 203,
    icon: '💼',
    color: 'rgba(10, 102, 194, 0.15)',
  },
  {
    id: 'link-yt',
    platform: 'YouTube',
    handle: 'Your Channel',
    url: 'https://youtube.com',
    active: true,
    clicks: 156,
    icon: '▶️',
    color: 'rgba(255, 0, 0, 0.1)',
  },
]

export function useSocialLinks() {
  const [links, setLinks] = useState<SocialLink[]>(INITIAL_LINKS)

  const toggleLink = useCallback((id: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l))
    )
  }, [])

  const trackClick = useCallback((id: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, clicks: l.clicks + 1 } : l))
    )
  }, [])

  const addLink = useCallback((platform: string, handle: string, url: string) => {
    const newLink: SocialLink = {
      id: `link-${Date.now()}`,
      platform,
      handle,
      url,
      active: true,
      clicks: 0,
      icon: '🔗',
      color: 'rgba(245, 158, 11, 0.1)',
    }
    setLinks((prev) => [...prev, newLink])
  }, [])

  return { links, toggleLink, trackClick, addLink }
}