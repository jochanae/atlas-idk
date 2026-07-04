import React, { createContext, useContext, useState, useCallback } from 'react'

const DashboardContext = createContext(null)

const INITIAL_METRICS = {
  totalLeads: 847,
  conversionRate: 12.4,
  activeFunnels: 3,
  clicksToday: 214,
  weeklyGrowth: 8.2
}

const INITIAL_FUNNELS = [
  {
    id: 'f1',
    prompt: 'Sell my online photography course to beginners',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    active: true,
    leads: 312,
    steps: [
      {
        id: 's1',
        label: 'Awareness',
        title: 'Free Mini-Guide',
        description: 'Offer a free "5-Day Phone Photography" PDF to capture emails from curious beginners.',
        cta: 'Download Free Guide'
      },
      {
        id: 's2',
        label: 'Consideration',
        title: 'Behind-the-Scenes Video',
        description: 'Send a short video showing real student transformations — from blurry snapshots to portfolio-worthy shots.',
        cta: 'Watch the Story'
      },
      {
        id: 's3',
        label: 'Conversion',
        title: 'Limited Enrollment Offer',
        description: 'Present a time-limited discount on the full course with a clear value summary and social proof.',
        cta: 'Enroll Now — Save 40%'
      }
    ]
  },
  {
    id: 'f2',
    prompt: 'Grow my freelance copywriting clients',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    active: true,
    leads: 189,
    steps: [
      {
        id: 's1',
        label: 'Awareness',
        title: 'The $10K Email Audit',
        description: 'Offer a free email sequence audit that reveals exactly what revenue they\'re leaving on the table.',
        cta: 'Get My Free Audit'
      },
      {
        id: 's2',
        label: 'Consideration',
        title: 'Case Study Breakdown',
        description: 'Share a detailed case study showing how one client went from 2% to 8% email open rates in 30 days.',
        cta: 'Read the Case Study'
      },
      {
        id: 's3',
        label: 'Conversion',
        title: 'Strategy Call',
        description: 'Invite them to a 20-minute paid strategy call — positions your expertise and filters serious prospects.',
        cta: 'Book a Strategy Call'
      }
    ]
  },
  {
    id: 'f3',
    prompt: 'Launch a digital wellness journal product',
    createdAt: new Date(Date.now() - 86400000 * 9).toISOString(),
    active: false,
    leads: 74,
    steps: [
      {
        id: 's1',
        label: 'Awareness',
        title: 'Morning Routine Quiz',
        description: 'An engaging 60-second quiz that reveals their current stress score and suggests a personalized wellness path.',
        cta: 'Take the Quiz'
      },
      {
        id: 's2',
        label: 'Consideration',
        title: 'Free 7-Day Journal Starter',
        description: 'Deliver a 7-day sample of the digital journal with guided prompts — lets them experience the product firsthand.',
        cta: 'Start Free Week'
      },
      {
        id: 's3',
        label: 'Conversion',
        title: 'Full Journal Access',
        description: 'Present the full product with a clear comparison between their quiz results and expected outcomes after 30 days.',
        cta: 'Get Lifetime Access'
      }
    ]
  }
]

const INITIAL_LINKS = [
  { id: 'l1', label: 'Instagram', url: 'https://instagram.com', active: true, clicks: 142, icon: '📸' },
  { id: 'l2', label: 'TikTok', url: 'https://tiktok.com', active: true, clicks: 89, icon: '🎵' },
  { id: 'l3', label: 'Newsletter', url: 'https://convertkit.com', active: true, clicks: 67, icon: '✉️' },
  { id: 'l4', label: 'Podcast', url: 'https://spotify.com', active: false, clicks: 23, icon: '🎙️' },
  { id: 'l5', label: 'YouTube', url: 'https://youtube.com', active: false, clicks: 18, icon: '▶️' }
]

const FUNNEL_TEMPLATES = [
  { trigger: ['course', 'class', 'teach', 'training', 'workshop'], theme: 'education' },
  { trigger: ['freelance', 'client', 'service', 'consulting', 'agency'], theme: 'service' },
  { trigger: ['product', 'shop', 'store', 'sell', 'ecommerce'], theme: 'product' },
  { trigger: ['coaching', 'coach', 'mentor', 'program'], theme: 'coaching' },
  { trigger: ['app', 'saas', 'software', 'tool', 'platform'], theme: 'saas' }
]

function generateFunnelFromPrompt(prompt) {
  const lower = prompt.toLowerCase()
  let theme = 'general'

  for (const t of FUNNEL_TEMPLATES) {
    if (t.trigger.some(word => lower.includes(word))) {
      theme = t.theme
      break
    }
  }

  const themes = {
    education: {
      steps: [
        { label: 'Awareness', title: 'Free Taste of Your Content', description: `Offer a free sample lesson or resource that gives a real preview of what they'll learn — hooks curiosity without giving everything away.`, cta: 'Access Free Sample' },
        { label: 'Consideration', title: 'Student Success Story', description: 'Share a transformation story from a real student, showing the before/after of what your course delivers in concrete terms.', cta: 'Read the Story' },
        { label: 'Conversion', title: 'Enrollment with Urgency', description: 'Present full course access with a clear outcome promise, social proof count, and a time-limited early-bird offer.', cta: 'Enroll Today' }
      ]
    },
    service: {
      steps: [
        { label: 'Awareness', title: 'High-Value Free Audit', description: 'Offer a free audit or review of something specific to your prospect — reveals their problem and establishes your expertise immediately.', cta: 'Get My Free Audit' },
        { label: 'Consideration', title: 'Results Breakdown', description: 'Show a detailed breakdown of a real client result — numbers, timeline, and what changed. Make it specific, not vague.', cta: 'See the Results' },
        { label: 'Conversion', title: 'Discovery Call', description: 'Invite them to a focused 20-minute call. Frame it around their outcome, not your sales process.', cta: 'Book My Call' }
      ]
    },
    product: {
      steps: [
        { label: 'Awareness', title: 'The Problem You Solve', description: 'Lead with a bold statement about the specific frustration your product eliminates. Make the reader feel seen before you show them anything.', cta: 'Yes, That\'s Me' },
        { label: 'Consideration', title: 'Product in Action', description: 'Show the product doing its job — a short demo, before/after comparison, or a real customer use case with their words.', cta: 'See How It Works' },
        { label: 'Conversion', title: 'Risk-Free First Order', description: 'Remove the barrier with a clear guarantee, easy returns, and a first-order incentive that makes trying it an obvious decision.', cta: 'Try It Risk-Free' }
      ]
    },
    coaching: {
      steps: [
        { label: 'Awareness', title: 'The Diagnosis Quiz', description: 'A short quiz that identifies exactly where they\'re stuck right now — personalizes the experience and earns their attention.', cta: 'Find My Gaps' },
        { label: 'Consideration', title: 'Coaching Methodology', description: 'Walk through your framework in plain language. Show them the path from where they are to where they want to be.', cta: 'See the Framework' },
        { label: 'Conversion', title: 'Application for Coaching', description: 'Frame enrollment as an application — not a purchase. This filters for committed clients and raises perceived value.', cta: 'Apply to Work Together' }
      ]
    },
    saas: {
      steps: [
        { label: 'Awareness', title: 'The Cost of the Status Quo', description: 'Open with what it\'s costing them — in time, money, or frustration — to keep doing things the old way.', cta: 'Calculate My Cost' },
        { label: 'Consideration', title: 'Live Demo or Free Trial', description: 'Let them experience the product immediately. Remove friction from the first touch — no credit card, no long onboarding.', cta: 'Try It Free' },
        { label: 'Conversion', title: 'Upgrade to Pro', description: 'Present the paid tier at the moment they\'ve already gotten value from the free experience — the decision feels easy, not pushy.', cta: 'Upgrade Now' }
      ]
    },
    general: {
      steps: [
        { label: 'Awareness', title: 'Lead Magnet', description: 'Offer a specific, high-value free resource that addresses the #1 frustration your target audience faces right now.', cta: 'Get Instant Access' },
        { label: 'Consideration', title: 'Social Proof & Story', description: 'Share a compelling story or testimonial that shows the transformation you deliver — make the outcome feel real and achievable.', cta: 'Read the Story' },
        { label: 'Conversion', title: 'Clear Offer', description: 'Present your core offer with a clean summary of what they get, what it costs, and why now is the right moment.', cta: 'Get Started' }
      ]
    }
  }

  const template = themes[theme] || themes.general
  const newId = `f${Date.now()}`

  return {
    id: newId,
    prompt,
    createdAt: new Date().toISOString(),
    active: true,
    leads: 0,
    steps: template.steps.map((s, i) => ({ ...s, id: `${newId}_s${i}` }))
  }
}

export function DashboardProvider({ children }) {
  const [metrics, setMetrics] = useState(INITIAL_METRICS)
  const [funnels, setFunnels] = useState(INITIAL_FUNNELS)
  const [links, setLinks] = useState(INITIAL_LINKS)
  const [generating, setGenerating] = useState(false)

  const generateFunnel = useCallback(async (prompt) => {
    if (!prompt.trim()) return null
    setGenerating(true)

    // Simulate AI generation delay
    await new Promise(resolve => setTimeout(resolve, 1800))

    const newFunnel = generateFunnelFromPrompt(prompt)
    setFunnels(prev => [newFunnel, ...prev])
    setMetrics(prev => ({
      ...prev,
      activeFunnels: prev.activeFunnels + 1
    }))
    setGenerating(false)
    return newFunnel
  }, [])

  const toggleFunnel = useCallback((id) => {
    setFunnels(prev => prev.map(f =>
      f.id === id ? { ...f, active: !f.active } : f
    ))
    setMetrics(prev => {
      const funnel = funnels.find(f => f.id === id)
      if (!funnel) return prev
      return {
        ...prev,
        activeFunnels: funnel.active
          ? Math.max(0, prev.activeFunnels - 1)
          : prev.activeFunnels + 1
      }
    })
  }, [funnels])

  const deleteFunnel = useCallback((id) => {
    setFunnels(prev => {
      const target = prev.find(f => f.id === id)
      if (target?.active) {
        setMetrics(m => ({ ...m, activeFunnels: Math.max(0, m.activeFunnels - 1) }))
      }
      return prev.filter(f => f.id !== id)
    })
  }, [])

  const toggleLink = useCallback((id) => {
    setLinks(prev => prev.map(l =>
      l.id === id ? { ...l, active: !l.active } : l
    ))
  }, [])

  const addLink = useCallback((link) => {
    const newLink = {
      id: `l${Date.now()}`,
      clicks: 0,
      active: true,
      ...link
    }
    setLinks(prev => [...prev, newLink])
  }, [])

  const deleteLink = useCallback((id) => {
    setLinks(prev => prev.filter(l => l.id !== id))
  }, [])

  return (
    <DashboardContext.Provider value={{
      metrics,
      funnels,
      links,
      generating,
      generateFunnel,
      toggleFunnel,
      deleteFunnel,
      toggleLink,
      addLink,
      deleteLink
    }}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}