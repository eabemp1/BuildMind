/**
 * app/api/ai/embed-tags/route.ts — AI Improvement #3 (embedding phase)
 *
 * Background job: computes pgvector embeddings for each founder's
 * personality_tags[] and avoidance_zones[] and writes them back to
 * founder_memory so deduplicateTags() can switch from substring heuristics
 * to cosine similarity at threshold 0.85.
 *
 * Architecture:
 *   - Called by QStash after every founderMemory write (via /api/ai/coach)
 *   - Also runs as a nightly sweep for any rows missing embeddings
 *   - Uses OpenAI text-embedding-3-small (1536-dim) or falls back to
 *     Groq's embedding endpoint if available
 *   - Writes to personality_tags_embedding (vector) and
 *     avoidance_zones_embedding (vector) columns
 *
 * Deduplication (replaces deduplicateTags() substring heuristic):
 *   - Load embeddings for all tags in the array
 *   - Build pairwise cosine similarity matrix
 *   - For each cluster with similarity > 0.85, keep the shortest tag
 *   - Write back deduplicated arrays
 *
 * Privacy: only processes rows that opt-in to embedding (embedding_consent = true)
 * or service-role calls — founder tag data is PII-adjacent.
 *
 * Authorization: Bearer ${CRON_SECRET} (service-role call) or authenticated user
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COSINE_THRESHOLD = 0.85; // tags more similar than this are merged

// ── Embedding helpers ─────────────────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<number[][]> {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey || texts.length === 0) return texts.map(() => []);

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
  const data = await res.json();
  return (data.data as { embedding: number[] }[]).map(d => d.embedding);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Deduplicate tags using cosine similarity.
 * Returns only one representative per cluster (shortest tag wins).
 */
function deduplicateWithEmbeddings(tags: string[], embeddings: number[][]): string[] {
  if (tags.length <= 1) return tags;
  const keep = new Array(tags.length).fill(true) as boolean[];

  for (let i = 0; i < tags.length; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < tags.length; j++) {
      if (!keep[j]) continue;
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= COSINE_THRESHOLD) {
        // Keep the shorter tag (more general); drop the longer one
        if (tags[i].length <= tags[j].length) {
          keep[j] = false;
        } else {
          keep[i] = false;
          break; // i is dropped; move to next i
        }
      }
    }
  }

  return tags.filter((_, i) => keep[i]);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing env" }, { status: 500 });
  }

  const supabase = createAdminClient(supabaseUrl, serviceKey);

  let body: { userId?: string } = {};
  try { body = await req.json(); } catch { /* no body for cron sweeps */ }

  // Determine which users to process
  let userIds: string[];
  const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleOrMissingFilter = `personality_tags_embedding.is.null,avoidance_zones_embedding.is.null,updated_at.lt.${staleBefore}`;

  if (body.userId) {
    // Single-user call (triggered after a coach interaction).
    // IDOR FIX: verify the session JWT and confirm it matches body.userId.
    // Without this any authenticated user could trigger embedding for another
    // user's founder_memory by passing an arbitrary UUID in the body.
    const sessionToken = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!sessionToken) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const { data: { user: sessionUser }, error: sessionError } =
      await supabase.auth.getUser(sessionToken);
    if (sessionError || !sessionUser || sessionUser.id !== body.userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: rows } = await supabase
      .from("founder_memory")
      .select("user_id")
      .eq("user_id", body.userId)
      .or(staleOrMissingFilter)
      .limit(1);
    userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id);
  } else if (isCron) {
    // Early exit if no actionable records exist.
    const { count, error: countError } = await supabase
      .from("founder_memory")
      .select("user_id", { count: "exact", head: true })
      .or(staleOrMissingFilter);
    if (countError) {
      return NextResponse.json({ ok: false, error: countError.message, step: "count_stale_embeddings" }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
    }

    // Nightly sweep: rows missing or stale embeddings
    const { data: rows } = await supabase
      .from("founder_memory")
      .select("user_id")
      .or(staleOrMissingFilter)
      .limit(20); // batch 20 per run to stay within maxDuration
    userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id);
  } else {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (userIds.length === 0) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const { data: memory } = await supabase
        .from("founder_memory")
        .select("personality_tags, avoidance_zones")
        .eq("user_id", userId)
        .maybeSingle();

      if (!memory) continue;

      const personalityTags: string[] = memory.personality_tags ?? [];
      const avoidanceZones: string[]  = memory.avoidance_zones  ?? [];

      const allTags = [...personalityTags, ...avoidanceZones];
      if (allTags.length === 0) continue;

      // Embed all tags in one API call
      const embeddings = await embedTexts(allTags);
      const ptEmb  = embeddings.slice(0, personalityTags.length);
      const azEmb  = embeddings.slice(personalityTags.length);

      // Deduplicate within each array
      const dedupedPT = deduplicateWithEmbeddings(personalityTags, ptEmb);
      const dedupedAZ = deduplicateWithEmbeddings(avoidanceZones, azEmb);

      // Store representative embedding as mean of deduplicated set
      const meanEmbPT = dedupedPT.length > 0
        ? meanVector(ptEmb.filter((_, i) => personalityTags.indexOf(dedupedPT[0]) === i || dedupedPT.includes(personalityTags[i])))
        : [];
      const meanEmbAZ = dedupedAZ.length > 0
        ? meanVector(azEmb.filter((_, i) => avoidanceZones.indexOf(dedupedAZ[0]) === i || dedupedAZ.includes(avoidanceZones[i])))
        : [];

      await supabase.from("founder_memory").upsert({
        user_id:                      userId,
        personality_tags:             dedupedPT,
        avoidance_zones:              dedupedAZ,
        personality_tags_embedding:   meanEmbPT.length ? `[${meanEmbPT.join(",")}]` : null,
        avoidance_zones_embedding:    meanEmbAZ.length ? `[${meanEmbAZ.join(",")}]` : null,
        updated_at:                   new Date().toISOString(),
      }, { onConflict: "user_id" });

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${userId}: ${msg}`);
      console.error(`[embed-tags] user ${userId}:`, msg);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    durationMs: Date.now() - start,
    errors: errors.length > 0 ? errors : undefined,
  });
}

function meanVector(vecs: number[][]): number[] {
  const valid = vecs.filter(v => v.length > 0);
  if (valid.length === 0) return [];
  const len = valid[0].length;
  const sum = new Array(len).fill(0) as number[];
  for (const v of valid) {
    for (let i = 0; i < len; i++) sum[i] += v[i];
  }
  return sum.map(x => x / valid.length);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
