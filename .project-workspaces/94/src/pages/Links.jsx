import React, { useState } from 'react'
import { useDashboard } from '../hooks/useDashboard'

const ICON_OPTIONS = ['📸', '🎵', '✉️', '🎙️', '▶️', '🐦', '💼', '🌐', '📱', '🛍️']

function LinkRow({ link, onToggle, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(link.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <div
      className="flex items-center gap-3 rounded-2xl transition-all duration-200"
      style={{
        padding: '14px 16px',
        background: link.active ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${link.active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        opacity: link.active ? 1 : 0.55
      }}
    >
      {/* Icon */}
      <div
        className="rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          width: 40,
          height: 40,
          background: link.active ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${link.active ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'}`,
          fontSize: 18
        }}
      >
        {link.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: link.active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
            marginBottom: 2
          }}
        >
          {link.label}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.02em' }}>
          {link.clicks.toLocaleString()} clicks
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          color: confirmDelete ? '#ef4444' : 'rgba(255,255,255,0.18)',
          letterSpacing: '0.03em',
          padding: '4px 6px',
          transition: 'color 0.2s',
          flexShrink: 0
        }}
      >
        {confirmDelete ? '✕' : '···'}
      </button>

      {/* Toggle */}
      <button
        onClick={() => onToggle(link.id)}
        className="flex-shrink-0 rounded-full transition-all duration-200 active:scale-95"
        style={{
          width: 40,
          height: 22,
          background: link.active
            ? 'linear-gradient(90deg, #d97706, #f59e0b)'
            : 'rgba(255,255,255,0.1)',
          border: 'none',
          position: 'relative',
          cursor: 'pointer'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: link.active ? 20 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
          }}
        />
      </button>
    </div>
  )
}

export default function Links() {
  const { links, toggleLink, deleteLink, addLink } = useDashboard()
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newIcon, setNewIcon] = useState('🌐')

  const activeLinks = links.filter(l => l.active)
  const inactiveLinks = links.filter(l => !l.active)

  const handleAdd = () => {
    if (!newLabel.trim() || !newUrl.trim()) return
    addLink({
      label: newLabel.trim(),
      url: newUrl.trim().startsWith('http') ? newUrl.trim() : `https://${newUrl.trim()}`,
      icon: newIcon
    })
    setNewLabel('')
    setNewUrl('')
    setNewIcon('🌐')
    setAdding(false)
  }

  return (
    <div className="scroll-area h-full">
      <div className="px-4 pt-8 pb-6 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(245,158,11,0.7)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 4
              }}
            >
              Social Presence
            </p>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.95)',
                letterSpacing: '-0.02em',
                lineHeight: 1.2
              }}
            >
              Your Links
            </h1>
          </div>
          <button
            onClick={() => setAdding(v => !v)}
            className="rounded-xl transition-all duration-200 active:scale-95"
            style={{
              padding: '8px 16px',
              background: adding ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.25)',
              color: '#f59e0b',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.02em'
            }}
          >
            {adding ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {/* Add link form */}
        {adding && (
          <div
            className="rounded-2xl fade-slide-up"
            style={{
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.2)',
              padding: 16
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(245,158,11,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              New Link
            </p>

            {/* Icon picker */}
            <div className="flex gap-2 flex-wrap mb-3">
              {ICON_OPTIONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setNewIcon(icon)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: newIcon === icon ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${newIcon === icon ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer',
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Label input */}
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Instagram)"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '10px 14px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                marginBottom: 8,
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />

            {/* URL input */}
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="URL (e.g. instagram.com/yourhandle)"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '10px 14px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                marginBottom: 12,
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            />

            <button
              onClick={handleAdd}
              disabled={!newLabel.trim() || !newUrl.trim()}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: 12,
                background: newLabel.trim() && newUrl.trim()
                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                  : 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)',
                color: newLabel.trim() && newUrl.trim() ? '#060608' : 'rgba(245,158,11,0.4)',
                fontSize: 14,
                fontWeight: 700,
                cursor: newLabel.trim() && newUrl.trim() ? 'pointer' : 'not-allowed',
                letterSpacing: '0.02em'
              }}
            >
              Add Link
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3">
          <div
            className="flex-1 rounded-2xl"
            style={{
              padding: '14px 16px',
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.15)'
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Active</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: '#f59e0b', letterSpacing: '-0.02em' }}>{activeLinks.length}</p>
          </div>
          <div
            className="flex-1 rounded-2xl"
            style={{
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)'
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Total Clicks</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em' }}>
              {links.reduce((sum, l) => sum + l.clicks, 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Active links */}
        {activeLinks.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 12
              }}
            >
              Active · {activeLinks.length}
            </h2>
            <div className="flex flex-col gap-3">
              {activeLinks.map(link => (
                <LinkRow key={link.id} link={link} onToggle={toggleLink} onDelete={deleteLink} />
              ))}
            </div>
          </section>
        )}

        {/* Inactive links */}
        {inactiveLinks.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 12
              }}
            >
              Inactive · {inactiveLinks.length}
            </h2>
            <div className="flex flex-col gap-3">
              {inactiveLinks.map(link => (
                <LinkRow key={link.id} link={link} onToggle={toggleLink} onDelete={deleteLink} />
              ))}
            </div>
          </section>
        )}

        {links.length === 0 && !adding && (
          <div
            className="flex flex-col items-center justify-center rounded-2xl"
            style={{
              padding: '48px 24px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>No links yet</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.6 }}>
              Tap + Add to connect your social profiles and track link performance.
            </p>
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}
