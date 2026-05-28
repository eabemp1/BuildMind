import { NextResponse } from "next/server";
import { getPublicStats, PUBLIC_STATS_FALLBACK } from "@/lib/server/publicStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    return NextResponse.json(await getPublicStats(), { headers });
  } catch {
    return NextResponse.json(PUBLIC_STATS_FALLBACK, { headers });
  }
}
