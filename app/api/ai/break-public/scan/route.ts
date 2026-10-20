/**
 * POST /api/ai/break-public/scan { domain }
 * Reads the public homepage and returns draft values for the Break My Startup form.
 * Public, IP rate-limited, SSRF-guarded (lib/pageReader.ts). Never throws a 500 at the visitor.
 */
import { NextResponse } from "next/server";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { publicBreakAllowed, recordCall } from "@/lib/server/aiBudget";
import { normaliseDomain } from "@/lib/break/domain";
import { scanSite } from "@/lib/break/siteScan";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = await rateLimitAsync(`break-scan:${ip}`, 8, 60 * 60 * 1000, { failClosed: true });
    if (!limit.ok) return NextResponse.json({ success: false, error: "Too many scans. Try again in an hour, or type it in." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const url = normaliseDomain(body?.domain);
    if (!url) return NextResponse.json({ success: false, error: "Enter a domain like yourapp.com." }, { status: 400 });

    const gate = await publicBreakAllowed();
    if (gate.live) await recordCall("public");
    const brief = await scanSite(url, { useAI: gate.live });
    if (!brief) return NextResponse.json({ success: false, error: "Could not read that site. It may block bots or be client-rendered. Type it in instead." }, { status: 422 });
    const idea = brief.idea.slice(0, 800);
    return NextResponse.json({ success: true, data: { idea, targetUsers: brief.targetUsers, problem: brief.problem, source: brief.source, domain: brief.domain, title: brief.title, prices: brief.prices } });
  } catch {
    return NextResponse.json({ success: false, error: "Scan failed. Type it in instead." }, { status: 500 });
  }
}
