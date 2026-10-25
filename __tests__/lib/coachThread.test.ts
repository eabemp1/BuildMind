import { describe, it, expect } from "vitest";
import { cleanThread, buildThreadBlock, refersBack, THREAD_BUDGET_CHARS, type ThreadMessage } from "@/lib/coachThread";

const U = (content: string): ThreadMessage => ({ role: "user", content });
const A = (content: string): ThreadMessage => ({ role: "assistant", content });

describe("cleanThread", () => {
  it("drops empties, failure placeholders and double sends", () => {
    const t = cleanThread([{ role: "user", content: "hi" }, { role: "user", content: "hi" }, { role: "assistant", content: "" }, { role: "assistant", content: "BuildMind couldn't generate a response right now." }, { role: "assistant", content: "Real answer" }]);
    expect(t).toEqual([U("hi"), A("Real answer")]);
  });
  it("treats unknown roles as the founder", () => {
    expect(cleanThread([{ role: "system", content: "x" }])).toEqual([U("x")]);
  });
});

describe("buildThreadBlock", () => {
  it("is empty with no history", () => {
    expect(buildThreadBlock([], "hello")).toBe("");
  });
  it("keeps the founder's original question after the thread grows (the old bug lost it)", () => {
    const h: ThreadMessage[] = [U("How do I get my first 5 beta users without a network?")];
    for (let i = 0; i < 6; i++) { h.push(A(`Answer ${i} ` + "x".repeat(400))); h.push(U(`Follow up ${i}`)); }
    const b = buildThreadBlock(h, "ok and then?");
    expect(b).toContain("ORIGINAL QUESTION");
    expect(b).toContain("first 5 beta users without a network");
  });
  it("keeps both the start and the end of a long coach reply", () => {
    const long = "START " + "m".repeat(900) + " END: want me to draft the message?";
    const b = buildThreadBlock([U("help me"), A(long)], "yes");
    expect(b).toContain("START");
    expect(b).toContain("want me to draft the message?");
  });
  it("points a short reply back at the thread", () => {
    const b = buildThreadBlock([U("help me"), A("Try X.")], "do it");
    expect(b).toContain("Do not start a new topic");
  });
  it("does not add the pointer for a fresh, self-contained question", () => {
    const q = "What should my pricing look like for a tool aimed at solo founders in Ghana who pay with mobile money?";
    expect(buildThreadBlock([U("hi"), A("hello")], q)).not.toContain("Do not start a new topic");
  });
  it("stays inside the budget however long the thread is", () => {
    const h: ThreadMessage[] = [];
    for (let i = 0; i < 40; i++) { h.push(U("q".repeat(900))); h.push(A("a".repeat(900))); }
    expect(buildThreadBlock(h, "go on").length).toBeLessThanOrEqual(THREAD_BUDGET_CHARS + 400);
  });
});

describe("refersBack", () => {
  it("detects follow-ups", () => {
    for (const m of ["yes", "why?", "do it", "can you expand on that", "ok"]) expect(refersBack(m)).toBe(true);
  });
  it("leaves standalone questions alone", () => {
    expect(refersBack("What is the best channel for reaching founders who build in public on a tiny budget?")).toBe(false);
  });
});
