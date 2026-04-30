import { NextResponse } from "next/server";
import { groqChat, hasGroqKey } from "@/app/api/ai/_utils";

/**
 * /api/ai/generate-ui
 *
 * Takes a page context (page name, data, user intent) and returns
 * a complete HTML string for a rich inline visualization — charts,
 * dashboards, comparisons, timelines — rendered directly in the UI.
 *
 * This powers BuildMind's AI UI generation feature.
 */

export async function POST(_request: Request) {
  // 🔒 Operator tier — not yet live. Returns 503 until Operator plan launches.
  return NextResponse.json(
    { ok: false, error: "AI UI Generation is coming in the Operator plan. Stay tuned.", tier: "operator" },
    { status: 503 }
  );
}
