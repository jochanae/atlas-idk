import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn("[Sentry] No DSN configured — skipping initialization");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.3,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Filter out browser extension errors
      const frames = event.exception?.values?.[0]?.stacktrace?.frames;
      if (frames?.some((f) => f.filename?.includes("extension://"))) {
        return null;
      }
      // Filter out analytics fetch errors
      const message = event.exception?.values?.[0]?.value || "";
      if (/analytics|beacon|collect/i.test(message)) {
        return null;
      }
      return event;
    },
    environment: import.meta.env.MODE,
  });
}

export function setSentryUser(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser(user);
}

export function clearSentryUser() {
  Sentry.setUser(null);
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) {
    console.error("[Sentry stub]", error, context);
    return;
  }
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  if (!SENTRY_DSN) {
    console.log(`[Sentry stub] ${level}:`, message);
    return;
  }
  Sentry.captureMessage(message, level);
}

export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  Sentry.addBreadcrumb(breadcrumb);
}
