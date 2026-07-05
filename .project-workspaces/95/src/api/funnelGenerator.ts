import { Funnel, FunnelStep } from '../types';

// Mock generator — swap this function body for a real AI call without touching any component.
// Expected contract: receives a prompt string, returns a Promise<Funnel>.

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mockStepsFromPrompt(prompt: string): FunnelStep[] {
  const lower = prompt.toLowerCase();

  if (lower.includes('webinar') || lower.includes('workshop')) {
    return [
      {
        stage: 'Awareness',
        action: 'Run a targeted social ad highlighting the pain point your webinar solves. Use a bold one-line hook.',
        cta: 'Save your free seat →',
      },
      {
        stage: 'Engagement',
        action: 'Drive traffic to a focused registration page. Single field: email. No distractions.',
        cta: 'Reserve my spot',
      },
      {
        stage: 'Conversion',
        action: 'Send a 3-part email sequence: confirmation, value preview, and day-of reminder with urgency.',
        cta: 'Join the live session',
      },
    ];
  }

  if (lower.includes('product') || lower.includes('shop') || lower.includes('store')) {
    return [
      {
        stage: 'Awareness',
        action: 'Create a short-form video showing the product solving a real problem. Post to Reels + TikTok.',
        cta: 'See how it works →',
      },
      {
        stage: 'Consideration',
        action: 'Link to a product page with social proof, a single benefit headline, and a clear price.',
        cta: 'Get yours today',
      },
      {
        stage: 'Conversion',
        action: 'Retarget visitors with a limited-time offer. One email, one discount, one deadline.',
        cta: 'Claim my discount',
      },
    ];
  }

  if (lower.includes('consult') || lower.includes('coaching') || lower.includes('service')) {
    return [
      {
        stage: 'Awareness',
        action: 'Share a case study or transformation story on LinkedIn and Instagram Stories.',
        cta: 'Read the full story →',
      },
      {
        stage: 'Interest',
        action: 'Offer a free 15-minute discovery call via a simple booking link. Reduce friction to zero.',
        cta: 'Book my free call',
      },
      {
        stage: 'Conversion',
        action: 'Follow up post-call with a personalized proposal email within 2 hours. Strike while interest is hot.',
        cta: 'See your proposal',
      },
    ];
  }

  // Default generic funnel
  return [
    {
      stage: 'Awareness',
      action: `Create content that speaks directly to the pain point behind: "${prompt}". Lead with the outcome, not the offer.`,
      cta: 'Learn more →',
    },
    {
      stage: 'Engagement',
      action: 'Capture interest with a focused landing page or lead magnet. One ask, one value exchange.',
      cta: 'Get instant access',
    },
    {
      stage: 'Conversion',
      action: 'Follow up within 24 hours. Personal message or automated sequence — keep it specific to their situation.',
      cta: 'Start today',
    },
  ];
}

export async function generateFunnel(prompt: string): Promise<Funnel> {
  // Simulate network latency for realistic UX
  await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 600));

  const steps = mockStepsFromPrompt(prompt);
  const now = new Date().toISOString();

  // Derive a short name from the prompt (first 5 words)
  const words = prompt.trim().split(/\s+/);
  const name = words.slice(0, 5).join(' ') + (words.length > 5 ? '…' : '');

  return {
    id: generateId(),
    name,
    prompt,
    steps,
    metrics: {
      leads: Math.floor(Math.random() * 40),
      conversionRate: Math.floor(Math.random() * 20) + 5,
      clicks: Math.floor(Math.random() * 200) + 20,
    },
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}