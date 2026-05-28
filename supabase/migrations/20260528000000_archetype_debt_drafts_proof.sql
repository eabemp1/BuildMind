-- Migration: archetype/debt/drafts/stage-proof support
-- Adds the storage and RPCs required by the May 2026 implementation prompt.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS archetype_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS archetype_confidence float DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_debt_surfaced jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_patterns jsonb DEFAULT '[]'::jsonb;

ALTER TABLE founder_context
  ADD COLUMN IF NOT EXISTS pending_stage_transition jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tasks_overridden_this_week integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_reasons text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS days_inactive integer DEFAULT 0;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS stage_history jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS founder_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL CHECK (stage IN ('Idea', 'Validation', 'MVP', 'Launch', 'Growth', 'Revenue')),
  company_type text NOT NULL,
  founder_archetype text,
  what_stalled_them text NOT NULL,
  what_broke_the_stall text NOT NULL,
  first_10_days_advice text NOT NULL,
  draft_template text,
  draft_channel text CHECK (draft_channel IN ('cold_email', 'linkedin_dm', 'whatsapp', 'twitter', 'in_person', 'phone')),
  draft_intent text CHECK (draft_intent IN ('discovery_call', 'first_sale', 'beta_invite', 'warm_followup', 'reactivation', 'partnership')),
  draft_style text CHECK (draft_style IN ('direct', 'curious', 'warm', 'observation-led', 'peer', 'referral')),
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE founder_knowledge_base
  ADD COLUMN IF NOT EXISTS draft_template text,
  ADD COLUMN IF NOT EXISTS draft_channel text CHECK (draft_channel IN ('cold_email', 'linkedin_dm', 'whatsapp', 'twitter', 'in_person', 'phone')),
  ADD COLUMN IF NOT EXISTS draft_intent text CHECK (draft_intent IN ('discovery_call', 'first_sale', 'beta_invite', 'warm_followup', 'reactivation', 'partnership')),
  ADD COLUMN IF NOT EXISTS draft_style text CHECK (draft_style IN ('direct', 'curious', 'warm', 'observation-led', 'peer', 'referral'));

CREATE INDEX IF NOT EXISTS idx_founder_knowledge_base_embedding
  ON founder_knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 30);

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('task_accepted', 'task_completed', 'task_overridden', 'reflection_done', 'login', 'stage_advanced', 'coach_session', 'app_open')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_date ON activity_log (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log (occurred_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_event_date ON activity_log (event_type, occurred_at);

CREATE TABLE IF NOT EXISTS admin_cache (
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prepend_archetype_tag(
  p_user_id uuid,
  p_archetype_tag text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_tags text[];
  v_filtered text[];
BEGIN
  SELECT COALESCE(personality_tags, ARRAY[]::text[])
    INTO v_current_tags
    FROM founder_memory
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO founder_memory (user_id, personality_tags, updated_at)
    VALUES (p_user_id, ARRAY[p_archetype_tag], now())
    ON CONFLICT (user_id) DO NOTHING;
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT t FROM unnest(v_current_tags) AS t
     WHERE t NOT LIKE 'archetype:%'
  ) INTO v_filtered;

  v_filtered := ARRAY[p_archetype_tag] || COALESCE(v_filtered, ARRAY[]::text[]);

  UPDATE founder_memory
     SET personality_tags = v_filtered[1:10],
         updated_at = now()
   WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION prepend_archetype_tag(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION match_founder_knowledge_base(
  query_embedding vector(768),
  match_count int DEFAULT 5,
  filter_stage text DEFAULT NULL,
  filter_archetype text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  stage text,
  company_type text,
  founder_archetype text,
  what_stalled_them text,
  what_broke_the_stall text,
  first_10_days_advice text,
  draft_template text,
  draft_channel text,
  draft_intent text,
  draft_style text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    fkb.id,
    fkb.stage,
    fkb.company_type,
    fkb.founder_archetype,
    fkb.what_stalled_them,
    fkb.what_broke_the_stall,
    fkb.first_10_days_advice,
    fkb.draft_template,
    fkb.draft_channel,
    fkb.draft_intent,
    fkb.draft_style,
    1 - (fkb.embedding <=> query_embedding) AS similarity
  FROM founder_knowledge_base fkb
  WHERE
    fkb.embedding IS NOT NULL
    AND (filter_stage IS NULL OR fkb.stage = filter_stage)
    AND (filter_archetype IS NULL OR fkb.founder_archetype = filter_archetype)
  ORDER BY fkb.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT SELECT ON founder_knowledge_base TO authenticated, anon;
GRANT EXECUTE ON FUNCTION match_founder_knowledge_base(vector, int, text, text) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION compute_w1_w4_retention()
RETURNS TABLE (activated bigint, retained bigint, retention_pct numeric)
LANGUAGE sql STABLE
AS $$
  WITH activated AS (
    SELECT al.user_id, u.created_at AS signup_date
    FROM activity_log al
    JOIN auth.users u ON u.id = al.user_id
    WHERE al.event_type IN ('task_accepted', 'task_completed', 'reflection_done')
      AND al.occurred_at BETWEEN u.created_at AND u.created_at + interval '7 days'
    GROUP BY al.user_id, u.created_at
    HAVING COUNT(*) >= 3
  ),
  retained AS (
    SELECT DISTINCT al.user_id
    FROM activity_log al
    JOIN activated a ON a.user_id = al.user_id
    WHERE al.occurred_at BETWEEN a.signup_date + interval '22 days' AND a.signup_date + interval '28 days'
      AND al.event_type IN ('task_accepted', 'task_completed', 'reflection_done')
  )
  SELECT
    COUNT(DISTINCT a.user_id) AS activated,
    COUNT(DISTINCT r.user_id) AS retained,
    ROUND(COUNT(DISTINCT r.user_id)::numeric / NULLIF(COUNT(DISTINCT a.user_id), 0) * 100, 1) AS retention_pct
  FROM activated a
  LEFT JOIN retained r ON r.user_id = a.user_id;
$$;

CREATE OR REPLACE FUNCTION compute_stage_advancement_rate()
RETURNS TABLE (active_founders bigint, advanced bigint, advancement_pct numeric)
LANGUAGE sql STABLE
AS $$
  WITH active_founders AS (
    SELECT DISTINCT user_id FROM activity_log
    WHERE occurred_at >= now() - interval '30 days'
      AND event_type IN ('task_accepted', 'task_completed', 'reflection_done')
  ),
  advanced AS (
    SELECT DISTINCT p.user_id
    FROM projects p
    JOIN active_founders af ON af.user_id = p.user_id
    WHERE jsonb_array_length(COALESCE(p.stage_history, '[]'::jsonb)) > 1
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p.stage_history, '[]'::jsonb)) AS h
        WHERE (h->>'set_at')::timestamptz >= now() - interval '30 days'
      )
  )
  SELECT
    COUNT(DISTINCT af.user_id) AS active_founders,
    COUNT(DISTINCT a.user_id) AS advanced,
    ROUND(COUNT(DISTINCT a.user_id)::numeric / NULLIF(COUNT(DISTINCT af.user_id), 0) * 100, 1) AS advancement_pct
  FROM active_founders af
  LEFT JOIN advanced a ON a.user_id = af.user_id;
$$;

CREATE OR REPLACE FUNCTION compute_behaviour_trajectory()
RETURNS TABLE (
  week_num int,
  avg_completion_rate numeric,
  avg_override_rate numeric,
  founder_count bigint
)
LANGUAGE sql STABLE
AS $$
  WITH weekly_rates AS (
    SELECT
      al.user_id,
      FLOOR(EXTRACT(EPOCH FROM (al.occurred_at - u.created_at)) / 604800)::int AS week_num,
      SUM(CASE WHEN al.event_type = 'task_completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN al.event_type = 'task_overridden' THEN 1 ELSE 0 END) AS overridden,
      SUM(CASE WHEN al.event_type IN ('task_accepted', 'task_overridden') THEN 1 ELSE 0 END) AS task_decisions,
      SUM(CASE WHEN al.event_type IN ('task_accepted', 'task_overridden', 'task_completed') THEN 1 ELSE 0 END) AS task_events
    FROM activity_log al
    JOIN auth.users u ON u.id = al.user_id
    GROUP BY al.user_id, FLOOR(EXTRACT(EPOCH FROM (al.occurred_at - u.created_at)) / 604800)::int
  )
  SELECT
    week_num,
    ROUND(AVG(completed::numeric / NULLIF(task_decisions, 0)) * 100, 1) AS avg_completion_rate,
    ROUND(AVG(overridden::numeric / NULLIF(task_events, 0)) * 100, 1) AS avg_override_rate,
    COUNT(DISTINCT user_id) AS founder_count
  FROM weekly_rates
  WHERE week_num IN (0, 3)
  GROUP BY week_num
  ORDER BY week_num;
$$;

GRANT EXECUTE ON FUNCTION compute_w1_w4_retention() TO service_role;
GRANT EXECUTE ON FUNCTION compute_stage_advancement_rate() TO service_role;
GRANT EXECUTE ON FUNCTION compute_behaviour_trajectory() TO service_role;
