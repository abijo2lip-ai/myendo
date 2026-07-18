-- Flointra — Add symptom checklist to users
-- Migration: 002_add_checklist
-- Description: Adds symptom_checklist TEXT[] column to users table for onboarding preferences.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS symptom_checklist TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN users.symptom_checklist IS 'User-selected symptom tags from onboarding checklist';
