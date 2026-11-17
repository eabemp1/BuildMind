import { expect, it } from "vitest";
import { buildLedger, findContradictions } from "../../lib/today/facts";
const now = Date.parse("2026-11-17T12:00:00Z");
const ledgerFor = (note: string) => buildLedger([{ created_at: new Date(now).toISOString(), note }], { now });

it.each([
  "I don't have any paying users",
  "I have no paying users",
  "There are zero paying customers",
  "No paying users yet",
  "I have no paid users",
  "I have no paying users but ten free beta users",
])("does not infer no users from only missing payment: %s", (note) => {
  const ledger = ledgerFor(note);
  expect(ledger.facts.some((fact) => fact.kind === "no_users")).toBe(false);
  expect(findContradictions("Interview your beta users about onboarding", ledger)).toEqual([]);
});

it.each([
  "I don't have any users",
  "I have no beta users",
  "There are zero users",
  "No users yet",
  "I have no paying users. I have no users at all.",
])("still protects genuine no-user statements: %s", (note) => {
  const ledger = ledgerFor(note);
  expect(ledger.facts.some((fact) => fact.kind === "no_users")).toBe(true);
  expect(findContradictions("Interview your beta users about onboarding", ledger).some((hit) => hit.fact === "no_users")).toBe(true);
});
