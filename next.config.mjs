import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,

  // SEO FIX: canonicalize on the non-www host. Without this, Google was
  // crawling and indexing buildmind.live and www.buildmind.live as two
  // separate, unresolved duplicate URLs for every public page.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.buildmind.live" }],
        destination: "https://buildmind.live/:path*",
        permanent: true,
      },
      // SEO FIX: /privacy and /terms were orphaned duplicates of
      // /legal/privacy and /legal/terms (same content, no canonical
      // pointing between them). The /legal/ versions are the ones
      // actually linked from the UI, so they're canonical; these
      // old routes now 301 to them instead of serving duplicate pages.
      {
        source: "/privacy",
        destination: "/legal/privacy",
        permanent: true,
      },
      {
        source: "/terms",
        destination: "/legal/terms",
        permanent: true,
      },
    ];
  },

  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
          // Content-Security-Policy is set per-request in middleware.ts
          // using a cryptographic nonce — do not add a static CSP here
          // as it would override the nonce-based header (W5 fix).
        ],
      },
      // Cache static AI fallbacks aggressively — they don't change at runtime
      {
        source: "/api/ai/break-public",
        headers: [
          { key: "Cache-Control", value: "no-store" }, // rate-limited, never cache
        ],
      },
    ];
  },
};

const sentryWrappedConfig = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "buildmind-ag",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,
  sourcemaps: {
    disable: process.env.SENTRY_UPLOAD_SOURCE_MAPS !== "true",
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});

export default process.env.SENTRY_UPLOAD_SOURCE_MAPS === "true"
  ? sentryWrappedConfig
  : nextConfig;
