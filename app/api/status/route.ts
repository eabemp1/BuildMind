import { NextResponse } from "next/server";
import { checkAndRecord } from "@/lib/statusChecks";
import { flushOwnerEvents } from "@/lib/ownerNotify";

export const dynamic = "force-dynamic";

/** Public uptime endpoint. Point UptimeRobot / BetterStack here (every 5 min). 503 when down. */
export async function GET() {
  const r = await checkAndRecord();
  await flushOwnerEvents(); // also reports signups made since the last check
  const components = Object.fromEntries(Object.entries(r.components).map(([k, v]) => [k, { status: v.status }]));
  return NextResponse.json(
    { status: r.overall, checkedAt: r.checkedAt, components },
    { status: r.overall === "down" ? 503 : 200, headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } },
  );
}
