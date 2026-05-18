import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: true,
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

export default nextConfig;
