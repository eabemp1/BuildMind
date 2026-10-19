import { describe, it, expect } from "vitest";
import { prepKindFor, taskHash, normalizePrepared, hasContent, inferPlatform, familyOf } from "@/lib/prep/kinds";
import { editRatio, styleLessons, outcomeLessons, performance, learnedLessons, learningPromptBlock, type LearnRow } from "@/lib/prep/learning";

describe("prepKindFor", () => {
  it("detects specific content work from the task text", () => {
    expect(prepKindFor("Rewrite the landing page headline", "build")).toBe("landing");
    expect(prepKindFor("Find 3 keywords and plan one SEO blog post", "publish")).toBe("seo");
    expect(prepKindFor("Send investors a short traction update", "outreach")).toBe("investor_update");
    expect(prepKindFor("Record a 30s demo video of the Today page", "publish")).toBe("video_script");
    expect(prepKindFor("Research 3 competitors and note their pricing", "analyze")).toBe("competitor_brief");
  });
  it("uses the mission kind when the text is generic", () => {
    expect(prepKindFor("DM 5 founders on LinkedIn about drift", "outreach")).toBe("outreach");
    expect(prepKindFor("Follow up with the two people who replied", "follow_up")).toBe("outreach");
    expect(prepKindFor("Talk to 3 founders about how they pick tasks", "interview")).toBe("validation_kit");
    expect(prepKindFor("Share one lesson from this week", "publish")).toBe("post");
  });
  it("gives build and unblock days a build plan, and rest days nothing", () => {
    expect(prepKindFor("Fix the login redirect bug", "build")).toBe("build_plan");
    expect(prepKindFor("Get the export working", "unblock")).toBe("build_plan");
    expect(prepKindFor("Tidy your task list", "reset")).toBeNull();
    expect(prepKindFor("hi", null)).toBeNull();
  });
  it("falls back to keywords when there is no mission kind", () => {
    expect(prepKindFor("Email 5 prospects about the pilot", null)).toBe("outreach");
    expect(prepKindFor("Write a LinkedIn post about what I learned", null)).toBe("post");
  });
  it("hashes the same task the same way, and different tasks differently", () => {
    expect(taskHash("DM 5 founders", "outreach")).toBe(taskHash("  dm 5   founders ", "outreach"));
    expect(taskHash("DM 5 founders", "outreach")).not.toBe(taskHash("DM 6 founders", "outreach"));
  });
  it("reads the platform and groups outreach with posts", () => {
    expect(inferPlatform("DM 5 people on LinkedIn")).toBe("linkedin");
    expect(inferPlatform("Reply in r/startups")).toBe("reddit");
    expect(familyOf("outreach")).toBe(familyOf("post"));
    expect(familyOf("landing")).not.toBe(familyOf("post"));
  });
});

describe("normalizePrepared", () => {
  it("keeps good parts and drops empty or unsafe ones", () => {
    const p = normalizePrepared({
      title: "T", summary: "S",
      variants: [{ label: "A", text: "Hello there" }, { label: "B", text: "   " }],
      sections: [{ heading: "H", bullets: ["a", "", "b"], links: [{ title: "ok", url: "https://x.com" }, { title: "bad", url: "javascript:alert(1)" }] }, { heading: "", body: "no heading" }],
    }, "outreach");
    expect(p.variants).toHaveLength(1);
    expect(p.sections).toHaveLength(1);
    expect(p.sections[0].bullets).toEqual(["a", "b"]);
    expect(p.sections[0].links).toEqual([{ title: "ok", url: "https://x.com" }]);
    expect(hasContent(p)).toBe(true);
  });
  it("reports empty output as having no content", () => {
    expect(hasContent(normalizePrepared({}, "post"))).toBe(false);
    expect(hasContent(normalizePrepared(null, "post"))).toBe(false);
  });
});

const row = (original: string, final: string | null, outcome: string | null = null, status = "sent", kind: LearnRow["kind"] = "outreach"): LearnRow => ({ kind, original, final, outcome, status });
const long = "Hi there, I noticed you are building something in the founder tools space and wanted to reach out because I think there could be a real fit between what you do and what I am making right now. Would you be open to a quick chat this week?";
const short = "Hi, quick question about how you pick your daily task?";

describe("learning from edits", () => {
  it("measures how much of a draft was rewritten", () => {
    expect(editRatio("one two three", "one two three")).toBe(0);
    expect(editRatio("one two three four", "one two")).toBeGreaterThan(0.4);
    expect(editRatio("", "x")).toBe(1);
  });
  it("says nothing until there are enough edited drafts", () => {
    expect(styleLessons([row(long, short), row(long, short)], "outreach").lessons).toEqual([]);
  });
  it("notices a consistent habit of cutting drafts, and states the sample", () => {
    const r = styleLessons([row(long, short), row(long, short), row(long, short)], "outreach");
    expect(r.samples).toBe(3);
    expect(r.lessons.some((l) => /shorter/i.test(l))).toBe(true);
  });
  it("learns from outreach and posts together, but not from landing copy", () => {
    const rows = [row(long, short), row(long, short), row(long, short, null, "sent", "post")];
    expect(styleLessons(rows, "outreach").lessons.length).toBeGreaterThan(0);
    expect(styleLessons(rows, "landing").lessons).toEqual([]);
  });
});

describe("learning from results", () => {
  it("needs enough results before it claims anything", () => {
    expect(outcomeLessons([row(short, null, "replied"), row(long, null, "no_reply")], "outreach").lessons).toEqual([]);
  });
  it("reports a clear gap with real counts", () => {
    const rows = [
      ...Array.from({ length: 4 }, () => row(short, null, "replied")),
      ...Array.from({ length: 4 }, () => row(long, null, "no_reply")),
    ];
    const l = outcomeLessons(rows, "outreach").lessons;
    expect(l.length).toBeGreaterThan(0);
    expect(l[0]).toMatch(/4 of 4/);
    expect(l[0]).toMatch(/0 of 4/);
  });
  it("tracks performance and builds the prompt block", () => {
    const rows = [row(short, null, "replied"), row(short, null, null), row(long, null, "no_reply")];
    expect(performance(rows, "outreach")).toEqual({ used: 3, responded: 1, waiting: 1 });
    expect(learningPromptBlock([])).toBe("");
    expect(learningPromptBlock(["Write shorter."])).toContain("- Write shorter.");
    expect(learnedLessons([], "outreach")).toEqual([]);
  });
});
