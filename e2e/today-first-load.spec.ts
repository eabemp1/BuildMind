/**
 * e2e/today-first-load.spec.ts
 *
 * Regression tests for the "Intelligence temporarily unavailable on first
 * load" bug. A single transient failure while the first task is generated must
 * not flash the failure card; only a failure that survives every retry may.
 */

import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

const FAILURE_HEADING = /intelligence temporarily unavailable/i;
const TASK_TEXT = "Send your working link to one warm contact before end of day.";

const okBody = {
  success: true,
  data: {
    action: TASK_TEXT,
    message: "Hey, I have been building a tool for founders. Would you try it for 10 minutes?",
    why: "The version they see today teaches you more than three more days of polishing.",
    time: "30 minutes",
  },
};

test.describe("today — first load resilience", () => {
  test("a transient first failure retries and shows the task, never the failure card", async ({ page, context }) => {
    // Streaming path unavailable, so the JSON fallback is exercised.
    await context.route("**/api/ai/today-action/stream", (route) => route.abort());

    let calls = 0;
    await context.route("**/api/ai/today-action", (route) => {
      calls += 1;
      if (calls === 1) {
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: "cold start" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(okBody) });
    });

    await signIn(page);

    await expect(page.getByText(TASK_TEXT).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: FAILURE_HEADING })).toHaveCount(0);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("when every attempt fails the card appears, and Retry recovers", async ({ page, context }) => {
    await context.route("**/api/ai/today-action/stream", (route) => route.abort());

    let healthy = false;
    await context.route("**/api/ai/today-action", (route) =>
      healthy
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(okBody) })
        : route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false }) }),
    );

    await signIn(page);

    await expect(page.getByRole("heading", { name: FAILURE_HEADING })).toBeVisible({ timeout: 20_000 });

    healthy = true;
    await page.getByRole("button", { name: /retry|try again/i }).first().click();
    await expect(page.getByText(TASK_TEXT).first()).toBeVisible({ timeout: 15_000 });
  });
});
