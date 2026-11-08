/**
 * lib/leads/osm.ts — real places from OpenStreetMap (free). SERVER-SIDE ONLY.
 * Nominatim finds the area; Overpass lists named places with the chosen tags inside it.
 */
import type { OsmTag } from "@/lib/leads/plan";

const UA = "BuildMindLeadFinder/1.0 (+https://buildmind.live)";

export interface OsmPlace { name: string; type: string; url: string; phone?: string; website?: string }

export function overpassQuery(bbox: [number, number, number, number], tags: OsmTag[], limit = 25): string {
  const [s, w, n, e] = bbox;
  const parts = tags.flatMap((t) => [`node["${t.key}"="${t.value}"]["name"](${s},${w},${n},${e});`, `way["${t.key}"="${t.value}"]["name"](${s},${w},${n},${e});`]);
  return `[out:json][timeout:20];(${parts.join("")});out center ${limit};`;
}

export function parsePlaces(json: unknown): OsmPlace[] {
  const els = (json as { elements?: unknown[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: OsmPlace[] = [];
  for (const el of els) {
    const e = el as { id?: number; type?: string; tags?: Record<string, string> };
    const tags = e.tags ?? {};
    if (!e.id || !e.type || !tags.name) continue;
    const type = tags.amenity ?? tags.shop ?? tags.craft ?? tags.office ?? tags.healthcare ?? tags.tourism ?? tags.leisure ?? "place";
    out.push({
      name: tags.name.slice(0, 120), type,
      url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      phone: tags.phone ?? tags["contact:phone"],
      website: tags.website ?? tags["contact:website"],
    });
  }
  return out;
}

export async function findPlaces(city: string, country: string, tags: OsmTag[], limit = 25): Promise<OsmPlace[]> {
  if (!tags.length || !(city || country)) return [];
  try {
    const q = encodeURIComponent([city, country].filter(Boolean).join(", "));
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000),
    }).then((r) => (r.ok ? r.json() : []));
    const bb = geo?.[0]?.boundingbox as string[] | undefined; // [south, north, west, east]
    if (!bb || bb.length < 4) return [];
    const [south, north, west, east] = bb.map(Number);
    if ([south, north, west, east].some((x) => !Number.isFinite(x))) return [];
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery([south, west, north, east], tags, limit))}`,
      signal: AbortSignal.timeout(22000),
    });
    return res.ok ? parsePlaces(await res.json()).slice(0, limit) : [];
  } catch {
    return [];
  }
}
