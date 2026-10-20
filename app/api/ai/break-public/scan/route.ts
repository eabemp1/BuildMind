/**
 * POST /api/ai/break-public/scan { domain }
 * Reads the public homepage and returns draft values for the Break My Startup form.
 * Public, IP rate-limited, SSRF-guarded (lib/pageReader.ts). Never throws a 500 at the visitor.
 */
import { NextResponse } from "next/server";
import { groqJSON } from "@/app/api/ai/_utils";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { publicBreakAllowed, recordCall } from "@/lib/server/aiBudget";
import { readPage } from "@/lib/pageReader";
import { normaliseDomain, factsFromDigest, digestForPrompt, type SiteFacts } from "@/lib/break/domain";

const PROMPT = `You read a company's homepage text and fill a form. Return ONLY JSON: {"idea":"one or two plain sentences on what the product does","targetUsers":"who it is for, only if the page says so, else empty string","problem":"the problem it solves, only if the page says so, else empty string"}.
Use ONLY the page text. Never invent customers, numbers or claims. Empty string beats a guess. No marketing words.`;

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = await rateLimitAsync(`break-scan:${ip}`, 8, 60 * 60 * 1000, { failClosed: true });
    if (!limit.ok) return NextResponse.json({ success: false, error: "Too many scans. Try again in an hour, or type it in." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const url = normaliseDomain(body?.domain);
    if (!url) return NextResponse.json({ success: false, error: "Enter a domain like yourapp.com." }, { status: 400 });

    const page = await readPage(url);
    if (!page.ok || (!page.title && !page.description && !page.text)) {
      return NextResponse.json({ success: false, error: "Could not read that site. It may block bots or be client-rendered. Type it in instead." }, { status: 422 });
    }

    let facts: SiteFacts = factsFromDigest(page);
    const gate = await publicBreakAllowed();
    if (gate.live) {
      try {
        await recordCall("public");
        const ai = await groqJSON<{ idea?: string; targetUsers?: string; problem?: string }>(PROMPT, digestForPrompt(page));
        const idea = String(ai?.idea ?? "").trim().slice(0, 800);
        if (idea.length >= 10) facts = { idea, targetUsers: String(ai.targetUsers ?? "").trim().slice(0, 200), problem: String(ai.problem ?? "").trim().slice(0, 400), source: "ai" };
      } catch { /* keep the page-only facts */ }
    }
    if (facts.idea.length < 10) return NextResponse.json({ success: false, error: "That page says too little to work from. Type it in instead." }, { status: 422 });

    return NextResponse.json({ success: true, data: { ...facts, domain: new URL(url).hostname, title: page.title, prices: page.prices } });
  } catch {
    return NextResponse.json({ success: false, error: "Scan failed. Type it in instead." }, { status: 500 });
  }
}
