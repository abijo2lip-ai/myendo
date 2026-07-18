-- Flointra — Settings & Notification Preferences
-- Migration: 005_settings_prefs
-- Description: Adds notification preference columns to the users table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reminder_time TIME NOT NULL DEFAULT '20:00';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS post_meal_nudge_enabled BOOLEAN NOT NULL DEFAULT true;
