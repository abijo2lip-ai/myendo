// Flointra — TypeScript types matching the database schema
// IMPORTANT: No calories, macros, weight, BMI, or "goal" fields anywhere.

// ─── User & Profile ───────────────────────────────────────────────

export type DiagnosisStatus = 'diagnosed' | 'suspected' | 'in_process';

export type SubscriptionTier = 'free' | 'premium';

export interface User {
  id: string;
  email: string;
  diagnosis_status: DiagnosisStatus;
  cycle_tracking_enabled: boolean;
  last_period_start_date: string | null; // ISO date
  avg_cycle_length_days: number;
  subscription_tier: SubscriptionTier;
  created_at: string; // ISO timestamptz
}

// ─── Symptom Logging ──────────────────────────────────────────────

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export type MoodScore = 1 | 2 | 3 | 4 | 5;
export type SleepScore = 1 | 2 | 3 | 4 | 5;
export type StressScore = 1 | 2 | 3 | 4 | 5;

export interface PainRegion {
  region: string;
  intensity: number; // 1–10
}

export interface SymptomLog {
  id: string;
  user_id: string;
  date: string; // ISO date
  pain_regions: PainRegion[];
  symptom_tags: string[];
  mood_score: MoodScore;
  sleep_score: SleepScore;
  stress_score: StressScore;
  cycle_day: number;
  cycle_phase: CyclePhase;
  note: string | null;
  created_at: string;
}

// ─── Food Logging ─────────────────────────────────────────────────

export type PostMealFeeling = 'better' | 'same' | 'worse';

export interface FoodLog {
  id: string;
  user_id: string;
  timestamp: string; // ISO timestamptz
  meal_name: string;
  photo_url: string | null;
  food_tags: string[];
  post_meal_feeling: PostMealFeeling | null;
  created_at: string;
}

// ─── Pattern Insights ─────────────────────────────────────────────

export interface PatternInsight {
  id: string;
  user_id: string;
  generated_at: string;
  food_tag: string;
  cycle_phase: string | null;
  symptom: string;
  correlation_strength: number;
  sample_size: number;
  insight_text: string;
}

// ─── Auth ─────────────────────────────────────────────────────────

export interface AuthState {
  session: import('@supabase/supabase-js').Session | null;
  user: import('@supabase/supabase-js').User | null;
  profile: User | null;
  isLoading: boolean;
}
