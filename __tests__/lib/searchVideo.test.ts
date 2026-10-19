import { describe, it, expect } from "vitest";
import { summariseSearch, searchSections, searchPromptBlock, searchFacts } from "@/lib/integrations/searchConsole";
import { parseVideoUrl, oembedUrl } from "@/lib/prep/video";
import { inferredBlock } from "@/lib/prep/context";

const range = { start: "2026-09-20", end: "2026-10-17" };
const row = (query: string, clicks: number, impressions: number, position: number) => ({ query, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });

describe("search console summary", () => {
  const s = summariseSearch([
    row("founder execution", 5, 120, 3.2),
    row("startup cognitive load", 0, 80, 11.4),
    row("founder drift", 0, 45, 7.8),
    row("tiny query", 0, 4, 12),
    row("buildmind", 9, 30, 1.1),
    row("daily action plan founders", 0, 60, 8.2),
  ], "sc-domain:buildmind.live", range, new Date("2026-10-19T00:00:00Z"));
  it("totals clicks and impressions", () => { expect(s.clicks).toBe(14); expect(s.impressions).toBe(339); });
  it("finds near misses by demand, ignoring tiny and top-ranked ones", () => {
    expect(s.nearMisses.map((r) => r.query)).toEqual(["startup cognitive load", "daily action plan founders", "founder drift"]);
    expect(s.nearMisses[0].position).toBe(11.4);
  });
  it("finds seen-but-never-clicked queries on page one", () => {
    expect(s.unclicked.map((r) => r.query)).toEqual(["daily action plan founders", "founder drift"]);
  });
  it("builds deterministic sections and a prompt block from the real numbers only", () => {
    const sec = searchSections(s);
    expect(sec[0].heading).toContain("almost ranking");
    expect(sec[0].bullets[0]).toBe('"startup cognitive load": position 11.4, 80 impressions, 0 clicks');
    expect(searchPromptBlock(s)).toContain("Use only these numbers");
    expect(searchFacts(s)[0].value).toBe("14");
  });
  it("is quiet when there is no data", () => {
    const e = summariseSearch([], "x", range);
    expect(searchSections(e)).toEqual([]);
    expect(searchPromptBlock(e)).toBe("");
  });
});

describe("video links", () => {
  it("accepts Loom and YouTube share links and normalises them", () => {
    expect(parseVideoUrl("https://www.loom.com/share/0123456789abcdef0123456789abcdef")).toEqual({ provider: "loom", url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef" });
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.provider).toBe("youtube");
  });
  it("rejects anything else, including http, lookalike hosts and other paths", () => {
    expect(parseVideoUrl("http://loom.com/share/0123456789abcdef0123456789abcdef")).toBeNull();
    expect(parseVideoUrl("https://loom.com.evil.com/share/0123456789abcdef0123456789abcdef")).toBeNull();
    expect(parseVideoUrl("https://www.loom.com/admin")).toBeNull();
    expect(parseVideoUrl("https://vimeo.com/123")).toBeNull();
    expect(parseVideoUrl("not a url")).toBeNull();
  });
  it("only ever builds oEmbed urls on the provider's own host", () => {
    const v = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")!;
    expect(oembedUrl(v).startsWith("https://www.youtube.com/oembed?url=")).toBe(true);
  });
});

describe("inferred context knows about a recorded demo", () => {
  it("adds one line when a demo exists", () => {
    expect(inferredBlock([], [], Date.now(), "BuildMind demo")).toContain('recorded a demo video ("BuildMind demo")');
  });
});
