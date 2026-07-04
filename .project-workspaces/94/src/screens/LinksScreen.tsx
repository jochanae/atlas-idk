import React, { useState } from 'react'
import SocialLinkRow from '../components/SocialLinkRow'
import type { SocialLink } from '../hooks/useSocialLinks'

interface Props {
  links: SocialLink[]
  onToggle: (id: string) => void
  onTrackClick: (id: string) => void
  onAdd: (platform: string, handle: string, url: string) => void
}

export default function LinksScreen({ links, onToggle, onTrackClick, onAdd }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [newPlatform, setNewPlatform] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newUrl, setNewUrl] = useState('')

  const totalClicks = links.filter((l) => l.active).reduce((s, l) => s + l.clicks, 0)
  const activeCount = links.filter((l) => l.active).length

  const handleAdd = () => {
    if (!newPlatform.trim() || !newHandle.trim()) return
    onAdd(newPlatform.trim(), newHandle.trim(), newUrl.trim() || '#')
    setNewPlatform('')
    setNewHandle('')
    setNewUrl('')
    setShowAdd(false)
  }

  return (
    <div className="px-4 pt-6 pb-28 space-y-5">
      <div>
        <h1 className="text-white text-2xl font-semibold tracking-tight">Links</h1>
        <p className="text-white/40 text-sm mt-1">
          {activeCount} active · {totalClicks.toLocaleString()} total clicks
        </p>
      </div>

      {/* Summary card */}
      <div className="glass rounded-2xl p-4 flex gap-4">
        <div className="flex-1 text-center">
          <p className="text-amber-400 text-xl font-semibold">
            {totalClicks > 999 ? `${(totalClicks / 1000).toFixed(1)}k` : totalClicks}
          </p>
          <p className="text-white/30 text-xs mt-0.5">Total Clicks</p>
        </div>
        <div className="w-px bg-white/6" />
        <div className="flex-1 text-center">
          <p className="text-white text-xl font-semibold">{activeCount}</p>
          <p className="text-white/30 text-xs mt-0.5">Active Links</p>
        </div>
        <div className="w-px bg-white/6" />
        <div className="flex-1 text-center">
          <p className="text-white text-xl font-semibold">{links.length}</p>
          <p className="text-white/30 text-xs mt-0.5">Total</p>
        </div>
      </div>

      {/* Links list */}
      <div className="glass rounded-2xl px-4">
        {links.map((link) => (
          <SocialLinkRow
            key={link.id}
            link={link}
            onToggle={onToggle}
            onClick={onTrackClick}
          />
        ))}
      </div>

      {/* Add link */}
      {showAdd ? (
        <div className="glass rounded-2xl p-4 space-y-3 animate-fade-in-up">
          <p className="text-white/50 text-sm font-medium">Add a link</p>
          <input
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
            placeholder="Platform (e.g. Twitter)"
            className="w-full bg-white/5 text-white text-sm rounded-xl px-4 py-3 outline-none border border-white/8"
            style={{ caretColor: '#f59e0b' }}
          />
          <input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="Handle or name"
            className="w-full bg-white/5 text-white text-sm rounded-xl px-4 py-3 outline-none border border-white/8"
            style={{ caretColor: '#f59e0b' }}
          />
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL (optional)"
            className="w-full bg-white/5 text-white text-sm rounded-xl px-4 py-3 outline-none border border-white/8"
            style={{ caretColor: '#f59e0b' }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-black"
              style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.9), rgba(217,119,6,0.8))' }}
            >
              Add Link
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="py-3 px-5 rounded-xl text-sm text-white/40"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full glass rounded-2xl py-4 text-sm font-medium text-amber-400/70 active:scale-[0.99] transition-transform"
          style={{ border: '1px dashed rgba(245,158,11,0.2)' }}
        >
          + Add Link
        </button>
      )}
    </div>
  )
}