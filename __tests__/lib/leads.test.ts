import { describe, it, expect } from "vitest";
import { isAllowedUrl, isPrivateAddress, htmlToText } from "@/lib/leads/pageReader";
import { isGenericLead } from "@/lib/leads/generic";
import { validateLeads } from "@/lib/leads/validate";
import { cleanQueries, cleanOsmTags, fallbackQueries, cleanInput } from "@/lib/leads/plan";
import { overpassQuery, parsePlaces } from "@/lib/leads/osm";
import { pickPages } from "@/lib/leads/engine";
import { describeRow, rankRows } from "@/lib/leads/map";

describe("page reader safety", () => {
  it("blocks private and odd URLs", () => {
    for (const u of ["http://localhost/x", "http://127.0.0.1/", "http://10.0.0.5/a", "http://192.168.1.1/", "http://169.254.169.254/latest", "ftp://a.com/x", "https://a.com:8080/x", "https://user:pw@a.com/", "http://intranet/", "not a url"]) {
      expect(isAllowedUrl(u), u).toBe(false);
    }
    expect(isAllowedUrl("https://example.com/page")).toBe(true);
  });
  it("knows private addresses", () => {
    expect(isPrivateAddress("172.20.1.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
  it("turns html into text", () => {
    expect(htmlToText("<style>a{}</style><p>Hello &amp; welcome</p><script>x()</script><p>Two</p>")).toBe("Hello & welcome\nTwo");
  });
});

describe("generic communities", () => {
  it("rejects the usual founder communities", () => {
    expect(isGenericLead("r/Startups", "https://reddit.com/r/startups")).toBe(true);
    expect(isGenericLead("Micro SaaS", "https://reddit.com/r/Micro_SaaS")).toBe(true);
    expect(isGenericLead("Indie Hackers", "https://indiehackers.com")).toBe(true);
    expect(isGenericLead("Madina Market Traders Association", "https://example.com.gh/madina")).toBe(false);
  });
});

describe("validateLeads", () => {
  const good = { name: "Madina Traders", kind: "association", where: "Accra", url: "https://example.com.gh/madina", why_fit: "Sells groceries.", evidence: "The page lists 120 member grocery traders in Madina.", how_to_reach: "Call the number on the page", first_message: "Hello, I am building a price tool for grocery buyers. Could I ask two questions?" };
  const allowed = ["https://www.example.com.gh/madina/"];
  it("keeps a real, evidenced lead", () => expect(validateLeads([good], allowed)).toHaveLength(1));
  it("drops a URL nobody searched", () => expect(validateLeads([{ ...good, url: "https://invented.com/x" }], allowed)).toHaveLength(0));
  it("drops generic, thin and duplicate leads", () => {
    expect(validateLeads([{ ...good, name: "r/Startups", url: "https://reddit.com/r/startups" }], ["https://reddit.com/r/startups"])).toHaveLength(0);
    expect(validateLeads([{ ...good, evidence: "ok" }], allowed)).toHaveLength(0);
    expect(validateLeads([good, good], allowed)).toHaveLength(1);
    expect(validateLeads("nope", allowed)).toEqual([]);
  });
});

describe("query planning", () => {
  const i = cleanInput({ country: "Ghana", city: "Accra", customer: "chop bar owners", problem: "tracking daily sales" });
  it("always has local fallback queries without 'startup'", () => {
    const q = fallbackQueries(i);
    expect(q.length).toBeGreaterThanOrEqual(5);
    expect(q.every((x) => /accra|ghana/i.test(x) && !/startup/i.test(x))).toBe(true);
  });
  it("drops non-local and founder-targeted queries", () => {
    const q = cleanQueries(["best startup communities Ghana", "chop bars in Accra Facebook page", "restaurant owners worldwide forum", "Accra food vendors association", "chop bar owners Kumasi Ghana WhatsApp"], i);
    expect(q).toEqual(["chop bars in Accra Facebook page", "Accra food vendors association", "chop bar owners Kumasi Ghana WhatsApp"]);
  });
  it("falls back when the model gives too little", () => expect(cleanQueries(["x"], i)).toEqual(fallbackQueries(i)));
  it("only allows safe OSM tags", () => {
    expect(cleanOsmTags([{ key: "amenity", value: "restaurant" }, { key: "evil", value: "x" }, { key: "shop", value: "a;b" }])).toEqual([{ key: "amenity", value: "restaurant" }]);
  });
});

describe("openstreetmap", () => {
  it("builds a query and parses places", () => {
    expect(overpassQuery([1, 2, 3, 4], [{ key: "amenity", value: "pharmacy" }])).toContain('node["amenity"="pharmacy"]["name"](1,2,3,4)');
    const p = parsePlaces({ elements: [{ id: 5, type: "node", tags: { name: "Good Health Pharmacy", amenity: "pharmacy", phone: "+233" } }, { id: 6, type: "node", tags: {} }] });
    expect(p).toEqual([{ name: "Good Health Pharmacy", type: "pharmacy", url: "https://www.openstreetmap.org/node/5", phone: "+233", website: undefined }]);
  });
});

describe("pickPages", () => {
  it("limits per domain and skips generic and unsafe", () => {
    const mk = (url: string, title = "t") => ({ title, url, snippet: "", source_type: "web" as const });
    const out = pickPages([mk("https://a.com/1"), mk("https://a.com/2"), mk("https://a.com/3"), mk("http://localhost/x"), mk("https://reddit.com/r/startups"), mk("https://b.com/1")]);
    expect(out.map((r) => r.url)).toEqual(["https://a.com/1", "https://a.com/2", "https://b.com/1"]);
  });
});

describe("customer map", () => {
  const row = { country: "ghana", lead_kind: "page", channel: "whatsapp", founders: 4, contacted: 20, replied: 9, converted: 2 };
  it("describes a row in plain words", () => expect(describeRow(row)).toBe("4 founders contacted public pages by WhatsApp: 9 of 20 replied (45%), 2 became customers."));
  it("ranks by reply rate and ignores thin rows", () => {
    const low = { ...row, channel: "email", replied: 2 };
    const thin = { ...row, channel: "phone", contacted: 2, replied: 2 };
    expect(rankRows([low, thin, row]).map((r) => r.channel)).toEqual(["whatsapp", "email"]);
  });
});

import { targetsFounders } from "@/lib/leads/plan";
import { thinReason } from "@/lib/leads/engine";

describe("founder customers", () => {
  it("allows founder communities only when the customers are founders", () => {
    expect(targetsFounders("Solo founders, Early Stage founders")).toBe(true);
    expect(targetsFounders("chop bar owners")).toBe(false);
    expect(isGenericLead("r/Startups", "https://reddit.com/r/startups", true)).toBe(false);
    const i = cleanInput({ country: "Ghana", city: "Accra", customer: "solo founders", problem: "x" });
    expect(cleanQueries(["startup founders Accra meetup", "founder community Ghana", "Accra tech hub founders"], i)).toHaveLength(3);
  });
});

describe("thinReason", () => {
  it("says what actually went wrong", () => {
    expect(thinReason(0, { resultsFound: 0, pagesRead: 0, places: 0 })).toMatch(/search key|quota/);
    expect(thinReason(0, { resultsFound: 5, pagesRead: 0, places: 0 })).toMatch(/could be opened/);
    expect(thinReason(1, { resultsFound: 20, pagesRead: 8, places: 3 })).toMatch(/8 pages and 3 map listings/);
  });
});
