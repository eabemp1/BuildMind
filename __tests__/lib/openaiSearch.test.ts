import { describe, it, expect } from "vitest";
import { parseOpenAISearch, openaiSearchAllowed } from "@/lib/search";

const data = { output: [{ type: "web_search_call" }, { type: "message", content: [{ text: "Acme sells POS in Accra. Bolt runs rides.", annotations: [
  { type: "url_citation", url: "https://acme.com/pos?utm_source=openai", title: "Acme POS", start_index: 0, end_index: 24 },
  { type: "url_citation", url: "https://acme.com/pos?utm_source=openai", title: "dup", start_index: 0, end_index: 5 },
  { type: "url_citation", url: "javascript:alert(1)", title: "bad" },
  { type: "url_citation", url: "https://bolt.eu/", title: "Bolt", start_index: 25, end_index: 41 },
] }] }] };

describe("OpenAI web search", () => {
  it("keeps only cited, safe, unique sources as unread links and drops tracking params", () => {
    const r = parseOpenAISearch(data, "pos accra", 8)!;
    expect(r.provider).toBe("openai");
    expect(r.results.map((x) => x.url)).toEqual(["https://acme.com/pos", "https://bolt.eu/"]);
    // The model's sentence is never kept as a quote: results are unread links.
    expect(r.results.every((x) => x.snippet === "" && x.unread === true)).toBe(true);
  });
  it("returns null with no citations", () => {
    expect(parseOpenAISearch({ output: [{ type: "message", content: [{ text: "x", annotations: [] }] }] }, "q", 5)).toBeNull();
  });
  it("respects the key, the off switch and the daily cap", () => {
    const d = new Date("2026-11-23T10:00:00Z");
    expect(openaiSearchAllowed({}, d)).toBe(false);
    expect(openaiSearchAllowed({ OPENAI_API_KEY: "k", OPENAI_SEARCH: "off" }, d)).toBe(false);
    const env = { OPENAI_API_KEY: "k", OPENAI_SEARCH_DAILY: "2" };
    const day2 = new Date("2026-11-24T10:00:00Z");
    expect([openaiSearchAllowed(env, day2), openaiSearchAllowed(env, day2), openaiSearchAllowed(env, day2)]).toEqual([true, true, false]);
  });
});
