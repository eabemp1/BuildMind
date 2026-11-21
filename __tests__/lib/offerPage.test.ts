import { describe, expect, it } from "vitest";
import { cleanContact, cleanEdit, contactHref, looksPhishy, normalizeDraft, publishProblems, quoteInNotes, slugFor, stripContactBits, MARKER, type OfferContent } from "@/lib/offers/page";

const quote = "I spend two hours every Sunday copying numbers between sheets";
const allowed = `PlayForge helps new runners stay consistent. ${quote}`;
const raw = { headline: "Stop copying numbers between sheets", subhead: "A calmer Sunday", offer: "We will set up one simple sheet for your first month. See https://x.com for more.", who_for: "New runners", faqs: [{ q: "How long does it take?", a: "About a day." }], cta_kind: "pilot" };

describe("offer page rules", () => {
  it("shows a quote only when it is word for word in the notes", () => {
    expect(quoteInNotes(quote, `Notes: "${quote}" and more`)).toBe(true);
    expect(quoteInNotes("they hate spreadsheets", `Notes: ${quote}`)).toBe(false);
  });
  it("removes links, emails and phone numbers from the text", () => {
    const c = normalizeDraft(raw, quote, allowed)!;
    expect(c.offer).not.toMatch(/@|https?:|x\.com/);
    expect(stripContactBits("call +233 24 123 4567 now")).not.toMatch(/233/);
  });
  it("marks invented prices, guarantees and experience instead of publishing them", () => {
    const c = normalizeDraft({ ...raw, offer: "Free trial for everyone, plus a money-back guarantee. I own a gym." }, quote, allowed)!;
    expect(c.offer).toContain(MARKER);
    expect(publishProblems({ ...c, contact: "me@x.com" }).join(" ")).toMatch(/\[add:/);
  });
  it("never lets the model set the contact", () => {
    expect(normalizeDraft({ ...raw, contact: "evil@x.com" }, quote, allowed)!.contact).toBe("");
  });
  it("rejects login, payment and verification wording", () => {
    expect(looksPhishy("Enter your password to continue")).toBe(true);
    expect(normalizeDraft({ ...raw, offer: "Verify your account with your card number." }, quote, allowed)).toBeNull();
    const c = normalizeDraft(raw, quote, allowed)!;
    expect(publishProblems({ ...c, contact: "me@x.com", offer: "Please log in with your password" })).toContain("Remove wording about logins, passwords, card numbers or verification.");
  });
  it("only accepts an email or an https link as the contact", () => {
    expect(cleanContact("Me@X.com")).toBe("me@x.com");
    expect(cleanContact("https://cal.example.com/me")).toBe("https://cal.example.com/me");
    expect(cleanContact("http://cal.example.com")).toBe("");
    expect(cleanContact("javascript:alert(1)")).toBe("");
    expect(contactHref("me@x.com")).toBe("mailto:me@x.com");
  });
  it("blocks publishing until a contact is set and no marker is left", () => {
    const c = normalizeDraft(raw, quote, allowed)!;
    expect(publishProblems(c)).toContain("Add where people should reach you: an email address or an https link.");
    expect(publishProblems({ ...c, contact: "me@x.com" })).toEqual([]);
  });
  it("founder edits keep the customer's quote unchanged and still strip links", () => {
    const c: OfferContent = { ...normalizeDraft(raw, quote, allowed)!, contact: "" };
    const e = cleanEdit({ headline: "New headline https://spam.example", quote: "changed", contact: "me@x.com" }, c);
    expect(e.headline).toBe("New headline");
    expect(e.quote).toBe(quote);
    expect(e.contact).toBe("me@x.com");
  });
  it("makes a safe slug", () => {
    expect(slugFor("Stop copying <script> numbers!", () => "abc123")).toBe("stop-copying-script-numbers-abc123");
    expect(slugFor("???", () => "abc123")).toBe("offer-abc123");
  });
});
