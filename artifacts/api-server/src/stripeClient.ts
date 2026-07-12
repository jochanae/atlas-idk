import Stripe from 'stripe';

// stripe-replit-sync is an optional Replit-managed integration.
// Declare a minimal interface so TypeScript does not error when the package is absent.
interface StripeSync {
  new(config: { poolConfig: { connectionString: string; max: number }; stripeSecretKey: string }): StripeSync;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');
  // Cast to string — Stripe.LatestApiVersion was removed in newer SDK typings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error('STRIPE_PUBLISHABLE_KEY not set');
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');
  return secretKey;
}

let stripeSyncInstance: InstanceType<any> | null = null;

export async function getStripeSync() {
  if (!stripeSyncInstance) {
    // Dynamic import — only available when the stripe-replit-sync package is installed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('stripe-replit-sync' as any).catch(() => null);
    if (!mod) throw new Error('stripe-replit-sync is not installed');
    const { StripeSync } = mod as { StripeSync: new(config: unknown) => unknown };
    const secretKey = await getStripeSecretKey();
    stripeSyncInstance = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSyncInstance;
}
