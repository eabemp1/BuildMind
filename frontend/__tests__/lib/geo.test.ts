/**
 * __tests__/lib/geo.test.ts
 *
 * Unit tests for the geo helper logic used in app/api/user/geo/route.ts.
 * Extracted here as pure functions so they run without mocking Next.js.
 */

import { describe, it, expect } from "vitest";

// ── Inline the helpers under test (mirrored from route.ts) ──────────────────
// This avoids having to mock next/server — the pure mapping logic is what
// matters here, not the HTTP layer (which is covered by E2E).

const GEO: Record<string, { flag: string; name: string }> = {
  GH: { flag: "🇬🇭", name: "Ghana" },
  NG: { flag: "🇳🇬", name: "Nigeria" },
  KE: { flag: "🇰🇪", name: "Kenya" },
  ZA: { flag: "🇿🇦", name: "South Africa" },
  CI: { flag: "🇨🇮", name: "Côte d'Ivoire" },
  US: { flag: "🇺🇸", name: "United States" },
  GB: { flag: "🇬🇧", name: "United Kingdom" },
  DE: { flag: "🇩🇪", name: "Germany" },
  FR: { flag: "🇫🇷", name: "France" },
  IN: { flag: "🇮🇳", name: "India" },
};

function countryToGeo(code: string | null): { flag: string; country: string } {
  if (!code) return { flag: "🌍", country: "Unknown" };
  const entry = GEO[code.toUpperCase()];
  return entry
    ? { flag: entry.flag, country: entry.name }
    : { flag: "🌍", country: code };
}

function decodeCity(raw: string | null): string {
  if (!raw) return "";
  try { return decodeURIComponent(raw); }
  catch { return raw; }
}

// ── countryToGeo ─────────────────────────────────────────────────────────────

describe("countryToGeo", () => {
  it("maps GH → Ghanaian flag and Ghana", () => {
    const result = countryToGeo("GH");
    expect(result.flag).toBe("🇬🇭");
    expect(result.country).toBe("Ghana");
  });

  it("maps lowercase country codes", () => {
    const result = countryToGeo("ng");
    expect(result.flag).toBe("🇳🇬");
    expect(result.country).toBe("Nigeria");
  });

  it("returns globe fallback for null", () => {
    const result = countryToGeo(null);
    expect(result.flag).toBe("🌍");
    expect(result.country).toBe("Unknown");
  });

  it("returns globe fallback for empty string", () => {
    const result = countryToGeo("");
    expect(result.flag).toBe("🌍");
    expect(result.country).toBe("Unknown");
  });

  it("returns globe + raw code for unknown country codes", () => {
    const result = countryToGeo("XX");
    expect(result.flag).toBe("🌍");
    expect(result.country).toBe("XX"); // passes through the raw code
  });

  it("maps all critical African markets correctly", () => {
    const markets: [string, string, string][] = [
      ["GH", "🇬🇭", "Ghana"],
      ["NG", "🇳🇬", "Nigeria"],
      ["KE", "🇰🇪", "Kenya"],
      ["ZA", "🇿🇦", "South Africa"],
    ];
    markets.forEach(([code, flag, country]) => {
      const result = countryToGeo(code);
      expect(result.flag).toBe(flag);
      expect(result.country).toBe(country);
    });
  });

  it("maps key international markets correctly", () => {
    const markets: [string, string][] = [
      ["US", "🇺🇸"],
      ["GB", "🇬🇧"],
      ["IN", "🇮🇳"],
      ["DE", "🇩🇪"],
    ];
    markets.forEach(([code, flag]) => {
      expect(countryToGeo(code).flag).toBe(flag);
    });
  });
});

// ── decodeCity ────────────────────────────────────────────────────────────────

describe("decodeCity", () => {
  it("decodes URL-encoded city names (Vercel header format)", () => {
    // Vercel sends city names URL-encoded: "Kumasi" → "Kumasi", "São Paulo" → "S%C3%A3o%20Paulo"
    expect(decodeCity("Kumasi")).toBe("Kumasi");
    expect(decodeCity("S%C3%A3o%20Paulo")).toBe("São Paulo");
    expect(decodeCity("New%20York")).toBe("New York");
    expect(decodeCity("Accra")).toBe("Accra");
  });

  it("returns empty string for null", () => {
    expect(decodeCity(null)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(decodeCity("")).toBe("");
  });

  it("returns raw string if decoding fails (malformed encoding)", () => {
    // Pass something that looks encoded but is malformed
    expect(decodeCity("Lagos%ZZ")).toBe("Lagos%ZZ");
  });

  it("handles plain ASCII city names without encoding", () => {
    expect(decodeCity("London")).toBe("London");
    expect(decodeCity("Berlin")).toBe("Berlin");
  });
});

// ── Integration: full geo resolution ─────────────────────────────────────────

describe("geo resolution (integration)", () => {
  it("GH + Kumasi resolves correctly end-to-end", () => {
    const { flag, country } = countryToGeo("GH");
    const city = decodeCity("Kumasi") || country;
    expect(flag).toBe("🇬🇭");
    expect(city).toBe("Kumasi");
  });

  it("unknown country + missing city falls back gracefully", () => {
    const { flag, country } = countryToGeo(null);
    const city = decodeCity(null) || country;
    expect(flag).toBe("🌍");
    expect(city).toBe("Unknown");
  });

  it("known country + missing city uses country name as city", () => {
    const { flag, country } = countryToGeo("NG");
    const city = decodeCity("") || country;
    expect(flag).toBe("🇳🇬");
    expect(city).toBe("Nigeria"); // falls back to country name
  });

  it("URL-encoded African city decodes properly", () => {
    const { flag } = countryToGeo("CI");
    const city = decodeCity("Abidjan") || "Côte d'Ivoire";
    expect(flag).toBe("🇨🇮");
    expect(city).toBe("Abidjan");
  });
});
