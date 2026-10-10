import { describe, expect, it, vi } from "vitest";
import { isShownTaskRow, isTodayRecommendation } from "@/lib/recommendationRows";
import { cleanAvoidanceEntry, sanitizeAvoidanceZones, sanitizeTopics } from "@/lib/avoidanceSanitize";

// Rows modelled on the real production export (Sept 30 - Oct 10 2026).
const row = (session_id: string, action_shown: string, extra: Record<string, unknown> = {}) => ({
  session_id,
  action_shown,
  critic_persona: null,
  ...extra,
});

describe("isTodayRecommendation / isShownTaskRow", () => {
  it("keeps the AI task shown on Today", () => {
    const r = row("today_action:proj:1791590502783", "Implement the email reminder toggle on the onboarding screen");
    expect(isTodayRecommendation(r)).toBe(true);
    expect(isShownTaskRow(r)).toBe(true);
  });

  it("keeps the task_complete fallback row", () => {
    const r = row("task_complete:user:1791588050788", "Spend the next two hours drafting a simple pricing tier outline");
    expect(isShownTaskRow(r)).toBe(true);
  });

  it("drops briefings, weekly reports, Break My Startup and recovery rows", () => {
    for (const sid of [
      "morning_briefing:user:2026-10-09",
      "weekly_report:user:2026-10-02",
      "bms_1791215984737_17j5mj",
      "recovery_mode:user:1",
      "ai_coach:proj:1",
    ]) {
      expect(isTodayRecommendation(row(sid, "Spend the next two hours drafting a pricing tier sheet"))).toBe(false);
    }
  });

  it("treats the archetype template row as Today-flow but not as a shown task", () => {
    const r = row("today_action_stream:proj:1", "Advance retain users while growing a repeatable channel: complete 1 task", {
      prediction_source: "founder_intelligence",
    });
    expect(isTodayRecommendation(r)).toBe(true);
    expect(isShownTaskRow(r)).toBe(false);
  });

  it("keeps legacy rows that have no session_id", () => {
    expect(isTodayRecommendation({ action_shown: "Message 3 founders on LinkedIn about onboarding" })).toBe(true);
  });
});

describe("avoidance sanitising", () => {
  const polluted =
    "Tried: I didn't try anything toda, I was engaged in a different work | Learned: Let us try again tomorrow";

  it("rejects a quoted reflection note", () => {
    expect(cleanAvoidanceEntry(polluted)).toBeNull();
  });

  it("keeps short behavioural categories", () => {
    expect(cleanAvoidanceEntry("cold outreach")).toBe("cold outreach");
    expect(cleanAvoidanceEntry("user_interview")).toBe("user_interview");
  });

  it("recategorises a long task-like sentence instead of storing it verbatim", () => {
    const out = cleanAvoidanceEntry("Send a personalized LinkedIn direct message to a founder you met in the BuildMind Slack asking for feedback");
    expect(out === null || out.length <= 60).toBe(true);
  });

  it("filters and de-duplicates a list", () => {
    expect(sanitizeAvoidanceZones(["outreach", "Outreach", polluted, 42, ""])).toEqual(["outreach"]);
  });

  it("never throws on non-arrays", () => {
    expect(sanitizeAvoidanceZones(null)).toEqual([]);
    expect(sanitizeAvoidanceZones(undefined)).toEqual([]);
    expect(sanitizeTopics("nope")).toEqual([]);
  });

  it("topics drop quote-shaped entries but are not reclassified", () => {
    expect(sanitizeTopics(["payment integration", polluted])).toEqual(["payment integration"]);
  });
});

describe("markIgnoredAfter24h leaves archetype prediction rows alone", () => {
  it("excludes founder_intelligence rows from the sweep", async () => {
    vi.resetModules();
    const calls: Array<[string, unknown[]]> = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["update", "eq", "or", "lt", "neq", "is"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, args]);
        return builder;
      };
    }
    builder.from = () => builder;
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => builder }));
    vi.doMock("@/lib/server/logger", () => ({ logError: () => {} }));
    const { markIgnoredAfter24h } = await import("@/lib/learning");
    await markIgnoredAfter24h("user-1");
    const orCall = calls.find(([m]) => m === "or");
    expect(orCall?.[1][0]).toContain("prediction_source.neq.founder_intelligence");
    expect(orCall?.[1][0]).toContain("prediction_source.is.null");
  });
});
