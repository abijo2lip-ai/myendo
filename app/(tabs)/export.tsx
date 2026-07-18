import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { format, parseISO, subDays } from 'date-fns';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PremiumGate } from '@/components/PremiumGate';
import { getCachedInsights } from '@/lib/insights';
import { buildPdfHtml, buildCsv, type ExportReportData } from '@/lib/export-pdf';
import type { SymptomLog, FoodLog, PatternInsight } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────

const CALMING_PALETTE = {
  bg: '#FFFFFF',
  surface: '#F9F5FF',
  surfaceAlt: '#F0EBF8',
  border: '#E8E0F0',
  primary: '#7C3AED',
  primaryLight: '#EDE4FA',
  heading: '#2D1B69',
  body: '#5C4A7A',
  muted: '#9B8AB5',
  success: '#4CAF50',
  tagBg: '#F5F0FF',
  tagBgActive: '#7C3AED',
  tagText: '#5C4A7A',
  tagTextActive: '#FFFFFF',
};

function formatTag(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Preset Ranges ────────────────────────────────────────────────────

const TODAY = format(new Date(), 'yyyy-MM-dd');

const PRESETS: { label: string; getRange: () => { from: string; to: string } }[] = [
  { label: 'Last 7 days', getRange: () => ({ from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: TODAY }) },
  { label: 'Last 30 days', getRange: () => ({ from: format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: TODAY }) },
  { label: 'Last 3 months', getRange: () => ({ from: format(subDays(new Date(), 89), 'yyyy-MM-dd'), to: TODAY }) },
  { label: 'All data', getRange: () => ({ from: '2024-01-01', to: TODAY }) },
];

// ─── Component ────────────────────────────────────────────────────────

export default function ExportScreen() {
  const { user, profile, isLoading: authLoading } = useAuth();

  // ─── Date state ───────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(TODAY);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [activePreset, setActivePreset] = useState<string>('Last 30 days');

  // ─── Data state ───────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [previewGenerated, setPreviewGenerated] = useState(false);

  // ─── Export state ─────────────────────────────────────────────────
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // ─── Fetch data for preview ───────────────────────────────────────
  const fetchPreviewData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setPreviewGenerated(false);

    try {
      const [symptomRes, foodRes, cachedInsights] = await Promise.all([
        supabase
          .from('symptom_logs')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', dateFrom)
          .lte('date', dateTo)
          .order('date', { ascending: true }),
        supabase
          .from('food_logs')
          .select('*')
          .eq('user_id', user.id)
          .gte('timestamp', `${dateFrom}T00:00:00`)
          .lte('timestamp', `${dateTo}T23:59:59`)
          .order('timestamp', { ascending: true }),
        getCachedInsights(user.id),
      ]);

      const symptoms = (symptomRes.data as SymptomLog[]) ?? [];
      const foods = (foodRes.data as FoodLog[]) ?? [];

      setSymptomLogs(symptoms);
      setFoodLogs(foods);
      setInsights(cachedInsights);
      setPreviewGenerated(true);
    } catch (err) {
      console.error('Error fetching export data:', err);
      Alert.alert('Error', 'Could not load your data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, dateFrom, dateTo]);

  // ─── Preview data ─────────────────────────────────────────────────
  const preview = useMemo(() => {
    if (!previewGenerated) return null;

    const symptomDays = symptomLogs.length;
    const mealCount = foodLogs.length;

    // Avg pain
    const avgPain =
      symptomLogs.reduce((sum, log) => {
        const regions = log.pain_regions ?? [];
        if (regions.length === 0) return sum;
        return sum + regions.reduce((s, r) => s + (r.intensity ?? 0), 0) / regions.length;
      }, 0) / (symptomDays || 1);

    // Top symptoms
    const symptomFreq = new Map<string, number>();
    for (const log of symptomLogs) {
      for (const tag of log.symptom_tags ?? []) {
        symptomFreq.set(tag, (symptomFreq.get(tag) ?? 0) + 1);
      }
    }
    const topSymptoms = [...symptomFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Top food correlations
    const topInsights = insights.slice(0, 3);

    return { symptomDays, mealCount, avgPain, topSymptoms, topInsights };
  }, [previewGenerated, symptomLogs, foodLogs, insights]);

  const hasData = preview !== null && preview.symptomDays > 0;

  // ─── Build export data ────────────────────────────────────────────
  const buildExportData = useCallback((): ExportReportData => ({
    dateRange: { from: dateFrom, to: dateTo },
    generatedDate: TODAY,
    symptomLogs,
    foodLogs,
    insights,
    diagnosisStatus: profile?.diagnosis_status ?? 'suspected',
    cycleTrackingEnabled: profile?.cycle_tracking_enabled ?? true,
    avgCycleLength: profile?.avg_cycle_length_days ?? 28,
  }), [dateFrom, dateTo, symptomLogs, foodLogs, insights, profile]);

  // ─── PDF Export ───────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (!hasData) {
      Alert.alert('No Data', 'There is no data to export for the selected date range.');
      return;
    }
    setExportingPdf(true);
    try {
      const data = buildExportData();
      const html = buildPdfHtml(data);
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Doctor Report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Success', 'PDF saved. Sharing is not available on this device.');
      }
    } catch (err) {
      console.error('PDF export error:', err);
      Alert.alert('Export Failed', 'Could not generate the PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  }, [hasData, buildExportData]);

  // ─── CSV Export ───────────────────────────────────────────────────
  const handleExportCsv = useCallback(async () => {
    if (!hasData) {
      Alert.alert('No Data', 'There is no data to export for the selected date range.');
      return;
    }
    setExportingCsv(true);
    try {
      const data = buildExportData();
      const csv = buildCsv(data);

      const fileUri = (cacheDirectory ?? '') + `flointra-export-${dateFrom}-to-${dateTo}.csv`;
      await writeAsStringAsync(fileUri, csv, {
        encoding: 'utf8' as any,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Share CSV Data',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Success', 'CSV saved to files.');
      }
    } catch (err) {
      console.error('CSV export error:', err);
      Alert.alert('Export Failed', 'Could not generate the CSV. Please try again.');
    } finally {
      setExportingCsv(false);
    }
  }, [hasData, buildExportData, dateFrom, dateTo]);

  // ─── Handle preset selection ──────────────────────────────────────
  const handlePreset = (preset: (typeof PRESETS)[0]) => {
    const range = preset.getRange();
    setDateFrom(range.from);
    setDateTo(range.to);
    setActivePreset(preset.label);
    setPreviewGenerated(false);
  };

  // ─── Auth loading ─────────────────────────────────────────────────
  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CALMING_PALETTE.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════════════════ HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Doctor Report</Text>
          <Text style={styles.headerSubtitle}>
            Generate a summary to share with your healthcare provider
          </Text>
        </View>

        <PremiumGate featureName="Doctor Export">
          {/* ═══════════════════════════════════════════════════════ SECTION 1: Date Range */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Date Range</Text>

            {/* Date inputs */}
            <View style={styles.dateInputRow}>
              <TouchableOpacity
                style={styles.dateField}
                onPress={() => setShowFromPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateFieldLabel}>From</Text>
                <Text style={styles.dateFieldValue}>
                  {format(parseISO(dateFrom), 'MMM d, yyyy')}
                </Text>
              </TouchableOpacity>
              <Text style={styles.dateSeparator}>→</Text>
              <TouchableOpacity
                style={styles.dateField}
                onPress={() => setShowToPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateFieldLabel}>To</Text>
                <Text style={styles.dateFieldValue}>
                  {format(parseISO(dateTo), 'MMM d, yyyy')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Presets */}
            <View style={styles.presetRow}>
              {PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.label}
                  style={[
                    styles.presetChip,
                    activePreset === preset.label && styles.presetChipActive,
                  ]}
                  onPress={() => handlePreset(preset)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      activePreset === preset.label && styles.presetChipTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Generate Preview button */}
            <TouchableOpacity
              style={[styles.generateBtn, loading && styles.generateBtnDisabled]}
              onPress={fetchPreviewData}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.generateBtnText}>Generate Preview</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ═══════════════════════════════════════════════════════ SECTION 2: Report Preview */}
          {preview !== null && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Report Preview</Text>

              {!hasData ? (
                <View style={styles.noDataCard}>
                  <Text style={styles.noDataIcon}>📋</Text>
                  <Text style={styles.noDataTitle}>No data in this range</Text>
                  <Text style={styles.noDataText}>
                    There are no symptom logs or food entries for the selected dates.
                    Try a wider date range.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Summary cards */}
                  <View style={styles.previewGrid}>
                    <View style={styles.previewCard}>
                      <Text style={styles.previewValue}>{preview.symptomDays}</Text>
                      <Text style={styles.previewLabel}>days of symptom data</Text>
                    </View>
                    <View style={styles.previewCard}>
                      <Text style={styles.previewValue}>{preview.mealCount}</Text>
                      <Text style={styles.previewLabel}>meals logged</Text>
                    </View>
                    <View style={styles.previewCard}>
                      <Text style={styles.previewValue}>{preview.avgPain.toFixed(1)}</Text>
                      <Text style={styles.previewLabel}>average pain score</Text>
                    </View>
                  </View>

                  {/* Top symptoms */}
                  {preview.topSymptoms.length > 0 && (
                    <View style={styles.previewListSection}>
                      <Text style={styles.previewListTitle}>Most frequent symptoms:</Text>
                      <View style={styles.tagRow}>
                        {preview.topSymptoms.map(([tag, count]) => (
                          <View key={tag} style={styles.previewTag}>
                            <Text style={styles.previewTagText}>
                              {formatTag(tag)} ({count}d)
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Top patterns */}
                  {preview.topInsights.length > 0 && (
                    <View style={styles.previewListSection}>
                      <Text style={styles.previewListTitle}>
                        Top symptom patterns found:
                      </Text>
                      {preview.topInsights.map((insight) => (
                        <View key={insight.id} style={styles.previewInsightRow}>
                          <Text style={styles.previewInsightPair}>
                            {formatTag(insight.symptom)} × {formatTag(insight.food_tag)}
                          </Text>
                          <Text style={styles.previewInsightDetail}>
                            +{Math.round((insight.correlation_strength - 1) * 100)}% ·{' '}
                            {insight.sample_size} days
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════ SECTION 3: Export Options */}
          {preview !== null && hasData && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Export Options</Text>

              {/* PDF Export */}
              <TouchableOpacity
                style={[styles.exportBtn, styles.exportBtnPrimary, exportingPdf && styles.exportBtnDisabled]}
                onPress={handleExportPdf}
                disabled={exportingPdf}
                activeOpacity={0.8}
              >
                {exportingPdf ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.exportBtnIcon}>📄</Text>
                    <Text style={styles.exportBtnText}>Export as PDF</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.exportBtnHint}>
                Professional medical-report format with charts, tables, and insights —
                ready to share with your doctor.
              </Text>

              {/* CSV Export */}
              <TouchableOpacity
                style={[styles.exportBtn, styles.exportBtnSecondary, exportingCsv && styles.exportBtnDisabled]}
                onPress={handleExportCsv}
                disabled={exportingCsv}
                activeOpacity={0.8}
              >
                {exportingCsv ? (
                  <ActivityIndicator color={CALMING_PALETTE.primary} size="small" />
                ) : (
                  <>
                    <Text style={styles.exportBtnIcon}>📊</Text>
                    <Text style={[styles.exportBtnText, styles.exportBtnTextSecondary]}>
                      Export as CSV
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.exportBtnHint}>
                Raw data with one row per day — ideal for spreadsheets or importing into
                other health tools.
              </Text>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════ MEDICAL DISCLAIMER */}
          <View style={styles.disclaimerContainer}>
            <Text style={styles.disclaimerIcon}>⚕️</Text>
            <Text style={styles.disclaimerText}>
              This report is generated from your personal tracking data. It is not a
              medical diagnosis. Always discuss your findings with your healthcare
              provider before making changes to your treatment plan.
            </Text>
          </View>

          <View style={styles.bottomPad} />
        </PremiumGate>
      </ScrollView>

      {/* ─── From Date Picker Modal ───────────────────────────────── */}
      <Modal
        visible={showFromPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFromPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowFromPicker(false)}
        >
          <Pressable style={styles.calendarModal} onPress={() => {}}>
            <Text style={styles.calendarTitle}>Select start date</Text>
            <Calendar
              current={dateFrom}
              maxDate={dateTo}
              onDayPress={(day: { dateString: string }) => {
                setDateFrom(day.dateString);
                setShowFromPicker(false);
                setActivePreset('');
                setPreviewGenerated(false);
              }}
              markedDates={{
                [dateFrom]: { selected: true, selectedColor: CALMING_PALETTE.primary },
                [dateTo]: { selected: true, selectedColor: CALMING_PALETTE.primaryLight },
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
              onPress={() => setShowFromPicker(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.calendarCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── To Date Picker Modal ─────────────────────────────────── */}
      <Modal
        visible={showToPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowToPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowToPicker(false)}
        >
          <Pressable style={styles.calendarModal} onPress={() => {}}>
            <Text style={styles.calendarTitle}>Select end date</Text>
            <Calendar
              current={dateTo}
              minDate={dateFrom}
              maxDate={TODAY}
              onDayPress={(day: { dateString: string }) => {
                setDateTo(day.dateString);
                setShowToPicker(false);
                setActivePreset('');
                setPreviewGenerated(false);
              }}
              markedDates={{
                [dateTo]: { selected: true, selectedColor: CALMING_PALETTE.primary },
                [dateFrom]: { selected: true, selectedColor: CALMING_PALETTE.primaryLight },
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
              onPress={() => setShowToPicker(false)}
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
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Header ───────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: CALMING_PALETTE.surfaceAlt,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: CALMING_PALETTE.heading,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: CALMING_PALETTE.body,
    marginTop: 4,
    lineHeight: 22,
  },

  // ─── Section ──────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 14,
  },

  // ─── Date Inputs ─────────────────────────────────────────────────
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dateField: {
    flex: 1,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 14,
    alignItems: 'center',
  },
  dateFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: CALMING_PALETTE.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateFieldValue: {
    fontSize: 16,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
  },
  dateSeparator: {
    fontSize: 20,
    color: CALMING_PALETTE.muted,
    fontWeight: '300',
  },

  // ─── Presets ──────────────────────────────────────────────────────
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  presetChip: {
    backgroundColor: CALMING_PALETTE.tagBg,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  presetChipActive: {
    backgroundColor: CALMING_PALETTE.tagBgActive,
    borderColor: CALMING_PALETTE.tagBgActive,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.tagText,
  },
  presetChipTextActive: {
    color: CALMING_PALETTE.tagTextActive,
  },

  // ─── Generate Button ──────────────────────────────────────────────
  generateBtn: {
    backgroundColor: CALMING_PALETTE.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: CALMING_PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  // ─── Preview ──────────────────────────────────────────────────────
  previewGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  previewCard: {
    flex: 1,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 16,
    alignItems: 'center',
  },
  previewValue: {
    fontSize: 26,
    fontWeight: '800',
    color: CALMING_PALETTE.primary,
  },
  previewLabel: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    marginTop: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  previewListSection: {
    marginBottom: 16,
  },
  previewListTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  previewTag: {
    backgroundColor: CALMING_PALETTE.primaryLight,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  previewTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },
  previewInsightRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: CALMING_PALETTE.border,
  },
  previewInsightPair: {
    fontSize: 14,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
  },
  previewInsightDetail: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    marginTop: 2,
  },

  // ─── No Data ──────────────────────────────────────────────────────
  noDataCard: {
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 24,
    alignItems: 'center',
  },
  noDataIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  noDataTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 6,
  },
  noDataText: {
    fontSize: 14,
    color: CALMING_PALETTE.body,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ─── Export Buttons ──────────────────────────────────────────────
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
    marginBottom: 6,
  },
  exportBtnPrimary: {
    backgroundColor: CALMING_PALETTE.primary,
    shadowColor: CALMING_PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },
  exportBtnSecondary: {
    backgroundColor: CALMING_PALETTE.surface,
    borderWidth: 2,
    borderColor: CALMING_PALETTE.primary,
    marginTop: 16,
  },
  exportBtnDisabled: {
    opacity: 0.6,
  },
  exportBtnIcon: {
    fontSize: 20,
  },
  exportBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exportBtnTextSecondary: {
    color: CALMING_PALETTE.primary,
  },
  exportBtnHint: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    lineHeight: 17,
    paddingHorizontal: 8,
    marginTop: 2,
  },

  // ─── Disclaimer ───────────────────────────────────────────────────
  disclaimerContainer: {
    marginHorizontal: 24,
    marginTop: 28,
    backgroundColor: CALMING_PALETTE.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  disclaimerIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 13,
    color: CALMING_PALETTE.body,
    lineHeight: 19,
    fontWeight: '500',
  },

  bottomPad: {
    height: 40,
  },

  // ─── Calendar Modal ──────────────────────────────────────────────
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
