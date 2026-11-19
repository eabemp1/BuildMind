/**
 * Synthetic fixtures modelled on the PLAYFORGE / Bengaluru report. The page text below is written for the test, NOT
 * fetched from the real sites, so this proves the checks, not what the live pages say today.
 */
import { describe, expect, it } from "vitest";
import { refineLeads, directLeads, type Source } from "@/lib/leads/rank";
import type { Lead } from "@/lib/leads/validate";

const lead = (o: Partial<Lead> & { name: string; url: string }): Lead => ({
  kind: "public_community", where: "Bengaluru", why_fit: "Runs sessions for new runners.", evidence: "", how_to_reach: "search them on Instagram",
  first_message: "Hi, we are building a small running quest app and would like to hear how you welcome new runners.", ...o,
});

const sources: Source[] = [
  { url: "https://oduba.example/coaching", title: "ODUBA", text: "ODUBA offers beginner coaching every Sunday morning for people who have never run before. Write to hello@oduba.example to join a session." },
  { url: "https://guide.example/clubs", title: "Bengaluru run clubs", text: "BEL Bullets Run Club meets near the BEL factory gate and welcomes first-time runners every weekend. Other clubs are listed below." },
  { url: "https://bhaago.example/habit-run", title: "Bhaago India", text: "Bhaago India organises Habit Run, a beginner 5K in Bengaluru for people starting out. Contact: team@bhaago.example" },
  { url: "https://stride.example", title: "Stride", text: "Stride running club has weekly check-ins, milestones and a leaderboard for its members." },
  { url: "https://endorfin.example/runs", title: "Endorfin run directory", text: "Endorfin lists running clubs and events in Bengaluru. Browse the directory of clubs by area." },
];

const raw: Lead[] = [
  lead({ name: "ODUBA", url: "https://oduba.example/coaching", evidence: "ODUBA offers beginner coaching every Sunday morning for people who have never run before.", fit_proof: "ODUBA offers beginner coaching every Sunday morning for people who have never run before.", claimed_contact: { kind: "email", value: "hello@oduba.example" }, distinct_reason: "Their beginners have no quest to keep them coming back.", hook: "beginner coaching", first_message: "Hi ODUBA team, would your beginner coaching group try one free PLAYFORGE quest with a few first-time runners?" }),
  lead({ name: "Bel Road Run Club", url: "https://guide.example/clubs", evidence: "BEL Bullets Run Club meets near the BEL factory gate and welcomes first-time runners every weekend.", fit_proof: "BEL Bullets Run Club meets near the BEL factory gate and welcomes first-time runners every weekend." }),
  lead({ name: "BEL Bullets Run Club", url: "https://guide.example/clubs", evidence: "BEL Bullets Run Club meets near the BEL factory gate and welcomes first-time runners every weekend.", fit_proof: "BEL Bullets Run Club meets near the BEL factory gate and welcomes first-time runners every weekend.", hook: "first-time runners", first_message: "Hello BEL Bullets Run Club, would your first-time runners try one free PLAYFORGE quest?" }),
  lead({ name: "Bhaago India", url: "https://bhaago.example/habit-run", evidence: "Bhaago India organises Habit Run, a beginner 5K in Bengaluru for people starting out.", fit_proof: "Bhaago India organises Habit Run, a beginner 5K in Bengaluru for people starting out.", claimed_contact: { kind: "email", value: "made.up@bhaago.example" }, hook: "Habit Run", distinct_reason: "A quest could keep Habit Run first-timers running between events.", first_message: "Hi Bhaago team, would the Habit Run crew try one free PLAYFORGE quest with a few first-time runners?" }),
  lead({ name: "Stride", url: "https://stride.example", evidence: "Stride running club has weekly check-ins, milestones and a leaderboard for its members.", fit_proof: "Stride running club has weekly check-ins, milestones and a leaderboard for its members.", already_has: "check-ins, milestones, leaderboard", first_message: "Hi Stride, our app tracks your progress with check-ins and milestones. Want to try it?" }),
  lead({ name: "Endorfin", kind: "listing", url: "https://endorfin.example/runs", evidence: "Endorfin lists running clubs and events in Bengaluru. Browse the directory of clubs by area.", fit_proof: "Endorfin lists running clubs and events in Bengaluru." }),
];

describe("refineLeads (synthetic fixtures)", () => {
  const { leads, stats } = refineLeads(raw, sources);
  const by = (n: string) => leads.find((l) => l.name === n);

  it("drops a name the cited page does not contain", () => {
    expect(by("Bel Road Run Club")).toBeUndefined();
    expect(by("BEL Bullets Run Club")).toBeDefined();
    expect(stats.droppedName).toBe(1);
  });
  it("shows a contact only when the page prints it", () => {
    expect(by("ODUBA")?.contact).toEqual({ kind: "email", value: "hello@oduba.example" });
    expect(by("ODUBA")?.how_to_reach).toContain("hello@oduba.example");
    // the invented address is replaced by the one that is really on the page
    expect(by("Bhaago India")?.contact?.value).toBe("team@bhaago.example");
  });
  it("says so when there is no verified contact, and never sends the founder to Instagram", () => {
    const b = by("BEL Bullets Run Club")!;
    expect(b.contact?.kind).toBe("none");
    expect(b.tier).toBe("no_contact");
    for (const l of leads) expect(l.how_to_reach.toLowerCase()).not.toContain("instagram");
    expect(b.how_to_reach).toMatch(/No verified contact/);
  });
  it("puts directories under referral sources and out of the direct count", () => {
    expect(by("Endorfin")?.tier).toBe("referral");
    expect(directLeads(leads).map((l) => l.name)).not.toContain("Endorfin");
  });
  it("ranks a lead with proof and a published email above one with no contact, and above a generic pitch", () => {
    const order = leads.map((l) => l.name);
    expect(order[0]).toBe("ODUBA");
    expect(order.indexOf("Bhaago India")).toBeLessThan(order.indexOf("BEL Bullets Run Club"));
    expect(order.indexOf("BEL Bullets Run Club")).toBeLessThan(order.indexOf("Stride"));
    expect(order.indexOf("Stride")).toBeLessThan(order.indexOf("Endorfin"));
    expect(by("Stride")?.distinct_reason).toBeFalsy();
  });
  it("keeps the program the lead runs", () => {
    expect(by("Bhaago India")?.hook).toBe("Habit Run");
  });
  it("drops a quote that is not on the page", () => {
    const r = refineLeads([lead({ name: "ODUBA", url: "https://oduba.example/coaching", evidence: "ODUBA is the largest marathon academy in all of southern India with paid trainers.", fit_proof: "x" })], sources);
    expect(r.leads).toHaveLength(0);
    expect(r.stats.droppedEvidence).toBe(1);
  });
  it("does not accept fit proof the page does not hold", () => {
    const r = refineLeads([lead({ name: "ODUBA", url: "https://oduba.example/coaching", evidence: "ODUBA offers beginner coaching every Sunday morning for people who have never run before.", fit_proof: "ODUBA trains elderly swimmers in the evening at the lake." })], sources);
    expect(r.leads[0].tier).toBe("referral");
  });
});
