import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import BodyMap from '@/components/BodyMap';
import type {
  CyclePhase,
  MoodScore,
  SleepScore,
  StressScore,
  EnergyScore,
  PainRegion,
  SymptomLog,
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
  chipBg: '#F5F0FF',
  chipBgActive: '#7C3AED',
  chipText: '#5C4A7A',
  chipTextActive: '#FFFFFF',
};

// ─── Symptom tag definitions ─────────────────────────────────────────

interface SymptomCategory {
  title: string;
  tags: string[];
}

const SYMPTOM_CATEGORIES: SymptomCategory[] = [
  {
    title: 'Pain & Core',
    tags: [
      'pelvic_pain',
      'lower_back_pain',
      'leg_pain',
      'abdominal_pain',
    ],
  },
  {
    title: 'Bowel & Digestion',
    tags: [
      'constipation',
      'diarrhea',
      'pain_with_bowel_movements',
      'bowel_urgency',
      'blood_in_stool',
      'bloating',
      'nausea',
    ],
  },
  {
    title: 'Bladder & Urinary',
    tags: [
      'bladder_pain',
      'urinary_frequency',
      'urinary_urgency',
      'pain_with_urination',
    ],
  },
  {
    title: 'Neurological',
    tags: ['migraine', 'headache', 'brain_fog'],
  },
  {
    title: 'Pelvic Floor & Sexual',
    tags: [
      'pelvic_floor_pain',
      'pain_during_sex',
      'pain_after_sex',
    ],
  },
  {
    title: 'Bleeding & Cycle',
    tags: [
      'heavy_bleeding',
      'spotting',
      'painful_periods',
      'bleeding_between_periods',
    ],
  },
  {
    title: 'Energy & Mood',
    tags: ['fatigue', 'mood_swings'],
  },
];

function formatTag(tag: string): string {
  return tag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Cycle helpers ────────────────────────────────────────────────────

function calcCycleDayExact(
  lastPeriodDate: string | null,
  selectedDate: string,
  cycleLength: number
): number {
  if (!lastPeriodDate || cycleLength <= 0) return 0;
  const start = parseISO(lastPeriodDate);
  const target = parseISO(selectedDate);
  const diff = differenceInDays(target, start);
  if (diff < 0) return 0;
  return (diff % cycleLength) + 1;
}

function calcCyclePhase(cycleDay: number, cycleLength: number): CyclePhase {
  if (cycleDay <= 0) return 'follicular';
  // Approximate phases based on cycle length
  const menstrualEnd = 5;
  const ovulationStart = Math.round(cycleLength / 2) - 1;
  const ovulationEnd = Math.round(cycleLength / 2) + 1;

  if (cycleDay <= menstrualEnd) return 'menstrual';
  if (cycleDay >= ovulationStart && cycleDay <= ovulationEnd) return 'ovulation';
  if (cycleDay > ovulationEnd) return 'luteal';
  return 'follicular';
}

const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

const CYCLE_PHASE_COLORS: Record<CyclePhase, string> = {
  menstrual: '#E8505B',
  follicular: '#4CAF50',
  ovulation: '#2196F3',
  luteal: '#FF9800',
};

// ─── Component ────────────────────────────────────────────────────────

export default function DailyLogScreen() {
  const { user, profile, isLoading: authLoading } = useAuth();

  // ─── Date state ─────────────────────────────────────────────────
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ─── Cycle ─────────────────────────────────────────────────────
  const cycleEnabled = profile?.cycle_tracking_enabled ?? true;
  const lastPeriodDate = profile?.last_period_start_date ?? null;
  const avgCycleLength = profile?.avg_cycle_length_days ?? 28;

  const cycleDay = useMemo(
    () => calcCycleDayExact(lastPeriodDate, selectedDate, avgCycleLength),
    [lastPeriodDate, selectedDate, avgCycleLength]
  );

  const cyclePhase = useMemo(
    () => calcCyclePhase(cycleDay, avgCycleLength),
    [cycleDay, avgCycleLength]
  );

  // ─── Form state ─────────────────────────────────────────────────
  const [painRegions, setPainRegions] = useState<PainRegion[]>([]);
  const [symptomTags, setSymptomTags] = useState<string[]>([]);
  const [moodScore, setMoodScore] = useState<MoodScore>(3);
  const [sleepScore, setSleepScore] = useState<SleepScore>(3);
  const [stressScore, setStressScore] = useState<StressScore>(3);
  const [energyScore, setEnergyScore] = useState<EnergyScore>(3);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);

  // ─── Load existing log for selected date ────────────────────────
  const loadLog = useCallback(async () => {
    if (!user) return;
    setLoadingLog(true);
    try {
      const { data, error } = await supabase
        .from('symptom_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', selectedDate)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading log:', error);
        return;
      }

      if (data) {
        const log = data as SymptomLog;
        setPainRegions(log.pain_regions ?? []);
        setSymptomTags(log.symptom_tags ?? []);
        setMoodScore(log.mood_score ?? 3);
        setSleepScore(log.sleep_score ?? 3);
        setStressScore(log.stress_score ?? 3);
        setEnergyScore((log.energy_score as EnergyScore) ?? 3);
        setNote(log.note ?? '');
        if (log.note) setNoteExpanded(true);
      } else {
        // Reset form for empty date
        resetForm();
      }
    } catch (err) {
      console.error('Error loading log:', err);
    } finally {
      setLoadingLog(false);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const resetForm = () => {
    setPainRegions([]);
    setSymptomTags([]);
    setMoodScore(3);
    setSleepScore(3);
    setStressScore(3);
    setEnergyScore(3);
    setNote('');
    setNoteExpanded(false);
    setSaved(false);
  };

  // ─── Pain region handlers ───────────────────────────────────────
  const handleRegionChange = useCallback(
    (regionId: string, intensity: number) => {
      setPainRegions((prev) => {
        const existing = prev.findIndex((r) => r.region === regionId);
        if (existing >= 0) {
          if (intensity <= 0) {
            return prev.filter((r) => r.region !== regionId);
          }
          const next = [...prev];
          next[existing] = { region: regionId, intensity };
          return next;
        }
        if (intensity <= 0) return prev;
        return [...prev, { region: regionId, intensity }];
      });
      setSaved(false);
    },
    []
  );

  const handleRegionRemove = useCallback((regionId: string) => {
    setPainRegions((prev) => prev.filter((r) => r.region !== regionId));
    setSaved(false);
  }, []);

  // ─── Symptom tag toggle ─────────────────────────────────────────
  const toggleTag = useCallback((tag: string) => {
    setSymptomTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setSaved(false);
  }, []);

  // ─── 5-point scale component ────────────────────────────────────
  const RatingScale = ({
    value,
    onChange,
    labels,
    emojis,
  }: {
    value: number;
    onChange: (v: any) => void;
    labels: string[];
    emojis?: string[];
  }) => (
    <View style={styles.ratingRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          style={[
            styles.ratingDot,
            {
              backgroundColor: n === value ? CALMING_PALETTE.primary : CALMING_PALETTE.border,
              borderColor: n === value ? CALMING_PALETTE.primary : CALMING_PALETTE.border,
            },
          ]}
          onPress={() => {
            onChange(n);
            setSaved(false);
          }}
          activeOpacity={0.7}
        >
          {emojis && (
            <Text style={styles.ratingEmoji}>{emojis[n - 1]}</Text>
          )}
          <Text
            style={[
              styles.ratingNumber,
              { color: n === value ? '#FFFFFF' : CALMING_PALETTE.muted },
            ]}
          >
            {n}
          </Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.ratingLabel}>{labels[value - 1]}</Text>
    </View>
  );

  // ─── Save ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        user_id: user.id,
        date: selectedDate,
        pain_regions: painRegions,
        symptom_tags: symptomTags,
        mood_score: moodScore,
        sleep_score: sleepScore,
        stress_score: stressScore,
        energy_score: energyScore,
        cycle_day: cycleEnabled && cycleDay > 0 ? cycleDay : null,
        cycle_phase: cycleEnabled ? cyclePhase : null,
        note: note.trim() || null,
      };

      // Upsert: check for existing log
      const { data: existing } = await supabase
        .from('symptom_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', selectedDate)
        .maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase
          .from('symptom_logs')
          .update(payload)
          .eq('id', existing.id));
      } else {
        ({ error } = await supabase
          .from('symptom_logs')
          .insert(payload));
      }

      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      console.error('Error saving log:', err?.message ?? err);
    } finally {
      setSaving(false);
    }
  }, [
    user,
    selectedDate,
    painRegions,
    symptomTags,
    moodScore,
    sleepScore,
    stressScore,
    energyScore,
    cycleEnabled,
    cycleDay,
    cyclePhase,
    note,
  ]);

  // ─── Date navigation ────────────────────────────────────────────
  const goToPrevDay = () => {
    const d = addDays(parseISO(selectedDate), -1);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
    setSaved(false);
  };
  const goToNextDay = () => {
    const next = addDays(parseISO(selectedDate), 1);
    const nextStr = format(next, 'yyyy-MM-dd');
    if (nextStr <= todayStr) {
      setSelectedDate(nextStr);
      setSaved(false);
    }
  };
  const isToday = selectedDate === todayStr;

  // ─── Loading states ─────────────────────────────────────────────
  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CALMING_PALETTE.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ════════════════════════════════════════════════════════
            SECTION 1: Date + Cycle
            ════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          {/* Date selector */}
          <View style={styles.dateRow}>
            <TouchableOpacity onPress={goToPrevDay} activeOpacity={0.6}>
              <Text style={styles.dateArrow}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dateText}>
                {format(parseISO(selectedDate), 'EEEE, MMMM d')}
              </Text>
              <Text style={styles.dateSubtext}>
                {isToday ? 'Today' : format(parseISO(selectedDate), 'yyyy')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goToNextDay}
              activeOpacity={isToday ? 1 : 0.6}
              disabled={isToday}
            >
              <Text
                style={[
                  styles.dateArrow,
                  isToday && styles.dateArrowDisabled,
                ]}
              >
                ›
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cycle info */}
          {cycleEnabled && cycleDay > 0 && (
            <View style={styles.cycleRow}>
              <View style={styles.cycleBadge}>
                <Text style={styles.cycleDayText}>Day {cycleDay}</Text>
              </View>
              <View
                style={[
                  styles.phaseBadge,
                  { backgroundColor: CYCLE_PHASE_COLORS[cyclePhase] + '20' },
                ]}
              >
                <View
                  style={[
                    styles.phaseDot,
                    { backgroundColor: CYCLE_PHASE_COLORS[cyclePhase] },
                  ]}
                />
                <Text
                  style={[
                    styles.phaseText,
                    { color: CYCLE_PHASE_COLORS[cyclePhase] },
                  ]}
                >
                  {CYCLE_PHASE_LABELS[cyclePhase]}
                </Text>
              </View>
            </View>
          )}
          {cycleEnabled && cycleDay === 0 && lastPeriodDate && (
            <Text style={styles.cycleNote}>
              Set your last period date for cycle tracking
            </Text>
          )}
        </View>

        {/* ════════════════════════════════════════════════════════
            SECTION 2: Pain Body Map
            ════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pain Map</Text>
          <Text style={styles.sectionSubtitle}>
            Tap a region to log pain intensity (0–10)
          </Text>
          <BodyMap
            selectedRegions={painRegions}
            onRegionChange={handleRegionChange}
            onRegionRemove={handleRegionRemove}
          />
        </View>

        {/* ════════════════════════════════════════════════════════
            SECTION 3: Symptom Tags
            ════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Symptoms</Text>
          {SYMPTOM_CATEGORIES.map((cat) => (
            <View key={cat.title} style={styles.tagCategory}>
              <Text style={styles.tagCategoryTitle}>{cat.title}</Text>
              <View style={styles.tagGrid}>
                {cat.tags.map((tag) => {
                  const active = symptomTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.tagChip,
                        active && styles.tagChipActive,
                      ]}
                      onPress={() => toggleTag(tag)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.tagChipText,
                          active && styles.tagChipTextActive,
                        ]}
                      >
                        {formatTag(tag)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* ════════════════════════════════════════════════════════
            SECTION 4: Quick Ratings
            ════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How are you feeling?</Text>

          <View style={styles.ratingSection}>
            <Text style={styles.ratingTitle}>Mood</Text>
            <RatingScale
              value={moodScore}
              onChange={setMoodScore}
              emojis={['😔', '😐', '🙂', '😊', '💜']}
              labels={['Very low', 'Low', 'Okay', 'Good', 'Great']}
            />
          </View>

          <View style={styles.ratingSection}>
            <Text style={styles.ratingTitle}>Sleep quality</Text>
            <RatingScale
              value={sleepScore}
              onChange={setSleepScore}
              labels={['Terrible', 'Poor', 'Fair', 'Good', 'Great']}
            />
          </View>

          <View style={styles.ratingSection}>
            <Text style={styles.ratingTitle}>Stress level</Text>
            <RatingScale
              value={stressScore}
              onChange={setStressScore}
              labels={['Very low', 'Low', 'Moderate', 'High', 'Very high']}
            />
          </View>

          <View style={styles.ratingSection}>
            <Text style={styles.ratingTitle}>Energy level</Text>
            <RatingScale
              value={energyScore}
              onChange={setEnergyScore}
              labels={[
                'Exhausted',
                'Low energy',
                'Moderate',
                'Energetic',
                'Very energized',
              ]}
            />
          </View>
        </View>

        {/* ════════════════════════════════════════════════════════
            SECTION 5: Note
            ════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          {!noteExpanded ? (
            <TouchableOpacity
              style={styles.noteToggle}
              onPress={() => setNoteExpanded(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.noteToggleText}>+ Add a note...</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <TextInput
                style={styles.noteInput}
                placeholder="How are you feeling today? Any details you want to remember for your next appointment..."
                placeholderTextColor={CALMING_PALETTE.muted}
                value={note}
                onChangeText={(t) => {
                  setNote(t);
                  setSaved(false);
                }}
                multiline
                textAlignVertical="top"
                numberOfLines={4}
              />
              <TouchableOpacity
                style={styles.noteCollapse}
                onPress={() => {
                  if (!note.trim()) setNoteExpanded(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.noteCollapseText}>
                  {note.trim() ? 'Tap to collapse' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ════════════════════════════════════════════════════════
            SAVE BUTTON
            ════════════════════════════════════════════════════════ */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : saved ? (
            <Text style={styles.saveButtonText}>✓ Saved!</Text>
          ) : (
            <Text style={styles.saveButtonText}>Save Today's Log</Text>
          )}
        </TouchableOpacity>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          ⚕️ Flointra is a tracking tool, not a medical diagnosis. Always
          discuss your findings with your healthcare provider.
        </Text>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ─── Date Picker Modal ──────────────────────────────────── */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDatePicker(false)}
        >
          <Pressable style={styles.calendarModal} onPress={() => {}}>
            <Text style={styles.calendarTitle}>Select a date</Text>
            <Calendar
              current={selectedDate}
              maxDate={todayStr}
              onDayPress={(day: { dateString: string }) => {
                setSelectedDate(day.dateString);
                setShowDatePicker(false);
                setSaved(false);
              }}
              markedDates={{
                [selectedDate]: {
                  selected: true,
                  selectedColor: CALMING_PALETTE.primary,
                },
              }}
              theme={{
                backgroundColor: '#FFFFFF',
                calendarBackground: '#FFFFFF',
                selectedDayBackgroundColor: CALMING_PALETTE.primary,
                todayTextColor: CALMING_PALETTE.primary,
                dayTextColor: CALMING_PALETTE.body,
                textDisabledColor: '#D4C5E8',
                arrowColor: CALMING_PALETTE.primary,
                monthTextColor: CALMING_PALETTE.heading,
                textMonthFontWeight: '700',
              }}
            />
            <TouchableOpacity
              style={styles.calendarCloseBtn}
              onPress={() => setShowDatePicker(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.calendarCloseText}>Close</Text>
            </TouchableOpacity>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Section ────────────────────────────────────────────────────
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: CALMING_PALETTE.muted,
    marginBottom: 12,
  },

  // ─── Date ───────────────────────────────────────────────────────
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dateArrow: {
    fontSize: 32,
    color: CALMING_PALETTE.primary,
    fontWeight: '300',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  dateArrowDisabled: {
    color: CALMING_PALETTE.border,
  },
  dateBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
  },
  dateSubtext: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    marginTop: 2,
  },

  // ─── Cycle ──────────────────────────────────────────────────────
  cycleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  cycleBadge: {
    backgroundColor: CALMING_PALETTE.primaryLight,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  cycleDayText: {
    fontSize: 13,
    fontWeight: '700',
    color: CALMING_PALETTE.primary,
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
    gap: 6,
  },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  phaseText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cycleNote: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },

  // ─── Symptom Tags ───────────────────────────────────────────────
  tagCategory: {
    marginTop: 14,
  },
  tagCategoryTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: CALMING_PALETTE.tagBg,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  tagChipActive: {
    backgroundColor: CALMING_PALETTE.tagBgActive,
    borderColor: CALMING_PALETTE.tagBgActive,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.tagText,
  },
  tagChipTextActive: {
    color: CALMING_PALETTE.tagTextActive,
  },

  // ─── Ratings ────────────────────────────────────────────────────
  ratingSection: {
    marginTop: 16,
  },
  ratingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.body,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  ratingDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  ratingEmoji: {
    fontSize: 14,
    position: 'absolute',
    top: -18,
  },
  ratingNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  ratingLabel: {
    fontSize: 13,
    color: CALMING_PALETTE.muted,
    marginLeft: 4,
    fontWeight: '500',
  },

  // ─── Note ───────────────────────────────────────────────────────
  noteToggle: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderStyle: 'dashed',
  },
  noteToggleText: {
    fontSize: 14,
    color: CALMING_PALETTE.muted,
    fontWeight: '500',
  },
  noteInput: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 16,
    fontSize: 15,
    color: CALMING_PALETTE.body,
    minHeight: 100,
    lineHeight: 22,
  },
  noteCollapse: {
    alignItems: 'flex-end',
    marginTop: 6,
  },
  noteCollapseText: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
  },

  // ─── Save Button ────────────────────────────────────────────────
  saveButton: {
    backgroundColor: CALMING_PALETTE.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: CALMING_PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  // ─── Disclaimer ─────────────────────────────────────────────────
  disclaimer: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  bottomPad: {
    height: 40,
  },

  // ─── Date Picker Modal ──────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 27, 105, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calendarModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 12,
    textAlign: 'center',
  },
  calendarCloseBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  calendarCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },
});
