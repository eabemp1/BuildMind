import { describe, it, expect } from "vitest";
import { planSignupAlerts, isMilestone, buildDigest, maskEmail } from "@/lib/ownerNotify";
import { overallOf, dailyUptime, transitions, overallUptime } from "@/lib/statusChecks";
import { buildBriefing, pctDelta, type BInput } from "@/lib/adminBriefing";

describe("signup alert policy", () => {
  it("alerts instantly for early signups", () => {
    const p = planSignupAlerts(5, [{ email: "ama@x.com", provider: "google" }], 30);
    expect(p.alert).toBe(true);
    expect(p.title).toBe("New signup #5");
    expect(p.body).toContain("am***@x.com");
  });
  it("stays quiet after the limit", () => {
    expect(planSignupAlerts(40, [{ email: "a@b.c" }], 30).alert).toBe(false);
  });
  it("pings on milestones even past the limit", () => {
    const p = planSignupAlerts(100, [{ email: "a@b.c" }], 30);
    expect(p.alert).toBe(true);
    expect(p.title).toContain("100");
    expect(isMilestone(100)).toBe(true);
  });
  it("batches several pending into one message", () => {
    const p = planSignupAlerts(12, Array.from({ length: 7 }, (_, i) => ({ email: `u${i}@x.com` })), 30);
    expect(p.title).toBe("7 new signups (12 total)");
    expect(p.body).toContain("+2 more");
  });
  it("nothing pending means no alert", () => expect(planSignupAlerts(9, []).alert).toBe(false));
  it("masks emails", () => expect(maskEmail(null)).toBe("someone"));
});

describe("digest", () => {
  it("is null on an empty day", () => expect(buildDigest({ signups: 0, upgrades: 0, incidents: 0, totalUsers: 9 })).toBeNull());
  it("summarises", () => expect(buildDigest({ signups: 3, upgrades: 1, incidents: 0, totalUsers: 9 })?.body).toContain("3 new signups · 1 upgrade · no incidents"));
});

describe("status", () => {
  const up = { status: "up" as const };
  it("overall: critical down => down, other down => degraded", () => {
    expect(overallOf({ app: up, database: { status: "down" }, auth: up })).toBe("down");
    expect(overallOf({ app: up, database: up, auth: up, email: { status: "down" } })).toBe("degraded");
    expect(overallOf({ app: up, database: up, auth: up })).toBe("up");
  });
  it("transitions only for down/recovery", () => {
    expect(transitions({ ai: up }, { ai: { status: "down" } })).toEqual([{ component: "ai", from: "up", to: "down" }]);
    expect(transitions({ ai: { status: "down" } }, { ai: up })).toHaveLength(1);
    expect(transitions({ ai: up }, { ai: { status: "degraded" } })).toHaveLength(0);
    expect(transitions(null, { ai: { status: "down" } })).toHaveLength(0);
  });
  it("daily uptime", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    const rows = [
      { checked_at: "2026-10-13T01:00:00Z", overall: "up" as const, components: {} },
      { checked_at: "2026-10-13T02:00:00Z", overall: "down" as const, components: {} },
    ];
    const d = dailyUptime(rows, null, 3, now);
    expect(d).toHaveLength(3);
    expect(d[2].uptime).toBe(50);
    expect(d[0].uptime).toBeNull();
    expect(overallUptime(d)).toBe(50);
  });
});

describe("admin briefing", () => {
  const now = new Date("2026-10-13T12:00:00Z").getTime();
  const iso = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const base: BInput = {
    users: [
      { id: "1", email: "a@x.com", plan: "builder", created_at: iso(1), last_seen: iso(10), projects_count: 1 },
      { id: "2", email: "b@x.com", plan: "free", created_at: iso(2), last_seen: iso(0), projects_count: 0 },
      { id: "3", email: "c@x.com", plan: "free", created_at: iso(9), last_seen: iso(0), projects_count: 0 },
    ],
    mrr: { mrr: 12, active_builders: 1, new_this_month: 1, churned_this_month: 0 },
    webhooks: [{ status: "failed", received_at: iso(1), event: "x", customer_email: null }],
    activity: [{ date: "d", dau: 2, wau: 3 }],
    quality: { qualityAlert: null },
    operator_gate: { briefing_open_rate: 50, task_completion_rate: 60 },
  };
  it("builds kpis and attention", () => {
    const b = buildBriefing(base, now);
    expect(b.kpis[0].value).toBe("2");
    expect(b.kpis[0].delta).toBe(100);
    expect(b.totals.conversion).toBe(33.3);
    expect(b.attention[0].id).toBe("failed-pay");
    expect(b.attention.some((a) => a.id === "churn")).toBe(true);
    expect(b.signups30).toHaveLength(30);
    expect(b.recent[0].id).toBe("1");
  });
  it("pctDelta handles zero", () => { expect(pctDelta(3, 0)).toBeNull(); expect(pctDelta(0, 0)).toBe(0); });
});
