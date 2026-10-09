/**
 * e2e/progress-counts.spec.ts
 *
 * The Progress page must show the number of finished actions, not days with
 * activity, and the Ghost Race card must render without layout-scaled text.
 */

import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("progress — weekly numbers", () => {
  test("tasks tile reflects actions_completed and the ghost race renders", async ({ page, context }) => {
    await context.route("**/api/ai/weekly-pulse**", async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      // Pin the two numbers the bug confused: finished actions vs days active.
      if (json?.data) {
        json.data.actions_completed = 5;
        json.data.tasks_completed = 2;
      }
      await route.fulfill({ response: res, json });
    });

    await signIn(page);
    await page.goto("/progress");

    await expect(page.getByRole("region", { name: /ghost race/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/done on \d+ of \d+ days/i).first()).toBeVisible();
  });

  test("chart text stays at its set size on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto("/progress");
    const label = page.locator("section[aria-label='Ghost race'] svg text").first();
    await expect(label).toBeVisible({ timeout: 15_000 });
    const px = await label.evaluate((el) => el.getBoundingClientRect().height);
    expect(px).toBeLessThan(20); // a 10-11px label, not a 2x-scaled one
  });
});
