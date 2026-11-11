import { describe, it, expect } from "vitest";
import { evidenceBlock } from "@/lib/work/context";
import { buildPrompt, draftProblems, normalizeWork, revisePrompt } from "@/lib/work/shape";
import { SPEC_BY_ID, WORK_SPECS } from "@/lib/work/registry";

const project = { name: "CutBook", description: "Bookings for barbers", problem: "no-shows", targetUsers: "barbers in Accra", stage: "Idea" };
const NOW = Date.parse("2026-11-10T12:00:00Z");

describe("evidenceBlock", () => {
  it("quotes the founder's own notes and skips thin ones", () => {
    const b = evidenceBlock([
      { outcome: "completed", what_happened: "Kwame said he loses about 3 bookings a week", what_learned: "They rely on WhatsApp for everything", created_at: "2026-11-09T10:00:00Z" },
      { outcome: "partial", what_happened: "ok", created_at: "2026-11-08T10:00:00Z" },
    ], NOW);
    expect(b).toContain("Kwame said he loses about 3 bookings a week");
    expect(b).toContain("yesterday");
    expect(b.split("\n").filter((l) => l.startsWith("- ")).length).toBe(1);
  });
  it("is empty when there is nothing useful", () => expect(evidenceBlock([], NOW)).toBe(""));
});

describe("buildPrompt", () => {
  it("includes the craft playbook and the founder's record when present", () => {
    const spec = SPEC_BY_ID.whatsapp_message;
    const p = buildPrompt(spec, { who: "a barber", goal: "a chat" }, project, "", "", "THE FOUNDER'S OWN NOTES\n- yesterday: x");
    expect(p).toContain("HOW THE BEST ONES ARE WRITTEN");
    expect(p).toContain("voice note");
    expect(p).toContain("THE FOUNDER'S OWN NOTES");
  });
  it("is unchanged in shape when no record exists", () => {
    const p = buildPrompt(SPEC_BY_ID.survey, { audience: "a", goal: "b" }, project);
    expect(p).not.toContain("THE FOUNDER'S OWN NOTES");
  });
  it("the most-used kinds all have a playbook", () => {
    for (const id of ["whatsapp_message", "email_sequence", "partner_pitch", "announcement", "onboarding_email", "job_post", "one_pager", "faq", "objection_sheet", "prd", "pricing_page"]) expect(SPEC_BY_ID[id].craft, id).toBeTruthy();
    expect(WORK_SPECS.length).toBeGreaterThan(0);
  });
});

describe("draftProblems", () => {
  const spec = SPEC_BY_ID.whatsapp_message;
  const make = (texts: string[]) => normalizeWork({ title: "t", summary: "s", variants: texts.map((t, i) => ({ label: `v${i}`, text: t })) }, spec, "", () => [])!;
  it("flags near-identical versions", () => {
    const r = make(["Hi Kwame, how do you handle clients who miss their booking slot at your shop?", "Hi Kwame, how do you handle clients who miss their booking slot at your barbershop?"]);
    expect(draftProblems(r, spec).join(" ")).toMatch(/nearly the same/);
  });
  it("flags an opening about the founder", () => {
    const r = make(["I'm building CutBook, an app for barbers. Can I ask you something?", "Kwame, how many bookings did you lose last week to no-shows?"]);
    expect(draftProblems(r, spec).join(" ")).toMatch(/opens with the founder/);
  });
  it("passes a good set", () => {
    const r = make(["Kwame, how many bookings did you lose last week to no-shows? A voice note is fine.", "Hi, a friend said you run the busiest shop in Osu. What happens when someone just doesn't show up?"]);
    expect(draftProblems(r, spec)).toEqual([]);
  });
  it("the revise prompt lists the problems and forbids new facts", () => {
    const p = revisePrompt("{}", spec, ["it uses marketing words"]);
    expect(p).toContain("it uses marketing words");
    expect(p).toMatch(/Do not add facts/);
  });
});

describe("who is who", () => {
  const spec = SPEC_BY_ID.whatsapp_message;
  const make = (texts: string[]) => normalizeWork({ title: "t", summary: "s", variants: texts.map((t, i) => ({ label: `v${i}`, text: t })) }, spec, "", () => [])!;
  it("flags 'I noticed you just signed up two users' when the brief never says it about the reader", () => {
    const r = make(["Hey, I noticed you just signed up two real users - congrats! What is the hardest part now?", "Kwame, how many bookings did you lose to no-shows last week?"]);
    expect(draftProblems(r, spec, "Who: a founder. Goal: a chat. Context: I just got my first two users").join(" ")).toMatch(/noticed, saw or read/);
  });
  it("allows 'I saw you at the hub' when the brief says so", () => {
    const r = make(["Hi Ama, I saw you at the hub on Friday. How do you handle missed bookings?", "Ama, how many bookings did you lose last week?"]);
    expect(draftProblems(r, spec, "Context: we both were at the hub on Friday, I saw you there").join(" ")).not.toMatch(/noticed, saw or read/);
  });
  it("the prompt states that founder facts are the sender's", () => {
    expect(buildPrompt(spec, { who: "a", goal: "b" }, project)).toMatch(/The founder is the SENDER/);
  });
});

import { readFileSync } from "node:fs";
import { SENDER_RULE } from "@/lib/prep/senderRule";
describe("the sender rule reaches every prompt that writes to a reader", () => {
  it("states the rule plainly", () => { expect(SENDER_RULE).toMatch(/SENDER/); expect(SENDER_RULE).toMatch(/never as facts about the reader/); });
  for (const f of ["lib/distribution/engine.ts", "lib/prep/engine.ts", "app/api/ai/prep/reply/route.ts", "app/api/radar/prep/route.ts"]) {
    it(f, () => expect(readFileSync(f, "utf8")).toContain("${SENDER_RULE}"));
  }
});
