import { describe, it, expect } from "vitest";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parseCount, readScreenshotText, suggestSignal, screenshotProofText, fingerprintBytes, detectPlatform } from "@/lib/screenshotMetrics";
import { checkProof } from "@/lib/signalProof";

// Text exactly as the OCR engine returned it for __tests__/fixtures/x-post-screenshot.png
const X_OCR = `Kofi Mensah @kofibuilds

Just launched BuildMind to help solo founders ship daily.
Would love honest feedback from other makers.

12:41 PM - Oct 22, 2026 - 1.2K Views

14 Replies 6 Reposts 48 Likes 9 Bookmarks
`;

describe("parseCount", () => {
  it("reads the ways apps write counts", () => {
    expect(parseCount("1.2K")).toBe(1200);
    expect(parseCount("3,456")).toBe(3456);
    expect(parseCount("2M")).toBe(2_000_000);
    expect(parseCount("48")).toBe(48);
    expect(parseCount("abc")).toBeNull();
    expect(parseCount("12:41")).toBeNull();
  });
});

describe("readScreenshotText", () => {
  it("reads an X post", () => {
    const r = readScreenshotText(X_OCR);
    expect(r.platform).toBe("x");
    expect(r.readable).toBe(true);
    expect(Object.fromEntries(r.metrics.map((m) => [m.name, m.value]))).toEqual({ views: 1200, replies: 14, shares: 6, likes: 48, bookmarks: 9 });
    expect(r.excerpt).toContain("Just launched BuildMind");
    expect(r.excerpt).not.toMatch(/Replies/);
  });
  it("reads LinkedIn, Reddit and Hacker News styles", () => {
    expect(Object.fromEntries(readScreenshotText("LinkedIn  Ama Boateng shared a post about building in public today\n48 reactions · 6 comments · 2 reposts").metrics.map((m) => [m.name, m.value]))).toMatchObject({ likes: 48, comments: 6, shares: 2 });
    const reddit = readScreenshotText("r/startups Posted by u/ama Feedback on my landing page please\n87 upvotes 23 comments Share");
    expect(reddit.platform).toBe("reddit");
    expect(reddit.metrics.find((m) => m.name === "comments")?.value).toBe(23);
    expect(detectPlatform("Show HN: BuildMind 52 points by kofi 3 hours ago 14 comments")).toBe("hn");
  });
  it("counts the same statistic once, and ignores times and dates", () => {
    const r = readScreenshotText("A long enough sentence about my product launch today\n12 Likes ... 12 likes\n10:30 AM Oct 22");
    expect(r.metrics).toEqual([{ name: "likes", value: 12 }]);
  });
  it("says when nothing readable was found", () => {
    expect(readScreenshotText("").readable).toBe(false);
    expect(readScreenshotText("x1 ||| 2").readable).toBe(false);
  });
});

describe("suggestSignal", () => {
  it("prefers people who responded over people who only looked", () => {
    expect(suggestSignal([{ name: "views", value: 5000 }, { name: "comments", value: 4 }, { name: "replies", value: 2 }])).toEqual({ kind: "reply", count: 6 });
    expect(suggestSignal([{ name: "likes", value: 40 }])).toEqual({ kind: "other", count: 40 });
    expect(suggestSignal([{ name: "views", value: 900 }])).toEqual({ kind: null, count: 0 });
  });
});

describe("screenshot proof is accepted once", () => {
  const reading = readScreenshotText(X_OCR);
  it("passes the proof check and the same picture gets the same identity", async () => {
    const fp = await fingerprintBytes(new TextEncoder().encode("picture-1").buffer as ArrayBuffer);
    const a = checkProof(screenshotProofText(fp, reading));
    const b = checkProof(screenshotProofText(fp, { ...reading, excerpt: "different words read the second time" }));
    expect(a.ok).toBe(true);
    expect(a.kind).toBe("image");
    expect(a.hash).toBe(b.hash);
    const other = await fingerprintBytes(new TextEncoder().encode("picture-2").buffer as ArrayBuffer);
    expect(checkProof(screenshotProofText(other, reading)).hash).not.toBe(a.hash);
  });
  it("refuses a screenshot with almost no text", () => {
    expect(checkProof("Screenshot 0123456789abcdef: x").ok).toBe(false);
  });
});

describe("real text recognition on a real image", () => {
  it("reads the numbers out of the fixture screenshot", async () => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, { langPath: path.resolve("node_modules/@tesseract.js-data/eng/4.0.0_best_int"), gzip: true, cachePath: "/tmp/tess-cache" });
    try {
      const { data } = await worker.recognize(readFileSync(path.resolve("__tests__/fixtures/x-post-screenshot.png")));
      const r = readScreenshotText(data.text);
      expect(r.platform).toBe("x");
      expect(Object.fromEntries(r.metrics.map((m) => [m.name, m.value]))).toMatchObject({ views: 1200, replies: 14, likes: 48 });
    } finally { await worker.terminate(); }
  }, 90_000);
});
