-- Evidence discipline for agent findings: sources, counter-evidence, tier, provenance.
-- Safe to run more than once. The app falls back to the old shape if this has not run.
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS sources             jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS counter_evidence    text;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS assumptions         text;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS evidence_tier       text;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS source_count        integer NOT NULL DEFAULT 0;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS caveat              text;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS confirm_note        text;
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS confirmed_at        timestamptz;
-- source_type previously could not hold 'web_search' under some older constraints.
DO $$ BEGIN
  ALTER TABLE agent_findings DROP CONSTRAINT IF EXISTS agent_findings_source_type_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
