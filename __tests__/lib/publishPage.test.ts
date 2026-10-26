import { describe, it, expect } from "vitest";
import { pageFromDraft } from "@/lib/publishPage";
import { inferSources, inferSource, SOURCES } from "@/lib/linkNudge";

describe("pageFromDraft", () => {
  it("takes a labelled headline and the following lines as the pitch", () => {
    const f = pageFromDraft("Headline: Know exactly what to do next\n\nBuildMind gives solo founders one task a day.\nJoin the early list.");
    expect(f).toEqual({ headline: "Know exactly what to do next", pitch: "BuildMind gives solo founders one task a day. Join the early list." });
  });
  it("strips markdown and quotes", () => {
    expect(pageFromDraft("## **Stop guessing. Start executing.**")?.headline).toBe("Stop guessing. Start executing.");
    expect(pageFromDraft('"One task a day for solo founders"')?.headline).toBe("One task a day for solo founders");
  });
  it("respects the 120 and 300 character limits of the page", () => {
    const f = pageFromDraft(`${"word ".repeat(60)}\n${"more ".repeat(100)}`)!;
    expect(f.headline.length).toBeLessThanOrEqual(120);
    expect(f.pitch.length).toBeLessThanOrEqual(300);
  });
  it("returns null when nothing can be a headline", () => {
    expect(pageFromDraft("")).toBeNull();
    expect(pageFromDraft("ok\n--\n")).toBeNull();
  });
});

describe("channels named in a task", () => {
  it("finds both TikTok and X in one task", () => {
    const t = "Draft landing page copy for my post on TikTok and on X";
    expect(inferSources(t)).toEqual(expect.arrayContaining(["tiktok", "x"]));
  });
  it("keeps the single-channel behaviour", () => {
    expect(inferSource("post this on LinkedIn")).toBe("linkedin");
    expect(inferSource("nothing here")).toBeNull();
  });
  it("includes the new channels in the allowed list", () => {
    for (const s of ["tiktok", "instagram", "youtube"]) expect(SOURCES).toContain(s);
  });
});
