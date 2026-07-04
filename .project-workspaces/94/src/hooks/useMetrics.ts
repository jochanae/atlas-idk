import { useState, useEffect } from 'react'
import type { Funnel } from './useFunnelState'

export interface MetricCard {
  id: string
  label: string
  value: string
  subtext: string
  trend: 'up' | 'down' | 'neutral'
  trendValue: string
}

export function useMetrics(funnels: Funnel[]): MetricCard[] {
  const [metrics, setMetrics] = useState<MetricCard[]>([])

  useEffect(() => {
    const activeFunnels = funnels.filter((f) => f.status === 'active')
    const totalLeads = funnels.reduce((sum, f) => sum + f.leads, 0)
    const avgConversion =
      activeFunnels.length > 0
        ? activeFunnels.reduce((sum, f) => sum + f.conversion, 0) / activeFunnels.length
        : 0

    setMetrics([
      {
        id: 'active-funnels',
        label: 'Active Funnels',
        value: String(activeFunnels.length),
        subtext: `${funnels.length} total`,
        trend: activeFunnels.length > 1 ? 'up' : 'neutral',
        trendValue: '+1 this week',
      },
      {
        id: 'total-leads',
        label: 'Total Leads',
        value: totalLeads > 999 ? `${(totalLeads / 1000).toFixed(1)}k` : String(totalLeads),
        subtext: 'across all funnels',
        trend: 'up',
        trendValue: '+23 today',
      },
      {
        id: 'avg-conversion',
        label: 'Avg. Conversion',
        value: `${avgConversion.toFixed(1)}%`,
        subtext: 'industry avg 3.2%',
        trend: avgConversion > 3.2 ? 'up' : 'down',
        trendValue: avgConversion > 3.2 ? 'above avg' : 'below avg',
      },
      {
        id: 'link-clicks',
        label: 'Link Clicks',
        value: '1.4k',
        subtext: 'last 7 days',
        trend: 'up',
        trendValue: '+18% vs prior week',
      },
    ])
  }, [funnels])

  return metrics
}