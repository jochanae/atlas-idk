import { useState, useCallback } from 'react'

export interface FunnelStep {
  id: number
  label: string
  action: string
  icon: string
}

export interface Funnel {
  id: string
  prompt: string
  steps: FunnelStep[]
  status: 'active' | 'paused' | 'archived'
  createdAt: Date
  leads: number
  conversion: number
}

const FUNNEL_TEMPLATES: Record<string, FunnelStep[]> = {
  default: [
    {
      id: 1,
      label: 'Awareness',
      action: 'Share a short-form video showing the core problem your product solves.',
      icon: '👁️',
    },
    {
      id: 2,
      label: 'Capture',
      action: 'Offer a free resource in exchange for an email — checklist, template, or mini-guide.',
      icon: '🎯',
    },
    {
      id: 3,
      label: 'Convert',
      action: 'Send a 3-email nurture sequence ending with a limited-time offer or discovery call.',
      icon: '⚡',
    },
  ],
  coach: [
    {
      id: 1,
      label: 'Awareness',
      action: 'Post a transformation story from a past client. Lead with the before, end with the after.',
      icon: '👁️',
    },
    {
      id: 2,
      label: 'Capture',
      action: 'Offer a free 15-min clarity call to your most engaged followers.',
      icon: '🎯',
    },
    {
      id: 3,
      label: 'Convert',
      action: 'Present your signature program with a clear outcome promise and a single CTA.',
      icon: '⚡',
    },
  ],
  product: [
    {
      id: 1,
      label: 'Awareness',
      action: 'Run a 3-day organic content sprint demonstrating your product in real use.',
      icon: '👁️',
    },
    {
      id: 2,
      label: 'Capture',
      action: 'Gate a "behind the scenes" bonus for email subscribers only.',
      icon: '🎯',
    },
    {
      id: 3,
      label: 'Convert',
      action: 'Launch a 48-hour flash sale exclusively to your email list.',
      icon: '⚡',
    },
  ],
  content: [
    {
      id: 1,
      label: 'Awareness',
      action: 'Publish a high-value carousel post addressing your audience\'s biggest misconception.',
      icon: '👁️',
    },
    {
      id: 2,
      label: 'Capture',
      action: 'Offer a free content calendar template in exchange for a follow + email.',
      icon: '🎯',
    },
    {
      id: 3,
      label: 'Convert',
      action: 'Pitch your 1:1 content strategy session to new subscribers within 48 hours of signup.',
      icon: '⚡',
    },
  ],
}

function detectTemplate(prompt: string): FunnelStep[] {
  const lower = prompt.toLowerCase()
  if (lower.includes('coach') || lower.includes('consulting') || lower.includes('service')) {
    return FUNNEL_TEMPLATES.coach
  }
  if (lower.includes('product') || lower.includes('shop') || lower.includes('sell') || lower.includes('store')) {
    return FUNNEL_TEMPLATES.product
  }
  if (lower.includes('content') || lower.includes('creator') || lower.includes('brand')) {
    return FUNNEL_TEMPLATES.content
  }
  return FUNNEL_TEMPLATES.default
}

const INITIAL_FUNNELS: Funnel[] = [
  {
    id: 'funnel-001',
    prompt: 'Instagram audience to email list for my wellness brand',
    steps: FUNNEL_TEMPLATES.content,
    status: 'active',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    leads: 142,
    conversion: 18.4,
  },
  {
    id: 'funnel-002',
    prompt: 'Sell my 1:1 coaching program to cold traffic',
    steps: FUNNEL_TEMPLATES.coach,
    status: 'active',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    leads: 67,
    conversion: 9.2,
  },
]

export function useFunnelState() {
  const [funnels, setFunnels] = useState<Funnel[]>(INITIAL_FUNNELS)
  const [generating, setGenerating] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<string | null>(null)

  const generateFunnel = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return
    setGenerating(true)

    await new Promise((r) => setTimeout(r, 1400))

    const steps = detectTemplate(prompt)
    const newFunnel: Funnel = {
      id: `funnel-${Date.now()}`,
      prompt,
      steps,
      status: 'active',
      createdAt: new Date(),
      leads: 0,
      conversion: 0,
    }

    setFunnels((prev) => [newFunnel, ...prev])
    setLastGenerated(newFunnel.id)
    setGenerating(false)
  }, [])

  const toggleStatus = useCallback((id: string) => {
    setFunnels((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, status: f.status === 'active' ? 'paused' : 'active' }
          : f
      )
    )
  }, [])

  const archiveFunnel = useCallback((id: string) => {
    setFunnels((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: 'archived' } : f))
    )
  }, [])

  return {
    funnels,
    generating,
    lastGenerated,
    generateFunnel,
    toggleStatus,
    archiveFunnel,
  }
}