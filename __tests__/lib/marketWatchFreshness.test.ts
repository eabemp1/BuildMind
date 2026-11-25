import { describe, it, expect } from "vitest";
import { classifySource, datesInText, toIsoDate } from "@/lib/marketWatch/freshness";
import { publishedAtFrom } from "@/lib/pageReader";
import { diffSnapshots, type MarketSnapshot, type WatchedThread } from "@/lib/marketWatch/diff";
import { buildMarketVisual } from "@/lib/marketWatch/visual";

const now = new Date("2026-11-25T10:00:00Z");
const weekStart = "2026-11-23";
const base = { readable: true, competitor: "Acme", weekStart, now, title: "Acme update", text: "Acme announced something." };

describe("classifySource", () => {
  it("old article (2022) is excluded even though it was checked today", () => {
    const v = classifySource({ ...base, publishedAt: "2022-05-12" });
    expect(v).toMatchObject({ status: "excluded", reason: "older" });
  });
  it("fresh article repeating an old event is excluded", () => {
    const v = classifySource({ ...base, publishedAt: "2026-11-24", title: "Acme raises prices", text: "On 12 May 2022 Acme announced its pricing change, and here is a look back." });
    expect(v).toMatchObject({ status: "excluded", reason: "repeats_old_event" });
  });
  it("verified change published this week counts", () => {
    expect(classifySource({ ...base, publishedAt: "2026-11-24T08:00:00Z" })).toMatchObject({ status: "this_week", publishedAt: "2026-11-24" });
  });
  it("within 90 days but before this week is background", () => {
    expect(classifySource({ ...base, publishedAt: "2026-10-01" }).status).toBe("context");
  });
  it("undated, unreadable, off topic and future-dated never count", () => {
    expect(classifySource({ ...base }).reason).toBe("undated");
    expect(classifySource({ ...base, readable: false, publishedAt: "2026-11-24" }).reason).toBe("unreadable");
    expect(classifySource({ ...base, publishedAt: "2026-11-24", text: "About something else", title: "Other" }).reason).toBe("off_topic");
    expect(classifySource({ ...base, publishedAt: "2027-03-01" }).status).toBe("excluded");
  });
});

describe("dates", () => {
  it("reads dates from markup and text", () => {
    expect(toIsoDate("2026-02-30")).toBeNull();
    expect(datesInText("May 12, 2022 and 3 June 2021 and 2020-01-02")).toEqual(expect.arrayContaining(["2022-05-12", "2021-06-03", "2020-01-02"]));
    expect(publishedAtFrom('<script type="application/ld+json">{"datePublished":"2026-11-24T09:00:00Z"}</script>')).toBe("2026-11-24");
    expect(publishedAtFrom('<meta property="article:published_time" content="2022-05-12T00:00:00Z">')).toBe("2022-05-12");
    expect(publishedAtFrom("<html></html>")).toBeUndefined();
  });
});

describe("only verified changes from this week are counted", () => {
  const t = (url: string, status: WatchedThread["status"]): WatchedThread => ({ url, title: url, about: "Acme", status });
  const prev: MarketSnapshot = { weekStart: "2026-11-16", competitors: [], threads: [] };
  it("counts this_week only", () => {
    const cur: MarketSnapshot = { weekStart, competitors: [], threads: [t("a", "this_week"), t("b", "context"), t("c", "excluded"), t("d", undefined)] };
    const { changes } = diffSnapshots(prev, cur);
    expect(changes.map((c) => c.url)).toEqual(["a"]);
  });
  it("visual separates week, background and left-out", () => {
    const threads = [t("a", "this_week"), t("b", "context"), { ...t("c", "excluded"), reason: "older" as const }];
    const { visual } = buildMarketVisual({ weekStart, baseline: false, changes: [], competitors: [], threads }, now);
    const titles = visual.panels.map((p) => ("title" in p ? p.title : ""));
    expect(titles).toEqual(expect.arrayContaining(["Published this week", "Background, last 90 days", "1 source left out"]));
  });
});
