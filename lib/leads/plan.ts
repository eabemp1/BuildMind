/**
 * lib/leads/plan.ts — turn "country + city + who your customers are" into local search queries. Pure.
 * The model may propose queries; these helpers clean them and supply a fallback that never says "startup".
 */
export interface LeadInput {
  country: string;
  city: string;
  customer: string;   // who the founder sells to, in their words
  problem: string;
}

export const OSM_KEYS = ["amenity", "shop", "craft", "office", "healthcare", "tourism", "leisure"] as const;
export type OsmTag = { key: (typeof OSM_KEYS)[number]; value: string };

const clean = (v: string, max: number) => v.replace(/[\r\n"]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function cleanInput(i: Partial<LeadInput>): LeadInput {
  return { country: clean(i.country ?? "", 60), city: clean(i.city ?? "", 60), customer: clean(i.customer ?? "", 160), problem: clean(i.problem ?? "", 240) };
}

/** True when the founder sells to other founders, so founder communities are legitimate leads. */
export function targetsFounders(customer: string): boolean {
  return /\b(founders?|startups?|entrepreneurs?|solopreneurs?|indie hackers?|makers?)\b/i.test(customer);
}

export function fallbackQueries(i: LeadInput): string[] {
  const place = [i.city, i.country].filter(Boolean).join(" ");
  const c = i.customer || "small business owners";
  return [
    `${c} ${place} Facebook page`,
    `${c} association ${place}`,
    `${c} ${place} WhatsApp group OR Telegram channel`,
    `${c} ${place} directory contact`,
    `${c} ${place} problems complaints`,
    `${i.problem} ${place} how people cope today`,
  ].map((q) => q.replace(/\s+/g, " ").trim());
}

export function cleanQueries(raw: unknown, i: LeadInput, max = 7): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const place = `${i.city} ${i.country}`.toLowerCase();
  for (const q of list) {
    if (typeof q !== "string") continue;
    const t = clean(q, 140);
    if (t.length < 8 || out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    if (!targetsFounders(i.customer) && /\bstartups?\b|\bfounders?\b|\bsaas\b/i.test(t)) continue; // that finds founders, not customers
    // Every query must be about the founder's place, or it returns the same global pages for everyone.
    const words = place.split(/\s+/).filter((w) => w.length > 2);
    if (words.length && !words.some((w) => t.toLowerCase().includes(w))) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out.length >= 3 ? out : fallbackQueries(i);
}

export function cleanOsmTags(raw: unknown, max = 4): OsmTag[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: OsmTag[] = [];
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const { key, value } = t as Record<string, unknown>;
    if (typeof key !== "string" || typeof value !== "string") continue;
    if (!(OSM_KEYS as readonly string[]).includes(key)) continue;
    if (!/^[a-z_]{2,30}$/.test(value)) continue;
    if (out.some((x) => x.key === key && x.value === value)) continue;
    out.push({ key: key as OsmTag["key"], value });
    if (out.length >= max) break;
  }
  return out;
}
