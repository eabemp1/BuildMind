/**
 * lib/leads/place.ts — is this lead in the place the founder asked for? Pure.
 * A real page is not always the right place: "Boyd Bicycle Shop, Bristol" can be Bristol, Tennessee.
 * A lead is dropped only when its text carries a clear sign of another country and nothing that confirms the requested one.
 */
export type PlaceVerdict = "confirmed" | "wrong" | "unknown";

const ALIASES: Record<string, string[]> = {
  "united kingdom": ["united kingdom", "uk", "u.k.", "england", "scotland", "wales", "northern ireland", "great britain", "britain"],
  "united states": ["united states", "usa", "u.s.a", "u.s.", "america"],
  canada: ["canada"],
  ghana: ["ghana"],
  nigeria: ["nigeria"],
  kenya: ["kenya"],
  "south africa": ["south africa"],
  india: ["india"],
  australia: ["australia"],
};
const COUNTRY_ALIAS_OF: Record<string, string> = { uk: "united kingdom", gb: "united kingdom", "great britain": "united kingdom", britain: "united kingdom", england: "united kingdom", scotland: "united kingdom", wales: "united kingdom", us: "united states", usa: "united states", america: "united states", "u.s.": "united states" };

function canonCountry(country: string): string {
  const c = country.trim().toLowerCase();
  return COUNTRY_ALIAS_OF[c] ?? c;
}

const US_STATE_ZIP = /\b(?:A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\s+\d{5}(?:-\d{4})?\b/;
const US_PHONE = /(?:\(\d{3}\)\s?|\b\d{3}[-.])\d{3}[-.]\d{4}\b/;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/;
const CA_POSTCODE = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d\b/;
const US_STATES = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington state|west virginia|wisconsin|wyoming)\b/i;

/** Which country this text points to by its address-like details, or null when it shows none. */
export function foreignSigns(text: string, requestedCountry: string): string | null {
  const want = canonCountry(requestedCountry);
  if (want !== "united states" && (US_STATE_ZIP.test(text) || US_PHONE.test(text) || US_STATES.test(text))) return "united states";
  if (want !== "united kingdom" && UK_POSTCODE.test(text)) return "united kingdom";
  if (want !== "canada" && CA_POSTCODE.test(text)) return "canada";
  return null;
}

function mentions(text: string, words: string[]): boolean {
  const t = text.toLowerCase();
  return words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/\./g, "\\.")}($|[^a-z])`, "i").test(t));
}

export function placeVerdict(text: string, place: { country: string; city?: string }): PlaceVerdict {
  const want = canonCountry(place.country);
  const confirmsCountry = mentions(text, ALIASES[want] ?? [want]);
  if (foreignSigns(text, place.country) && !confirmsCountry) return "wrong";
  if (confirmsCountry) return "confirmed";
  if (place.city && mentions(text, [place.city.toLowerCase()])) return "confirmed";
  return "unknown";
}
