import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboard } from '../hooks/useDashboard'

const PLACEHOLDER_PROMPTS = [
  'Sell my 1:1 coaching program to burnout professionals',
  'Grow my handmade jewelry Etsy shop',
  'Launch my freelance UX design services',
  'Build an audience for my finance newsletter',
  'Promote my online fitness membership'
]

export default function FunnelPrompt() {
  const [value, setValue] = useState('')
  const [placeholder] = useState(
    () => PLACEHOLDER_PROMPTS[Math.floor(Math.random() * PLACEHOLDER_PROMPTS.length)]
  )
  const [focused, setFocused] = useState(false)
  const { generateFunnel, generating } = useDashboard()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const handleSubmit = async () => {
    if (!value.trim() || generating) return
    const result = await generateFunnel(value.trim())
    if (result) {
      setValue('')
      navigate('/funnels')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className="rounded-2xl transition-all duration-300"
      style={{
        background: focused
          ? 'rgba(245, 158, 11, 0.06)'
          : 'rgba(255, 255, 255, 0.04)',
        border: `1px solid ${focused ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.07)'}`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: focused ? '0 0 30px rgba(245, 158, 11, 0.08)' : 'none'
      }}
    >
      <div className="p-4 pb-3">
        {/* Label */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="rounded-md flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.2)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L8.5 5.5H13L9.5 8.5L11 13L7 10L3 13L4.5 8.5L1 5.5H5.5L7 1Z" fill="#f59e0b" />
            </svg>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Generate Funnel
          </span>
        </div>

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          disabled={generating}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: generating ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)',
            fontSize: 15,
            lineHeight: 1.6,
            letterSpacing: '0.01em',
            fontFamily: 'inherit',
            caretColor: '#f59e0b'
          }}
        />
      </div>

      {/* Bottom action row */}
      <div
        className="flex items-center justify-between px-4 pb-4"
      >
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.03em' }}>
          {value.length > 0 ? `${value.length} chars` : 'Describe your offer or audience'}
        </span>

        <button
          onClick={handleSubmit}
          disabled={!value.trim() || generating}
          className="flex items-center gap-2 rounded-xl transition-all duration-200 active:scale-95"
          style={{
            padding: '8px 16px',
            background: !value.trim() || generating
              ? 'rgba(245, 158, 11, 0.12)'
              : 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: !value.trim() || generating ? 'rgba(245,158,11,0.4)' : '#060608',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: !value.trim() || generating ? 'not-allowed' : 'pointer'
          }}
        >
          {generating ? (
            <>
              <span className="pulse-amber" style={{ fontSize: 14 }}>⚡</span>
              <span>Building…</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 14 }}>→</span>
              <span>Build Funnel</span>
            </>
          )}
        </button>
      </div>

      {/* Generation progress */}
      {generating && (
        <div
          className="mx-4 mb-4 rounded-lg overflow-hidden shimmer fade-slide-up"
          style={{ height: 2, background: 'rgba(245,158,11,0.15)' }}
        >
          <div
            className="h-full rounded-lg"
            style={{
              width: '60%',
              background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)',
              animation: 'shimmer 1.2s linear infinite'
            }}
          />
        </div>
      )}
    </div>
  )
}