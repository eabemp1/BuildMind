import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanAccent, cleanImage, cleanDesign, emptyDesign, onAccent, sectionsOf, guardSections, MAX_IMAGE_BYTES } from "@/lib/landing/design";
import { PublishedPage } from "@/components/landing/PublishedPage";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("landing design rules", () => {
  it("accent must be a hex colour", () => {
    expect(cleanAccent("#ABCDEF")).toBe("#abcdef");
    expect(cleanAccent("red; background:url(x)")).toBe("#0e7c66");
  });
  it("images: png/jpeg/webp data URLs under the cap only", () => {
    expect(cleanImage(PNG)).toBe(PNG);
    expect(cleanImage("data:image/svg+xml;base64,PHN2Zz4=")).toBe("");
    expect(cleanImage("https://evil.example/x.png")).toBe("");
    expect(cleanImage(`data:image/png;base64,${"A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)}`)).toBe("");
  });
  it("links, emails and phone numbers are stripped; login-like pages refused", () => {
    const d = cleanDesign({ brand: "Acme https://x.co", whoFor: "mail me a@b.co", benefits: [{ title: "Fast", text: "Call +233 24 123 4567 now" }] })!;
    expect(d.brand).toBe("Acme");
    expect(d.whoFor).not.toContain("@");
    expect(d.benefits[0].text).not.toMatch(/\d{3}/);
    expect(cleanDesign({ finalTitle: "Verify your account with your password" })).toBeNull();
  });
  it("sections appear only when filled; no proof means no proof section", () => {
    expect(sectionsOf(emptyDesign())).toMatchObject({ benefits: false, steps: false, proof: false, hero: "none" });
    const d = cleanDesign({ benefits: [{ title: "A", text: "b" }], screenshot: PNG })!;
    expect(sectionsOf(d).hero).toBe("screenshot");
    expect(sectionsOf({ ...d, screenshot: "" }).hero).toBe("card");
  });
  it("text on the accent stays readable", () => {
    expect(onAccent("#0e7c66")).toBe("#ffffff");
    expect(onAccent("#f2e04a")).toBe("#10231C");
  });
  it("drafted sections drop anything with a number or experience the founder never gave", () => {
    const out = guardSections({
      benefits: [{ title: "Save time", text: "Patients wait elsewhere." }, { title: "Trusted", text: "Used by 500 clinics." }],
      steps: [{ title: "Scan", text: "Patients scan a code." }],
      whoFor: "Small clinics",
    }, "QueuePilot helps small clinics. Patients scan a code and wait elsewhere.");
    expect(out.benefits?.map((b) => b.title)).toEqual(["Save time"]);
    expect(out.steps).toHaveLength(1);
  });
});

describe("published page", () => {
  const html = (over = {}, extra = {}) => renderToStaticMarkup(<PublishedPage headline="Waiting rooms, calmer" pitch="Patients join from their phone." code="abc12345" design={{ ...emptyDesign(), ...over }} {...extra} />);
  it("has a working path to the form: button targets the form's id", () => {
    const h = html();
    expect(h).toContain('href="#join"');
    expect(h).toContain('id="join"');
    expect(h).toContain('name="email"'.replace('name="email"', 'type="email"'));
  });
  it("the stylesheet is not HTML-escaped (escaped quotes silently drop every heading style)", () => {
    expect(html()).not.toContain("&quot;");
    expect(html()).toContain("Iowan Old Style");
  });
  it("shows a real quote only when the founder typed one", () => {
    expect(html()).not.toContain("<blockquote");
    expect(html({ proofQuote: "It saved my morning.", proofWho: "A clinic manager" })).toContain("It saved my morning.");
  });
  it("uses the founder's accent, logo and screenshot", () => {
    const h = html({ accent: "#aa3300", logo: PNG, screenshot: PNG, brand: "QueuePilot" });
    expect(h).toContain("--accent:#aa3300");
    expect(h.match(/<img /g)?.length).toBe(2);
  });
  it("a page with nothing but a headline still has a hero, a button and a form", () => {
    const h = html();
    expect(h).toContain("<h1>Waiting rooms, calmer</h1>");
    expect(h).toContain("lp-solo");
  });
});
