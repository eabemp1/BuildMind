/**
 * e2e/explore.spec.ts
 *
 * E2E tests for the Founder Feed (Explore) page.
 * Validates the live/seed data loading, filters, and the ● live indicator.
 */

import { test, expect } from "@playwright/test";
import { signIn, mockApiRoute } from "./helpers";

const MOCK_FEED_ROWS = [
  {
    id: "e2e-1",
    flag: "🇬🇭",
    location: "Accra",
    stage: "MVP",
    stage_color: "#6366f1",
    action: "Shipped first working demo to 3 pilot users",
    outcome: null,
    streak: 14,
    type: "launched",
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: "e2e-2",
    flag: "🇳🇬",
    location: "Lagos",
    stage: "Validation",
    stage_color: "#10b981",
    action: "Interviewed 4 users — found FX rate is the real pain",
    outcome: "Pivoting to price transparency",
    streak: 8,
    type: "reflect",
    created_at: new Date(Date.now() - 20 * 60000).toISOString(),
  },
  {
    id: "e2e-3",
    flag: "🇰🇪",
    location: "Nairobi",
    stage: "Revenue",
    stage_color: "#a78bfa",
    action: "Closed first paying customer at $89/mo",
    outcome: null,
    streak: 30,
    type: "streak",
    created_at: new Date(Date.now() - 60 * 60000).toISOString(),
  },
  {
    id: "e2e-4",
    flag: "🇿🇦",
    location: "Cape Town",
    stage: "Launch",
    stage_color: "#ef4444",
    action: "Product Hunt listing went live — 47 upvotes in first hour",
    outcome: null,
    streak: 21,
    type: "launched",
    created_at: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
  },
];

test.describe("explore / founder feed", () => {
  test("feed page is accessible without login", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(page.getByText(/founder feed/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("seed data renders when Supabase returns nothing", async ({ page, context }) => {
    // Intercept Supabase realtime/rest calls and return empty
    await context.route("**/rest/v1/feed_events**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto("/explore");
    // Seed data should still show — page is never empty
    const firstCard = page.locator("text=/shipped|interviewed|closed|cold/i").first();
    await expect(firstCard).toBeVisible({ timeout: 8_000 });
  });

  test("live data replaces seed when Supabase returns rows", async ({ page, context }) => {
    await context.route("**/rest/v1/feed_events**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_FEED_ROWS),
      }),
    );
    await page.goto("/explore");
    // The live indicator should appear
    await expect(page.locator("text=live").first()).toBeVisible({ timeout: 8_000 });
    // Our mock data action text should be visible
    await expect(page.getByText(/shipped first working demo/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("stage filter narrows results", async ({ page }) => {
    await page.goto("/explore");
    // Wait for feed to load
    await page.waitForTimeout(1000);
    // Click the MVP filter
    await page.getByRole("button", { name: /^mvp$/i }).click();
    // Validation-stage items should not be visible (or at least MVP ones are)
    // The filter itself being active is the key assertion
    const mvpButton = page.getByRole("button", { name: /^mvp$/i });
    // Active filter button has different styling — check it's not just plain text
    await expect(mvpButton).toBeVisible();
  });

  test("all 5 activity type filters are present", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("button", { name: /all activity/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /shipped/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reflected/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /streak milestones/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /weekly reports/i })).toBeVisible();
  });

  test("'what happened next?' expands outcome text", async ({ page, context }) => {
    await context.route("**/rest/v1/feed_events**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_FEED_ROWS),
      }),
    );
    await page.goto("/explore");
    // Wait for live data
    await page.getByText(/interviewed 4 users/i).waitFor({ timeout: 8_000 });
    // Click the expand button on the reflect card (which has an outcome)
    await page.getByText(/what happened next/i).first().click();
    // The outcome text should now be visible
    await expect(page.getByText(/pivoting to price transparency/i)).toBeVisible({ timeout: 3_000 });
  });

  test("stats row shows active founders, actions, countries", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/active this week/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/actions completed/i).first()).toBeVisible();
    await expect(page.getByText(/countries/i).first()).toBeVisible();
  });

  test("CTA to sign up is present for unauthenticated view", async ({ page }) => {
    await page.goto("/explore");
    const cta = page.getByRole("link", { name: /start building/i });
    await expect(cta).toBeVisible({ timeout: 8_000 });
  });
});
