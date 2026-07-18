// Flointra — Pattern Insights Engine
// Rule-based correlation detection between food tags, symptoms, and cycle phases.
// CONSTRAINT: NO calorie, macro, weight, BMI, diet, or goal language anywhere.

import { supabase } from './supabase';
import type { SymptomLog, FoodLog, PatternInsight, CyclePhase } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────

interface CorrelationInput {
  foodTag: string;
  symptom: string;
  cyclePhase: CyclePhase | null; // null = overall (all phases)
}

interface CorrelationResult {
  foodTag: string;
  symptom: string;
  cyclePhase: CyclePhase | null;
  correlationStrength: number;
  sampleSize: number;
  insightText: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTag(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPhase(phase: CyclePhase | null): string {
  if (!phase) return 'overall';
  const labels: Record<CyclePhase, string> = {
    menstrual: 'menstrual',
    follicular: 'follicular',
    ovulation: 'ovulation',
    luteal: 'luteal',
  };
  return labels[phase];
}

/**
 * Convert a food log timestamp to a date string (yyyy-MM-dd)
 * so we can align food logs with symptom logs by day.
 */
function foodLogDate(food: FoodLog): string {
  return food.timestamp.slice(0, 10);
}

// ─── Main Engine ────────────────────────────────────────────────────

/**
 * Generate pattern insights for a user.
 * Returns the top 20 correlations sorted by correlation_strength DESC.
 *
 * Caching: Only regenerates if the user's last generated_at is >24 hours old
 * or no insights exist yet.
 */
export async function generateInsights(userId: string): Promise<PatternInsight[]> {
  // ── Cache check ──────────────────────────────────────────────────
  const { data: latestInsight } = await supabase
    .from('pattern_insights')
    .select('generated_at')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestInsight?.generated_at) {
    const lastGen = new Date(latestInsight.generated_at).getTime();
    const now = Date.now();
    const hoursSince = (now - lastGen) / (1000 * 60 * 60);
    if (hoursSince < 24) {
      // Return cached insights
      const { data: cached } = await supabase
        .from('pattern_insights')
        .select('*')
        .eq('user_id', userId)
        .order('correlation_strength', { ascending: false })
        .limit(20);
      return (cached as PatternInsight[]) ?? [];
    }
  }

  // ── Fetch all data ───────────────────────────────────────────────
  const { data: symptomLogs } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  const { data: foodLogs } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });

  if (!symptomLogs || symptomLogs.length === 0) {
    return [];
  }

  const typedSymptoms = symptomLogs as SymptomLog[];
  const typedFoods = (foodLogs as FoodLog[]) ?? [];

  // ── Build per-day data map ───────────────────────────────────────
  // Map: date string → { symptoms: Set<string>, foodTags: Set<string>, cyclePhase, hasPainScore: number }
  interface DayData {
    symptoms: Set<string>;
    foodTags: Set<string>;
    cyclePhase: CyclePhase | null;
    painAvg: number; // average pain intensity across regions
  }

  const dayMap = new Map<string, DayData>();

  for (const log of typedSymptoms) {
    const day: DayData = {
      symptoms: new Set(log.symptom_tags ?? []),
      foodTags: new Set(),
      cyclePhase: log.cycle_phase ?? null,
      painAvg: 0,
    };

    if (log.pain_regions && log.pain_regions.length > 0) {
      const total = log.pain_regions.reduce((sum, r) => sum + (r.intensity ?? 0), 0);
      day.painAvg = total / log.pain_regions.length;
    }

    dayMap.set(log.date, day);
  }

  // Add food tags to the corresponding day
  for (const food of typedFoods) {
    const date = foodLogDate(food);
    let day = dayMap.get(date);
    if (!day) {
      day = {
        symptoms: new Set(),
        foodTags: new Set(),
        cyclePhase: null,
        painAvg: 0,
      };
      dayMap.set(date, day);
    }
    for (const tag of food.food_tags ?? []) {
      day.foodTags.add(tag);
    }
  }

  // ── Collect all unique food tags, symptoms, and phases ───────────
  const allFoodTags = new Set<string>();
  const allSymptoms = new Set<string>();
  const allPhases = new Set<CyclePhase | null>();
  allPhases.add(null); // overall

  for (const day of dayMap.values()) {
    for (const ft of day.foodTags) allFoodTags.add(ft);
    for (const s of day.symptoms) allSymptoms.add(s);
    if (day.cyclePhase) allPhases.add(day.cyclePhase);
  }

  // ── Compute correlations ─────────────────────────────────────────
  const results: CorrelationResult[] = [];
  const MIN_SAMPLE = 3;

  for (const foodTag of allFoodTags) {
    for (const symptom of allSymptoms) {
      for (const phase of allPhases) {
        // Filter days to this phase (or all days if phase is null)
        const phaseDays = [...dayMap.entries()].filter(
          ([, day]) => phase === null || day.cyclePhase === phase
        );

        // Days where this food tag was logged
        const daysWithFood = phaseDays.filter(([, day]) => day.foodTags.has(foodTag));
        // Days where this food tag was NOT logged (but other food may have been logged, or no food)
        const daysWithoutFood = phaseDays.filter(([, day]) => !day.foodTags.has(foodTag));

        if (daysWithFood.length < MIN_SAMPLE || daysWithoutFood.length < MIN_SAMPLE) {
          continue;
        }

        // Symptom occurrence: how often the symptom appeared on days with/without this food
        const symptomWith = daysWithFood.filter(([, day]) => day.symptoms.has(symptom)).length;
        const symptomWithout = daysWithoutFood.filter(([, day]) => day.symptoms.has(symptom)).length;

        const rateWith = symptomWith / daysWithFood.length;
        const rateWithout = symptomWithout / daysWithoutFood.length;

        // Avoid division by zero; if rateWithout is 0, use a small epsilon
        const epsilon = 0.001;
        const effectiveRateWithout = rateWithout === 0 ? epsilon : rateWithout;

        const correlationStrength = rateWith / effectiveRateWithout;

        // Only include meaningful correlations (strength > 1.0 = positive correlation)
        if (correlationStrength <= 1.0) continue;

        const sampleSize = daysWithFood.length + daysWithoutFood.length;

        // Generate human-readable insight text
        const pctIncrease = Math.round((correlationStrength - 1) * 100);
        let insightText: string;

        if (phase) {
          insightText = `${formatTag(symptom)} is reported ${pctIncrease}% more often on days you log ${formatTag(foodTag)} during your ${formatPhase(phase)} phase (based on ${sampleSize} logged days).`;
        } else {
          insightText = `${formatTag(symptom)} is reported ${pctIncrease}% more often on days you log ${formatTag(foodTag)} (based on ${sampleSize} logged days).`;
        }

        results.push({
          foodTag,
          symptom,
          cyclePhase: phase,
          correlationStrength: Math.round(correlationStrength * 10000) / 10000,
          sampleSize,
          insightText,
        });
      }
    }
  }

  // ── Sort and limit ───────────────────────────────────────────────
  results.sort((a, b) => b.correlationStrength - a.correlationStrength);
  const topResults = results.slice(0, 20);

  // ── Store in database (upsert) ───────────────────────────────────
  if (topResults.length > 0) {
    // Delete old insights for this user
    await supabase.from('pattern_insights').delete().eq('user_id', userId);

    // Insert new insights
    const toInsert = topResults.map((r) => ({
      user_id: userId,
      food_tag: r.foodTag,
      symptom: r.symptom,
      cycle_phase: r.cyclePhase,
      correlation_strength: r.correlationStrength,
      sample_size: r.sampleSize,
      insight_text: r.insightText,
    }));

    const { error } = await supabase.from('pattern_insights').insert(toInsert);
    if (error) {
      console.error('Error storing pattern insights:', error);
    }
  }

  // Return with proper IDs by re-fetching
  const { data: stored } = await supabase
    .from('pattern_insights')
    .select('*')
    .eq('user_id', userId)
    .order('correlation_strength', { ascending: false })
    .limit(20);

  return (stored as PatternInsight[]) ?? [];
}

/**
 * Get cached insights for a user (does NOT regenerate).
 */
export async function getCachedInsights(userId: string): Promise<PatternInsight[]> {
  const { data } = await supabase
    .from('pattern_insights')
    .select('*')
    .eq('user_id', userId)
    .order('correlation_strength', { ascending: false })
    .limit(20);

  return (data as PatternInsight[]) ?? [];
}

/**
 * Count how many distinct days the user has logged symptoms.
 */
export async function getLoggedDaysCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('symptom_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Get pain trend data for the chart.
 * Returns an array of { date, avgPain, cyclePhase } for the last 90 days.
 */
export async function getPainTrend(userId: string): Promise<
  { date: string; avgPain: number; cyclePhase: CyclePhase | null }[]
> {
  const { data } = await supabase
    .from('symptom_logs')
    .select('date, pain_regions, cycle_phase')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(90);

  if (!data) return [];

  return (data as Pick<SymptomLog, 'date' | 'pain_regions' | 'cycle_phase'>[]).map((log) => {
    let avgPain = 0;
    if (log.pain_regions && log.pain_regions.length > 0) {
      const total = log.pain_regions.reduce((sum, r) => sum + (r.intensity ?? 0), 0);
      avgPain = total / log.pain_regions.length;
    }
    return {
      date: log.date,
      avgPain: Math.round(avgPain * 10) / 10,
      cyclePhase: log.cycle_phase ?? null,
    };
  });
}
