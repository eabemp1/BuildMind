/** Where the founder is, and whether an in-person event is within reach of them. */

const PLACES: Record<string, string[]> = {
  Ghana: ["ghana", "accra", "kumasi", "tema", "takoradi", "tamale"],
  Nigeria: ["nigeria", "lagos", "abuja", "ibadan"],
  Kenya: ["kenya", "nairobi", "mombasa"],
  "South Africa": ["south africa", "cape town", "johannesburg", "pretoria", "durban"],
  Egypt: ["egypt", "cairo"],
  Rwanda: ["rwanda", "kigali"],
  UK: ["uk", "united kingdom", "england", "london", "manchester"],
  USA: ["usa", "u.s.", "united states", "new york", "san francisco", "los angeles", "california", "texas", "austin", "boston", "seattle", "chicago", "miami", "washington", "denver"],
  Canada: ["canada", "toronto", "vancouver", "montreal"],
  India: ["india", "bangalore", "mumbai", "delhi"],
};
const TIMEZONES: Record<string, string> = {
  "Africa/Accra": "Ghana", "Africa/Lagos": "Nigeria", "Africa/Nairobi": "Kenya", "Africa/Johannesburg": "South Africa",
  "Africa/Cairo": "Egypt", "Africa/Kigali": "Rwanda", "Europe/London": "UK", "America/New_York": "USA", "America/Chicago": "USA",
  "America/Denver": "USA", "America/Los_Angeles": "USA", "America/Toronto": "Canada", "Asia/Kolkata": "India",
};

/** The country a place name points to, when it is one we know. */
export function countryOf(text: string): string | null {
  const t = text.toLowerCase();
  for (const [country, names] of Object.entries(PLACES)) {
    if (names.some((n) => new RegExp(`(?:^|[^a-z])${n.replace(/\./g, "\\.")}(?:[^a-z]|$)`).test(t))) return country;
  }
  return null;
}

/** What the founder typed on /radar, else the country of their device's timezone, else "". */
export function readWhere(): string {
  try {
    const typed = localStorage.getItem("bm_radar_where")?.trim();
    if (typed) return typed;
    return TIMEZONES[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? "";
  } catch {
    return "";
  }
}

/** near: same place or country. far: a different known country. unknown: not enough to say. */
export function reach(location: string, where: string): "near" | "far" | "unknown" {
  const home = where.trim().toLowerCase();
  if (!home) return "unknown";
  if (location.toLowerCase().includes(home)) return "near";
  const there = countryOf(location);
  const here = countryOf(home);
  if (there && here) return there === here ? "near" : "far";
  return "unknown";
}
