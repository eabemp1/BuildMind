/**
 * e2e/today.spec.ts
 *
 * E2E tests for the Today page (the core execution loop).
 *
 * These test the full browser experience that unit tests cannot reach:
 *   - Page loads and shows a meaningful action
 *   - Outcome chips are clickable and update the score display
 *   - The reflect flow completes and shows the score delta
 *   - The streak counter is visible
 *   - The causality strip updates after reflection
 */

import { test, expect } from "@playwright/test";
import { signIn, mockApiRoute } from "./helpers";

test.describe("today page — core loop", () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock the AI today-action endpoint so tests don't depend on Groq
    await mockApiRoute(context, "**/api/ai/today-action**", {
      success: true,
      data: {
        action: "Send your working link to one warm contact before end of day.",
        message: "Hey — I've been building [product]. Would you try it for 10 minutes?",
        why: "The version they see today teaches you more than 3 more days of polishing.",
        time: "30 minutes",
      },
    });

    // Mock the reflect-action endpoint
    await mockApiRoute(context, "**/api/ai/reflect-action**", {
      success: true,
      data: {
        causality: "Because you completed it → tomorrow goes deeper.",
        nextAction: "Follow up with the same contact — ask for one referral.",
        identityLine: "You're someone who executes.",
      },
    });

    await signIn(page);
  });

  test("today page loads with an action card", async ({ page }) => {
    await expect(page).toHaveURL(/\/today/);
    // The action text should be somewhere on the page
    const action = page.getByText(/send|talk|call|post|record|ship/i).first();
    await expect(action).toBeVisible({ timeout: 10_000 });
  });

  test("streak counter is visible", async ({ page }) => {
    // Streak pill or streak number should be present
    const streak = page.locator("text=streak").or(page.locator("text=-day")).first();
    await expect(streak).toBeVisible({ timeout: 10_000 });
  });

  test("execution score is displayed", async ({ page }) => {
    // Score display — number between 0 and 100
    const score = page.locator("text=/score|\\d+\\s*\\/\\s*100/i").first();
    await expect(score).toBeVisible({ timeout: 10_000 });
  });

  test("outcome chips are rendered", async ({ page }) => {
    // All four outcome options should be visible
    await expect(page.getByText(/completed it/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/partly done|partial/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/got blocked/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/learned something/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("selecting 'completed' chip enables submit button", async ({ page }) => {
    // Click the completed chip
    await page.getByText(/completed it/i).first().click();

    // A submit or "done" button should now be visible/enabled
    const submitBtn = page.getByRole("button", { name: /submit|done|reflect/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeEnabled();
  });

  test("submitting a reflection shows score delta", async ({ page }) => {
    // Select outcome
    await page.getByText(/completed it/i).first().click();

    // Submit
    const submitBtn = page.getByRole("button", { name: /submit|done|reflect/i }).first();
    await submitBtn.click();

    // Score delta (before → after arrow) should appear
    const delta = page.locator("text=/→|↑|↓/").first();
    await expect(delta).toBeVisible({ timeout: 8_000 });
  });

  test("submitting a reflection shows causality text", async ({ page }) => {
    await page.getByText(/completed it/i).first().click();
    const submitBtn = page.getByRole("button", { name: /submit|done|reflect/i }).first();
    await submitBtn.click();

    // Causality strip should update
    await expect(page.getByText(/because you/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("today page title is BuildMind or similar", async ({ page }) => {
    await expect(page).toHaveTitle(/buildmind|founder|today/i);
  });
});

test.describe("today page — navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("sidebar links to reflect page", async ({ page }) => {
    const reflectLink = page.getByRole("link", { name: /reflect/i }).first();
    await expect(reflectLink).toBeVisible({ timeout: 8_000 });
  });

  test("sidebar links to founder feed", async ({ page }) => {
    const feedLink = page.getByRole("link", { name: /feed|explore/i }).first();
    await expect(feedLink).toBeVisible({ timeout: 8_000 });
  });
});
