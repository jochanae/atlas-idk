export type FunnelStep = {
  step: number
  title: string
  description: string
  cta: string
  conversionTarget: number
}

export type Funnel = {
  id: string
  name: string
  prompt: string
  steps: FunnelStep[]
  status: 'active' | 'draft' | 'archived'
  createdAt: string
  updatedAt: string
  leads: number
  conversions: number
}

export type SocialLink = {
  id: string
  platform: string
  url: string
  label: string
  active: boolean
  clicks: number
}

export type MetricSnapshot = {
  totalLeads: number
  totalConversions: number
  activeFunnels: number
  conversionRate: number
}