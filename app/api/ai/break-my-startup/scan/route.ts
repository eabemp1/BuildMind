/** POST /api/ai/break-my-startup/scan { domain } — signed-in site scan for the main Break My Startup form. */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { gateAIUsage } from "@/app/api/ai/_usageGate";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { normaliseDomain } from "@/lib/break/domain";
import { scanSite } from "@/lib/break/siteScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const rl = await rateLimitAsync(`bms-scan:${user.userId}`, 20, 60 * 60 * 1000, { failClosed: true });
    if (!rl.ok) return NextResponse.json({ success: false, error: "Too many scans. Try again later." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const url = normaliseDomain(body?.domain);
    if (!url) return NextResponse.json({ success: false, error: "Enter a domain like yourapp.com." }, { status: 400 });

    const blocked = await gateAIUsage(user.userId, "general");
    const brief = await scanSite(url, { useAI: !blocked });
    if (!brief) return NextResponse.json({ success: false, error: "Could not read that site. It may block bots or be client-rendered. Describe it instead." }, { status: 422 });
    return NextResponse.json({ success: true, data: brief });
  } catch {
    return NextResponse.json({ success: false, error: "Scan failed. Describe it instead." }, { status: 500 });
  }
}
