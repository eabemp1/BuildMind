-- Migration: add new founder_memory columns for weekly loop, initial analysis, and milestone break interstitial
-- These fields wire the Report → Today loop and the Break My Startup auto-trigger

-- Add last_week_summary (written by weekly-report API, read by today-action on Mondays)
ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS last_week_summary text DEFAULT NULL;

-- Add initial_analysis (written by initial-analysis API, cached per stage, shown on today page)
ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS initial_analysis text DEFAULT NULL;

-- Add pending_milestone_break (written by milestone-break API, cleared after acknowledgement)
-- Stores JSON with brutal points and recommended action shown as mandatory checkpoint
ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS pending_milestone_break text DEFAULT NULL;
