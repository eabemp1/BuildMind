import { defineConfig, devices } from "@playwright/test";

/**
 * playwright.config.ts
 *
 * Runs E2E tests against the locally running Next.js dev server.
 * For CI, set NEXT_PUBLIC_SUPABASE_URL and related env vars in your
 * CI environment — the tests use a dedicated test user account.
 *
 * Run:
 *   npx playwright test              # all tests
 *   npx playwright test e2e/billing  # billing suite only
 *   npx playwright test --ui         # interactive UI mode
 */

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // billing tests must be sequential to avoid race conditions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Spin up the Next.js dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
