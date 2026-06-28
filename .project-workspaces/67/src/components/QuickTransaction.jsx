import React, { useState, useRef } from 'react'

const EXAMPLES = [
  'Add vintage 1986 Chanel tote, valued at $4,500',
  'Add Rolex Submariner ref. 126610, worth $12,800',
  'Log Jean-Michel Basquiat print at $48,000',
  'Add Hermès Kelly 28 Sellier, current value $32,000'
]

function parseNaturalLanguage(text) {
  // Very lightweight parser — real impl would use AI
  const valueMatch = text.match(/\$[\d,]+(?:\.\d{2})?/)
  const value = valueMatch
    ? parseInt(valueMatch[0].replace(/[$,]/g, ''))
    : null

  let category = 'watches'
  const lower = text.toLowerCase()
  if (lower.includes('chanel') || lower.includes('hermès') || lower.includes('hermes') ||
      lower.includes('tote') || lower.includes('bag') || lower.includes('kelly') ||
      lower.includes('birkin') || lower.includes('fashion') || lower.includes('jacket') ||
      lower.includes('dress') || lower.includes('coat')) {
    category = 'fashion'
  } else if (lower.includes('painting') || lower.includes('print') || lower.includes('art') ||
             lower.includes('canvas') || lower.includes('basquiat') || lower.includes('warhol') ||
             lower.includes('hirst') || lower.includes('sculpture')) {
    category = 'art'
  }

  // Extract name — everything before "valued", "worth", "at $", or ","
  const nameMatch = text.match(/(?:add|log|record)\s+(.+?)(?:,|\s+valued|\s+worth|\s+at\s+\$)/i)
  const name = nameMatch
    ? nameMatch[1].trim()
    : text.replace(/(?:add|log|record)\s+/i, '').split(/[,$]/)[0].trim()

  return { name, value, category }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export default function QuickTransaction() {
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [submitted, setSubmitted] = useState(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const inputRef = useRef(null)

  const categoryMeta = {
    watches: { label: 'Rare Watch', color: '#d4a017', icon: '⌚' },
    art: { label: 'Fine Art', color: '#8ba7c7', icon: '🖼' },
    fashion: { label: 'Vintage Fashion', color: '#c7a8b8', icon: '👜' }
  }

  function handleChange(e) {
    const val = e.target.value
    setInputValue(val)
    setSubmitted(null)

    if (val.trim().length > 12) {
      const result = parseNaturalLanguage(val)
      if (result.value) {
        setParsed(result)
      } else {
        setParsed(null)
      }
    } else {
      setParsed(null)
    }
  }

  function handleSubmit() {
    if (!inputValue.trim() || isAnimating) return
    const result = parseNaturalLanguage(inputValue)
    setIsAnimating(true)
    setTimeout(() => {
      setSubmitted(result)
      setInputValue('')
      setParsed(null)
      setIsAnimating(false)
    }, 600)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  function fillExample(ex) {
    setInputValue(ex)
    const result = parseNaturalLanguage(ex)
    if (result.value) setParsed(result)
    inputRef.current?.focus()
  }

  return (
    <div
      className="animate-fade-up"
      style={{ animationDelay: '160ms' }}
    >
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xs font-medium tracking-[0.2em] uppercase"
          style={{ color: 'rgba(232, 188, 90, 0.6)' }}
        >
          Quick Transaction
        </h2>
        <span
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.2)' }}
        >
          Natural language entry
        </span>
      </div>

      {/* Main input card */}
      <div
        className="rounded-2xl p-4 transition-all duration-300"
        style={{
          background: isFocused
            ? 'rgba(212, 160, 23, 0.04)'
            : 'rgba(255, 255, 255, 0.02)',
          border: isFocused
            ? '1px solid rgba(212, 160, 23, 0.3)'
            : '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: isFocused
            ? '0 0 30px rgba(212, 160, 23, 0.08)'
            : 'none',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)'
        }}
      >
        {/* Input row */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 transition-all duration-200"
            style={{
              background: isFocused
                ? 'rgba(212, 160, 23, 0.15)'
                : 'rgba(255, 255, 255, 0.04)',
              border: isFocused
                ? '1px solid rgba(212, 160, 23, 0.35)'
                : '1px solid rgba(255, 255, 255, 0.06)'
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M8 2v12M2 8h12"
                stroke={isFocused ? '#d4a017' : 'rgba(255,255,255,0.3)'}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={`"Add vintage 1986 Chanel tote, valued at $4,500"`}
            rows={2}
            className="flex-1 bg-transparent resize-none text-sm leading-relaxed input-obsidian"
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'Inter, sans-serif',
              fontSize: '0.875rem',
              lineHeight: '1.6',
              padding: 0,
              minHeight: '44px'
            }}
          />
        </div>

        {/* Parsed preview */}
        {parsed && (
          <div
            className="mt-3 rounded-xl px-3 py-2.5 flex items-center gap-3 animate-fade-up"
            style={{
              background: `${categoryMeta[parsed.category].color}10`,
              border: `1px solid ${categoryMeta[parsed.category].color}30`
            }}
          >
            <span className="text-base">{categoryMeta[parsed.category].icon}</span>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-medium truncate"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                {parsed.name}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                {categoryMeta[parsed.category].label}
              </p>
            </div>
            <span
              className="font-display text-base font-semibold flex-shrink-0"
              style={{
                color: categoryMeta[parsed.category].color,
                fontFamily: 'Cormorant Garamond, Georgia, serif'
              }}
            >
              {formatCurrency(parsed.value)}
            </span>
          </div>
        )}

        {/* Submit button */}
        <div className="flex items-center justify-between mt-3">
          <span
            className="text-xs"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            Press Enter or tap Add
          </span>
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim() || isAnimating}
            className="tactile flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200"
            style={{
              background: inputValue.trim()
                ? 'rgba(212, 160, 23, 0.15)'
                : 'rgba(255,255,255,0.03)',
              border: inputValue.trim()
                ? '1px solid rgba(212, 160, 23, 0.35)'
                : '1px solid rgba(255,255,255,0.06)',
              color: inputValue.trim()
                ? '#d4a017'
                : 'rgba(255,255,255,0.2)',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            {isAnimating ? (
              <span className="animate-pulse-gold">Adding…</span>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 1v10M1 6h10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Add Asset
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success toast */}
      {submitted && submitted.value && (
        <div
          className="mt-3 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-up"
          style={{
            background: 'rgba(126, 200, 126, 0.06)',
            border: '1px solid rgba(126, 200, 126, 0.2)'
          }}
        >
          <span
            className="text-sm animate-sparkle"
            style={{ color: '#7ec87e' }}
          >
            ✦
          </span>
          <div>
            <p
              className="text-xs font-medium"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              Asset logged to ledger
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              {submitted.name} · {formatCurrency(submitted.value)}
            </p>
          </div>
        </div>
      )}

      {/* Example prompts */}
      <div className="mt-4">
        <p
          className="text-xs mb-2.5"
          style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem', letterSpacing: '0.1em' }}
        >
          QUICK EXAMPLES
        </p>
        <div className="flex flex-col gap-1.5">
          {EXAMPLES.slice(0, 2).map((ex, i) => (
            <button
              key={i}
              onClick={() => fillExample(ex)}
              className="tactile text-left text-xs py-2 px-3 rounded-lg transition-all duration-150"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.3)',
                fontStyle: 'italic'
              }}
            >
              "{ex}"
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}