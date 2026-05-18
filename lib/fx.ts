/**
 * lib/fx.ts — Live USD → GHS conversion via Bank of Ghana interbank rate
 *
 * Fetches the BoG daily interbank mid rate and converts a USD amount to
 * pesewas (GHS × 100) for Paystack. Results are cached in-memory for
 * CACHE_TTL_MS to avoid hitting BoG on every checkout request.
 *
 * Fallback chain (most → least preferred):
 *   1. Live BoG rate  (https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/)
 *   2. PAYSTACK_AMOUNT_BUILDER env var  (manually maintained fallback)
 *   3. PAYSTACK_AMOUNT_PESEWAS env var  (legacy name)
 *   4. Hard-coded floor: 44300 pesewas (GHS 443 ≈ $39 @ 11.34, 13 May 2026)
 */

const BOG_URL =
  "https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/";

/** Cache for 1 hour — rate only changes once per business day */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Hard-coded floor used when all live/env sources fail */
const FALLBACK_PESEWAS = 44300; // GHS 443 ≈ $39 @ BoG 11.34 (13 May 2026)

interface RateCache {
  rate: number;
  fetchedAt: number;
}

let _cache: RateCache | null = null;

/**
 * Parses the BoG interbank page HTML for the USDGHS mid rate.
 * BoG publishes a plain HTML table — no JSON API — so we scrape the mid rate.
 */
function parseBoGRate(html: string): number | null {
  // Row format: | 13 May 2026 | US Dollar | USDGHS | 11.3343 | 11.3457 | 11.3400 |
  const match = html.match(/USDGHS[\s\S]*?([\d]+\.[\d]+)\s*\|/);
  if (!match) return null;

  // The table has: Buying | Selling | Mid Rate — we want the last number (mid)
  // More precise: grab all three numbers after USDGHS and take the last one
  const rowMatch = html.match(
    /USDGHS[^|]*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/
  );
  if (rowMatch) {
    const mid = parseFloat(rowMatch[3]);
    if (!isNaN(mid) && mid > 5 && mid < 100) return mid; // sanity bounds
  }

  const fallbackRate = parseFloat(match[1]);
  if (!isNaN(fallbackRate) && fallbackRate > 5 && fallbackRate < 100)
    return fallbackRate;

  return null;
}

/**
 * Fetches the live USD/GHS mid rate from the Bank of Ghana.
 * Returns null if the fetch fails or the rate can't be parsed.
 */
async function fetchBoGRate(): Promise<number | null> {
  try {
    const res = await fetch(BOG_URL, {
      headers: { "User-Agent": "BuildMind-FX/1.0" },
      signal: AbortSignal.timeout(8000), // 8 s timeout
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseBoGRate(html);
  } catch {
    return null;
  }
}

/**
 * Returns the current USD/GHS mid rate from BoG, using a 1-hour in-memory cache.
 * Falls back to null if live fetch fails.
 */
export async function getUsdToGhsRate(): Promise<number | null> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.rate;
  }

  const rate = await fetchBoGRate();
  if (rate !== null) {
    _cache = { rate, fetchedAt: now };
  }
  return rate;
}

/**
 * Converts a USD price to pesewas for Paystack (GHS × 100), rounded to
 * the nearest 100 pesewas (i.e. nearest GHS 1) to keep amounts clean.
 *
 * Fallback chain:
 *   Live BoG rate → PAYSTACK_AMOUNT_BUILDER env → PAYSTACK_AMOUNT_PESEWAS env → hard floor
 *
 * @param usdAmount - Price in US dollars (e.g. 39)
 * @returns Amount in pesewas (e.g. 44300)
 */
export async function usdToPesewas(usdAmount: number): Promise<{
  pesewas: number;
  rateUsed: number | null;
  source: "live" | "env" | "fallback";
}> {
  // 1. Try live BoG rate
  const rate = await getUsdToGhsRate();
  if (rate !== null) {
    const pesewas = Math.round((usdAmount * rate * 100) / 100) * 100;
    return { pesewas, rateUsed: rate, source: "live" };
  }

  // 2. Try env var (manually maintained)
  const envAmount =
    process.env.PAYSTACK_AMOUNT_BUILDER ??
    process.env.PAYSTACK_AMOUNT_PESEWAS;
  if (envAmount) {
    const pesewas = parseInt(envAmount, 10);
    if (!isNaN(pesewas) && pesewas > 0) {
      return { pesewas, rateUsed: null, source: "env" };
    }
  }

  // 3. Hard floor
  return { pesewas: FALLBACK_PESEWAS, rateUsed: null, source: "fallback" };
}
