/**
 * Funnel Generator API
 *
 * Currently uses a mock implementation.
 * To swap in a real AI provider (Anthropic, OpenAI, etc.),
 * replace the body of `generateFunnel` with a real API call.
 * The return type (FunnelStep[]) is the contract — frontend never changes.
 */

import type { FunnelStep } from '../types'

const MOCK_DELAY_MS = 1200

function buildMockFunnel(prompt: string): FunnelStep[] {
  const topic = prompt.trim() || 'your offer'

  return [
    {
      step: 1,
      title: 'Awareness Hook',
      description: `Draw in cold audiences by addressing the core pain point behind "${topic}". Lead with a bold stat, a provocative question, or a relatable struggle. No selling yet — just resonance.`,
      cta: 'Learn how →',
      conversionTarget: 35,
    },
    {
      step: 2,
      title: 'Value Bridge',
      description: `Deliver a high-value free resource related to "${topic}" — a checklist, mini-guide, or short video. Capture email at this stage. The exchange should feel like a steal for the subscriber.`,
      cta: 'Get free access →',
      conversionTarget: 22,
    },
    {
      step: 3,
      title: 'Conversion Close',
      description: `Present your core offer as the logical next step from the free resource. Use social proof, a time-sensitive bonus, or a clear transformation statement tied to "${topic}".`,
      cta: 'Start now →',
      conversionTarget: 8,
    },
  ]
}

export async function generateFunnel(prompt: string): Promise<FunnelStep[]> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))

  // ─── SWAP POINT ───────────────────────────────────────────────
  // Replace everything below with a real API call when ready:
  //
  // const response = await fetch('/api/generate-funnel', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ prompt }),
  // })
  // if (!response.ok) throw new Error('Funnel generation failed')
  // const data = await response.json()
  // return data.steps as FunnelStep[]
  // ──────────────────────────────────────────────────────────────

  return buildMockFunnel(prompt)
}