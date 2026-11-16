/**
 * Regression cases for the rule-based guards (no model calls). Each row is a real failure seen in testing.
 * When a new failure is found, add a row here before fixing it.
 */
import { describe, it, expect } from "vitest";
import { assumesContact, lacksContacts } from "@/lib/todayFallbacks";
import { echoesTestScenario } from "@/lib/testMode";
import { evidenceRung, dedupeFindings, priceUnverified } from "@/lib/evidence";
import { cleanCompetitorUrl } from "@/lib/marketWatch/sources";
import { taskMinutes, statedMinutes } from "@/lib/today/minutes";
import { spendsAgainstBudget } from "@/lib/constraints";

const rows = <T,>(name: string, fn: (x: T) => unknown, cases: Array<[T, unknown]>) =>
  describe(name, () => { cases.forEach(([input, want], i) => it(`${i + 1}: ${JSON.stringify(input).slice(0, 70)}`, () => expect(fn(input)).toEqual(want))); });

rows("assumesContact", assumesContact, [
  ["Call one bike shop you know", true], ["Message a friend who rides", true], ["Ask your family about it", true],
  ["Text your existing contacts", true], ["Call someone you already know in the trade", true],
  ["Find five shops on Google Maps and call them", false], ["Post one question in a public forum", false],
  ["Write the three questions you will ask", false], ["Visit a shop and watch the queue for 20 minutes", false],
]);
rows("lacksContacts", (b: string[]) => lacksContacts(b) !== null, [
  [["I don't know any shop owners"], true], [["I have no contacts in this industry"], true],
  [["Too busy this week"], false], [[], false], [["Not sure about pricing"], false],
]);
rows("echoesTestScenario", echoesTestScenario, [
  ["Address severe founder avoidance", true], ["Run the QA scenario again", true], ["This is a test of the app", true],
  ["Testing the system with fake data", true], ["Simulated founder behaviour", true],
  ["Interview three shop owners", false], ["Write the landing page headline", false], ["Review your pricing notes", false],
]);
rows("evidenceRung", evidenceRung, [
  ["Shops use spreadsheets", "adjacent_clue"], ["I hate the waiting, no way to book", "direct_pain"],
  ["I would pay for that", "stated_willingness"], ["He paid for the pilot", "paid_pilot"],
  ["They renewed for a second month", "repeat_payment"], ["They might pay if it were cheaper", "adjacent_clue"],
  ["Nothing relevant", "adjacent_clue"], ["She said she would switch tomorrow", "stated_willingness"],
]);
rows("priceUnverified", priceUnverified, [
  [{ evidence: "Costs $39/month", sources: [] }, true], [{ evidence: "Costs $39/month", sources: ["https://a.com"] }, false],
  [{ evidence: "Costs GHS 200 per month" }, true], [{ evidence: "Many shops complain" }, false],
]);
rows("cleanCompetitorUrl accepts only company sites", (u: string) => cleanCompetitorUrl(u).ok, [
  ["https://acme.com", true], ["acme.io", true], ["https://twitter.com/acme", false], ["https://news.ycombinator.com/item?id=1", false],
  ["https://medium.com/@x/post", false], ["not a url", false],
]);
rows("statedMinutes", statedMinutes, [
  ["Do this in 15 minutes", 15], ["Spend 45 min on calls", 45], ["Write the email", null],
]);
describe("taskMinutes", () => {
  it("stated minutes win over the cap", () => expect(taskMinutes("Call shops for 30 minutes", 20, 15)).toBe(30));
  it("cap trims only the default", () => expect(taskMinutes("Call shops", 40, 15)).toBeLessThanOrEqual(15));
});
describe("spendsAgainstBudget", () => {
  const zero = { minutesPerDay: 30, monthlyBudget: 0 } as never;
  it("flags spending with zero budget", () => expect(spendsAgainstBudget("Run $50 of Facebook ads", zero)).toBe(true));
  it("allows free work", () => expect(spendsAgainstBudget("Post in a public forum", zero)).toBe(false));
  it("no limits means no flag", () => expect(spendsAgainstBudget("Run $50 of ads", null)).toBe(false));
});
describe("dedupeFindings", () => {
  it("keeps distinct findings", () => expect(dedupeFindings([{ title: "Long queues hurt shops", confidence: 0.5 }, { title: "Competitor pricing unclear", confidence: 0.5 }])).toHaveLength(2));
  it("merges repeats", () => expect(dedupeFindings([{ title: "Queues hurt bike shops badly", confidence: 0.5 }, { title: "Queues hurt bike shops badly today", confidence: 0.6 }])).toHaveLength(1));
});

import { withinBudget } from "@/lib/constraints";
describe("withinBudget", () => {
  const plan = ["Interview 8 shop owners in person", "Run a £5 Facebook ad for shop owners", "Post one question in a forum"];
  it("drops spending and keeps the length when the budget is zero", () => {
    const out = withinBudget(plan, true, ["Visit one shop and watch the queue"]);
    expect(out).toHaveLength(3);
    expect(out.join(" ")).not.toMatch(/Facebook ad/);
  });
  it("leaves the list alone with a budget or no limit", () => expect(withinBudget(plan, false)).toEqual(plan));
});
