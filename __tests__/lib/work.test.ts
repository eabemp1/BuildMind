import { describe, it, expect } from "vitest";
import { WORK_SPECS, EXISTING, catalog, searchCatalog, SPEC_BY_ID, VISUALS, TOOLS } from "@/lib/work/registry";
import { cleanInputs, sanitizeText, buildPrompt, normalizeWork, readRefined, figuresToCheck, JARGON, REFINE_PRESETS, refinePrompt } from "@/lib/work/shape";
import { cleanVoice, founderFirstName } from "@/lib/work/voice";
import { prepKindFor } from "@/lib/prep/kinds";

const project = { name: "Acme", description: "d", problem: "p", targetUsers: "u", stage: "Validation" };
const noneUnsupported = () => [] as string[];

describe("registry", () => {
  it("every spec is complete and ids are unique", () => {
    const ids = new Set<string>();
    for (const s of WORK_SPECS) {
      expect(ids.has(s.id)).toBe(false); ids.add(s.id);
      expect(s.fields.length).toBeGreaterThan(0);
      expect(s.instruction.length).toBeGreaterThan(20);
      expect(s.you.length).toBeGreaterThan(5);
      expect(new Set(s.fields.map((f) => f.key)).size).toBe(s.fields.length);
    }
  });
  it("every existing entry's task opens its own panel", () => {
    for (const e of EXISTING) expect(prepKindFor(e.task, null)).toBe(e.kind);
  });
  it("catalogue has spec and existing entries, and search finds by label", () => {
    const c = catalog();
    expect(c.length).toBe(WORK_SPECS.length + EXISTING.length + VISUALS.length + TOOLS.length);
    expect(searchCatalog(c, WORK_SPECS[0].label.slice(0, 5)).length).toBeGreaterThan(0);
    expect(searchCatalog(c, "").length).toBe(c.length);
  });
});

describe("cleanInputs", () => {
  const spec = WORK_SPECS[0];
  it("rejects missing required fields", () => {
    expect(cleanInputs(spec, {}).error).toBeTruthy();
  });
  it("accepts filled fields and trims", () => {
    const raw: Record<string, string> = {};
    for (const f of spec.fields) raw[f.key] = "  hello  ";
    const r = cleanInputs(spec, raw);
    expect(r.error).toBeUndefined();
    expect(Object.values(r.values).every((v) => v === "hello")).toBe(true);
  });
  it("ignores non-object input", () => { expect(cleanInputs(spec, null).error).toBeTruthy(); });
});

describe("sanitizeText", () => {
  it("caps length and strips control characters", () => {
    expect(sanitizeText("a\u0000b", 10)).toBe("ab");
    expect(sanitizeText("x".repeat(50), 10).length).toBeLessThanOrEqual(10);
    expect(sanitizeText(42, 10)).toBe("");
  });
});

describe("buildPrompt", () => {
  it("includes the brief values and the no-invention rule", () => {
    const spec = WORK_SPECS[0];
    const values: Record<string, string> = {};
    for (const f of spec.fields) values[f.key] = `VAL_${f.key}`;
    const p = buildPrompt(spec, values, project);
    for (const f of spec.fields) expect(p).toContain(`VAL_${f.key}`);
    expect(p).toContain("[add:");
  });
});

describe("normalizeWork", () => {
  const v = WORK_SPECS.find((s) => s.shape === "variants")!;
  const sec = WORK_SPECS.find((s) => s.shape === "sections")!;
  it("returns null when nothing useful", () => {
    expect(normalizeWork({}, v, "", noneUnsupported)).toBeNull();
    expect(normalizeWork({ variants: [{ text: "" }] }, v, "", noneUnsupported)).toBeNull();
  });
  it("caps variants at four and labels them", () => {
    const r = normalizeWork({ title: "T", variants: Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, text: `text ${i}` })) }, v, "", noneUnsupported)!;
    expect(r.variants.length).toBe(4);
    expect(r.variants[0].id).toBe("v1");
  });
  it("keeps sections with content only", () => {
    const r = normalizeWork({ sections: [{ heading: "A", body: "b" }, { heading: "Empty" }, { body: "no heading" }] }, sec, "", noneUnsupported)!;
    expect(r.sections.map((s) => s.heading)).toEqual(["A"]);
  });
  it("flags an [add:] gap as a need", () => {
    const r = normalizeWork({ variants: [{ label: "A", text: "Hi [add: your price]" }], sections: [{ heading: "H", body: "b" }] }, v, "", noneUnsupported)!;
    expect(r.needs.length).toBeGreaterThan(0);
  });
});

describe("figuresToCheck", () => {
  const unsupported = (t: string, a: string) => (t.match(/\d+/g) ?? []).filter((n) => !a.includes(n));
  it("ignores benign counts and flags real figures", () => {
    expect(figuresToCheck("a 10 slide deck", "", unsupported)).toEqual([]);
    expect(figuresToCheck("we grew 4821 users", "", unsupported)).toEqual(["4821"]);
    expect(figuresToCheck("we grew 4821 users", "4821", unsupported)).toEqual([]);
  });
});

describe("readRefined", () => {
  it("reads a text field and rejects junk", () => {
    expect(readRefined({ text: "  better  " })).toBe("better");
    expect(readRefined({})).toBeNull();
    expect(readRefined(null)).toBeNull();
  });
});

describe("SPEC_BY_ID", () => { it("maps every spec", () => { for (const s of WORK_SPECS) expect(SPEC_BY_ID[s.id]).toBe(s); }); });

describe("quality bar", () => {
  const spec = SPEC_BY_ID["whatsapp_message"] ?? WORK_SPECS[0];
  it("every prompt carries the quality bar", () => {
    for (const s of WORK_SPECS) expect(buildPrompt(s, {}, project)).toContain("QUALITY BAR");
  });
  it("no kind's own instruction uses the jargon the bar forbids", () => {
    for (const s of WORK_SPECS) expect(s.instruction.match(JARGON) ?? []).toEqual([]);
  });
  it("flags marketing words for the founder instead of changing them", () => {
    const raw = { title: "t", summary: "s", variants: [{ label: "a", text: "We leverage a seamless ecosystem." }] };
    const r = normalizeWork(raw, spec, "", noneUnsupported)!;
    expect(r.variants[0].text).toContain("leverage");
    expect(r.needs.some((n) => /plain/i.test(n.label) && /leverage/.test(n.why) && /seamless/.test(n.why))).toBe(true);
  });
  it("says nothing when the words are plain", () => {
    const raw = { title: "t", summary: "s", variants: [{ label: "a", text: "Hi Ama, do you have 5 minutes this week?" }] };
    expect(normalizeWork(raw, spec, "", noneUnsupported)!.needs).toEqual([]);
  });
});

describe("refine presets", () => {
  it("expands the WhatsApp preset into a real instruction", () => {
    expect(REFINE_PRESETS).toContain("For WhatsApp");
    expect(refinePrompt("Hello there", "For WhatsApp")).toMatch(/WhatsApp message: 2 to 4 short sentences/);
    expect(refinePrompt("Hello there", "Shorter")).toContain("INSTRUCTION: Shorter");
  });
});

describe("voice sample", () => {
  const sample = "Hi Kofi, thanks for replying so fast. I'd love to hear how you handle this today, no rush at all.";
  it("is cleaned and capped", () => {
    expect(cleanVoice("  a \n\n\n\n b ")).toBe("a \n\n b");
    expect(cleanVoice("x".repeat(5000))).toHaveLength(1200);
    expect(cleanVoice(42)).toBe("");
  });
  it("goes into the prompt as tone only, and not when too short", () => {
    const p = buildPrompt(SPEC_BY_ID["whatsapp_message"] ?? WORK_SPECS[0], {}, project, sample);
    expect(p).toContain("THE FOUNDER'S OWN WRITING");
    expect(p).toContain(sample);
    expect(p).toMatch(/take no facts/);
    expect(buildPrompt(WORK_SPECS[0], {}, project, "Hi")).not.toContain("OWN WRITING");
    expect(buildPrompt(WORK_SPECS[0], {}, project)).not.toContain("OWN WRITING");
  });
});

describe("founder name and product wording", () => {
  it("takes a clean first name only", () => {
    expect(founderFirstName("Emmanuel Apau")).toBe("Emmanuel");
    expect(founderFirstName("  ")).toBe("");
    expect(founderFirstName("A")).toBe("");
    expect(founderFirstName("Ama<script>")).toBe("Amascript");
    expect(founderFirstName(7)).toBe("");
  });
  it("is in the prompt only when known, and the product rule is always there", () => {
    expect(buildPrompt(WORK_SPECS[0], {}, project, "", "Emmanuel")).toContain("THE FOUNDER'S NAME: Emmanuel");
    expect(buildPrompt(WORK_SPECS[0], {}, project)).not.toContain("THE FOUNDER'S NAME");
    expect(buildPrompt(WORK_SPECS[0], {}, project)).toMatch(/who it is for and what they get/);
  });
});
