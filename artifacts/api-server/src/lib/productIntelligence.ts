/**
 * Product Intelligence — static archetype library + keyword classifier
 *
 * Classifies a project into a known product archetype based on:
 *   - Genome fields (purpose, audience text)
 *   - AM page names and entity names
 *
 * No LLM calls — pure keyword scoring. Fast, deterministic, no latency.
 * Each archetype carries implied requirements that downstream artifacts
 * (Sketch, Design Plan, Flow) inherit when Product Intelligence is classified.
 */

// ── Archetype definition ──────────────────────────────────────────────────────

export interface ProductArchetype {
  id: string;
  label: string;
  description: string;
  /**
   * Signal keywords matched case-insensitively against the combined text corpus
   * (purpose + audience + page names + entity names + descriptions).
   * Scoring = matched / total; highest score wins if above MIN_SCORE_THRESHOLD.
   */
  signals: string[];
  /**
   * What any product of this type implicitly needs — surfaced as discussion
   * points before the Application Model is finalized.
   */
  impliedRequirements: string[];
}

// ── Classification result ─────────────────────────────────────────────────────

export interface ProductIntelligenceResult {
  archetypeId: string;
  archetypeLabel: string;
  /** Normalized 0–1 match score (matched signals / total signals) */
  score: number;
  impliedRequirements: string[];
  matchedSignals: string[];
}

// ── Archetype library ─────────────────────────────────────────────────────────

/** Minimum normalized score for a classification to be considered valid */
const MIN_SCORE_THRESHOLD = 0.12;

export const ARCHETYPES: ProductArchetype[] = [
  {
    id: "b2b_saas",
    label: "B2B SaaS",
    description: "A business tool used by teams inside organizations",
    signals: [
      "team", "workspace", "organization", "enterprise", "tenant",
      "subscription", "billing", "seat", "plan", "tier",
      "role", "permission", "admin", "member", "colleague",
      "invite", "onboarding", "company", "department",
    ],
    impliedRequirements: [
      "Multi-tenancy (organization-scoped data isolation)",
      "Role-based access control (admin, member, viewer)",
      "Subscription billing and seat management",
      "Team invitation and onboarding flow",
      "Audit log for compliance-sensitive actions",
      "SSO / enterprise auth (SAML or OAuth)",
      "Usage metrics and account health dashboard",
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description: "A two-sided platform connecting buyers and sellers",
    signals: [
      "buyer", "seller", "listing", "vendor", "merchant",
      "marketplace", "commission", "escrow", "bid", "offer",
      "review", "rating", "transaction", "fee", "payout",
      "supply", "demand", "search", "discovery",
    ],
    impliedRequirements: [
      "Dual user types (buyers and sellers) with separate onboarding",
      "Listing creation, editing, and moderation",
      "Search and discovery with filters",
      "Secure payment processing and escrow",
      "Commission and payout logic",
      "Reviews and trust signals",
      "Dispute resolution flow",
    ],
  },
  {
    id: "social_network",
    label: "Social Network",
    description: "A community platform built around user-generated content",
    signals: [
      "post", "feed", "follow", "follower", "friend",
      "community", "social", "share", "comment", "like",
      "profile", "notification", "network", "connection",
      "mention", "hashtag", "trending", "discover",
    ],
    impliedRequirements: [
      "User profiles and identity",
      "Follow / friend graph with feed generation",
      "Content creation (posts, comments, media)",
      "Notifications (in-app and push)",
      "Content moderation and reporting",
      "Privacy controls (public/private/friends-only)",
      "Search and discovery (people, content, hashtags)",
    ],
  },
  {
    id: "scheduling",
    label: "Scheduling / Booking",
    description: "A time-based booking or calendar management tool",
    signals: [
      "appointment", "booking", "calendar", "schedule", "availability",
      "slot", "reservation", "recurring", "reminder", "event",
      "time", "date", "block", "cancel", "reschedule",
      "staff", "provider", "client",
    ],
    impliedRequirements: [
      "Calendar view with availability management",
      "Booking flow (select slot → confirm → notify)",
      "Recurring event support",
      "Email and SMS reminders",
      "Cancellation and rescheduling policies",
      "Provider / staff profiles and working hours",
      "Timezone handling",
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    description: "A store selling physical or digital products",
    signals: [
      "product", "cart", "checkout", "inventory", "shipping",
      "order", "catalog", "store", "shop", "discount",
      "coupon", "refund", "sku", "variant", "stock",
      "fulfillment", "warehouse", "purchase", "price",
    ],
    impliedRequirements: [
      "Product catalog with variants (size, color, etc.)",
      "Shopping cart and checkout flow",
      "Payment processing (Stripe, PayPal, etc.)",
      "Inventory and stock management",
      "Order management and fulfillment",
      "Shipping rates and tracking",
      "Discount codes and promotions",
      "Returns and refund policy",
    ],
  },
  {
    id: "developer_tool",
    label: "Developer Tool",
    description: "A tool built for software engineers — SDK, CLI, API, or dev platform",
    signals: [
      "api", "sdk", "cli", "developer", "integration",
      "webhook", "token", "endpoint", "documentation", "library",
      "build", "deploy", "code", "repository", "pipeline",
      "environment", "key", "rate limit", "version", "plugin",
    ],
    impliedRequirements: [
      "API key management and scoped permissions",
      "Webhook configuration and delivery",
      "Rate limiting and quota management",
      "Versioned API documentation",
      "SDKs or client libraries",
      "Sandbox / test environment",
      "Error logging and developer observability",
    ],
  },
  {
    id: "dashboard_analytics",
    label: "Dashboard & Analytics",
    description: "A data visualization and monitoring tool",
    signals: [
      "dashboard", "analytics", "metric", "chart", "report",
      "visualization", "kpi", "insight", "trend", "statistics",
      "graph", "performance", "tracker", "monitor", "overview",
      "asset", "portfolio", "ledger", "summary", "data",
    ],
    impliedRequirements: [
      "Data ingestion and normalization pipeline",
      "Charting library (time-series, bar, pie, etc.)",
      "Configurable date range and filters",
      "KPI cards with delta indicators",
      "Export to CSV or PDF",
      "Real-time or scheduled data refresh",
      "Role-based visibility of sensitive metrics",
    ],
  },
  {
    id: "fintech",
    label: "Fintech / Trading",
    description: "A financial tool — investing, trading, budgeting, or payments",
    signals: [
      "trade", "trading", "invest", "investment", "portfolio",
      "stock", "crypto", "asset", "balance", "transaction",
      "budget", "expense", "finance", "money", "fund",
      "profit", "loss", "return", "market", "price",
      "ledger", "account", "wallet", "transfer",
    ],
    impliedRequirements: [
      "Real-time or near-real-time market data",
      "Secure financial data handling (PCI-DSS awareness)",
      "Transaction history with audit trail",
      "Portfolio performance calculation",
      "Gain/loss reporting",
      "Export to CSV for taxes / reconciliation",
      "Multi-currency support",
    ],
  },
  {
    id: "iot_hardware",
    label: "IoT / Hardware",
    description: "A product that involves physical devices or embedded systems",
    signals: [
      "device", "sensor", "firmware", "hardware", "iot",
      "connectivity", "physical", "embedded", "telemetry",
      "gateway", "protocol", "edge", "mqtt", "bluetooth",
      "wifi", "signal", "reading", "temperature", "humidity",
    ],
    impliedRequirements: [
      "Device provisioning and registration",
      "Connectivity protocol (MQTT, HTTP, BLE, etc.)",
      "Telemetry ingestion and storage",
      "Real-time monitoring dashboard",
      "Firmware OTA update mechanism",
      "Offline mode and local buffering",
      "Device health and alert system",
    ],
  },
  {
    id: "content_platform",
    label: "Content Platform",
    description: "A CMS, blog, or media publishing platform",
    signals: [
      "blog", "post", "article", "author", "editorial",
      "media", "content", "publish", "subscriber", "newsletter",
      "cms", "category", "tag", "editor", "draft",
      "seo", "slug", "rss", "podcast", "video",
    ],
    impliedRequirements: [
      "Rich text / markdown editor",
      "Content lifecycle (draft → review → publish)",
      "Author profiles and multi-author support",
      "Taxonomy (categories, tags)",
      "SEO metadata (title, description, canonical URL)",
      "RSS or newsletter subscription",
      "Media library for images and files",
    ],
  },
];

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify a project into a product archetype using keyword scoring.
 *
 * @param purposeText  - genome.purpose field
 * @param audienceText - genome.audience field
 * @param pageNames    - AM page names
 * @param entityNames  - AM entity names
 * @param extraText    - optional: page descriptions, entity descriptions, etc.
 */
export function classifyProductArchetype(
  purposeText: string | null | undefined,
  audienceText: string | null | undefined,
  pageNames: string[],
  entityNames: string[],
  extraText?: string[],
): ProductIntelligenceResult | null {
  // Build the text corpus — combine all available signals into one lowercase string
  const corpus = [
    purposeText ?? "",
    audienceText ?? "",
    ...pageNames,
    ...entityNames,
    ...(extraText ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (!corpus.trim()) return null;

  let bestScore = 0;
  let bestArchetype: ProductArchetype | null = null;
  const bestMatched: string[] = [];

  for (const archetype of ARCHETYPES) {
    const matched: string[] = [];
    for (const signal of archetype.signals) {
      if (corpus.includes(signal.toLowerCase())) {
        matched.push(signal);
      }
    }
    const score = matched.length / archetype.signals.length;
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = archetype;
      bestMatched.length = 0;
      bestMatched.push(...matched);
    }
  }

  if (!bestArchetype || bestScore < MIN_SCORE_THRESHOLD) return null;

  return {
    archetypeId: bestArchetype.id,
    archetypeLabel: bestArchetype.label,
    score: Math.round(bestScore * 100) / 100,
    impliedRequirements: bestArchetype.impliedRequirements,
    matchedSignals: bestMatched,
  };
}
