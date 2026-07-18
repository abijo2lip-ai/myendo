-- Flointra — Food Diary Enhancements
-- Migration: 004_food_diary_enhancements
-- Description: Adds post-meal symptom tracking to food_logs for qualitative check-ins.
-- CONSTRAINT: NO calorie, macro, weight, BMI, portion, or goal fields anywhere.

-- ───────────────────────────────────────────────────────────────────
-- Add post_meal_symptoms array to food_logs
-- Stores symptom tags attached during the post-meal check-in
-- (e.g. bloating, nausea, pain, etc.)
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE food_logs
  ADD COLUMN IF NOT EXISTS post_meal_symptoms TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN food_logs.post_meal_symptoms IS
  'Symptom tags recorded during post-meal check-in (bloating, nausea, pain, etc.)';

-- ───────────────────────────────────────────────────────────────────
-- Supabase Storage bucket for meal photos
-- NOTE: This bucket must be created via the Supabase dashboard or
-- client-side with:
--
--   supabase.storage.createBucket('meal-photos', {
--     public: true,
--     fileSizeLimit: 5242880, -- 5MB
--     allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
--   })
--
-- Then set RLS policy:
--   CREATE POLICY "Users can upload own meal photos"
--     ON storage.objects FOR INSERT
--     WITH CHECK (auth.uid() = owner);
--   CREATE POLICY "Meal photos are publicly readable"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'meal-photos');
-- ───────────────────────────────────────────────────────────────────
