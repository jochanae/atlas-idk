import React, { useState, useRef } from 'react'

interface Props {
  onGenerate: (prompt: string) => void
  generating: boolean
}

const PLACEHOLDER_PROMPTS = [
  'Drive Instagram followers to my email list…',
  'Sell my 1:1 coaching program to cold traffic…',
  'Convert podcast listeners to course buyers…',
  'Build a waitlist for my digital product launch…',
]

export default function FunnelGenerator({ onGenerate, generating }: Props) {
  const [prompt, setPrompt] = useState('')
  const [placeholderIndex] = useState(() =>
    Math.floor(Math.random() * PLACEHOLDER_PROMPTS.length)
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (!prompt.trim() || generating) return
    onGenerate(prompt.trim())
    setPrompt('')
    textareaRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="ambient-glow glass-amber rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <p className="text-amber-400/80 text-xs font-semibold uppercase tracking-widest">
          Generate Funnel
        </p>
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={generating}
        placeholder={PLACEHOLDER_PROMPTS[placeholderIndex]}
        rows={3}
        className="w-full bg-transparent text-white text-sm resize-none outline-none leading-relaxed tracking-wide-custom"
        style={{ caretColor: '#f59e0b' }}
      />

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-amber-400/10">
        <p className="text-white/20 text-xs">
          {prompt.length > 0 ? `${prompt.length} chars` : 'Describe your goal'}
        </p>

        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() || generating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.9), rgba(217,119,6,0.8))',
            color: '#0a0a0f',
            boxShadow: prompt.trim() && !generating ? '0 4px 16px rgba(245,158,11,0.25)' : 'none',
          }}
        >
          {generating ? (
            <>
              <span className="animate-shimmer">●</span>
              <span>Building…</span>
            </>
          ) : (
            <>
              <span>Generate</span>
              <span>→</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}