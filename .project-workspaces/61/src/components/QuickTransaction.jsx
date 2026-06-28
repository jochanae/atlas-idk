import React, { useRef, useState } from 'react'

const EXAMPLES = [
  'Add 2018 AP Royal Oak Offshore, $45K',
  'Add Hermès Kelly 28 Sellier, valued at $22000',
  'Add Basquiat lithograph 1983, $8500',
  'Add vintage Chanel jacket 1994, $3200'
]

export default function QuickTransaction({ value, onChange, onSubmit, focused, onFocus, onBlur }) {
  const inputRef = useRef(null)
  const [hintIndex] = useState(() => Math.floor(Math.random() * EXAMPLES.length))
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake] = useState(false)

  function handleSubmit() {
    if (!value.trim()) {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      inputRef.current?.focus()
      return
    }
    setSubmitting(true)
    setTimeout(() => {
      onSubmit(value)
      setSubmitting(false)
    }, 150)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'linear-gradient(to top, rgba(5,6,8,0.98) 60%, transparent 100%)',
        paddingBottom: 'env(safe-area-inset-bottom, 20px)'
      }}
    >
      <div
        className="mx-auto px-4 pt-3 pb-5"
        style={{ maxWidth: '480px' }}
      >
        {/* Hint text — only when not focused and empty */}
        {!focused && !value && (
          <p
            className="text-center mb-2 transition-all duration-300"
            style={{
              fontSize: '10px',
              color: 'rgba(255,255,255,0.18)',
              letterSpacing: '0.04em',
              fontStyle: 'italic'
            }}
          >
            "{EXAMPLES[hintIndex]}"
          </p>
        )}

        {/* Input container */}
        <div
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300 ${shake ? 'animate-shake' : ''}`}
          style={{
            background: focused
              ? 'rgba(18,22,40,0.95)'
              : 'rgba(14,17,30,0.85)',
            border: focused
              ? '1px solid rgba(212,160,23,0.4)'
              : '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            boxShadow: focused
              ? '0 0 0 1px rgba(212,160,23,0.15), 0 0 32px rgba(212,160,23,0.08), 0 -8px 40px rgba(0,0,0,0.4)'
              : '0 -4px 24px rgba(0,0,0,0.3)',
            transform: shake ? 'translateX(0)' : undefined
          }}
        >
          {/* Icon */}
          <div
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: focused
                ? 'rgba(212,160,23,0.12)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${focused ? 'rgba(212,160,23,0.25)' : 'rgba(255,255,255,0.06)'}`,
              transition: 'all 0.2s ease'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1v12M1 7h12"
                stroke={focused ? '#d4a017' : 'rgba(255,255,255,0.3)'}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            placeholder="Describe an asset to add…"
            className="flex-1 bg-transparent text-white placeholder-transparent"
            style={{
              fontSize: '14px',
              letterSpacing: '0.01em',
              caretColor: '#d4a017',
              outline: 'none',
              border: 'none',
              lineHeight: 1.4
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
          />

          {/* Placeholder — custom */}
          {!value && (
            <span
              className="absolute pointer-events-none"
              style={{
                fontSize: '14px',
                color: 'rgba(255,255,255,0.2)',
                left: '68px',
                top: '50%',
                transform: 'translateY(-50%)'
              }}
            >
              Describe an asset to add…
            </span>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            className="flex-shrink-0 press-effect"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: value.trim()
                ? 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)'
                : 'rgba(255,255,255,0.05)',
              border: `1px solid ${value.trim() ? 'rgba(212,160,23,0.4)' : 'rgba(255,255,255,0.06)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              boxShadow: value.trim() ? '0 0 16px rgba(212,160,23,0.25)' : 'none'
            }}
          >
            {submitting ? (
              <div
                className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: 'rgba(255,255,255,0.6)', borderTopColor: 'transparent' }}
              />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7h10M8 3l4 4-4 4"
                  stroke={value.trim() ? '#0a0c12' : 'rgba(255,255,255,0.25)'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Bottom hint */}
        <p
          className="text-center mt-2"
          style={{ fontSize: '9px', color: 'rgba(255,255,255,0.1)', letterSpacing: '0.08em' }}
        >
          Natural language · Enter to add · Tap asset to expand
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        .animate-shake {
          animation: shake 0.4s ease;
        }
      `}</style>
    </div>
  )
}