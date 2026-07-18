// Flointra — Settings & Privacy Screen
// CONSTRAINT: NO calorie, macro, weight, BMI, diet, or goal language anywhere.

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useSubscription } from '@/hooks/useSubscription';
import type { DiagnosisStatus } from '@/types';

// ─── Diagnosis Options (same as onboarding) ────────────────────────────
const DIAGNOSIS_OPTIONS: {
  value: DiagnosisStatus;
  label: string;
  description: string;
}[] = [
  {
    value: 'diagnosed',
    label: 'Diagnosed with endo',
    description: 'Confirmed by a healthcare provider',
  },
  {
    value: 'suspected',
    label: 'Suspected endo',
    description: 'You or your doctor suspect it, but not yet confirmed',
  },
  {
    value: 'in_process',
    label: 'In the process of diagnosis',
    description: 'Currently undergoing tests or consultations',
  },
];

// ─── Section Header ─────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Settings Row ───────────────────────────────────────────────────────
function SettingsRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const { isPremium } = useSubscription();

  // ── Editable state ──────────────────────────────────────────────────
  const [diagnosis, setDiagnosis] = useState<DiagnosisStatus>(
    profile?.diagnosis_status ?? 'suspected'
  );
  const [cycleTracking, setCycleTracking] = useState(
    profile?.cycle_tracking_enabled ?? true
  );
  const [lastPeriodDate, setLastPeriodDate] = useState(
    profile?.last_period_start_date ?? ''
  );
  const [cycleLength, setCycleLength] = useState(
    String(profile?.avg_cycle_length_days ?? 28)
  );

  // Notifications
  const [reminderEnabled, setReminderEnabled] = useState(
    profile?.reminder_enabled ?? false
  );
  const [reminderTime, setReminderTime] = useState(
    profile?.reminder_time?.substring(0, 5) ?? '20:00'
  );
  const [postMealNudge, setPostMealNudge] = useState(
    profile?.post_meal_nudge_enabled ?? true
  );

  const [saving, setSaving] = useState(false);

  // Sync from profile when it loads
  useEffect(() => {
    if (profile) {
      setDiagnosis(profile.diagnosis_status);
      setCycleTracking(profile.cycle_tracking_enabled);
      setLastPeriodDate(profile.last_period_start_date ?? '');
      setCycleLength(String(profile.avg_cycle_length_days));
      setReminderEnabled(profile.reminder_enabled ?? false);
      setReminderTime(profile.reminder_time?.substring(0, 5) ?? '20:00');
      setPostMealNudge(profile.post_meal_nudge_enabled ?? true);
    }
  }, [profile]);

  // ── Profile update ──────────────────────────────────────────────────
  const handleUpdateProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const cycleLengthNum = parseInt(cycleLength, 10);
      const updateData: Record<string, unknown> = {
        diagnosis_status: diagnosis,
        cycle_tracking_enabled: cycleTracking,
        avg_cycle_length_days: isNaN(cycleLengthNum) ? 28 : cycleLengthNum,
        reminder_enabled: reminderEnabled,
        reminder_time: reminderTime,
        post_meal_nudge_enabled: postMealNudge,
      };
      if (lastPeriodDate) {
        updateData.last_period_start_date = lastPeriodDate;
      } else {
        updateData.last_period_start_date = null;
      }
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      Alert.alert('Profile updated', 'Your settings have been saved.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Export all data ─────────────────────────────────────────────────
  const handleExportAll = async () => {
    if (!user) return;
    try {
      const { data: symptoms } = await supabase
        .from('symptom_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true });
      const { data: foods } = await supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: true });
      const { data: insights } = await supabase
        .from('pattern_insights')
        .select('*')
        .eq('user_id', user.id)
        .order('generated_at', { ascending: false });

      const { buildPdfHtml, buildCsv } = await import('@/lib/export-pdf');
      const { printToFileAsync } = await import('expo-print');
      const { shareAsync } = await import('expo-sharing');
      const { documentDirectory } = await import('expo-file-system');

      const reportData = {
        dateRange: {
          from: symptoms?.[0]?.date ?? new Date().toISOString().slice(0, 10),
          to: new Date().toISOString().slice(0, 10),
        },
        generatedDate: new Date().toISOString(),
        symptomLogs: (symptoms ?? []) as any[],
        foodLogs: (foods ?? []) as any[],
        insights: (insights ?? []) as any[],
        diagnosisStatus: profile?.diagnosis_status ?? 'suspected',
        cycleTrackingEnabled: profile?.cycle_tracking_enabled ?? false,
        avgCycleLength: profile?.avg_cycle_length_days ?? 28,
      };

      const pdfHtml = buildPdfHtml(reportData);
      const pdfUri = await printToFileAsync({
        html: pdfHtml,
        base64: false,
      });

      const csvContent = buildCsv(reportData);
      const csvUri = documentDirectory + 'flointra-export.csv';
      const { writeAsStringAsync } = await import('expo-file-system');
      await writeAsStringAsync(csvUri, csvContent);

      await shareAsync(pdfUri.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Export your Flointra data',
      });

      Alert.alert(
        'Export ready',
        'Your data has been exported. The CSV file is also available for sharing.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      Alert.alert('Export error', msg);
    }
  };

  // ── Delete all data ─────────────────────────────────────────────────
  const handleDeleteData = () => {
    Alert.alert(
      'Delete all your data?',
      'This will permanently delete all your symptom and food logs. Your account will remain active. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Data',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await supabase
                .from('symptom_logs')
                .delete()
                .eq('user_id', user.id);
              await supabase
                .from('food_logs')
                .delete()
                .eq('user_id', user.id);
              await supabase
                .from('pattern_insights')
                .delete()
                .eq('user_id', user.id);
              Alert.alert(
                'Data deleted',
                'All your logs have been permanently removed.'
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // ── Delete account ──────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and all associated data. You will lose access immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              // Delete all user data first
              await supabase
                .from('symptom_logs')
                .delete()
                .eq('user_id', user.id);
              await supabase
                .from('food_logs')
                .delete()
                .eq('user_id', user.id);
              await supabase
                .from('pattern_insights')
                .delete()
                .eq('user_id', user.id);
              // Delete user profile
              await supabase.from('users').delete().eq('id', user.id);
              // Sign out
              await signOut();
              // Navigate to onboarding
              router.replace('/onboarding/welcome');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // ── Upgrade ─────────────────────────────────────────────────────────
  const handleUpgrade = () => {
    Alert.alert(
      'Coming soon',
      'Premium subscriptions will be available soon. Thank you for your interest!'
    );
  };

  // ── Cycle length validation ─────────────────────────────────────────
  const handleCycleLengthChange = (text: string) => {
    // Only allow digits, max 3 chars
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 3);
    setCycleLength(cleaned);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header ────────────────────────────────────────────── */}
        <Text style={styles.heading}>Settings</Text>
        <Text style={styles.subtitle}>
          Manage your profile, notifications, and data.
        </Text>

        {/* ─── Section 1: Profile ────────────────────────────────── */}
        <SectionHeader title="Profile" />

        {/* Email (read-only) */}
        <SettingsRow label="Email" value={profile?.email ?? user?.email} />

        {/* Diagnosis status */}
        <View style={styles.diagnosisSection}>
          <Text style={styles.rowLabel}>Diagnosis status</Text>
          {DIAGNOSIS_OPTIONS.map((opt) => {
            const isSelected = diagnosis === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.diagnosisCard,
                  isSelected && styles.diagnosisCardSelected,
                ]}
                onPress={() => setDiagnosis(opt.value)}
                activeOpacity={0.7}
              >
                <View style={styles.diagnosisCardContent}>
                  <View
                    style={[
                      styles.radioCircle,
                      isSelected && styles.radioCircleSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.diagnosisTextWrap}>
                    <Text
                      style={[
                        styles.diagnosisLabel,
                        isSelected && styles.diagnosisLabelSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.diagnosisDesc}>{opt.description}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Cycle tracking toggle */}
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowLabel}>Cycle tracking</Text>
            <Text style={styles.rowValue}>
              {cycleTracking ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={cycleTracking}
            onValueChange={setCycleTracking}
            trackColor={{ false: '#D4CCE4', true: '#C4B5E8' }}
            thumbColor={cycleTracking ? '#7C3AED' : '#9B8AB5'}
          />
        </View>

        {/* Last period date + cycle length (only when tracking enabled) */}
        {cycleTracking && (
          <View style={styles.cycleFields}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Last period start</Text>
              <TextInput
                style={styles.fieldInput}
                value={lastPeriodDate}
                onChangeText={setLastPeriodDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#B5A8CC"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Avg cycle length</Text>
              <View style={styles.fieldWithUnit}>
                <TextInput
                  style={styles.fieldInputSmall}
                  value={cycleLength}
                  onChangeText={handleCycleLengthChange}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="28"
                  placeholderTextColor="#B5A8CC"
                />
                <Text style={styles.fieldUnit}>days</Text>
              </View>
            </View>
          </View>
        )}

        {/* Update profile button */}
        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleUpdateProfile}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Saving...' : 'Update Profile'}
          </Text>
        </TouchableOpacity>

        {/* ─── Section 2: Notifications ──────────────────────────── */}
        <SectionHeader title="Notifications" />

        {/* Daily log reminder */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowLabel}>Daily log reminder</Text>
            <Text style={styles.rowValue}>
              {reminderEnabled
                ? 'Reminder at ' + reminderTime
                : 'Not set'}
            </Text>
          </View>
          <Switch
            value={reminderEnabled}
            onValueChange={setReminderEnabled}
            trackColor={{ false: '#D4CCE4', true: '#C4B5E8' }}
            thumbColor={reminderEnabled ? '#7C3AED' : '#9B8AB5'}
          />
        </View>

        {/* Time picker (only when reminder is on) */}
        {reminderEnabled && (
          <View style={styles.indentedField}>
            <Text style={styles.fieldLabel}>Reminder time</Text>
            <TextInput
              style={styles.fieldInput}
              value={reminderTime}
              onChangeText={setReminderTime}
              placeholder="20:00"
              placeholderTextColor="#B5A8CC"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.helperText}>
              Enter a time in 24-hour format (e.g. 08:00, 20:00)
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Post-meal check-in toggle */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowLabel}>Post-meal check-in</Text>
            <Text style={styles.rowValue}>
              {postMealNudge ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={postMealNudge}
            onValueChange={setPostMealNudge}
            trackColor={{ false: '#D4CCE4', true: '#C4B5E8' }}
            thumbColor={postMealNudge ? '#7C3AED' : '#9B8AB5'}
          />
        </View>
        <Text style={styles.notifNote}>
          Push notification scheduling will be available in a future update.
          Your preferences are saved and will take effect once enabled.
        </Text>

        {/* ─── Section 3: Subscription ───────────────────────────── */}
        <SectionHeader title="Subscription" />

        <View style={styles.subscriptionCard}>
          <View style={styles.subscriptionHeader}>
            <Text style={styles.subscriptionPlanLabel}>Current plan</Text>
            <View
              style={[
                styles.planBadge,
                isPremium ? styles.premiumBadge : styles.freeBadge,
              ]}
            >
              <Text
                style={[
                  styles.planBadgeText,
                  isPremium
                    ? styles.premiumBadgeText
                    : styles.freeBadgeText,
                ]}
              >
                {isPremium ? 'Premium' : 'Free'}
              </Text>
            </View>
          </View>

          {!isPremium ? (
            <>
              <View style={styles.upgradeCard}>
                <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
                <View style={styles.benefitList}>
                  <Text style={styles.benefitItem}>
                    {'\u2728'} Pattern Insights &amp; correlations
                  </Text>
                  <Text style={styles.benefitItem}>
                    {'\uD83D\uDCC4'} Doctor-ready PDF/CSV exports
                  </Text>
                  <Text style={styles.benefitItem}>
                    {'\uD83D\uDCF8'} Unlimited photo storage
                  </Text>
                  <Text style={styles.benefitItem}>
                    {'\uD83D\uDCDA'} Educational resources
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={handleUpgrade}
                  activeOpacity={0.8}
                >
                  <Text style={styles.upgradeButtonText}>
                    Upgrade to Premium
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.privacyPledge}>
                Your data stays private. No ads, no data selling {'\u2014'} ever.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.premiumThankYou}>
                Thank you for being a Premium member! {'\uD83D\uDC9C'}
              </Text>
              <TouchableOpacity
                style={styles.outlineButton}
                onPress={handleUpgrade}
                activeOpacity={0.7}
              >
                <Text style={styles.outlineButtonText}>
                  Manage Subscription
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ─── Section 4: Data & Privacy ──────────────────────────── */}
        <SectionHeader title="Data &amp; Privacy" />

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleExportAll}
          activeOpacity={0.7}
        >
          <Text style={styles.actionButtonText}>Export all my data</Text>
          <Text style={styles.actionButtonHint}>
            Generate a PDF and CSV of all your logs and insights
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonDanger]}
          onPress={handleDeleteData}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionButtonText, styles.actionTextDanger]}>
            Delete my data
          </Text>
          <Text style={styles.actionButtonHint}>
            Removes all symptom logs, food logs, and pattern insights
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonDanger]}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionButtonText, styles.actionTextDanger]}>
            Delete my account
          </Text>
          <Text style={styles.actionButtonHint}>
            Permanently deletes your account and all data
          </Text>
        </TouchableOpacity>

        {/* ─── Section 5: About ───────────────────────────────────── */}
        <SectionHeader title="About" />

        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>What is Flointra?</Text>
          <Text style={styles.aboutText}>
            Flointra is your compassionate companion for understanding pelvic
            pain patterns. We help you track symptoms, identify personal
            triggers, and prepare for healthcare appointments {'\u2014'} so you can
            advocate for yourself with confidence.
          </Text>

          <View style={styles.pledgeCard}>
            <Text style={styles.pledgeTitle}>
              Our no-calorie-counting pledge
            </Text>
            <Text style={styles.pledgeText}>
              Flointra will never ask you to count calories, track macros,
              log your weight, or set weight goals. Food tracking here is
              about finding your patterns {'\u2014'} not monitoring your intake. Your
              relationship with food is personal, and we honor that.
            </Text>
          </View>

          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>Medical disclaimer</Text>
            <Text style={styles.disclaimerText}>
              Flointra is a self-tracking tool designed to support {'\u2014'} not
              replace {'\u2014'} professional medical care. It does not provide
              medical diagnoses, treatment recommendations, or clinical
              advice. Always consult your healthcare provider about any
              symptoms, concerns, or changes to your treatment plan.
            </Text>
          </View>

          <View style={styles.aboutMeta}>
            <Text style={styles.aboutMetaText}>App version 1.0.0</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.aboutLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.aboutLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2D1B69',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B5B8A',
    lineHeight: 22,
    marginBottom: 28,
  },

  // ── Sections ──────────────────────────────────────────────────────
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0EBF5',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── Rows ──────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    minHeight: 56,
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A3580',
  },
  rowValue: {
    fontSize: 13,
    color: '#8B7AAA',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0EBF5',
    marginVertical: 2,
  },

  // ── Diagnosis picker ─────────────────────────────────────────────
  diagnosisSection: {
    paddingTop: 4,
  },
  diagnosisCard: {
    backgroundColor: '#F9F5FF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E8E0F0',
  },
  diagnosisCardSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F0FF',
  },
  diagnosisCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#C4B5D8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioCircleSelected: {
    borderColor: '#7C3AED',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#7C3AED',
  },
  diagnosisTextWrap: {
    flex: 1,
  },
  diagnosisLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A3580',
    marginBottom: 2,
  },
  diagnosisLabelSelected: {
    color: '#2D1B69',
  },
  diagnosisDesc: {
    fontSize: 13,
    color: '#8B7AAA',
    lineHeight: 18,
  },

  // ── Cycle fields ──────────────────────────────────────────────────
  cycleFields: {
    backgroundColor: '#F9F5FF',
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5C4A7A',
  },
  fieldInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E0F0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#2D1B69',
    width: 180,
    textAlign: 'right',
  },
  fieldInputSmall: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E0F0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#2D1B69',
    width: 80,
    textAlign: 'right',
  },
  fieldWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldUnit: {
    fontSize: 14,
    color: '#8B7AAA',
  },

  // ── Buttons ───────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  // ── Notifications ─────────────────────────────────────────────────
  indentedField: {
    backgroundColor: '#F9F5FF',
    borderRadius: 12,
    padding: 14,
    marginLeft: 0,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#9B8AB5',
    marginTop: 6,
    lineHeight: 16,
  },
  notifNote: {
    fontSize: 12,
    color: '#9B8AB5',
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 4,
  },

  // ── Subscription ──────────────────────────────────────────────────
  subscriptionCard: {
    backgroundColor: '#F9F5FF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8E0F0',
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  subscriptionPlanLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4A3580',
  },
  planBadge: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  freeBadge: {
    backgroundColor: '#E8E0F0',
  },
  premiumBadge: {
    backgroundColor: '#7C3AED',
  },
  planBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  freeBadgeText: {
    color: '#5C4A7A',
  },
  premiumBadgeText: {
    color: '#FFFFFF',
  },
  upgradeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E0D8F0',
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D1B69',
    marginBottom: 14,
  },
  benefitList: {
    marginBottom: 20,
    gap: 8,
  },
  benefitItem: {
    fontSize: 15,
    color: '#4A3580',
    lineHeight: 22,
  },
  upgradeButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  privacyPledge: {
    fontSize: 12,
    color: '#9B8AB5',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
  premiumThankYou: {
    fontSize: 15,
    color: '#4A3580',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#7C3AED',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Data & Privacy ────────────────────────────────────────────────
  actionButton: {
    backgroundColor: '#F9F5FF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8E0F0',
  },
  actionButtonDanger: {
    borderColor: '#FDD8D8',
    backgroundColor: '#FFF5F5',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A3580',
    marginBottom: 4,
  },
  actionTextDanger: {
    color: '#CC3333',
  },
  actionButtonHint: {
    fontSize: 13,
    color: '#8B7AAA',
    lineHeight: 18,
  },

  // ── About ─────────────────────────────────────────────────────────
  aboutCard: {
    gap: 16,
  },
  aboutTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D1B69',
  },
  aboutText: {
    fontSize: 15,
    color: '#5C4A7A',
    lineHeight: 22,
  },
  pledgeCard: {
    backgroundColor: '#F5F0FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0D8F0',
  },
  pledgeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
    marginBottom: 8,
  },
  pledgeText: {
    fontSize: 14,
    color: '#5C4A7A',
    lineHeight: 20,
  },
  disclaimerCard: {
    backgroundColor: '#FFFAF0',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0E4C8',
  },
  disclaimerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#B8860B',
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#6B5A30',
    lineHeight: 18,
  },
  aboutMeta: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  aboutMetaText: {
    fontSize: 13,
    color: '#9B8AB5',
  },
  aboutLink: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 40,
  },
});
