import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/ai-providers", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai-providers")>()),
  // The model tries to invent a win from the product description.
  callModelJSON: vi.fn(async () => ({ win: "You integrated the 3D orbit viewer into the demo page.", risk: "No one has seen it yet.", action: "Email five university space clubs." })),
}));

import { winFrom, NO_WIN } from "@/lib/briefingWin";
import { generateMorningBriefing } from "@/lib/reflexion";
import MorningBriefingModal from "@/components/MorningBriefingModal";

const ctx = { startupSummary: "A 3D orbit viewer for space clubs", stage: "Idea", momentumScore: 0 };

describe("briefing WIN", () => {
  it("only a task the founder saved as completed is a win", () => {
    expect(winFrom("Email 5 clubs", true)).toBe("You finished: Email 5 clubs");
    expect(winFrom("Email 5 clubs", false)).toBe("");
    expect(winFrom("Email 5 clubs", undefined)).toBe("");
    expect(winFrom(undefined, true)).toBe("");
  });
  it("a new account never gets a model-written win, whatever the model says", async () => {
    const b = await generateMorningBriefing(ctx);
    expect(b.win).toBe("");
    expect(b.action).toContain("space clubs"); // other lines are unaffected
  });
  it("a real saved outcome becomes the win", async () => {
    const b = await generateMorningBriefing({ ...ctx, yesterdayTask: "Message one student", completedYesterday: true });
    expect(b.win).toBe("You finished: Message one student");
  });
  const briefing = { win: "", risk: "r", action: "Email five university space clubs.", gaps: [] } as never;
  it("with no win the modal says so", () => {
    expect(renderToStaticMarkup(<MorningBriefingModal briefing={briefing} isPaywalled={false} onDismiss={() => {}} />)).toContain(NO_WIN);
  });
  it("NOW shows Today's saved action and Start opens that same task", () => {
    const now = { text: "Send your working link to one person who has the problem.", time: "20 minutes", href: "/work?task=Send%20your%20working%20link" };
    const html = renderToStaticMarkup(<MorningBriefingModal briefing={briefing} isPaywalled={false} onDismiss={() => {}} now={now} />);
    expect(html).toContain("Send your working link to one person who has the problem. (20 minutes)");
    expect(html).not.toContain("university space clubs");
    expect(html).toContain('href="/work?task=Send%20your%20working%20link"');
  });
});
