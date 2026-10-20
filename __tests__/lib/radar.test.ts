import { describe, it, expect } from "vitest";
import { classifyOpportunity, classifyRole } from "@/lib/radar/classify";
import { quoteInSource, quoteMatchesDate, plausibleDate, findMeetingUrl } from "@/lib/radar/extract";
import { fitFor } from "@/lib/radar/fit";
import { nextMove, buildIcs } from "@/lib/radar/nextMove";
import { cleanPrep } from "@/lib/radar/prep";
import { unsupportedNumbers } from "@/lib/distribution/engine";
import type { RadarItem } from "@/lib/radar/types";

const NOW = Date.parse("2026-10-20T09:00:00Z");
const item = (o: Partial<RadarItem>): RadarItem => ({ id: "11111111-1111-4111-8111-111111111111", type: "event", kind: "meetup", kind_confirmed: true, title: "T", organizer: null, url: null, location: null, is_virtual: false, meeting_url: null, starts_at: null, ends_at: null, deadline_at: null, eligibility: null, cost: null, role: null, next_follow_up_at: null, last_contacted_at: null, notes: null, status: "new", fit_score: null, fit_reasons: null, prep: null, ...o });

describe("classify: never mixes things up", () => {
  const cases: [string, string, string][] = [
    ["hackathon", "Accra Build Weekend Hackathon", "48 hours. Teams of 4. Prizes."],
    ["grant", "Africa Founders Grant 2027", "Non-dilutive funding for early stage. Apply by 30 Nov."],
    ["accelerator", "Founders Accelerator, Cohort 5", "Applications open for the next cohort."],
    ["webinar", "How to find your first 10 users (webinar)", "Join us live online on Zoom."],
    ["workshop", "Customer Interview Workshop", "Hands-on session, bring a laptop."],
    ["conference", "West Africa Tech Summit", "Two days of keynotes and panels."],
    ["meetup", "Founders Networking Night", "Drinks and demos."],
  ];
  it.each(cases)("%s", (kind, title, text) => { expect(classifyOpportunity({ title, text }).kind).toBe(kind); });
  it("a conference with a prize is still a conference", () => {
    expect(classifyOpportunity({ title: "Lagos Startup Summit", text: "Conference with keynotes, a prize for best stand, and a forum." }).kind).toBe("conference");
  });
  it("a conference with a hackathon track is not a hackathon", () => {
    expect(classifyOpportunity({ title: "Dev Conference 2027", text: "Keynotes, forum, and a hackathon track on day two." }).kind).toBe("conference");
  });
  it("links decide meetings and people", () => {
    expect(classifyOpportunity({ url: "https://calendly.com/sam/30min", title: "Chat with Sam" }).kind).toBe("meeting");
    expect(classifyOpportunity({ url: "https://www.linkedin.com/in/sam-doe/" }).kind).toBe("person");
    expect(classifyOpportunity({ url: "https://zoom.us/j/123", title: "Founder Webinar", text: "webinar" }).kind).toBe("webinar");
  });
  it("asks when it cannot tell", () => {
    const c = classifyOpportunity({ title: "Something happening", text: "Come along." });
    expect(c.confirmed).toBe(false);
  });
  it("roles", () => { expect(classifyRole("General Partner at Acme Ventures")).toBe("investor"); expect(classifyRole("Freelance designer")).toBe("customer"); });
});

describe("extraction guards", () => {
  const src = "Applications close on 30 November 2026. Held in Accra, Ghana.";
  it("quotes must appear in the source", () => {
    expect(quoteInSource("Applications close on 30 November 2026", src)).toBe(true);
    expect(quoteInSource("Applications close on 5 December", src)).toBe(false);
  });
  it("dates must agree with their quote", () => {
    expect(quoteMatchesDate("close on 30 November 2026", "2026-11-30T00:00:00Z")).toBe(true);
    expect(quoteMatchesDate("close on 30 November 2026", "2026-12-30T00:00:00Z")).toBe(false);
    expect(quoteMatchesDate("close on 30 November 2026", "2026-11-03T00:00:00Z")).toBe(false);
  });
  it("rejects implausible dates", () => { expect(plausibleDate("2019-01-01", NOW)).toBeNull(); expect(plausibleDate("2026-11-30", NOW)).not.toBeNull(); });
  it("finds a meeting link", () => { expect(findMeetingUrl("Join: https://meet.google.com/abc-defg-hij.")).toBe("https://meet.google.com/abc-defg-hij"); expect(findMeetingUrl("see https://example.com/page")).toBeNull(); });
});

describe("fit and next move", () => {
  const ctx = { stage: "Growth", projectText: "BuildMind daily execution system for solo founders", now: NOW };
  it("a passed item scores 0", () => { expect(fitFor(item({ starts_at: "2026-10-01T10:00:00Z" }), ctx).score).toBe(0); });
  it("an urgent grant at growth stage beats a distant meetup", () => {
    const grant = fitFor(item({ type: "program", kind: "grant", deadline_at: "2026-10-23T00:00:00Z", title: "Founders grant for solo founders" }), ctx);
    const meetup = fitFor(item({ kind: "meetup", starts_at: "2027-03-01T10:00:00Z", title: "Mixer" }), ctx);
    expect(grant.score).toBeGreaterThan(meetup.score);
    expect(grant.reasons.join(" ")).toMatch(/Due in 3 days/);
  });
  it("eligibility and cost become cautions, not silent penalties", () => {
    const f = fitFor(item({ kind: "conference", starts_at: "2026-11-05T09:00:00Z", eligibility: "Open to US citizens only", cost: "Ticket $200" }), ctx);
    expect(f.cautions.join(" ")).toMatch(/eligibility/i); expect(f.cautions.join(" ")).toMatch(/cost/i);
  });
  it("tasks match the type", () => {
    expect(nextMove(item({ type: "program", kind: "grant", deadline_at: "2026-10-23T00:00:00Z" }), NOW)).toMatch(/Apply by/);
    expect(nextMove(item({ kind: "webinar", starts_at: "2026-10-22T10:00:00Z" }), NOW)).toMatch(/calendar/);
    expect(nextMove(item({ type: "meeting", kind: "meeting", starts_at: "2026-10-22T10:00:00Z" }), NOW)).toMatch(/agenda/);
  });
  it("builds a valid .ics with location or meeting link", () => {
    const ics = buildIcs(item({ title: "Demo, night; Accra", starts_at: "2026-10-22T18:00:00Z", meeting_url: "https://meet.google.com/x" }), NOW) as string;
    expect(ics).toContain("BEGIN:VEVENT"); expect(ics).toContain("DTSTART:20261022T180000Z"); expect(ics).toContain("LOCATION:https://meet.google.com/x"); expect(ics).toContain("Demo\\, night\; Accra");
    expect(buildIcs(item({}), NOW)).toBeNull();
  });
});

describe("prep guard", () => {
  it("drops invented numbers and placeholders", () => {
    const ok = { why_it_fits: "Fits.", questions: ["What do you do today about this?"], intro: "Hi, I build a planning tool for solo founders.", ask: "A 15 minute call" };
    expect(cleanPrep(ok, "planning tool solo founders 15 minute call", unsupportedNumbers)).not.toBeNull();
    expect(cleanPrep({ ...ok, intro: "We already have 4,000 users." }, "planning tool", unsupportedNumbers)).toBeNull();
    expect(cleanPrep({ ...ok, intro: "Hi [Name], I build tools." }, "x", unsupportedNumbers)).toBeNull();
  });
});
