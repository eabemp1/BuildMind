/**
 * app/api/ai/founder-insight/route.ts
 *
 * Generates a personalized insight about the founder based on their memory profile.
 *
 * Migrated from Anthropic (claude-opus-4-5) → Groq (llama-3.3-70b-versatile)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/projects";
import { groqChat } from "@/app/api/ai/_utils";
import type { FounderMemory } from "@/lib/founderMemory";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { prompt, memory }: { prompt: string; memory: FounderMemory } = body;

  if (!prompt || !memory) {
    return NextResponse.json({ error: "Missing prompt or memory" }, { status: 400 });
  }

  try {
    const systemPrompt = `You are a brutally honest startup co-founder who has been watching this founder build for months.
You have access to their behavioral patterns. You speak in direct, clear sentences.
Never be generic. Never hedge. Never say "it seems like" or "perhaps".
Your insight should feel like it came from someone who truly knows them.`;

    const insight = await groqChat(systemPrompt, [{ role: "user", content: prompt }]);

    return NextResponse.json({ insight });
  } catch (e: unknown) {
    if (process.env.NODE_ENV === "development") console.error("founder-insight error:", e);
    return NextResponse.json({ error: "AI error" }, { status: 500 });
  }
}
