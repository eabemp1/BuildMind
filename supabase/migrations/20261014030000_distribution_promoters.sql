-- Let promoters (token-based helpers) use the Distribution Studio with their own private data.
ALTER TABLE dist_drafts        ADD COLUMN IF NOT EXISTS promoter_id uuid;
ALTER TABLE dist_conversations ADD COLUMN IF NOT EXISTS promoter_id uuid;
ALTER TABLE dist_experiments   ADD COLUMN IF NOT EXISTS promoter_id uuid;
CREATE INDEX IF NOT EXISTS dist_drafts_promoter_idx ON dist_drafts (promoter_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS dist_conv_promoter_idx   ON dist_conversations (promoter_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS dist_exp_promoter_idx    ON dist_experiments (promoter_id, updated_at DESC);
