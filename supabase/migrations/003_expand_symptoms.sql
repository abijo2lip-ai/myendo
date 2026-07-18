-- Flointra — Expand symptom logging with energy score
-- Migration: 003_expand_symptoms
-- Description: Adds energy_score column to symptom_logs for expanded daily check-in.
-- CONSTRAINT: NO calorie, macro, weight, BMI, or goal fields anywhere.

ALTER TABLE symptom_logs
  ADD COLUMN IF NOT EXISTS energy_score INTEGER
  CHECK (energy_score IS NULL OR (energy_score >= 1 AND energy_score <= 5));

COMMENT ON COLUMN symptom_logs.energy_score IS 'Self-reported energy level: 1 (exhausted) to 5 (energized)';
