-- Lets the automatic founder-memory reclassification know which rows are already
-- classified by the current classifier version, so it can skip them cheaply.
ALTER TABLE public.founder_memory
  ADD COLUMN IF NOT EXISTS zones_classifier_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zones_classified_at timestamptz;
