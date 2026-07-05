import { useState, useEffect } from 'react';
import { SocialLink } from '../types';

const STORAGE_KEY = 'funnelos_links';

const DEFAULTS: SocialLink[] = [
  { id: '1', platform: 'Instagram', url: '', active: false, icon: 'ig' },
  { id: '2', platform: 'TikTok', url: '', active: false, icon: 'tt' },
  { id: '3', platform: 'LinkedIn', url: '', active: false, icon: 'li' },
  { id: '4', platform: 'Twitter / X', url: '', active: false, icon: 'tw' },
  { id: '5', platform: 'YouTube', url: '', active: false, icon: 'yt' },
];

function load(): SocialLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function save(links: SocialLink[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function useLinkStore() {
  const [links, setLinks] = useState<SocialLink[]>(load);

  useEffect(() => {
    save(links);
  }, [links]);

  const toggleLink = (id: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l))
    );
  };

  const updateLink = (id: string, url: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, url } : l))
    );
  };

  const addLink = (platform: string, url: string) => {
    const link: SocialLink = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      platform,
      url,
      active: true,
      icon: platform.slice(0, 2).toLowerCase(),
    };
    setLinks((prev) => [...prev, link]);
  };

  return { links, toggleLink, updateLink, addLink };
}