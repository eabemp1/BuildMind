-- Migration: 20260511000000_performance_indexes.sql
--
-- Performance indexes for all tables queried by user_id or project_id.
-- Without these, every SELECT on reflections, tasks, milestones, founder_context,
-- etc. performs a full table scan. Fine at <100 users; painful at 500+.
--
-- All CREATE INDEX calls use IF NOT EXISTS so this migration is safe to re-run.
-- Some tables (morning_briefings, notifications) already had indexes in schema-idempotent.sql;
-- those are omitted here to avoid conflicts.

-- ── projects ─────────────────────────────────────────────────────────────────
-- /today, /overview, /projects — all filter by user_id, often with updated_at ORDER BY
CREATE INDEX IF NOT EXISTS idx_projects_user_id
  ON projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON projects(user_id, updated_at DESC);

-- ── milestones ────────────────────────────────────────────────────────────────
-- today-action, break-my-startup — filter by project_id, order by created_at
CREATE INDEX IF NOT EXISTS idx_milestones_project_id
  ON milestones(project_id);

CREATE INDEX IF NOT EXISTS idx_milestones_project_created
  ON milestones(project_id, created_at ASC);

-- today-action also filters by user_id directly for some queries
CREATE INDEX IF NOT EXISTS idx_milestones_user_id
  ON milestones(user_id);

-- ── tasks ─────────────────────────────────────────────────────────────────────
-- today-action batches by milestone_id; break-my-startup .in(milestoneIds)
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id
  ON tasks(milestone_id);

-- Partial index: pending tasks only — used by today-action and urgency scoring
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_pending
  ON tasks(milestone_id) WHERE NOT is_completed;

CREATE INDEX IF NOT EXISTS idx_tasks_user_id
  ON tasks(user_id);

-- ── reflections ───────────────────────────────────────────────────────────────
-- today-action — SELECT ... WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
-- This is the most frequently executed query in the whole app (every /today load).
CREATE INDEX IF NOT EXISTS idx_reflections_user_created
  ON reflections(user_id, created_at DESC);

-- reflexion quality log lookups by project
CREATE INDEX IF NOT EXISTS idx_reflections_project_id
  ON reflections(project_id);

-- ── founder_context ───────────────────────────────────────────────────────────
-- morning briefing, evening check, today-action — all look up by user_id
CREATE INDEX IF NOT EXISTS idx_founder_context_user_id
  ON founder_context(user_id);

-- ── founder_memory ────────────────────────────────────────────────────────────
-- today-action parallel fetch — WHERE user_id = ? (maybeSingle)
CREATE INDEX IF NOT EXISTS idx_founder_memory_user_id
  ON founder_memory(user_id);

-- ── ai_usage ─────────────────────────────────────────────────────────────────
-- enforceAndTrackAIUsage — filter by user_id + month
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month
  ON ai_usage(user_id, month);

-- ── reflexion_learning_log ────────────────────────────────────────────────────
-- lib/learning.ts — SELECT last 20 rows WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reflexion_learning_log_user_created
  ON reflexion_learning_log(user_id, created_at DESC);

-- Partial index: pending rows only — markIgnoredAfter24h queries these
CREATE INDEX IF NOT EXISTS idx_reflexion_learning_log_pending
  ON reflexion_learning_log(user_id, created_at DESC) WHERE outcome = 'pending';

-- ── reflexion_quality_log ────────────────────────────────────────────────────
-- admin/quality page — filter by user_id, project_id, created_at
CREATE INDEX IF NOT EXISTS idx_reflexion_quality_log_user_created
  ON reflexion_quality_log(user_id, created_at DESC);

-- ── push_subscriptions ────────────────────────────────────────────────────────
-- evening-check cron — WHERE user_id = ANY(activeUserIds)
-- schema-idempotent.sql already has the unique endpoint index;
-- add a plain user_id index for the cron batch lookup
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

-- ── notifications ─────────────────────────────────────────────────────────────
-- NotificationBell component — WHERE user_id = ? AND NOT is_read
-- schema-idempotent.sql already has: idx notifications_user_unread WHERE NOT is_read
-- Add a broader user+created index for the full notification list page
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- ── ventures_blueprints ───────────────────────────────────────────────────────
-- my-ventures page — WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_ventures_blueprints_user_created
  ON ventures_blueprints(user_id, created_at DESC);
