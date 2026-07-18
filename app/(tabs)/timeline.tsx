import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
} from 'date-fns';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type {
  CyclePhase,
  SymptomLog,
  FoodLog,
  PainRegion,
  MoodScore,
  SleepScore,
  StressScore,
  EnergyScore,
  PostMealFeeling,
} from '@/types';

// ─── Constants ────────────────────────────────────────────────────────

const CALMING_PALETTE = {
  bg: '#FFFFFF',
  surface: '#F9F5FF',
  border: '#E8E0F0',
  primary: '#7C3AED',
  primaryLight: '#EDE4FA',
  heading: '#2D1B69',
  body: '#5C4A7A',
  muted: '#9B8AB5',
  tagBg: '#F5F0FF',
  tagBgActive: '#7C3AED',
  tagText: '#5C4A7A',
  tagTextActive: '#FFFFFF',
  painGreen: '#22C55E',
  painAmber: '#F59E0B',
  painRed: '#EF4444',
  painGray: '#D4C5E8',
};

// Cycle phase colors per task spec (bands on calendar)
const CYCLE_PHASE_BAND_COLORS: Record<CyclePhase, string> = {
  menstrual: '#E8505B', // pink
  follicular: '#7DD3FC', // light blue
  ovulation: '#A855F7', // purple
  luteal: '#C4B5FD', // lavender
};

const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

// ─── Cycle helpers ────────────────────────────────────────────────────

function calcCycleDay(
  lastPeriodDate: string | null,
  targetDate: string,
  cycleLength: number
): number {
  if (!lastPeriodDate || cycleLength <= 0) return 0;
  const start = parseISO(lastPeriodDate);
  const target = parseISO(targetDate);
  const diff = differenceInDays(target, start);
  if (diff < 0) return 0;
  return (diff % cycleLength) + 1;
}

function calcCyclePhase(cycleDay: number, cycleLength: number): CyclePhase | null {
  if (cycleDay <= 0) return null;
  const menstrualEnd = 5;
  const ovulationStart = Math.round(cycleLength / 2) - 1;
  const ovulationEnd = Math.round(cycleLength / 2) + 1;

  if (cycleDay <= menstrualEnd) return 'menstrual';
  if (cycleDay >= ovulationStart && cycleDay <= ovulationEnd) return 'ovulation';
  if (cycleDay > ovulationEnd) return 'luteal';
  return 'follicular';
}

// ─── Pain dot helpers ─────────────────────────────────────────────────

function getMaxPainIntensity(painRegions: PainRegion[]): number {
  if (!painRegions || painRegions.length === 0) return 0;
  return Math.max(...painRegions.map((r) => r.intensity));
}

function painDotColor(intensity: number): string {
  if (intensity === 0) return CALMING_PALETTE.painGray;
  if (intensity <= 3) return CALMING_PALETTE.painGreen;
  if (intensity <= 6) return CALMING_PALETTE.painAmber;
  return CALMING_PALETTE.painRed;
}

function painLabel(intensity: number): string {
  if (intensity === 0) return 'None';
  if (intensity <= 3) return 'Mild';
  if (intensity <= 6) return 'Moderate';
  return 'Severe';
}

// ─── Tag formatting ───────────────────────────────────────────────────

function formatTag(tag: string): string {
  return tag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Filter options ───────────────────────────────────────────────────

const SYMPTOM_FILTER_OPTIONS = [
  { key: 'pelvic_pain', label: 'Pelvic Pain' },
  { key: 'lower_back_pain', label: 'Lower Back Pain' },
  { key: 'bloating', label: 'Bloating' },
  { key: 'migraine', label: 'Migraine' },
  { key: 'headache', label: 'Headache' },
  { key: 'fatigue', label: 'Fatigue' },
  { key: 'nausea', label: 'Nausea' },
  { key: 'constipation', label: 'Constipation' },
  { key: 'diarrhea', label: 'Diarrhea' },
  { key: 'brain_fog', label: 'Brain Fog' },
  { key: 'mood_swings', label: 'Mood Swings' },
  { key: 'pain_during_sex', label: 'Pain During Sex' },
  { key: 'painful_periods', label: 'Painful Periods' },
  { key: 'heavy_bleeding', label: 'Heavy Bleeding' },
];

const FOOD_FILTER_OPTIONS = [
  { key: 'dairy', label: 'Dairy' },
  { key: 'gluten', label: 'Gluten' },
  { key: 'caffeine', label: 'Caffeine' },
  { key: 'alcohol', label: 'Alcohol' },
  { key: 'spicy_food', label: 'Spicy Food' },
  { key: 'processed_sugar', label: 'Processed Sugar' },
  { key: 'red_meat', label: 'Red Meat' },
  { key: 'soy', label: 'Soy' },
  { key: 'fried_food', label: 'Fried Food' },
  { key: 'high_fodmap', label: 'High-FODMAP' },
  { key: 'nightshades', label: 'Nightshades' },
];

const CYCLE_PHASE_FILTER_OPTIONS: { key: CyclePhase; label: string }[] = [
  { key: 'menstrual', label: 'Menstrual' },
  { key: 'follicular', label: 'Follicular' },
  { key: 'ovulation', label: 'Ovulation' },
  { key: 'luteal', label: 'Luteal' },
];

// ─── Types ────────────────────────────────────────────────────────────

type ViewMode = 'calendar' | 'list';

interface DaySummary {
  date: string;
  symptomLog: SymptomLog | null;
  foodLogs: FoodLog[];
  cycleDay: number;
  cyclePhase: CyclePhase | null;
  maxPain: number;
}

interface Filters {
  symptomTypes: string[];
  foodTags: string[];
  cyclePhases: CyclePhase[];
  painMin: number;
  painMax: number;
}

const DEFAULT_FILTERS: Filters = {
  symptomTypes: [],
  foodTags: [],
  cyclePhases: [],
  painMin: 0,
  painMax: 10,
};

const LIST_PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────

export default function TimelineScreen() {
  const { user, profile, isLoading: authLoading } = useAuth();

  // ─── View state ──────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [currentMonth, setCurrentMonth] = useState(todayStr);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);

  // ─── Filters ─────────────────────────────────────────────────────
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // ─── Data state ──────────────────────────────────────────────────
  const [monthSymptoms, setMonthSymptoms] = useState<Map<string, SymptomLog>>(new Map());
  const [monthFoods, setMonthFoods] = useState<Map<string, FoodLog[]>>(new Map());
  const [loadingMonth, setLoadingMonth] = useState(false);

  // List state
  const [listDays, setListDays] = useState<DaySummary[]>([]);
  const [listOffset, setListOffset] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [hasMoreList, setHasMoreList] = useState(true);

  // ─── Cycle ───────────────────────────────────────────────────────
  const cycleEnabled = profile?.cycle_tracking_enabled ?? true;
  const lastPeriodDate = profile?.last_period_start_date ?? null;
  const avgCycleLength = profile?.avg_cycle_length_days ?? 28;

  // ─── Fetch month data for calendar ───────────────────────────────
  const fetchMonthData = useCallback(async () => {
    if (!user) return;
    setLoadingMonth(true);
    try {
      const monthStart = format(startOfMonth(parseISO(currentMonth)), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(parseISO(currentMonth)), 'yyyy-MM-dd');

      // Extend a bit beyond month boundaries for edge visibility
      const calStart = format(startOfWeek(parseISO(monthStart), { weekStartsOn: 0 }), 'yyyy-MM-dd');
      const calEnd = format(endOfWeek(parseISO(monthEnd), { weekStartsOn: 0 }), 'yyyy-MM-dd');

      const [symptomRes, foodRes] = await Promise.all([
        supabase
          .from('symptom_logs')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', calStart)
          .lte('date', calEnd)
          .order('date', { ascending: true }),
        supabase
          .from('food_logs')
          .select('*')
          .eq('user_id', user.id)
          .gte('timestamp', `${calStart}T00:00:00Z`)
          .lte('timestamp', `${calEnd}T23:59:59Z`)
          .order('timestamp', { ascending: true }),
      ]);

      if (symptomRes.error) console.error('Error fetching symptoms:', symptomRes.error);
      if (foodRes.error) console.error('Error fetching foods:', foodRes.error);

      const symMap = new Map<string, SymptomLog>();
      (symptomRes.data ?? []).forEach((log: any) => {
        symMap.set(log.date, log as SymptomLog);
      });
      setMonthSymptoms(symMap);

      const foodMap = new Map<string, FoodLog[]>();
      (foodRes.data ?? []).forEach((log: any) => {
        const day = (log.timestamp as string).slice(0, 10);
        const existing = foodMap.get(day) ?? [];
        existing.push(log as FoodLog);
        foodMap.set(day, existing);
      });
      setMonthFoods(foodMap);
    } catch (err) {
      console.error('Error fetching month data:', err);
    } finally {
      setLoadingMonth(false);
    }
  }, [user, currentMonth]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  // ─── Fetch list data ─────────────────────────────────────────────
  const fetchListData = useCallback(
    async (reset: boolean) => {
      if (!user) return;
      setLoadingList(true);
      const offset = reset ? 0 : listOffset;
      try {
        const { data, error } = await supabase
          .from('symptom_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .range(offset, offset + LIST_PAGE_SIZE - 1);

        if (error) {
          console.error('Error fetching list:', error);
          return;
        }

        const logs = (data ?? []) as SymptomLog[];
        setHasMoreList(logs.length === LIST_PAGE_SIZE);

        // For each day, fetch food logs
        const days: DaySummary[] = [];
        for (const log of logs) {
          const { data: foods } = await supabase
            .from('food_logs')
            .select('*')
            .eq('user_id', user.id)
            .gte('timestamp', `${log.date}T00:00:00Z`)
            .lte('timestamp', `${log.date}T23:59:59Z`)
            .order('timestamp', { ascending: true });

          const cycleDay = calcCycleDay(lastPeriodDate, log.date, avgCycleLength);
          const phase = calcCyclePhase(cycleDay, avgCycleLength);

          days.push({
            date: log.date,
            symptomLog: log,
            foodLogs: (foods ?? []) as FoodLog[],
            cycleDay,
            cyclePhase: cycleEnabled ? phase : null,
            maxPain: getMaxPainIntensity(log.pain_regions ?? []),
          });
        }

        if (reset) {
          setListDays(days);
          setListOffset(logs.length);
        } else {
          setListDays((prev) => [...prev, ...days]);
          setListOffset((prev) => prev + logs.length);
        }
      } catch (err) {
        console.error('Error fetching list data:', err);
      } finally {
        setLoadingList(false);
      }
    },
    [user, listOffset, lastPeriodDate, avgCycleLength, cycleEnabled]
  );

  useEffect(() => {
    if (viewMode === 'list') {
      fetchListData(true);
    }
  }, [viewMode]);

  // ─── Filter application ──────────────────────────────────────────
  const hasActiveFilters = useMemo(() => {
    return (
      filters.symptomTypes.length > 0 ||
      filters.foodTags.length > 0 ||
      filters.cyclePhases.length > 0 ||
      filters.painMin > 0 ||
      filters.painMax < 10
    );
  }, [filters]);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  // ─── Calendar day filtering ──────────────────────────────────────
  const passesFilters = useCallback(
    (daySummary: DaySummary): boolean => {
      const sl = daySummary.symptomLog;
      const fls = daySummary.foodLogs;

      // Pain range filter
      if (daySummary.maxPain < filters.painMin || daySummary.maxPain > filters.painMax) {
        return false;
      }

      // Cycle phase filter
      if (
        filters.cyclePhases.length > 0 &&
        (!daySummary.cyclePhase || !filters.cyclePhases.includes(daySummary.cyclePhase))
      ) {
        return false;
      }

      // Symptom tag filter
      if (filters.symptomTypes.length > 0) {
        if (!sl || !sl.symptom_tags) return false;
        const hasAny = filters.symptomTypes.some((t) => sl.symptom_tags.includes(t));
        if (!hasAny) return false;
      }

      // Food tag filter
      if (filters.foodTags.length > 0) {
        if (fls.length === 0) return false;
        const hasAny = fls.some((fl) =>
          filters.foodTags.some((ft) => fl.food_tags.includes(ft))
        );
        if (!hasAny) return false;
      }

      return true;
    },
    [filters]
  );

  // ─── Build calendar markedDates ──────────────────────────────────
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const monthStart = format(startOfMonth(parseISO(currentMonth)), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(parseISO(currentMonth)), 'yyyy-MM-dd');
    const calStart = format(startOfWeek(parseISO(monthStart), { weekStartsOn: 0 }), 'yyyy-MM-dd');
    const calEnd = format(endOfWeek(parseISO(monthEnd), { weekStartsOn: 0 }), 'yyyy-MM-dd');

    const days = eachDayOfInterval({
      start: parseISO(calStart),
      end: parseISO(calEnd),
    });

    days.forEach((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const sl = monthSymptoms.get(dateStr) ?? null;
      const fls = monthFoods.get(dateStr) ?? [];
      const cycleDay = calcCycleDay(lastPeriodDate, dateStr, avgCycleLength);
      const phase = calcCyclePhase(cycleDay, avgCycleLength);

      const daySummary: DaySummary = {
        date: dateStr,
        symptomLog: sl,
        foodLogs: fls,
        cycleDay,
        cyclePhase: cycleEnabled ? phase : null,
        maxPain: getMaxPainIntensity(sl?.pain_regions ?? []),
      };

      const passes = !hasActiveFilters || passesFilters(daySummary);

      const dots: { key: string; color: string }[] = [];

      if (sl && passes) {
        const color = painDotColor(daySummary.maxPain);
        dots.push({ key: 'pain', color });
      } else if (!sl) {
        // No log — subtle gray dot
        if (!hasActiveFilters) {
          dots.push({ key: 'empty', color: CALMING_PALETTE.painGray });
        }
      }

      // Phase band — add a second dot with phase color if cycle tracking is on
      if (cycleEnabled && phase) {
        dots.push({ key: 'phase', color: CYCLE_PHASE_BAND_COLORS[phase] });
      }

      const isSelected = selectedDate === dateStr;

      marks[dateStr] = {
        dots,
        selected: isSelected,
        selectedColor: CALMING_PALETTE.primary,
      };
    });

    return marks;
  }, [
    currentMonth,
    monthSymptoms,
    monthFoods,
    lastPeriodDate,
    avgCycleLength,
    cycleEnabled,
    hasActiveFilters,
    passesFilters,
    selectedDate,
  ]);

  // ─── Selected day modal data ─────────────────────────────────────
  const selectedDaySummary = useMemo((): DaySummary | null => {
    if (!selectedDate) return null;
    const sl = monthSymptoms.get(selectedDate) ?? null;
    const fls = monthFoods.get(selectedDate) ?? [];
    const cycleDay = calcCycleDay(lastPeriodDate, selectedDate, avgCycleLength);
    const phase = calcCyclePhase(cycleDay, avgCycleLength);
    return {
      date: selectedDate,
      symptomLog: sl,
      foodLogs: fls,
      cycleDay,
      cyclePhase: cycleEnabled ? phase : null,
      maxPain: getMaxPainIntensity(sl?.pain_regions ?? []),
    };
  }, [selectedDate, monthSymptoms, monthFoods, lastPeriodDate, avgCycleLength, cycleEnabled]);

  // ─── Handlers ────────────────────────────────────────────────────
  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    setShowDayModal(true);
  };

  const handleMonthChange = (month: DateData) => {
    setCurrentMonth(`${month.year}-${String(month.month).padStart(2, '0')}-01`);
  };

  const handleViewFullDay = () => {
    setShowDayModal(false);
    setViewMode('list');
  };

  const handleLoadMore = () => {
    if (!hasMoreList || loadingList) return;
    fetchListData(false);
  };

  const toggleFilter = <K extends keyof Filters>(
    key: K,
    value: Filters[K] extends (infer U)[] ? U : never
  ) => {
    setFilters((prev) => {
      const arr = prev[key] as any[];
      const exists = arr.includes(value);
      return {
        ...prev,
        [key]: exists ? arr.filter((v: any) => v !== value) : [...arr, value],
      };
    });
  };

  // ─── Loading state ───────────────────────────────────────────────
  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CALMING_PALETTE.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Helper sub-components ───────────────────────────────────────

  const renderMoodEmoji = (score: number) => {
    const emojis = ['😔', '😐', '🙂', '😊', '💜'];
    return emojis[score - 1] ?? '🙂';
  };

  const renderScoreDots = (score: number, max: number = 5) => {
    return (
      <View style={styles.dotsRow}>
        {Array.from({ length: max }, (_, i) => (
          <View
            key={i}
            style={[
              styles.miniDot,
              {
                backgroundColor:
                  i < score ? CALMING_PALETTE.primary : CALMING_PALETTE.border,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  const renderPostMealFeeling = (feeling: PostMealFeeling | null) => {
    if (!feeling) return null;
    const map: Record<PostMealFeeling, { emoji: string; color: string }> = {
      better: { emoji: '😊', color: CALMING_PALETTE.painGreen },
      same: { emoji: '😐', color: CALMING_PALETTE.muted },
      worse: { emoji: '😟', color: CALMING_PALETTE.painRed },
    };
    const f = map[feeling];
    return (
      <View style={[styles.feelingBadge, { backgroundColor: f.color + '18' }]}>
        <Text style={[styles.feelingBadgeText, { color: f.color }]}>
          {f.emoji} {feeling}
        </Text>
      </View>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* ════════════════════════════════════════════════════════════
          HEADER: View toggle + filter button
          ════════════════════════════════════════════════════════════ */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Timeline</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setShowFilters(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.filterBtnText}>
              {hasActiveFilters ? '🔍 Filters active' : '🔍 Filters'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* View toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'calendar' && styles.toggleBtnActive]}
          onPress={() => setViewMode('calendar')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.toggleBtnText,
              viewMode === 'calendar' && styles.toggleBtnTextActive,
            ]}
          >
            📅 Calendar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
          onPress={() => setViewMode('list')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.toggleBtnText,
              viewMode === 'list' && styles.toggleBtnTextActive,
            ]}
          >
            📋 List
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <View style={styles.activeFiltersRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {filters.symptomTypes.map((t) => (
              <View key={`sym-${t}`} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{formatTag(t)}</Text>
              </View>
            ))}
            {filters.foodTags.map((t) => (
              <View key={`food-${t}`} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{formatTag(t)}</Text>
              </View>
            ))}
            {filters.cyclePhases.map((p) => (
              <View key={`phase-${p}`} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{CYCLE_PHASE_LABELS[p]}</Text>
              </View>
            ))}
            {filters.painMin > 0 && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Pain ≥ {filters.painMin}</Text>
              </View>
            )}
            {filters.painMax < 10 && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>Pain ≤ {filters.painMax}</Text>
              </View>
            )}
          </ScrollView>
          <TouchableOpacity onPress={clearFilters} activeOpacity={0.7}>
            <Text style={styles.clearFiltersText}>Clear all</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ════════════════════════════════════════════════════════════
          CALENDAR VIEW
          ════════════════════════════════════════════════════════════ */}
      {viewMode === 'calendar' && (
        <View style={styles.calendarContainer}>
          {loadingMonth && (
            <ActivityIndicator
              size="small"
              color={CALMING_PALETTE.primary}
              style={styles.calendarLoader}
            />
          )}
          <Calendar
            current={currentMonth}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            markedDates={markedDates}
            markingType="multi-dot"
            theme={{
              backgroundColor: CALMING_PALETTE.bg,
              calendarBackground: CALMING_PALETTE.bg,
              textSectionTitleColor: CALMING_PALETTE.muted,
              selectedDayBackgroundColor: CALMING_PALETTE.primary,
              selectedDayTextColor: '#FFFFFF',
              todayTextColor: CALMING_PALETTE.primary,
              dayTextColor: CALMING_PALETTE.body,
              textDisabledColor: '#D4C5E8',
              dotColor: CALMING_PALETTE.primary,
              selectedDotColor: '#FFFFFF',
              arrowColor: CALMING_PALETTE.primary,
              monthTextColor: CALMING_PALETTE.heading,
              textMonthFontWeight: '700',
              textDayFontSize: 14,
              textMonthFontSize: 16,
            }}
          />

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CALMING_PALETTE.painGreen }]} />
              <Text style={styles.legendText}>Mild (0–3)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CALMING_PALETTE.painAmber }]} />
              <Text style={styles.legendText}>Moderate (4–6)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CALMING_PALETTE.painRed }]} />
              <Text style={styles.legendText}>Severe (7–10)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CALMING_PALETTE.painGray }]} />
              <Text style={styles.legendText}>No log</Text>
            </View>
          </View>

          {/* Empty state hint */}
          {monthSymptoms.size === 0 && !loadingMonth && (
            <View style={styles.emptyCalendarHint}>
              <Text style={styles.emptyText}>
                Start logging to see your timeline
              </Text>
              <Text style={styles.emptySubtext}>
                Your daily symptom and food logs will appear here as colored dots on the calendar.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ════════════════════════════════════════════════════════════
          LIST VIEW
          ════════════════════════════════════════════════════════════ */}
      {viewMode === 'list' && (
        <FlatList
          data={listDays}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loadingList ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={CALMING_PALETTE.primary} />
              </View>
            ) : (
              <View style={styles.emptyList}>
                <Text style={styles.emptyText}>
                  Start logging to see your timeline
                </Text>
                <Text style={styles.emptySubtext}>
                  Log your symptoms and meals on the Today and Food tabs to build your history.
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const day = item;
            const sl = day.symptomLog;
            const isCurrentWeek =
              index === 0 ||
              (() => {
                if (index === 0) return true;
                const prev = listDays[index - 1];
                const thisWeek = format(parseISO(day.date), 'w');
                const prevWeek = format(parseISO(prev.date), 'w');
                const thisYear = format(parseISO(day.date), 'yyyy');
                const prevYear = format(parseISO(prev.date), 'yyyy');
                return thisWeek === prevWeek && thisYear === prevYear;
              })();

            return (
              <View>
                {/* Week header */}
                {isCurrentWeek && (
                  <Text style={styles.weekHeader}>
                    Week of {format(parseISO(day.date), 'MMM d, yyyy')}
                  </Text>
                )}

                {/* Day card */}
                <TouchableOpacity
                  style={styles.dayCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedDate(day.date);
                    setShowDayModal(true);
                  }}
                >
                  {/* Card header: date + cycle */}
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardDate}>
                        {format(parseISO(day.date), 'EEEE, MMMM d')}
                      </Text>
                      {day.cyclePhase && day.cycleDay > 0 && (
                        <Text style={styles.cardCycle}>
                          Day {day.cycleDay} · {CYCLE_PHASE_LABELS[day.cyclePhase]}
                        </Text>
                      )}
                    </View>
                    <View style={styles.cardPainBadge}>
                      <View
                        style={[
                          styles.painDotBig,
                          { backgroundColor: painDotColor(day.maxPain) },
                        ]}
                      />
                      <Text style={styles.cardPainLabel}>
                        {painLabel(day.maxPain)}
                      </Text>
                    </View>
                  </View>

                  {/* Pain summary */}
                  <View style={styles.cardSection}>
                    {sl && sl.pain_regions && sl.pain_regions.length > 0 ? (
                      <Text style={styles.cardBody}>
                        Pain:{' '}
                        {sl.pain_regions
                          .map((r) => `${formatTag(r.region)} (${r.intensity})`)
                          .join(', ')}
                      </Text>
                    ) : (
                      <Text style={styles.cardMuted}>No pain logged</Text>
                    )}
                  </View>

                  {/* Symptom tags */}
                  {sl && sl.symptom_tags && sl.symptom_tags.length > 0 && (
                    <View style={styles.cardSection}>
                      <Text style={styles.cardLabel}>
                        {sl.symptom_tags.length} symptom{sl.symptom_tags.length > 1 ? 's' : ''}
                      </Text>
                      <View style={styles.cardChipRow}>
                        {sl.symptom_tags.slice(0, 3).map((tag) => (
                          <View key={tag} style={styles.cardChip}>
                            <Text style={styles.cardChipText}>{formatTag(tag)}</Text>
                          </View>
                        ))}
                        {sl.symptom_tags.length > 3 && (
                          <Text style={styles.cardChipMore}>
                            +{sl.symptom_tags.length - 3} more
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Quick ratings */}
                  {sl && (
                    <View style={styles.cardSection}>
                      <View style={styles.quickRatingRow}>
                        <View style={styles.quickRating}>
                          <Text style={styles.quickRatingEmoji}>
                            {renderMoodEmoji(sl.mood_score)}
                          </Text>
                          <Text style={styles.quickRatingLabel}>Mood</Text>
                        </View>
                        <View style={styles.quickRating}>
                          <Text style={styles.quickRatingValue}>😴</Text>
                          <Text style={styles.quickRatingLabel}>Sleep</Text>
                          {renderScoreDots(sl.sleep_score)}
                        </View>
                        <View style={styles.quickRating}>
                          <Text style={styles.quickRatingValue}>⚡</Text>
                          <Text style={styles.quickRatingLabel}>Stress</Text>
                          {renderScoreDots(sl.stress_score)}
                        </View>
                        {sl.energy_score && (
                          <View style={styles.quickRating}>
                            <Text style={styles.quickRatingValue}>🔋</Text>
                            <Text style={styles.quickRatingLabel}>Energy</Text>
                            {renderScoreDots(sl.energy_score)}
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Meals summary */}
                  <View style={styles.cardSection}>
                    <Text style={styles.cardLabel}>
                      {day.foodLogs.length} meal{day.foodLogs.length !== 1 ? 's' : ''} logged
                    </Text>
                    {day.foodLogs.length > 0 && (
                      <View style={styles.cardChipRow}>
                        {(() => {
                          const allTags = new Set<string>();
                          day.foodLogs.forEach((fl) =>
                            fl.food_tags.forEach((t) => allTags.add(t))
                          );
                          return Array.from(allTags)
                            .slice(0, 4)
                            .map((tag) => (
                              <View key={tag} style={[styles.cardChip, styles.cardChipFood]}>
                                <Text style={styles.cardChipText}>{formatTag(tag)}</Text>
                              </View>
                            ));
                        })()}
                        {(() => {
                          const allTags = new Set<string>();
                          day.foodLogs.forEach((fl) =>
                            fl.food_tags.forEach((t) => allTags.add(t))
                          );
                          return allTags.size > 4 ? (
                            <Text style={styles.cardChipMore}>+{allTags.size - 4}</Text>
                          ) : null;
                        })()}
                      </View>
                    )}
                  </View>

                  <Text style={styles.cardTapHint}>Tap for details →</Text>
                </TouchableOpacity>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={styles.listFooter}>
              {hasMoreList && !loadingList && (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  onPress={handleLoadMore}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loadMoreText}>Load more days</Text>
                </TouchableOpacity>
              )}
              {loadingList && (
                <ActivityIndicator size="small" color={CALMING_PALETTE.primary} />
              )}
            </View>
          }
        />
      )}

      {/* Disclaimer */}
      <Text style={styles.disclaimer}>
        ⚕️ Flointra is a tracking tool, not a medical diagnosis. Always discuss your
        findings with your healthcare provider.
      </Text>

      {/* ════════════════════════════════════════════════════════════
          DAY SUMMARY MODAL (Bottom Sheet style)
          ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showDayModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDayModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDayModal(false)}
        >
          <Pressable style={styles.dayModal} onPress={() => {}}>
            <View style={styles.modalHandle} />

            {selectedDaySummary ? (
              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
                {(() => {
                  const d = selectedDaySummary;
                  const sl = d.symptomLog;

                  return (
                    <>
                      {/* Date + cycle */}
                      <Text style={styles.modalDate}>
                        {format(parseISO(d.date), 'EEEE, MMMM d, yyyy')}
                      </Text>
                      {d.cyclePhase && d.cycleDay > 0 && (
                        <View style={styles.modalCycleRow}>
                          <View
                            style={[
                              styles.modalPhaseBadge,
                              {
                                backgroundColor:
                                  CYCLE_PHASE_BAND_COLORS[d.cyclePhase] + '30',
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.phaseDot,
                                {
                                  backgroundColor:
                                    CYCLE_PHASE_BAND_COLORS[d.cyclePhase],
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.modalPhaseText,
                                { color: CYCLE_PHASE_BAND_COLORS[d.cyclePhase] },
                              ]}
                            >
                              Day {d.cycleDay} · {CYCLE_PHASE_LABELS[d.cyclePhase]}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Pain regions */}
                      <Text style={styles.modalSectionTitle}>Pain Regions</Text>
                      {sl && sl.pain_regions && sl.pain_regions.length > 0 ? (
                        sl.pain_regions.map((r, i) => (
                          <View key={i} style={styles.modalPainRow}>
                            <Text style={styles.modalBody}>
                              {formatTag(r.region)}
                            </Text>
                            <View style={styles.modalPainBar}>
                              <View
                                style={[
                                  styles.modalPainFill,
                                  {
                                    width: `${(r.intensity / 10) * 100}%`,
                                    backgroundColor: painDotColor(r.intensity),
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.modalPainNum}>
                              {r.intensity}/10
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.modalMuted}>No pain logged</Text>
                      )}

                      {/* Symptom tags */}
                      <Text style={styles.modalSectionTitle}>Symptoms</Text>
                      {sl && sl.symptom_tags && sl.symptom_tags.length > 0 ? (
                        <View style={styles.modalChipRow}>
                          {sl.symptom_tags.map((tag) => (
                            <View key={tag} style={styles.cardChip}>
                              <Text style={styles.cardChipText}>
                                {formatTag(tag)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.modalMuted}>No symptoms logged</Text>
                      )}

                      {/* Quick ratings */}
                      <Text style={styles.modalSectionTitle}>How you felt</Text>
                      {sl ? (
                        <View style={styles.modalRatingGrid}>
                          <View style={styles.modalRatingItem}>
                            <Text style={styles.modalRatingLabel}>Mood</Text>
                            <Text style={styles.modalRatingValue}>
                              {renderMoodEmoji(sl.mood_score)} {sl.mood_score}/5
                            </Text>
                          </View>
                          <View style={styles.modalRatingItem}>
                            <Text style={styles.modalRatingLabel}>Sleep</Text>
                            <Text style={styles.modalRatingValue}>
                              {sl.sleep_score}/5
                            </Text>
                          </View>
                          <View style={styles.modalRatingItem}>
                            <Text style={styles.modalRatingLabel}>Stress</Text>
                            <Text style={styles.modalRatingValue}>
                              {sl.stress_score}/5
                            </Text>
                          </View>
                          {sl.energy_score && (
                            <View style={styles.modalRatingItem}>
                              <Text style={styles.modalRatingLabel}>Energy</Text>
                              <Text style={styles.modalRatingValue}>
                                {sl.energy_score}/5
                              </Text>
                            </View>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.modalMuted}>No ratings logged</Text>
                      )}

                      {/* Meals */}
                      <Text style={styles.modalSectionTitle}>
                        Meals ({d.foodLogs.length})
                      </Text>
                      {d.foodLogs.length > 0 ? (
                        d.foodLogs.map((fl, i) => (
                          <View key={fl.id} style={styles.modalMealRow}>
                            <View style={styles.modalMealHeader}>
                              <Text style={styles.modalMealName}>
                                {fl.meal_name}
                              </Text>
                              <Text style={styles.modalMealTime}>
                                {format(parseISO(fl.timestamp), 'h:mm a')}
                              </Text>
                            </View>
                            {fl.food_tags.length > 0 && (
                              <View style={styles.modalChipRow}>
                                {fl.food_tags.map((tag) => (
                                  <View
                                    key={tag}
                                    style={[styles.cardChip, styles.cardChipFood]}
                                  >
                                    <Text style={styles.cardChipText}>
                                      {formatTag(tag)}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                            {renderPostMealFeeling(fl.post_meal_feeling)}
                          </View>
                        ))
                      ) : (
                        <Text style={styles.modalMuted}>No meals logged</Text>
                      )}

                      {/* Note */}
                      {sl?.note && (
                        <>
                          <Text style={styles.modalSectionTitle}>Note</Text>
                          <View style={styles.modalNoteBox}>
                            <Text style={styles.modalNoteText}>{sl.note}</Text>
                          </View>
                        </>
                      )}
                    </>
                  );
                })()}

                {/* View full day button */}
                <TouchableOpacity
                  style={styles.viewFullDayBtn}
                  onPress={handleViewFullDay}
                  activeOpacity={0.8}
                >
                  <Text style={styles.viewFullDayText}>View full day in list</Text>
                </TouchableOpacity>

                {/* Modal disclaimer */}
                <Text style={styles.modalDisclaimer}>
                  ⚕️ This is not a medical diagnosis. Discuss patterns with your doctor.
                </Text>
              </ScrollView>
            ) : (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={CALMING_PALETTE.primary} />
              </View>
            )}

            {/* Close button */}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowDayModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          FILTERS MODAL
          ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowFilters(false)}
        >
          <Pressable style={styles.filterModal} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.filterModalTitle}>Filter Timeline</Text>
            <ScrollView
              style={styles.filterScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Symptom type filter */}
              <Text style={styles.modalSectionTitle}>Symptom Type</Text>
              <View style={styles.modalChipRow}>
                {SYMPTOM_FILTER_OPTIONS.map((opt) => {
                  const active = filters.symptomTypes.includes(opt.key);
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.filterOption,
                        active && styles.filterOptionActive,
                      ]}
                      onPress={() => toggleFilter('symptomTypes', opt.key)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          active && styles.filterOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Food tag filter */}
              <Text style={styles.modalSectionTitle}>Food Tags</Text>
              <View style={styles.modalChipRow}>
                {FOOD_FILTER_OPTIONS.map((opt) => {
                  const active = filters.foodTags.includes(opt.key);
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.filterOption,
                        active && styles.filterOptionActive,
                      ]}
                      onPress={() => toggleFilter('foodTags', opt.key)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          active && styles.filterOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Cycle phase filter */}
              <Text style={styles.modalSectionTitle}>Cycle Phase</Text>
              <View style={styles.modalChipRow}>
                {CYCLE_PHASE_FILTER_OPTIONS.map((opt) => {
                  const active = filters.cyclePhases.includes(opt.key);
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.filterOption,
                        active && styles.filterOptionActive,
                      ]}
                      onPress={() => toggleFilter('cyclePhases', opt.key)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          active && styles.filterOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Pain range filter */}
              <Text style={styles.modalSectionTitle}>Pain Severity Range</Text>
              <View style={styles.painRangeRow}>
                <TouchableOpacity
                  style={[
                    styles.painRangeBtn,
                    filters.painMin > 0 && styles.painRangeBtnActive,
                  ]}
                  onPress={() => {
                    const next =
                      filters.painMin >= 9 ? 0 : filters.painMin + 1;
                    setFilters((prev) => ({
                      ...prev,
                      painMin: next,
                      painMax: Math.max(prev.painMax, next),
                    }));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.painRangeBtnText}>
                    Min: {filters.painMin > 0 ? filters.painMin : 'Any'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.painRangeSep}>to</Text>
                <TouchableOpacity
                  style={[
                    styles.painRangeBtn,
                    filters.painMax < 10 && styles.painRangeBtnActive,
                  ]}
                  onPress={() => {
                    const next =
                      filters.painMax <= 1 ? 10 : filters.painMax - 1;
                    setFilters((prev) => ({
                      ...prev,
                      painMax: next,
                      painMin: Math.min(prev.painMin, next),
                    }));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.painRangeBtnText}>
                    Max: {filters.painMax < 10 ? filters.painMax : 'Any'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Filter actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.clearAllBtn}
                onPress={() => {
                  clearFilters();
                  setShowFilters(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.clearAllBtnText}>Clear all filters</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyFiltersBtn}
                onPress={() => setShowFilters(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.applyFiltersBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CALMING_PALETTE.bg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },

  // ─── Header ──────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: CALMING_PALETTE.heading,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.body,
  },

  // ─── Toggle ──────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: CALMING_PALETTE.primary,
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },

  // ─── Active filters ──────────────────────────────────────────────
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 8,
  },
  filterChip: {
    backgroundColor: CALMING_PALETTE.primaryLight,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },
  clearFiltersText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
    paddingHorizontal: 4,
  },

  // ─── Calendar ────────────────────────────────────────────────────
  calendarContainer: {
    paddingHorizontal: 12,
  },
  calendarLoader: {
    position: 'absolute',
    top: 30,
    right: 16,
    zIndex: 10,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
  },
  emptyCalendarHint: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },

  // ─── Empty state ─────────────────────────────────────────────────
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: CALMING_PALETTE.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },

  // ─── List view ───────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  weekHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: CALMING_PALETTE.muted,
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dayCard: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardDate: {
    fontSize: 16,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
  },
  cardCycle: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    marginTop: 2,
  },
  cardPainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  painDotBig: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  cardPainLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.body,
  },
  cardSection: {
    marginTop: 10,
  },
  cardBody: {
    fontSize: 14,
    color: CALMING_PALETTE.body,
    lineHeight: 20,
  },
  cardMuted: {
    fontSize: 14,
    color: CALMING_PALETTE.muted,
    fontStyle: 'italic',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  cardChip: {
    backgroundColor: CALMING_PALETTE.tagBg,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  cardChipFood: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  cardChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: CALMING_PALETTE.tagText,
  },
  cardChipMore: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
  },
  quickRatingRow: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  quickRating: {
    alignItems: 'center',
  },
  quickRatingEmoji: {
    fontSize: 18,
  },
  quickRatingValue: {
    fontSize: 16,
  },
  quickRatingLabel: {
    fontSize: 10,
    color: CALMING_PALETTE.muted,
    marginTop: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  miniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  feelingBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  feelingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardTapHint: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    textAlign: 'right',
    marginTop: 10,
  },
  listFooter: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadMoreBtn: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },

  // ─── Disclaimer ──────────────────────────────────────────────────
  disclaimer: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },

  // ─── Day Summary Modal ───────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 27, 105, 0.4)',
    justifyContent: 'flex-end',
  },
  dayModal: {
    backgroundColor: CALMING_PALETTE.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: CALMING_PALETTE.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalScroll: {
    paddingHorizontal: 20,
  },
  modalDate: {
    fontSize: 20,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 8,
  },
  modalCycleRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  modalPhaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 12,
    gap: 6,
  },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalPhaseText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginTop: 16,
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 15,
    color: CALMING_PALETTE.body,
    width: 120,
  },
  modalMuted: {
    fontSize: 14,
    color: CALMING_PALETTE.muted,
    fontStyle: 'italic',
  },
  modalPainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  modalPainBar: {
    flex: 1,
    height: 10,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 5,
    overflow: 'hidden',
  },
  modalPainFill: {
    height: '100%',
    borderRadius: 5,
  },
  modalPainNum: {
    fontSize: 13,
    fontWeight: '700',
    color: CALMING_PALETTE.body,
    width: 40,
    textAlign: 'right',
  },
  modalChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalRatingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  modalRatingItem: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 10,
    padding: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  modalRatingLabel: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    marginBottom: 4,
  },
  modalRatingValue: {
    fontSize: 16,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
  },
  modalMealRow: {
    marginBottom: 10,
  },
  modalMealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalMealName: {
    fontSize: 15,
    fontWeight: '600',
    color: CALMING_PALETTE.body,
  },
  modalMealTime: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
  },
  modalNoteBox: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 12,
    padding: 14,
  },
  modalNoteText: {
    fontSize: 14,
    color: CALMING_PALETTE.body,
    lineHeight: 20,
  },
  viewFullDayBtn: {
    backgroundColor: CALMING_PALETTE.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  viewFullDayText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalDisclaimer: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
  },
  modalCloseBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: CALMING_PALETTE.border,
    marginHorizontal: 20,
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },

  // ─── Filters Modal ───────────────────────────────────────────────
  filterModal: {
    backgroundColor: CALMING_PALETTE.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  filterOption: {
    backgroundColor: CALMING_PALETTE.tagBg,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    marginBottom: 6,
  },
  filterOptionActive: {
    backgroundColor: CALMING_PALETTE.tagBgActive,
    borderColor: CALMING_PALETTE.tagBgActive,
  },
  filterOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.tagText,
  },
  filterOptionTextActive: {
    color: CALMING_PALETTE.tagTextActive,
  },
  painRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  painRangeBtn: {
    flex: 1,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  painRangeBtnActive: {
    borderColor: CALMING_PALETTE.primary,
    backgroundColor: CALMING_PALETTE.primaryLight,
  },
  painRangeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.body,
  },
  painRangeSep: {
    fontSize: 14,
    color: CALMING_PALETTE.muted,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CALMING_PALETTE.border,
  },
  clearAllBtn: {
    flex: 1,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  clearAllBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
  },
  applyFiltersBtn: {
    flex: 1,
    backgroundColor: CALMING_PALETTE.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyFiltersBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
