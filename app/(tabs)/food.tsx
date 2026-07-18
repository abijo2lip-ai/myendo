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
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { format, parseISO, addDays, differenceInHours } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { FoodLog, PostMealFeeling } from '@/types';

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
  beneficialBg: '#ECFDF5',
  beneficialBgActive: '#059669',
  beneficialText: '#065F46',
  beneficialTextActive: '#FFFFFF',
  triggerBg: '#FFF1F2',
  triggerBgActive: '#E8505B',
  triggerText: '#991B1B',
  triggerTextActive: '#FFFFFF',
};

// ─── Food Tag Definitions ────────────────────────────────────────────

interface FoodTagCategory {
  title: string;
  accent: 'purple' | 'green' | 'amber';
  tags: string[];
}

const FOOD_TAG_CATEGORIES: FoodTagCategory[] = [
  {
    title: 'Common triggers to watch',
    accent: 'purple',
    tags: [
      'gluten',
      'dairy',
      'red_meat',
      'processed_sugar',
      'caffeine',
      'alcohol',
      'soy',
    ],
  },
  {
    title: 'Digestive & inflammatory factors',
    accent: 'amber',
    tags: [
      'high_fodmap',
      'nightshades',
      'seed_oils',
      'spicy_food',
      'fried_food',
    ],
  },
  {
    title: 'Beneficial foods',
    accent: 'green',
    tags: [
      'fermented_foods',
      'leafy_greens',
      'omega_3_rich',
      'turmeric_ginger',
      'high_fiber',
      'anti_inflammatory_meal',
    ],
  },
];

function formatTag(tag: string): string {
  return tag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Post-meal symptom quick-tags ────────────────────────────────────

const POST_MEAL_SYMPTOM_TAGS = [
  'bloating',
  'nausea',
  'pain',
  'fatigue',
  'headache',
  'diarrhea',
  'constipation',
  'skin_reaction',
];

// ─── Component ────────────────────────────────────────────────────────

export default function FoodDiaryScreen() {
  const { user, isLoading: authLoading } = useAuth();

  // ─── Date state ─────────────────────────────────────────────────
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ─── Meals list ─────────────────────────────────────────────────
  const [meals, setMeals] = useState<FoodLog[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);

  // ─── Meal log form ──────────────────────────────────────────────
  const [showMealForm, setShowMealForm] = useState(false);
  const [mealName, setMealName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [foodTags, setFoodTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);

  // ─── Post-meal check-in ─────────────────────────────────────────
  const [checkinMeal, setCheckinMeal] = useState<FoodLog | null>(null);
  const [checkinFeeling, setCheckinFeeling] = useState<PostMealFeeling | null>(null);
  const [checkinSymptoms, setCheckinSymptoms] = useState<string[]>([]);
  const [savingCheckin, setSavingCheckin] = useState(false);

  // ─── Load meals for selected date ───────────────────────────────
  const loadMeals = useCallback(async () => {
    if (!user) return;
    setLoadingMeals(true);
    try {
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setMeals((data as FoodLog[]) ?? []);
    } catch (err: any) {
      console.error('Error loading meals:', err?.message ?? err);
    } finally {
      setLoadingMeals(false);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  // ─── Photo picker ───────────────────────────────────────────────
  const pickPhoto = async () => {
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission needed', 'Camera roll access is needed to add meal photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission needed', 'Camera access is needed to take meal photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  // ─── Upload photo to Supabase Storage ───────────────────────────
  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      const fileName = `${user!.id}/${Date.now()}.jpg`;
      const response = await fetch(uri);
      const blob = await response.blob();

      const { error } = await supabase.storage
        .from('meal-photos')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('meal-photos')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (err: any) {
      console.error('Photo upload failed:', err?.message ?? err);
      return null;
    }
  };

  // ─── Tag toggle ─────────────────────────────────────────────────
  const toggleTag = useCallback((tag: string) => {
    setFoodTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  // ─── Save / Update meal ─────────────────────────────────────────
  const handleSaveMeal = useCallback(async () => {
    if (!user || !mealName.trim()) return;
    setSaving(true);
    try {
      let photoUrl: string | null = null;

      if (photoUri && !photoUri.startsWith('http')) {
        photoUrl = await uploadPhoto(photoUri);
      } else if (photoUri) {
        photoUrl = photoUri; // existing URL, keep it
      }

      const payload = {
        user_id: user.id,
        timestamp: new Date().toISOString(),
        meal_name: mealName.trim(),
        photo_url: photoUrl,
        food_tags: foodTags,
      };

      if (editingMealId) {
        const { error } = await supabase
          .from('food_logs')
          .update(payload)
          .eq('id', editingMealId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('food_logs')
          .insert(payload);
        if (error) throw error;
      }

      // Reset form
      resetForm();
      await loadMeals();
    } catch (err: any) {
      console.error('Error saving meal:', err?.message ?? err);
      Alert.alert('Error', 'Could not save meal. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user, mealName, photoUri, foodTags, editingMealId, loadMeals]);

  const resetForm = () => {
    setMealName('');
    setPhotoUri(null);
    setFoodTags([]);
    setEditingMealId(null);
    setShowMealForm(false);
  };

  // ─── Edit meal ──────────────────────────────────────────────────
  const handleEditMeal = (meal: FoodLog) => {
    setMealName(meal.meal_name);
    setPhotoUri(meal.photo_url);
    setFoodTags(meal.food_tags);
    setEditingMealId(meal.id);
    setShowMealForm(true);
  };

  // ─── Delete meal ────────────────────────────────────────────────
  const handleDeleteMeal = (meal: FoodLog) => {
    Alert.alert(
      'Delete meal?',
      `Remove "${meal.meal_name}" from your food log?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('food_logs')
                .delete()
                .eq('id', meal.id);
              if (error) throw error;
              await loadMeals();
            } catch (err: any) {
              console.error('Error deleting meal:', err?.message ?? err);
            }
          },
        },
      ]
    );
  };

  // ─── Open post-meal check-in ────────────────────────────────────
  const openCheckin = (meal: FoodLog) => {
    setCheckinMeal(meal);
    setCheckinFeeling(null);
    setCheckinSymptoms([]);
  };

  const closeCheckin = () => {
    setCheckinMeal(null);
    setCheckinFeeling(null);
    setCheckinSymptoms([]);
  };

  const handleSaveCheckin = useCallback(async () => {
    if (!checkinMeal || !checkinFeeling) return;
    setSavingCheckin(true);
    try {
      const { error } = await supabase
        .from('food_logs')
        .update({
          post_meal_feeling: checkinFeeling,
          post_meal_symptoms: checkinSymptoms,
        })
        .eq('id', checkinMeal.id);

      if (error) throw error;
      closeCheckin();
      await loadMeals();
    } catch (err: any) {
      console.error('Error saving check-in:', err?.message ?? err);
    } finally {
      setSavingCheckin(false);
    }
  }, [checkinMeal, checkinFeeling, checkinSymptoms, loadMeals]);

  // ─── Find meals pending check-in (1-3 hours ago) ────────────────
  const pendingCheckins = useMemo(() => {
    const now = new Date();
    return meals.filter((meal) => {
      if (meal.post_meal_feeling) return false; // already answered
      const mealTime = new Date(meal.timestamp);
      const hoursSince = differenceInHours(now, mealTime);
      return hoursSince >= 1 && hoursSince <= 3;
    });
  }, [meals]);

  // ─── Date navigation ────────────────────────────────────────────
  const goToPrevDay = () => {
    setSelectedDate((prev) => format(addDays(parseISO(prev), -1), 'yyyy-MM-dd'));
  };
  const goToNextDay = () => {
    const next = format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd');
    if (next <= todayStr) setSelectedDate(next);
  };
  const isToday = selectedDate === todayStr;

  // ─── Loading state ──────────────────────────────────────────────
  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CALMING_PALETTE.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render helpers ─────────────────────────────────────────────

  const getTagStyle = (tag: string, active: boolean) => {
    // Determine which category the tag belongs to
    for (const cat of FOOD_TAG_CATEGORIES) {
      if (cat.tags.includes(tag)) {
        if (cat.accent === 'green') {
          return {
            chip: [
              styles.tagChip,
              styles.tagChipBeneficial,
              active && styles.tagChipBeneficialActive,
            ] as any,
            text: [
              styles.tagChipText,
              styles.tagChipBeneficialText,
              active && styles.tagChipBeneficialTextActive,
            ] as any,
          };
        }
        if (cat.accent === 'amber') {
          return {
            chip: [
              styles.tagChip,
              active && styles.tagChipActive,
            ] as any,
            text: [
              styles.tagChipText,
              active && styles.tagChipTextActive,
            ] as any,
          };
        }
        // purple (default)
        return {
          chip: [
            styles.tagChip,
            active && styles.tagChipActive,
          ] as any,
          text: [
            styles.tagChipText,
            active && styles.tagChipTextActive,
          ] as any,
        };
      }
    }
    // fallback
    return {
      chip: [
        styles.tagChip,
        active && styles.tagChipActive,
      ] as any,
      text: [
        styles.tagChipText,
        active && styles.tagChipTextActive,
      ] as any,
    };
  };

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
            HEADER: Date + Log Meal Button
            ════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          {/* Date selector — same pattern as symptom log */}
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

          {/* Log a meal button */}
          <TouchableOpacity
            style={styles.logMealBtn}
            onPress={() => {
              resetForm();
              setShowMealForm(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.logMealBtnIcon}>+</Text>
            <Text style={styles.logMealBtnText}>Log a meal</Text>
          </TouchableOpacity>
        </View>

        {/* ════════════════════════════════════════════════════════
            MEAL LOG FORM (expandable)
            ════════════════════════════════════════════════════════ */}
        {showMealForm && (
          <View style={styles.section}>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                {editingMealId ? 'Edit meal' : 'What did you eat?'}
              </Text>

              {/* Meal name */}
              <TextInput
                style={styles.mealNameInput}
                placeholder="What did you eat? e.g. chicken salad"
                placeholderTextColor={CALMING_PALETTE.muted}
                value={mealName}
                onChangeText={setMealName}
                autoFocus
              />

              {/* Photo */}
              <View style={styles.photoRow}>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={pickPhoto}
                  activeOpacity={0.7}
                >
                  <Text style={styles.photoBtnText}>🖼️ Add photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.photoBtnOutline}
                  onPress={takePhoto}
                  activeOpacity={0.7}
                >
                  <Text style={styles.photoBtnOutlineText}>📷 Camera</Text>
                </TouchableOpacity>
              </View>
              {photoUri && (
                <View style={styles.photoPreview}>
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoThumb}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhotoUri(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.photoRemoveText}>✕ Remove</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Food tags */}
              <Text style={styles.tagsIntro}>
                Add tags to help find your patterns:
              </Text>
              {FOOD_TAG_CATEGORIES.map((cat) => (
                <View key={cat.title} style={styles.tagCategory}>
                  <Text
                    style={[
                      styles.tagCategoryTitle,
                      cat.accent === 'green' && { color: '#059669' },
                    ]}
                  >
                    {cat.title}
                  </Text>
                  <View style={styles.tagGrid}>
                    {cat.tags.map((tag) => {
                      const active = foodTags.includes(tag);
                      const styleSet = getTagStyle(tag, active);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={styleSet.chip}
                          onPress={() => toggleTag(tag)}
                          activeOpacity={0.7}
                        >
                          <Text style={styleSet.text}>
                            {formatTag(tag)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* Form buttons */}
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={resetForm}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    (!mealName.trim() || saving) && styles.saveBtnDisabled,
                  ]}
                  onPress={handleSaveMeal}
                  disabled={!mealName.trim() || saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════
            POST-MEAL CHECK-IN NUDGE
            ════════════════════════════════════════════════════════ */}
        {pendingCheckins.length > 0 && (
          <View style={styles.section}>
            {pendingCheckins.map((meal) => (
              <TouchableOpacity
                key={meal.id}
                style={styles.checkinCard}
                onPress={() => openCheckin(meal)}
                activeOpacity={0.8}
              >
                <Text style={styles.checkinEmoji}>⏰</Text>
                <View style={styles.checkinContent}>
                  <Text style={styles.checkinTitle}>
                    How do you feel after{' '}
                    <Text style={styles.checkinMealName}>{meal.meal_name}</Text>
                    ?
                  </Text>
                  <Text style={styles.checkinSub}>
                    Tap to check in — it helps find your patterns
                  </Text>
                </View>
                <Text style={styles.checkinArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ════════════════════════════════════════════════════════
            TODAY'S MEALS LIST
            ════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isToday ? "Today's meals" : 'Meals'}
          </Text>

          {loadingMeals ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={CALMING_PALETTE.primary} />
            </View>
          ) : meals.length === 0 ? (
            /* Empty state */
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyTitle}>No meals logged today</Text>
              <Text style={styles.emptySub}>
                Tap "Log a meal" to start finding your patterns.
              </Text>
            </View>
          ) : (
            meals.map((meal) => (
              <View key={meal.id} style={styles.mealCard}>
                {/* Time + meal name */}
                <View style={styles.mealHeader}>
                  <Text style={styles.mealTime}>
                    {format(new Date(meal.timestamp), 'h:mm a')}
                  </Text>
                  <Text style={styles.mealName}>{meal.meal_name}</Text>
                </View>

                {/* Photo thumbnail */}
                {meal.photo_url && (
                  <Image
                    source={{ uri: meal.photo_url }}
                    style={styles.mealPhoto}
                    resizeMode="cover"
                  />
                )}

                {/* Food tags */}
                {meal.food_tags.length > 0 && (
                  <View style={styles.mealTags}>
                    {meal.food_tags.map((tag) => (
                      <View key={tag} style={styles.mealTagChip}>
                        <Text style={styles.mealTagText}>
                          {formatTag(tag)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Post-meal feeling badge */}
                {meal.post_meal_feeling && (
                  <View
                    style={[
                      styles.feelingBadge,
                      meal.post_meal_feeling === 'better' && styles.feelingBetter,
                      meal.post_meal_feeling === 'worse' && styles.feelingWorse,
                    ]}
                  >
                    <Text style={styles.feelingText}>
                      {meal.post_meal_feeling === 'better'
                        ? '✨ Feeling better'
                        : meal.post_meal_feeling === 'worse'
                          ? '⚠️ Feeling worse'
                          : '— Feeling the same'}
                    </Text>
                    {meal.post_meal_symptoms.length > 0 && (
                      <Text style={styles.feelingSymptoms}>
                        {meal.post_meal_symptoms.map(formatTag).join(', ')}
                      </Text>
                    )}
                  </View>
                )}

                {/* Edit / Delete */}
                <View style={styles.mealActions}>
                  <TouchableOpacity
                    style={styles.mealActionBtn}
                    onPress={() => handleEditMeal(meal)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.mealActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.mealActionBtn}
                    onPress={() => handleDeleteMeal(meal)}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.mealActionText, styles.mealActionDelete]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          ⚕️ Flointra helps you track what you eat to find your patterns. This
          is not a medical diagnosis — always discuss your findings with your
          healthcare provider.
        </Text>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ════════════════════════════════════════════════════════
          DATE PICKER MODAL
          ════════════════════════════════════════════════════════ */}
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

      {/* ════════════════════════════════════════════════════════
          POST-MEAL CHECK-IN MODAL
          ════════════════════════════════════════════════════════ */}
      <Modal
        visible={checkinMeal !== null}
        transparent
        animationType="fade"
        onRequestClose={closeCheckin}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={closeCheckin}
        >
          <Pressable
            style={styles.checkinModal}
            onPress={() => {}}
          >
            <Text style={styles.checkinModalTitle}>Post-meal check-in</Text>
            <Text style={styles.checkinModalSub}>
              How do you feel after {checkinMeal?.meal_name}?
            </Text>

            {/* Feeling buttons */}
            <View style={styles.checkinFeelingRow}>
              {(['better', 'same', 'worse'] as PostMealFeeling[]).map(
                (feeling) => (
                  <TouchableOpacity
                    key={feeling}
                    style={[
                      styles.checkinFeelingBtn,
                      checkinFeeling === feeling && styles.checkinFeelingActive,
                      feeling === 'better' && checkinFeeling === 'better' && styles.checkinFeelingBetter,
                      feeling === 'worse' && checkinFeeling === 'worse' && styles.checkinFeelingWorse,
                    ]}
                    onPress={() => setCheckinFeeling(feeling)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.checkinFeelingEmoji}>
                      {feeling === 'better' ? '✨' : feeling === 'same' ? '—' : '⚠️'}
                    </Text>
                    <Text
                      style={[
                        styles.checkinFeelingLabel,
                        checkinFeeling === feeling && styles.checkinFeelingLabelActive,
                      ]}
                    >
                      {feeling === 'better' ? 'Better' : feeling === 'same' ? 'Same' : 'Worse'}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            {/* Optional symptom tags */}
            {checkinFeeling && (
              <View style={styles.checkinSymptomsSection}>
                <Text style={styles.checkinSymptomsTitle}>
                  Any symptoms to note? (optional)
                </Text>
                <View style={styles.tagGrid}>
                  {POST_MEAL_SYMPTOM_TAGS.map((tag) => {
                    const active = checkinSymptoms.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[
                          styles.tagChip,
                          active && styles.tagChipActive,
                        ]}
                        onPress={() =>
                          setCheckinSymptoms((prev) =>
                            prev.includes(tag)
                              ? prev.filter((t) => t !== tag)
                              : [...prev, tag]
                          )
                        }
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
            )}

            {/* Save */}
            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeCheckin}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (!checkinFeeling || savingCheckin) && styles.saveBtnDisabled,
                ]}
                onPress={handleSaveCheckin}
                disabled={!checkinFeeling || savingCheckin}
                activeOpacity={0.8}
              >
                {savingCheckin ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
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
    marginBottom: 12,
  },

  // ─── Date ───────────────────────────────────────────────────────
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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

  // ─── Log Meal Button ────────────────────────────────────────────
  logMealBtn: {
    backgroundColor: CALMING_PALETTE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: CALMING_PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  logMealBtnIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  logMealBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Meal Form ──────────────────────────────────────────────────
  formCard: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 14,
  },
  mealNameInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 14,
    fontSize: 15,
    color: CALMING_PALETTE.body,
    marginBottom: 14,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  photoBtn: {
    backgroundColor: CALMING_PALETTE.primaryLight,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    alignItems: 'center',
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },
  photoBtnOutline: {
    borderWidth: 1,
    borderColor: CALMING_PALETTE.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    alignItems: 'center',
  },
  photoBtnOutlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },
  photoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  photoThumb: {
    width: 80,
    height: 60,
    borderRadius: 8,
  },
  photoRemove: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  photoRemoveText: {
    fontSize: 13,
    color: '#E8505B',
    fontWeight: '600',
  },

  // ─── Tags ───────────────────────────────────────────────────────
  tagsIntro: {
    fontSize: 13,
    color: CALMING_PALETTE.muted,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  tagCategory: {
    marginTop: 10,
  },
  tagCategoryTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
    letterSpacing: 0.8,
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
  // Beneficial (green) tags
  tagChipBeneficial: {
    backgroundColor: CALMING_PALETTE.beneficialBg,
    borderColor: '#A7F3D0',
  },
  tagChipBeneficialActive: {
    backgroundColor: CALMING_PALETTE.beneficialBgActive,
    borderColor: CALMING_PALETTE.beneficialBgActive,
  },
  tagChipBeneficialText: {
    color: CALMING_PALETTE.beneficialText,
  },
  tagChipBeneficialTextActive: {
    color: CALMING_PALETTE.beneficialTextActive,
  },

  // ─── Form Actions ───────────────────────────────────────────────
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
  },
  saveBtn: {
    backgroundColor: CALMING_PALETTE.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ─── Post-meal Check-in Nudge ───────────────────────────────────
  checkinCard: {
    backgroundColor: '#FFF9ED',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 10,
    gap: 12,
  },
  checkinEmoji: {
    fontSize: 24,
  },
  checkinContent: {
    flex: 1,
  },
  checkinTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.heading,
    lineHeight: 20,
  },
  checkinMealName: {
    fontStyle: 'italic',
  },
  checkinSub: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    marginTop: 2,
  },
  checkinArrow: {
    fontSize: 24,
    color: CALMING_PALETTE.muted,
    fontWeight: '300',
  },

  // ─── Meals List ─────────────────────────────────────────────────
  loadingRow: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    borderStyle: 'dashed',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: CALMING_PALETTE.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  mealCard: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  mealTime: {
    fontSize: 12,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    flex: 1,
  },
  mealPhoto: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: 8,
  },
  mealTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  mealTagChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  mealTagText: {
    fontSize: 11,
    fontWeight: '500',
    color: CALMING_PALETTE.body,
  },
  feelingBadge: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: CALMING_PALETTE.surface,
    marginBottom: 8,
  },
  feelingBetter: {
    backgroundColor: '#ECFDF5',
  },
  feelingWorse: {
    backgroundColor: '#FFF1F2',
  },
  feelingText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.body,
  },
  feelingSymptoms: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    marginTop: 2,
  },
  mealActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 4,
  },
  mealActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  mealActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },
  mealActionDelete: {
    color: '#E8505B',
  },

  // ─── Post-meal Check-in Modal ───────────────────────────────────
  checkinModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 380,
  },
  checkinModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 4,
  },
  checkinModalSub: {
    fontSize: 14,
    color: CALMING_PALETTE.body,
    marginBottom: 18,
    lineHeight: 20,
  },
  checkinFeelingRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  checkinFeelingBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CALMING_PALETTE.surface,
    borderWidth: 2,
    borderColor: CALMING_PALETTE.border,
    gap: 4,
  },
  checkinFeelingActive: {
    borderColor: CALMING_PALETTE.primary,
    backgroundColor: CALMING_PALETTE.primaryLight,
  },
  checkinFeelingBetter: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  checkinFeelingWorse: {
    borderColor: '#E8505B',
    backgroundColor: '#FFF1F2',
  },
  checkinFeelingEmoji: {
    fontSize: 20,
  },
  checkinFeelingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
  },
  checkinFeelingLabelActive: {
    color: CALMING_PALETTE.heading,
  },
  checkinSymptomsSection: {
    marginBottom: 14,
  },
  checkinSymptomsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.body,
    marginBottom: 10,
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
