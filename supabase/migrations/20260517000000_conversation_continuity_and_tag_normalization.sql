-- 20260517000000_conversation_continuity_and_tag_normalization.sql
--
-- AI Improvement #2: Add recent_interactions JSONB to founder_context
--   Stores last 10 AI interactions across all features for cross-feature
--   conversation continuity (see lib/conversationContinuity.ts).
--
-- AI Improvement #3: Enable pgvector + add tag embedding columns
--   Adds embedding vectors for personality_tags and avoidance_zones so
--   semantic deduplication can identify "ships fast" ≡ "moves quickly"
--   without substring heuristics.
--   NOTE: embeddings are populated lazily by the /api/ai/embed-tags job,
--   not by this migration. The columns are nullable until first populated.
--
-- Engineering Fix #2: Add last_re_engagement_email_at column used by the
--   re-engage worker to avoid double-sending within the same wave.

-- ── pgvector extension ────────────────────────────────────────────────────────
-- Enable on Supabase via Dashboard → Extensions → vector, OR with this SQL.
-- Supabase supports pgvector natively on all plans.
create extension if not exists vector;

-- ── founder_context additions ─────────────────────────────────────────────────

alter table founder_context
  -- Cross-feature conversation continuity (AI Improvement #2)
  add column if not exists recent_interactions jsonb default '[]'::jsonb,

  -- Re-engagement tracking (Engineering Fix #2 worker)
  add column if not exists last_re_engagement_email_at timestamptz,

  -- pgvector tag embeddings (AI Improvement #3)
  -- 1536-dim for text-embedding-3-small (OpenAI) or 384-dim for bge-small
  -- We use 768 as a safe default that works for most embedding models.
  add column if not exists personality_tags_embedding vector(768),
  add column if not exists avoidance_zones_embedding vector(768);

-- IVFFlat index for cosine similarity search on tag embeddings
-- Will be used by semantic deduplication and future "founders like you" feature.
-- Created with lists=10 (appropriate for <10k rows; increase to 100 at 100k rows).
create index if not exists idx_founder_context_personality_tags_embedding
  on founder_context
  using ivfflat (personality_tags_embedding vector_cosine_ops)
  with (lists = 10);

create index if not exists idx_founder_context_avoidance_zones_embedding
  on founder_context
  using ivfflat (avoidance_zones_embedding vector_cosine_ops)
  with (lists = 10);

-- Index on recent_interactions for the cron that prunes old entries
create index if not exists idx_founder_context_recent_interactions_gin
  on founder_context using gin (recent_interactions);

-- ── RLS policy for recent_interactions ───────────────────────────────────────
-- Reuse existing pattern: user can only read/write their own row.
-- (No new policy needed if the existing founder_context RLS covers all columns.)

-- ── Comment documentation ─────────────────────────────────────────────────────
comment on column founder_context.recent_interactions is
  'Array of last 10 AI interactions across all features. Schema: [{feature, summary, timestamp, emotionalSignal?}]. Populated by recordInteractionServer() in lib/conversationContinuity.ts.';

comment on column founder_context.personality_tags_embedding is
  'Mean-pooled embedding vector of personality_tags string array. Used for semantic deduplication and future founder-similarity features. Populated lazily by /api/ai/embed-tags.';

comment on column founder_context.avoidance_zones_embedding is
  'Mean-pooled embedding vector of avoidance_zones string array. Same purpose as personality_tags_embedding.';

comment on column founder_context.last_re_engagement_email_at is
  'Timestamp of last re-engagement email sent. Used by the re-engage cron worker to prevent duplicate emails within the same wave (7d / 14d).';
