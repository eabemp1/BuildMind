import { NextResponse } from "next/server";
import { publicPrice, normalizeCountryCode } from "@/lib/billing/regionalPricing";

export const dynamic = "force-dynamic";

/**
 * Public price quote for the visitor's region. Decided from the CDN geo
 * header only (never a query param), so it always matches what checkout
 * will actually charge.
 */
export async function GET(req: Request) {
  const country = normalizeCountryCode(req.headers.get("x-vercel-ip-country"));
  const res = NextResponse.json(publicPrice(country));
  res.headers.set("Cache-Control", "private, max-age=3600");
  res.headers.set("Vary", "x-vercel-ip-country");
  return res;
}
