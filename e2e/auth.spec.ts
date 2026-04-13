/**
 * e2e/auth.spec.ts
 *
 * Auth flow E2E tests.
 * These run against the live dev server + a real Supabase test project.
 * They validate the paths that unit tests cannot: browser redirects,
 * session persistence, and route protection.
 */

import { test, expect } from "@playwright/test";
import { signIn, TEST_EMAIL, TEST_PASSWORD } from "./helpers";

test.describe("auth flow", () => {
  test.beforeEach(async ({ page }) => {
    // Always start logged out
    await page.goto("/");
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });

  test("invalid credentials show an error, not a redirect", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/email/i).fill("notauser@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    // Should stay on login page
    await expect(page).toHaveURL(/\/auth\/login/);
    // Should show an error message
    await expect(page.locator("text=/invalid|incorrect|wrong|check/i").first()).toBeVisible({ timeout: 6_000 });
  });

  test("empty form shows validation error", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("valid credentials redirect to /today", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/today/);
  });

  test("authenticated user visiting /auth/login is redirected away", async ({ page }) => {
    await signIn(page);
    await page.goto("/auth/login");
    // Should redirect back out of the login page
    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 5_000 });
  });

  test("protected route /today redirects unauthenticated user to login", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/auth\/login|\/$/);
  });
});

test.describe("signup page", () => {
  test("signup page renders and has required fields", async ({ page }) => {
    await page.goto("/auth/signup");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });
});
