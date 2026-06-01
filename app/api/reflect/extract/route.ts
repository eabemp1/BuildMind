/**
 * app/api/reflect/extract/route.ts
 *
 * Accepts text file uploads and extracts structured reflection data points.
 * Vision/image support intentionally excluded until a stable free provider
 * is available (OpenRouter Llama 4 Maverick when ready).
 *
 * Supported formats:
 *  - Markdown (.md) — personal logs, session notes
 *  - CSV (.csv)     — exported Google Form responses, analytics exports
 *  - Plain text (.txt) — any raw log
 *
 * Returns: { what_tried, what_happened, what_learned, blocker, outcome }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callModelJSON } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/x-markdown",
  "application/csv",
];

const ALLOWED_EXTENSIONS = [".md", ".csv", ".txt"];

type Outcome = "completed" | "blocked" | "partial" | "learned";

interface ExtractedReflection {
  what_tried?:    string;
  what_happened?: string;
  what_learned?:  string;
  blocker?:       string;
  outcome?:       Outcome;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File too large (max 5MB)" }, { status: 413 });
    }

    // Reject images and PDFs — vision support coming later
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    const isAllowedType = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);

    if (!isAllowedType) {
      return NextResponse.json({
        ok: false,
        error: "Only .md, .csv, and .txt files are supported right now. Screenshot analysis coming soon.",
      }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let textContent = buffer.toString("utf-8");

    // Cap tokens — first 6000 chars is enough signal
    if (file.type === "text/csv" || ext === ".csv") {
      textContent = textContent.slice(0, 3000);
    } else {
      textContent = textContent.slice(0, 6000);
    }

    const extracted = await callModelJSON<ExtractedReflection>(
      [
        {
          role: "system",
          content: `You are a reflection data extractor for a founder productivity app.
Parse this text/markdown/CSV and extract structured data points a founder would want to log.

Return JSON ONLY with these optional fields (omit if not clearly present):
{
  "what_tried":    "specific action the founder took",
  "what_happened": "concrete result, with numbers if available",
  "what_learned":  "key insight",
  "blocker":       "specific blocker if mentioned",
  "outcome":       "completed|partial|blocked|learned"
}

Be specific and factual. Only include fields where you have clear evidence. Do not guess or invent.`,
        },
        {
          role: "user",
          content: textContent,
        },
      ],
      { role: "fast", temperature: 0.1, maxTokens: 400 }
    ).catch(() => ({} as ExtractedReflection));

    return NextResponse.json({ ok: true, ...extracted });

  } catch (err) {
    console.error("[reflect/extract]", err);
    return NextResponse.json({ ok: false, error: "Extraction failed" }, { status: 500 });
  }
}
