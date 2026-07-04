import React, { useState } from 'react'
import { useLinkStore } from '../hooks/useLinkStore'

const PLATFORM_ICONS: Record<string, string> = {
  Instagram: '📸',
  'Twitter / X': '✦',
  LinkedIn: '💼',
  Newsletter: '✉',
  TikTok: '▶',
  YouTube: '▷',
  Facebook: '⊕',
  Website: '◎',
  Other: '◈',
}

export function LinkManager() {
  const { links, toggleLink, updateLink, addLink, removeLink } = useLinkStore()
  const [showAdd, setShowAdd] = useState(false)
  const [newLink, setNewLink] = useState({
    platform: 'Other',
    url: '',
    label: '',
    active: true,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [editLabel, setEditLabel] = useState('')

  const handleAdd = () => {
    if (!newLink.url.trim()) return
    addLink(newLink)
    setNewLink({ platform: 'Other', url: '', label: '', active: true })
    setShowAdd(false)
  }

  const startEdit = (id: string) => {
    const link = links.find((l) => l.id === id)
    if (!link) return
    setEditingId(id)
    setEditUrl(link.url)
    setEditLabel(link.label)
  }

  const saveEdit = () => {
    if (!editingId) return
    updateLink(editingId, { url: editUrl, label: editLabel })
    setEditingId(null)
  }

  const activeLinks = links.filter((l) => l.active)

  return (
    <div className="px-4 pt-6 pb-2 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-amber-gold tracking-wide">Links</h2>
          <p className="text-sm text-white/40 mt-0.5">
            {activeLinks.length} of {links.length} active
          </p>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          aria-label="Add new social link"
          className="text-xs px-3 py-2 rounded-xl bg-amber-gold/10 border border-amber-gold/20 text-amber-light hover:bg-amber-gold/15 transition-all active:scale-95 mt-1"
        >
          + Add Link
        </button>
      </div>

      {/* Add Link Form */}
      {showAdd && (
        <div
          className="rounded-2xl border border-glass-border p-4 space-y-3 animate-fade-up"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <p className="text-xs text-white/40 uppercase tracking-wide">New Link</p>
          <select
            value={newLink.platform}
            onChange={(e) => setNewLink((n) => ({ ...n, platform: e.target.value }))}
            aria-label="Platform"
            className="w-full bg-obsidian-700 border border-glass-border rounded-xl px-3 py-2 text-sm text-white/80 appearance-none"
          >
            {Object.keys(PLATFORM_ICONS).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="url"
            value={newLink.url}
            onChange={(e) => setNewLink((n) => ({ ...n, url: e.target.value }))}
            placeholder="https://..."
            aria-label="URL"
            className="w-full bg-transparent border border-glass-border rounded-xl px-3 py-2 text-sm text-white/80 placeholder-white/25"
          />
          <input
            type="text"
            value={newLink.label}
            onChange={(e) => setNewLink((n) => ({ ...n, label: e.target.value }))}
            placeholder="Display label (e.g. @yourhandle)"
            aria-label="Display label"
            className="w-full bg-transparent border border-glass-border rounded-xl px-3 py-2 text-sm text-white/80 placeholder-white/25"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newLink.url.trim()}
              aria-label="Save new link"
              className="flex-1 py-2 rounded-xl bg-amber-gold text-obsidian-900 text-sm font-medium disabled:opacity-40 active:scale-95 transition-all"
            >
              Save Link
            </button>
            <button
              onClick={() => setShowAdd(false)}
              aria-label="Cancel adding link"
              className="px-4 py-2 rounded-xl border border-glass-border text-white/50 text-sm active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Link List */}
      <div className="space-y-2">
        {links.map((link) => (
          <div
            key={link.id}
            className={`rounded-2xl border backdrop-blur-glass transition-all duration-200 overflow-hidden ${
              link.active ? 'border-glass-border' : 'border-white/5 opacity-50'
            }`}
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            {editingId === link.id ? (
              <div className="p-3 space-y-2 animate-fade-up">
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  aria-label="Edit URL"
                  className="w-full bg-transparent border border-glass-border rounded-xl px-3 py-2 text-sm text-white/80"
                />
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  aria-label="Edit label"
                  className="w-full bg-transparent border border-glass-border rounded-xl px-3 py-2 text-sm text-white/80"
                />
                <div className="flex gap-2">
                  <button onClick={saveEdit} aria-label="Save link edits" className="flex-1 py-1.5 rounded-lg bg-amber-gold text-obsidian-900 text-xs font-medium active:scale-95">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} aria-label="Cancel editing link" className="px-3 py-1.5 rounded-lg border border-glass-border text-white/40 text-xs active:scale-95">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg flex-shrink-0" role="img" aria-label={link.platform}>
                  {PLATFORM_ICONS[link.platform] ?? '◈'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/85 font-medium">{link.platform}</p>
                  <p className="text-xs text-white/40 truncate">{link.label || link.url}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(link.id)}
                    aria-label={`Edit ${link.platform} link`}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeLink(link.id)}
                    aria-label={`Remove ${link.platform} link`}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400/70 hover:bg-red-500/5 transition-all"
                  >
                    ×
                  </button>
                  {/* Toggle */}
                  <button
                    onClick={() => toggleLink(link.id)}
                    aria-label={`${link.active ? 'Deactivate' : 'Activate'} ${link.platform} link`}
                    role="switch"
                    aria-checked={link.active}
                    className={`relative w-10 h-6 rounded-full transition-all duration-300 ${
                      link.active ? 'bg-amber-gold shadow-amber-sm' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-300 ${
                        link.active ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}