/**
 * e2e/helpers.ts
 *
 * Shared helpers and fixtures for BuildMind E2E tests.
 *
 * Test account setup:
 *   Create a dedicated Supabase test user with:
 *     email:    process.env.E2E_TEST_EMAIL    (e.g. e2e@buildmind.test)
 *     password: process.env.E2E_TEST_PASSWORD
 *   This account must:
 *     - Already have completed onboarding (onboarding_completed = true)
 *     - Have at least one project in the "MVP" stage
 *   The account is reset between test runs by the `resetTestAccount` helper.
 */

import { type Page, type BrowserContext, expect } from "@playwright/test";

export const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? "e2e@buildmind.test";
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "TestPass123!";

/** Sign in via the login page and wait for redirect to /today */
export async function signIn(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL("**/today", { timeout: 15_000 });
}

/** Sign out via Supabase client (works without a sign-out button in view) */
export async function signOut(page: Page) {
  // Prefer a hard reset (cookies + storage) to avoid bundling app modules into the browser context.
  await page.context().clearCookies().catch(() => {});
  await page.evaluate(() => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  }).catch(() => {});
}

/** Wait for the Today page to be fully loaded (score and action visible) */
export async function waitForTodayReady(page: Page) {
  await page.waitForSelector("[data-testid='today-action']", { timeout: 10_000 });
}

/** Helper: intercept a POST route and return a mocked response */
export async function mockApiRoute(
  context: BrowserContext,
  urlPattern: string | RegExp,
  responseBody: object,
  status = 200,
) {
  await context.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    }),
  );
}
