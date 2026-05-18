import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/user/geo
 *
 * Reads the caller's country from Vercel's geo headers (populated
 * automatically on Vercel deployments, no third-party API needed).
 * Writes `flag`, `city`, and `country` into the authenticated user's
 * Supabase auth `user_metadata` so the Founder Feed can show real
 * location data instead of "🌍 Somewhere".
 *
 * Called once at the end of onboarding. Idempotent — safe to call
 * multiple times (existing values are overwritten with fresher data).
 *
 * Vercel geo headers: https://vercel.com/docs/edge-network/headers
 *   x-vercel-ip-country      → ISO 3166-1 alpha-2 (e.g. "GH")
 *   x-vercel-ip-city         → URL-encoded city name (e.g. "Kumasi")
 *
 * In local dev these headers are absent → falls back to defaults.
 * In production on Vercel → real geo data, no API key required.
 */

// ISO 3166-1 alpha-2 → flag emoji + country name
// Covers all Supabase-supported markets and BuildMind's known user base.
const GEO: Record<string, { flag: string; name: string }> = {
  GH: { flag: "🇬🇭", name: "Ghana" },
  NG: { flag: "🇳🇬", name: "Nigeria" },
  KE: { flag: "🇰🇪", name: "Kenya" },
  ZA: { flag: "🇿🇦", name: "South Africa" },
  EG: { flag: "🇪🇬", name: "Egypt" },
  TZ: { flag: "🇹🇿", name: "Tanzania" },
  UG: { flag: "🇺🇬", name: "Uganda" },
  RW: { flag: "🇷🇼", name: "Rwanda" },
  CI: { flag: "🇨🇮", name: "Côte d'Ivoire" },
  SN: { flag: "🇸🇳", name: "Senegal" },
  CM: { flag: "🇨🇲", name: "Cameroon" },
  ET: { flag: "🇪🇹", name: "Ethiopia" },
  TN: { flag: "🇹🇳", name: "Tunisia" },
  MA: { flag: "🇲🇦", name: "Morocco" },
  AO: { flag: "🇦🇴", name: "Angola" },
  ZM: { flag: "🇿🇲", name: "Zambia" },
  ZW: { flag: "🇿🇼", name: "Zimbabwe" },
  US: { flag: "🇺🇸", name: "United States" },
  GB: { flag: "🇬🇧", name: "United Kingdom" },
  CA: { flag: "🇨🇦", name: "Canada" },
  IN: { flag: "🇮🇳", name: "India" },
  DE: { flag: "🇩🇪", name: "Germany" },
  FR: { flag: "🇫🇷", name: "France" },
  NL: { flag: "🇳🇱", name: "Netherlands" },
  SE: { flag: "🇸🇪", name: "Sweden" },
  BR: { flag: "🇧🇷", name: "Brazil" },
  MX: { flag: "🇲🇽", name: "Mexico" },
  AU: { flag: "🇦🇺", name: "Australia" },
  SG: { flag: "🇸🇬", name: "Singapore" },
  AE: { flag: "🇦🇪", name: "UAE" },
  PK: { flag: "🇵🇰", name: "Pakistan" },
  BD: { flag: "🇧🇩", name: "Bangladesh" },
  PH: { flag: "🇵🇭", name: "Philippines" },
  ID: { flag: "🇮🇩", name: "Indonesia" },
  JP: { flag: "🇯🇵", name: "Japan" },
  KR: { flag: "🇰🇷", name: "South Korea" },
  IL: { flag: "🇮🇱", name: "Israel" },
  TR: { flag: "🇹🇷", name: "Turkey" },
  PL: { flag: "🇵🇱", name: "Poland" },
  UA: { flag: "🇺🇦", name: "Ukraine" },
  ES: { flag: "🇪🇸", name: "Spain" },
  PT: { flag: "🇵🇹", name: "Portugal" },
  IT: { flag: "🇮🇹", name: "Italy" },
  RO: { flag: "🇷🇴", name: "Romania" },
  LS: { flag: "🇱🇸", name: "Lesotho" },
  BW: { flag: "🇧🇼", name: "Botswana" },
  NA: { flag: "🇳🇦", name: "Namibia" },
  NZ: { flag: "🇳🇿", name: "New Zealand" },
  AR: { flag: "🇦🇷", name: "Argentina" },
  CL: { flag: "🇨🇱", name: "Chile" },
  CO: { flag: "🇨🇴", name: "Colombia" },
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
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Dev mode — skip silently, no admin client available
      return NextResponse.json({ ok: true, skipped: "no admin env" });
    }

    // Read Vercel geo headers (absent in local dev → empty strings)
    const countryCode = request.headers.get("x-vercel-ip-country") ?? "";
    const rawCity     = request.headers.get("x-vercel-ip-city") ?? "";

    const { flag, country } = countryToGeo(countryCode || null);
    const city = decodeCity(rawCity) || country;

    // Also accept an override body from the client (for future manual entry)
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const finalFlag    = body.flag    ?? flag;
    const finalCity    = body.city    ?? city;
    const finalCountry = body.country ?? country;

    // Write to Supabase auth user_metadata via admin client
    const admin = createAdminClient();
    const { data: existing } = await admin.auth.admin.getUserById(user.id);
    const existingMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;

    // Derive timezone offset from country code using Vercel's geo header or body
    // This populates founder_context.timezone_offset used by cron delivery timing.
    const countryCode = body.countryCode ?? request.headers.get("x-vercel-ip-country") ?? null;
    const COUNTRY_TZ_OFFSET: Record<string, number> = {
      GH: 0, SN: 0, CI: 0, ML: 0, GN: 0,           // UTC+0
      NG: 1, BJ: 1, NE: 1, CM: 1, CF: 1, CD: 1,     // UTC+1
      KE: 3, ET: 3, TZ: 3, UG: 3, SO: 3, RW: 2, ZA: 2, // UTC+2/3
      MA: 1, TN: 1, DZ: 1, EG: 2,                    // North Africa
      US: -5, CA: -5, MX: -6, BR: -3,                // Americas (rough EST)
      GB: 0, DE: 1, FR: 1, NL: 1, SE: 1,             // Europe
      IN: 5, PK: 5, BD: 6, SG: 8, PH: 8, AU: 10,    // Asia-Pacific
      AE: 4,
    };
    const tzOffset = countryCode ? (COUNTRY_TZ_OFFSET[countryCode.toUpperCase()] ?? 0) : 0;

    // Also write timezone_offset to founder_context so cron jobs can read it
    // without hitting user_metadata (which requires admin API per-user)
    await supabase
      .from("founder_context")
      .update({ timezone_offset: tzOffset })
      .eq("user_id", user.id);

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...existingMeta,
        flag:     finalFlag,
        city:     finalCity,
        country:  finalCountry,
        timezone_offset: tzOffset,
        geo_set_at: new Date().toISOString(),
      },
    });

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      flag: finalFlag,
      city: finalCity,
      country: finalCountry,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Geo update failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
