export interface FunnelStep {
  stage: string;
  action: string;
  cta?: string;
}

export interface FunnelMetrics {
  leads: number;
  conversionRate: number;
  clicks: number;
}

export interface Funnel {
  id: string;
  name: string;
  prompt: string;
  steps: FunnelStep[];
  metrics: FunnelMetrics;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  active: boolean;
  icon?: string;
}