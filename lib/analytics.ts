import posthog from "posthog-js";

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
  if (!key) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
  });
  initialized = true;
}

export function identifyUser(userId: string, email?: string | null) {
  if (!initialized) return;
  posthog.identify(userId, { email: email ?? undefined });
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
