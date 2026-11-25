import { describe, it, expect } from "vitest";
import { buildFunnel, type FunnelInput } from "@/lib/funnel/report";
import { touchFrom } from "@/lib/funnel/source";
import { excludeConfigFromEnv, isQaAccount } from "@/lib/funnel/exclude";

const now = new Date("2026-11-25T12:00:00Z");
const d = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const base: FunnelInput = { now, days: 30, visits: [], accounts: [], signupTouches: [], activity: [], isExcluded: () => false };

describe("touchFrom", () => {
  it("reads tagged, search, referral and direct", () => {
    expect(touchFrom("?utm_source=TikTok&utm_medium=video", "", "buildmind.live")).toMatchObject({ source: "tiktok", medium: "video" });
    expect(touchFrom("", "https://www.google.com/", "buildmind.live")).toMatchObject({ source: "google", medium: "search" });
    expect(touchFrom("", "https://news.ycombinator.com/item?id=1", "buildmind.live")).toMatchObject({ source: "news.ycombinator.com", medium: "referral" });
    expect(touchFrom("", "https://buildmind.live/pricing", "buildmind.live").source).toBe("direct");
    expect(touchFrom("", "", "buildmind.live").source).toBe("direct");
  });
});

describe("buildFunnel", () => {
  const acc = (id: string, ago: number, email = `${id}@x.com`) => ({ id, email, createdAt: d(ago) });
  it("counts distinct visitors, not page loads", () => {
    const r = buildFunnel({ ...base, visits: [{ vid: "a", source: "tiktok", at: d(1) }, { vid: "a", source: "tiktok", at: d(1) }, { vid: "b", source: "direct", at: d(1) }, { vid: null, source: "direct", at: d(1) }] });
    expect(r.total.visitors).toBe(2);
  });
  it("walks visit -> signup -> first task -> return, by source", () => {
    const r = buildFunnel({
      ...base,
      visits: [{ vid: "a", source: "tiktok", at: d(12) }, { vid: "b", source: "tiktok", at: d(12) }, { vid: "c", source: "linkedin", at: d(12) }],
      accounts: [acc("u1", 10), acc("u2", 10), acc("u3", 2)],
      signupTouches: [{ userId: "u1", source: "tiktok", at: d(10) }, { userId: "u2", source: "tiktok", at: d(10) }, { userId: "u3", source: "linkedin", at: d(2) }],
      activity: [
        { userId: "u1", type: "task_completed", at: d(10) }, { userId: "u1", type: "app_open", at: d(7) },   // back on day 3
        { userId: "u2", type: "app_open", at: d(10) },                                                      // same day only
        { userId: "u3", type: "task_completed", at: d(1) },
      ],
    });
    const tt = r.bySource.find((x) => x.source === "tiktok")!;
    expect(tt).toMatchObject({ visitors: 2, signups: 2, firstAction: 1, returnEligible: 2, returned: 1 });
    const li = r.bySource.find((x) => x.source === "linkedin")!;
    expect(li).toMatchObject({ visitors: 1, signups: 1, firstAction: 1, returnEligible: 0, returned: 0 }); // too new to judge a return
  });
  it("leaves QA accounts out of every number", () => {
    const r = buildFunnel({ ...base, accounts: [acc("u1", 5), acc("qa", 5, "me+qa@x.com")], activity: [{ userId: "qa", type: "task_completed", at: d(4) }], isExcluded: (a) => a.id === "qa" });
    expect(r.total.signups).toBe(1);
    expect(r.total.firstAction).toBe(0);
    expect(r.excludedAccounts).toBe(1);
  });
  it("credits a source only when the signup event is near the account's creation", () => {
    const r = buildFunnel({ ...base, accounts: [acc("old", 20)], signupTouches: [{ userId: "old", source: "tiktok", at: d(2) }] });
    expect(r.bySource[0].source).toBe("unknown");
  });
  it("names the weakest stage and admits small numbers", () => {
    const visits = Array.from({ length: 200 }, (_, i) => ({ vid: `v${i}`, source: "direct", at: d(3) }));
    const accounts = Array.from({ length: 30 }, (_, i) => acc(`u${i}`, 3));
    const r = buildFunnel({ ...base, visits, accounts, activity: accounts.slice(0, 20).map((a) => ({ userId: a.id, type: "task_completed", at: d(3) })) });
    expect(r.diagnosis).toMatch(/signup problem/);
    expect(buildFunnel({ ...base, visits: [{ vid: "a", source: "x", at: d(1) }] }).diagnosis).toMatch(/Only 1 distinct visitors/);
  });
});

describe("isQaAccount", () => {
  const cfg = excludeConfigFromEnv({ ADMIN_USER_IDS: "ADMIN1", FUNNEL_EXCLUDE_EMAILS: "@qa.buildmind.live, me@x.com" });
  it("excludes admins, listed addresses and +qa tags only", () => {
    expect(isQaAccount({ id: "admin1", email: "a@b.com" }, cfg)).toBe(true);
    expect(isQaAccount({ id: "u", email: "x@qa.buildmind.live" }, cfg)).toBe(true);
    expect(isQaAccount({ id: "u", email: "ME@x.com" }, cfg)).toBe(true);
    expect(isQaAccount({ id: "u", email: "me+qa1@gmail.com" }, cfg)).toBe(true);
    expect(isQaAccount({ id: "u", email: "tester@gmail.com" }, cfg)).toBe(false);
    expect(isQaAccount({ id: "p", email: "a@b.com" }, cfg, new Set(["p"]))).toBe(true);
  });
});
