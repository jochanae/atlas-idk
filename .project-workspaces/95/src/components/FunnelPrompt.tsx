import React, { useState, useRef } from 'react'
import { generateFunnel } from '../api/funnelGenerator'
import type { Funnel } from '../types'
import { useFunnelStore } from '../hooks/useFunnelStore'

export function FunnelPrompt() {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastGenerated, setLastGenerated] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addFunnel } = useFunnelStore()

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || isGenerating) return
    setIsGenerating(true)
    setError(null)
    try {
      const steps = await generateFunnel(trimmed)
      const name = trimmed.length > 48 ? trimmed.slice(0, 48) + '…' : trimmed
      addFunnel({
        name,
        prompt: trimmed,
        steps,
        status: 'active',
        leads: Math.floor(Math.random() * 120) + 10,
        conversions: Math.floor(Math.random() * 30) + 2,
      })
      setLastGenerated(name)
      setPrompt('')
      textareaRef.current?.blur()
    } catch {
      setError('Generation failed. Try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  return (
    <div className="px-4 pt-6 pb-2">
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-amber-gold tracking-wide">Funnel Studio</h1>
        <p className="text-sm text-white/40 mt-0.5">Describe your offer. Generate a 3-step lead funnel.</p>
      </div>

      <div
        className="rounded-2xl border border-glass-border bg-glass-surface backdrop-blur-glass shadow-glass p-4"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Sell my 1:1 coaching for freelance designers who want to double their rates…"
          rows={3}
          disabled={isGenerating}
          aria-label="Funnel prompt input"
          className="w-full bg-transparent text-white/85 placeholder-white/25 text-sm resize-none leading-relaxed disabled:opacity-50"
        />

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-glass-border">
          <span className="text-xs text-white/25">
            {prompt.length > 0 ? `${prompt.length} chars` : 'Press Enter to generate'}
          </span>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            aria-label="Generate funnel"
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200
              bg-amber-gold text-obsidian-900 shadow-amber
              disabled:opacity-40 disabled:cursor-not-allowed
              hover:bg-amber-light active:scale-95"
          >
            {isGenerating ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-obsidian-900/40 border-t-obsidian-900 rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              'Generate Funnel'
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400 px-1">{error}</p>
      )}

      {lastGenerated && !isGenerating && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-amber-glow border border-amber-muted/30 animate-fade-up">
          <p className="text-xs text-amber-light">
            ✓ Funnel created — <span className="font-medium">"{lastGenerated}"</span>
          </p>
        </div>
      )}
    </div>
  )
}