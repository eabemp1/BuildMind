/**
 * __tests__/lib/reEngagement.test.ts
 *
 * Unit tests for the re-engagement eligibility logic used by
 * /api/cron/re-engage.
 *
 * We test the pure decision logic (who gets an email, when to skip)
 * without running the actual cron or calling Supabase/Resend.
 */

import { describe, it, expect } from "vitest";

// ── Pure eligibility helpers (extracted from cron logic) ─────────────────────
// These mirror the decision branches in the cron route so we can unit-test
// them without spinning up Next.js or mocking the entire Supabase client.

function isInReEngagementWindow(daysInactive: number): "7day" | "14day" | null {
  if (daysInactive >= 6 && daysInactive <= 8) return "7day";
  if (daysInactive >= 13 && daysInactive <= 15) return "14day";
  return null;
}

function shouldSkipDueToRecentSend(
  lastSentAt: string | null,
  nowMs: number,
): boolean {
  if (!lastSentAt) return false;
  const lastSent = new Date(lastSentAt).getTime();
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  return lastSent > nowMs - fiveDaysMs;
}

// ── isInReEngagementWindow ────────────────────────────────────────────────────

describe("isInReEngagementWindow", () => {
  it("returns '7day' for exactly 7 days inactive", () => {
    expect(isInReEngagementWindow(7)).toBe("7day");
  });

  it("returns '7day' for 6 days (window lower bound)", () => {
    expect(isInReEngagementWindow(6)).toBe("7day");
  });

  it("returns '7day' for 8 days (window upper bound)", () => {
    expect(isInReEngagementWindow(8)).toBe("7day");
  });

  it("returns null for 5 days (below 7-day window)", () => {
    expect(isInReEngagementWindow(5)).toBeNull();
  });

  it("returns null for 9 days (between windows)", () => {
    expect(isInReEngagementWindow(9)).toBeNull();
  });

  it("returns null for 12 days (just below 14-day window)", () => {
    expect(isInReEngagementWindow(12)).toBeNull();
  });

  it("returns '14day' for exactly 14 days inactive", () => {
    expect(isInReEngagementWindow(14)).toBe("14day");
  });

  it("returns '14day' for 13 days (window lower bound)", () => {
    expect(isInReEngagementWindow(13)).toBe("14day");
  });

  it("returns '14day' for 15 days (window upper bound)", () => {
    expect(isInReEngagementWindow(15)).toBe("14day");
  });

  it("returns null for 16 days (beyond 14-day window)", () => {
    expect(isInReEngagementWindow(16)).toBeNull();
  });

  it("returns null for 0 days (active user)", () => {
    expect(isInReEngagementWindow(0)).toBeNull();
  });
});

// ── shouldSkipDueToRecentSend ─────────────────────────────────────────────────

describe("shouldSkipDueToRecentSend", () => {
  const now = Date.now();

  it("returns false when lastSentAt is null (never sent)", () => {
    expect(shouldSkipDueToRecentSend(null, now)).toBe(false);
  });

  it("returns true when last email was sent 2 days ago (within 5-day window)", () => {
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldSkipDueToRecentSend(twoDaysAgo, now)).toBe(true);
  });

  it("returns true when last email was sent exactly 4 days ago", () => {
    const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldSkipDueToRecentSend(fourDaysAgo, now)).toBe(true);
  });

  it("returns false when last email was sent 6 days ago (outside 5-day window)", () => {
    const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldSkipDueToRecentSend(sixDaysAgo, now)).toBe(false);
  });

  it("returns false when last email was sent 30 days ago", () => {
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldSkipDueToRecentSend(thirtyDaysAgo, now)).toBe(false);
  });
});
