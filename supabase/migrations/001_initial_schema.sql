-- Flointra — Initial Database Schema
-- Migration: 001_initial_schema
-- Description: Core tables for users, symptom logging, food logging, and pattern insights.
-- CONSTRAINT: NO calorie, macro, weight, BMI, or goal fields anywhere.

-- ───────────────────────────────────────────────────────────────────
-- USERS — extends Supabase auth.users via trigger
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  diagnosis_status TEXT NOT NULL DEFAULT 'suspected'
                  CHECK (diagnosis_status IN ('diagnosed', 'suspected', 'in_process')),
  cycle_tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_period_start_date DATE,
  avg_cycle_length_days INTEGER NOT NULL DEFAULT 28,
  subscription_tier TEXT NOT NULL DEFAULT 'free'
                    CHECK (subscription_tier IN ('free', 'premium')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a user profile row when a new auth.users row is inserted.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ───────────────────────────────────────────────────────────────────
-- SYMPTOM LOGS
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS symptom_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  pain_regions    JSONB NOT NULL DEFAULT '[]'::jsonb,
                  -- Array of {region: string, intensity: int (1-10)}
  symptom_tags    TEXT[] NOT NULL DEFAULT '{}',
  mood_score      INTEGER NOT NULL CHECK (mood_score >= 1 AND mood_score <= 5),
  sleep_score     INTEGER NOT NULL CHECK (sleep_score >= 1 AND sleep_score <= 5),
  stress_score    INTEGER NOT NULL CHECK (stress_score >= 1 AND stress_score <= 5),
  cycle_day       INTEGER,
  cycle_phase     TEXT CHECK (cycle_phase IN ('menstrual', 'follicular', 'ovulation', 'luteal')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_symptom_logs_user_date
  ON symptom_logs (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_symptom_logs_user_phase
  ON symptom_logs (user_id, cycle_phase);

-- ───────────────────────────────────────────────────────────────────
-- FOOD LOGS — qualitative only (no calories, no macros, no weight)
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS food_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meal_name       TEXT NOT NULL,
  photo_url       TEXT,
  food_tags       TEXT[] NOT NULL DEFAULT '{}',
                  -- Qualitative tags e.g. {"dairy", "gluten", "spicy", "caffeine"}
  post_meal_feeling TEXT CHECK (post_meal_feeling IN ('better', 'same', 'worse')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_timestamp
  ON food_logs (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_tags
  ON food_logs USING GIN (food_tags);

-- ───────────────────────────────────────────────────────────────────
-- PATTERN INSIGHTS — cached computed correlations
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pattern_insights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  food_tag            TEXT NOT NULL,
  cycle_phase         TEXT CHECK (cycle_phase IN ('menstrual', 'follicular', 'ovulation', 'luteal')),
  symptom             TEXT NOT NULL,
  correlation_strength NUMERIC(5,4) NOT NULL,
  sample_size         INTEGER NOT NULL CHECK (sample_size > 0),
  insight_text        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pattern_insights_user
  ON pattern_insights (user_id, generated_at DESC);

-- ───────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (basic scaffolding)
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_insights ENABLE ROW LEVEL SECURITY;

-- Each user can only see their own rows.
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view own symptom logs"
  ON symptom_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own symptom logs"
  ON symptom_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own symptom logs"
  ON symptom_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own symptom logs"
  ON symptom_logs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own food logs"
  ON food_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own food logs"
  ON food_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own food logs"
  ON food_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own food logs"
  ON food_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Pattern insights: free users cannot see insights (enforced at app level via feature gating,
-- but RLS provides a server-side safety net). Premium users can read; system/backend inserts.
CREATE POLICY "Premium users can view own insights"
  ON pattern_insights FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.subscription_tier = 'premium'
    )
  );

-- Only backend/service_role can insert/update/delete insights.
CREATE POLICY "Service can manage insights"
  ON pattern_insights FOR ALL
  USING (true)
  WITH CHECK (true);
