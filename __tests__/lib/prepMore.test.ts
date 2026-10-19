import { describe, it, expect } from "vitest";
import { prepKindFor } from "@/lib/prep/kinds";
import { inferredBlock } from "@/lib/prep/context";
import { guardNotes, isBehaviour } from "@/lib/prep/notes";
import { groundedPrices } from "@/lib/prep/engine";
import { variantProblems, contentPrompt } from "@/lib/distribution/engine";

describe("routing for the new kinds", () => {
  it("detects pricing, launch, prospects and build work", () => {
    expect(prepKindFor("Decide what to charge for the Pro plan", null)).toBe("pricing_test");
    expect(prepKindFor("Test pricing with 3 founders", "pricing")).toBe("pricing_test");
    expect(prepKindFor("Launch on Show HN", null)).toBe("launch_plan");
    expect(prepKindFor("Prepare the Product Hunt launch", "publish")).toBe("launch_plan");
    expect(prepKindFor("Find 10 people who struggle with task planning", null)).toBe("prospects");
    expect(prepKindFor("Build the export button", null)).toBe("build_plan");
  });
  it("keeps earlier routes intact", () => {
    expect(prepKindFor("Rewrite the landing page headline", "build")).toBe("landing");
    expect(prepKindFor("Follow up with the launch partner by email", "follow_up")).toBe("outreach");
    expect(prepKindFor("Send an investor update with MRR", null)).toBe("investor_update");
  });
});

describe("inferred context", () => {
  const now = new Date("2026-10-19T12:00:00Z").getTime();
  it("summarises the founder's own record and nothing else", () => {
    const block = inferredBlock(
      [{ kind: "outreach", task_text: "DM 5 founders about task planning", status: "sent", outcome: "replied", created_at: "2026-10-17T10:00:00Z" }],
      [{ today_action: "Write the pricing page", outcome: "completed", created_at: "2026-10-18T09:00:00Z" }],
      now,
    );
    expect(block).toContain("Outreach drafts 2 days ago");
    expect(block).toContain("got a reply");
    expect(block).toContain("Write the pricing page");
    expect(block).toContain("Do not restate it as new facts");
  });
  it("is empty with no record, and notices unused drafts", () => {
    expect(inferredBlock([], [], now)).toBe("");
    const unused = Array.from({ length: 3 }, () => ({ kind: "post", task_text: "x", status: "prepared", outcome: null, created_at: "2026-10-18T10:00:00Z" }));
    expect(inferredBlock(unused, [], now)).toContain("never used");
  });
  it("is passed into content prompts", () => {
    const p = contentPrompt({ kind: "build_plan", task: "Build export", platform: "other", project: { name: "X", description: "", problem: "", targetUsers: "", stage: "" }, lessons: [], inferred: "WHAT BUILDMIND KNOWS marker" });
    expect(p).toContain("WHAT BUILDMIND KNOWS marker");
    expect(p).toContain("Smallest version");
  });
});

describe("launch titles", () => {
  it("rejects hype and long titles", () => {
    expect(variantProblems("launch_plan", "Show HN: A daily action planner for solo founders")).toEqual([]);
    expect(variantProblems("launch_plan", "The ultimate revolutionary planner!")).toContain("hype");
    expect(variantProblems("launch_plan", "x".repeat(120))).toContain("title too long");
  });
});

describe("interview notes", () => {
  const notes = "Last month I paid for three different planners and quit all of them. I would probably use something simpler if it existed. We tried a spreadsheet for two weeks.";
  it("keeps only quotes that are in the notes, and counts behaviour in code", () => {
    const r = guardNotes({
      themes: [
        { theme: "Tried and abandoned tools", quote: "Last month I paid for three different planners and quit all of them." },
        { theme: "Wants simplicity", quote: "I would probably use something simpler if it existed." },
        { theme: "Invented", quote: "I love this idea and would pay 50 dollars today" },
        { theme: "Spreadsheet", quote: "We tried a spreadsheet for two weeks." },
      ],
      surprise: "They paid for three tools.", nextQuestion: "What did you do the last time a planner failed you?",
    }, notes);
    expect(r.themes).toHaveLength(3);
    expect(r.behaviourCount).toBe(2);
    expect(r.opinionCount).toBe(1);
  });
  it("classifies would-statements as not behaviour", () => {
    expect(isBehaviour("I would pay for that")).toBe(false);
    expect(isBehaviour("Yesterday I switched to a spreadsheet")).toBe(true);
  });
});

describe("pricing grounding", () => {
  const hits = [{ title: "Acme pricing", url: "https://acme.com/pricing", snippet: "Acme Pro costs $29 per month for teams." }];
  it("shows a price only if the cited source contains it", () => {
    const ok = groundedPrices({ others: [{ name: "Acme", price: "$29 per month", source: 1 }, { name: "Acme", price: "$99 per month", source: 1 }, { name: "Ghost", price: "$29", source: 1 }, { name: "Acme", price: "$29", source: 3 }] }, hits);
    expect(ok).toEqual([{ name: "Acme", price: "$29 per month", source: 1 }]);
  });
});
