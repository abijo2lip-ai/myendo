import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { PremiumGate } from '@/components/PremiumGate';
import {
  generateInsights,
  getCachedInsights,
  getLoggedDaysCount,
  getPainTrend,
} from '@/lib/insights';
import type { PatternInsight, CyclePhase } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;

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
  tagBg: '#F5F0FF',
  tagBgActive: '#7C3AED',
  tagText: '#5C4A7A',
  tagTextActive: '#FFFFFF',
  // Correlation colors
  strongPositive: '#E8505B',   // red
  moderatePositive: '#FF9800', // amber
  weakPositive: '#9B8AB5',    // neutral/muted
  // Chart gradient
  chartGradientFrom: '#7C3AED',
  chartGradientTo: '#EDE4FA',
  // Phase colors
  phaseMenstrual: '#E8505B',
  phaseFollicular: '#4CAF50',
  phaseOvulation: '#2196F3',
  phaseLuteal: '#FF9800',
};

const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

const CYCLE_PHASE_COLORS: Record<CyclePhase, string> = {
  menstrual: CALMING_PALETTE.phaseMenstrual,
  follicular: CALMING_PALETTE.phaseFollicular,
  ovulation: CALMING_PALETTE.phaseOvulation,
  luteal: CALMING_PALETTE.phaseLuteal,
};

function formatTag(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPhase(phase: CyclePhase | null): string {
  if (!phase) return '';
  return CYCLE_PHASE_LABELS[phase] ?? '';
}

// ─── Correlation Helpers ──────────────────────────────────────────────

function getCorrelationColor(strength: number): string {
  if (strength >= 2.0) return CALMING_PALETTE.strongPositive;
  if (strength >= 1.4) return CALMING_PALETTE.moderatePositive;
  return CALMING_PALETTE.weakPositive;
}

function getCorrelationLabel(strength: number): string {
  if (strength >= 2.0) return 'Strong pattern';
  if (strength >= 1.4) return 'Moderate pattern';
  return 'Mild pattern';
}

function getHighlightText(strength: number): string {
  // Convert correlation strength to a human-readable highlight
  const pct = Math.round((strength - 1) * 100);
  if (pct <= 0) return '';
  return `+${pct}% more likely`;
}

// ─── Component ────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [painTrend, setPainTrend] = useState<
    { date: string; avgPain: number; cyclePhase: CyclePhase | null }[]
  >([]);
  const [loggedDays, setLoggedDays] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // ─── Load data ────────────────────────────────────────────────────
  const loadData = useCallback(
    async (forceRefresh = false) => {
      if (!user) return;
      setLoading(true);
      try {
        let data: PatternInsight[];
        if (forceRefresh) {
          data = await generateInsights(user.id);
        } else {
          // Try cached first, then generate
          const cached = await getCachedInsights(user.id);
          if (cached.length > 0) {
            data = cached;
          } else {
            data = await generateInsights(user.id);
          }
        }

        const [trend, days] = await Promise.all([
          getPainTrend(user.id),
          getLoggedDaysCount(user.id),
        ]);

        setInsights(data);
        setPainTrend(trend);
        setLoggedDays(days);
      } catch (err) {
        console.error('Error loading insights:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
  }, [loadData]);

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

  // ─── Empty states ─────────────────────────────────────────────────
  const hasEnoughData = loggedDays >= 7;
  const hasInsights = insights.length > 0;

  // ─── Chart data ───────────────────────────────────────────────────
  const chartData = painTrend.length > 0 ? {
    labels: painTrend
      .filter((_, i) => i % Math.max(1, Math.floor(painTrend.length / 6)) === 0)
      .map((d) => format(parseISO(d.date), 'M/d')),
    datasets: [
      {
        data: painTrend.map((d) => d.avgPain),
        color: () => CALMING_PALETTE.primary,
        strokeWidth: 2,
      },
    ],
  } : null;

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ════════════════════════════════════════════════════════
            HEADER
            ════════════════════════════════════════════════════════ */}
        <View style={styles.headerGradient}>
          <Text style={styles.headerTitle}>Your Patterns</Text>
          <Text style={styles.headerSubtitle}>
            Patterns discovered from your own tracking data
          </Text>
        </View>

        <PremiumGate featureName="Pattern Insights">
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={CALMING_PALETTE.primary} />
              <Text style={styles.loadingText}>Analyzing your data...</Text>
            </View>
          ) : !hasEnoughData ? (
            /* ── Empty: not enough data ─────────────────────────── */
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>Not enough data yet</Text>
              <Text style={styles.emptyText}>
                Log symptoms and meals for at least 7 days to see your first patterns.
              </Text>
              <View style={styles.emptyStat}>
                <Text style={styles.emptyStatNumber}>{loggedDays}</Text>
                <Text style={styles.emptyStatLabel}>days logged so far</Text>
              </View>
            </View>
          ) : (
            <>
              {/* ── Refresh button ─────────────────────────────────── */}
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleRefresh}
                disabled={refreshing}
                activeOpacity={0.7}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={CALMING_PALETTE.primary} />
                ) : (
                  <Text style={styles.refreshBtnText}>🔄 Refresh Insights</Text>
                )}
              </TouchableOpacity>

              {!hasInsights ? (
                /* ── Empty: not enough patterns ─────────────────── */
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyEmoji}>📊</Text>
                  <Text style={styles.emptyTitle}>Keep logging!</Text>
                  <Text style={styles.emptyText}>
                    We need more data to find reliable patterns. You have{' '}
                    <Text style={styles.bold}>{loggedDays}</Text> days logged so far.
                  </Text>
                </View>
              ) : (
                <>
                  {/* ════════════════════════════════════════════════════
                      SECTION 2: Top Pattern Cards
                      ════════════════════════════════════════════════ */}
                  <Text style={styles.sectionTitle}>Top Discoveries</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cardsScroll}
                    decelerationRate="fast"
                    snapToInterval={280 + 16}
                    snapToAlignment="start"
                  >
                    {insights.slice(0, 5).map((insight) => {
                      const isExpanded = expandedCard === insight.id;
                      const corrColor = getCorrelationColor(insight.correlation_strength);
                      const highlight = getHighlightText(insight.correlation_strength);

                      return (
                        <TouchableOpacity
                          key={insight.id}
                          style={[styles.patternCard, { borderLeftColor: corrColor }]}
                          onPress={() =>
                            setExpandedCard(isExpanded ? null : insight.id)
                          }
                          activeOpacity={0.9}
                        >
                          <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>
                              {formatTag(insight.symptom)} × {formatTag(insight.food_tag)}
                            </Text>
                            <View
                              style={[styles.corrBadge, { backgroundColor: corrColor + '18' }]}
                            >
                              <Text style={[styles.corrLabel, { color: corrColor }]}>
                                {getCorrelationLabel(insight.correlation_strength)}
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.highlightText, { color: corrColor }]}>
                            {highlight}
                          </Text>

                          <Text style={styles.cardContext}>
                            {insight.cycle_phase
                              ? `during ${formatPhase(insight.cycle_phase as CyclePhase)} phase`
                              : 'overall'}
                          </Text>

                          <Text style={styles.cardSample}>
                            Based on {insight.sample_size} days of data
                          </Text>

                          {isExpanded && (
                            <View style={styles.cardDetail}>
                              <View style={styles.cardDetailDivider} />
                              <Text style={styles.cardDetailText}>
                                {insight.insight_text}
                              </Text>
                            </View>
                          )}

                          <Text style={styles.cardTapHint}>
                            {isExpanded ? 'Tap to collapse' : 'Tap for details'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* ════════════════════════════════════════════════════
                      SECTION 3: Trend Chart
                      ════════════════════════════════════════════════ */}
                  {chartData && (
                    <View style={styles.chartSection}>
                      <Text style={styles.sectionTitle}>Pain Trend</Text>
                      <View style={styles.chartCard}>
                        <LineChart
                          data={{
                            labels: chartData.labels,
                            datasets: chartData.datasets,
                          }}
                          width={SCREEN_WIDTH - 64}
                          height={220}
                          yAxisSuffix=""
                          yAxisInterval={1}
                          fromZero
                          chartConfig={{
                            backgroundColor: '#FFFFFF',
                            backgroundGradientFrom: '#FFFFFF',
                            backgroundGradientTo: '#FFFFFF',
                            color: (opacity = 1) =>
                              `rgba(124, 58, 237, ${opacity})`,
                            labelColor: () => CALMING_PALETTE.muted,
                            style: { borderRadius: 16 },
                            propsForDots: {
                              r: '4',
                              strokeWidth: '2',
                              stroke: CALMING_PALETTE.primary,
                            },
                            propsForBackgroundLines: {
                              stroke: CALMING_PALETTE.border,
                              strokeWidth: 1,
                            },
                          }}
                          bezier
                          style={styles.chart}
                          withInnerLines={true}
                          withOuterLines={false}
                          withVerticalLines={false}
                          withHorizontalLabels={true}
                          withVerticalLabels={true}
                        />

                        {/* Phase indicator strip */}
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.phaseStripScroll}
                          contentContainerStyle={styles.phaseStripContent}
                        >
                          {painTrend.map((d, i) => (
                            <View
                              key={i}
                              style={[
                                styles.phaseStripDot,
                                {
                                  backgroundColor: d.cyclePhase
                                    ? CYCLE_PHASE_COLORS[d.cyclePhase]
                                    : CALMING_PALETTE.border,
                                },
                              ]}
                            />
                          ))}
                        </ScrollView>

                        {/* Phase legend */}
                        <View style={styles.phaseLegend}>
                          {(
                            ['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]
                          ).map((phase) => (
                            <View key={phase} style={styles.phaseLegendItem}>
                              <View
                                style={[
                                  styles.phaseLegendDot,
                                  {
                                    backgroundColor: CYCLE_PHASE_COLORS[phase],
                                  },
                                ]}
                              />
                              <Text style={styles.phaseLegendText}>
                                {CYCLE_PHASE_LABELS[phase]}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* ════════════════════════════════════════════════════
                      SECTION 4: Doctor Discussion Starters
                      ════════════════════════════════════════════════ */}
                  {insights.length > 0 && (
                    <View style={styles.doctorSection}>
                      <Text style={styles.sectionTitle}>
                        What to discuss with your doctor
                      </Text>
                      <Text style={styles.sectionSubtitle}>
                        Use these patterns as conversation starters at your next
                        appointment
                      </Text>

                      {insights.slice(0, 5).map((insight) => {
                        const phaseStr = insight.cycle_phase
                          ? ` during my ${formatPhase(insight.cycle_phase as CyclePhase).toLowerCase()} phase`
                          : '';
                        const starter = `I noticed that my ${formatTag(
                          insight.symptom
                        ).toLowerCase()} increases when I eat ${formatTag(
                          insight.food_tag
                        ).toLowerCase()}${phaseStr}. Could this be related to inflammation?`;

                        return (
                          <View key={`doc-${insight.id}`} style={styles.doctorCard}>
                            <Text style={styles.doctorQuote}>“{starter}”</Text>
                            <Text style={styles.doctorSample}>
                              Based on {insight.sample_size} days of tracking
                            </Text>
                          </View>
                        );
                      })}

                      {/* Additional general suggestion */}
                      {painTrend.length > 0 && (
                        <View style={styles.doctorCard}>
                          <Text style={styles.doctorQuote}>
                            “My pain levels are consistently higher in the first few days
                            of my menstrual phase. Are there treatments that could help
                            during this window?”
                          </Text>
                          <Text style={styles.doctorSample}>
                            Based on your pain trend data
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* ════════════════════════════════════════════════════
                      SECTION 5: All Patterns (full list)
                      ════════════════════════════════════════════════ */}
                  {insights.length > 5 && (
                    <View style={styles.allPatternsSection}>
                      <Text style={styles.sectionTitle}>All Patterns</Text>
                      {insights.map((insight) => (
                        <View key={`all-${insight.id}`} style={styles.allPatternRow}>
                          <View style={styles.allPatternLeft}>
                            <Text style={styles.allPatternTitle}>
                              {formatTag(insight.symptom)} × {formatTag(insight.food_tag)}
                            </Text>
                            <Text style={styles.allPatternContext}>
                              {insight.cycle_phase
                                ? `during ${formatPhase(insight.cycle_phase as CyclePhase)} phase`
                                : 'overall'}{' '}
                              · {insight.sample_size} days
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.allPatternBadge,
                              {
                                backgroundColor:
                                  getCorrelationColor(insight.correlation_strength) + '18',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.allPatternBadgeText,
                                {
                                  color: getCorrelationColor(insight.correlation_strength),
                                },
                              ]}
                            >
                              {getHighlightText(insight.correlation_strength)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* ════════════════════════════════════════════════════
                      MEDICAL DISCLAIMER (always visible)
                      ════════════════════════════════════════════════════ */}
                </>
              )}

              {/* Disclaimer shown even when there are insights */}
              <View style={styles.disclaimerContainer}>
                <Text style={styles.disclaimerIcon}>⚕️</Text>
                <Text style={styles.disclaimerText}>
                  This is a pattern from your own data, not a medical diagnosis.
                  Discuss with your doctor before eliminating foods or changing your
                  treatment plan.
                </Text>
              </View>

              <View style={styles.bottomPad} />
            </>
          )}
        </PremiumGate>
      </ScrollView>
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
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: CALMING_PALETTE.muted,
  },

  // ─── Header ───────────────────────────────────────────────────────
  headerGradient: {
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

  // ─── Refresh ──────────────────────────────────────────────────────
  refreshBtn: {
    alignSelf: 'flex-end',
    marginRight: 24,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: CALMING_PALETTE.primaryLight,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: CALMING_PALETTE.primary,
  },

  // ─── Section titles ───────────────────────────────────────────────
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: CALMING_PALETTE.muted,
    paddingHorizontal: 24,
    marginBottom: 12,
    lineHeight: 20,
  },

  // ─── Empty states ─────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: CALMING_PALETTE.body,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  emptyStat: {
    marginTop: 24,
    alignItems: 'center',
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
  },
  emptyStatNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: CALMING_PALETTE.primary,
  },
  emptyStatLabel: {
    fontSize: 14,
    color: CALMING_PALETTE.muted,
    marginTop: 4,
  },
  bold: {
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
  },

  // ─── Pattern Cards (horizontal scroll) ────────────────────────────
  cardsScroll: {
    paddingLeft: 24,
    paddingRight: 8,
    gap: 16,
  },
  patternCard: {
    width: 280,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    borderLeftWidth: 4,
    padding: 18,
    shadowColor: '#2D1B69',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: CALMING_PALETTE.heading,
    flex: 1,
    marginRight: 8,
  },
  corrBadge: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  corrLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  highlightText: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  cardContext: {
    fontSize: 13,
    color: CALMING_PALETTE.body,
    marginBottom: 4,
  },
  cardSample: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    fontWeight: '500',
  },
  cardDetail: {
    marginTop: 12,
  },
  cardDetailDivider: {
    height: 1,
    backgroundColor: CALMING_PALETTE.border,
    marginBottom: 10,
  },
  cardDetailText: {
    fontSize: 14,
    color: CALMING_PALETTE.body,
    lineHeight: 21,
  },
  cardTapHint: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    marginTop: 12,
    fontWeight: '500',
  },

  // ─── Chart ────────────────────────────────────────────────────────
  chartSection: {
    marginTop: 8,
  },
  chartCard: {
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 16,
    shadowColor: '#2D1B69',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  chart: {
    borderRadius: 16,
    marginLeft: -8,
  },
  phaseStripScroll: {
    marginTop: 8,
    maxHeight: 12,
  },
  phaseStripContent: {
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 0,
  },
  phaseStripDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.7,
  },
  phaseLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  phaseLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phaseLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  phaseLegendText: {
    fontSize: 11,
    color: CALMING_PALETTE.muted,
    fontWeight: '500',
  },

  // ─── Doctor Section ───────────────────────────────────────────────
  doctorSection: {
    marginTop: 8,
  },
  doctorCard: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: CALMING_PALETTE.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CALMING_PALETTE.border,
    padding: 16,
  },
  doctorQuote: {
    fontSize: 15,
    color: CALMING_PALETTE.body,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  doctorSample: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    marginTop: 8,
    fontWeight: '500',
  },

  // ─── All Patterns ─────────────────────────────────────────────────
  allPatternsSection: {
    marginTop: 8,
  },
  allPatternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: CALMING_PALETTE.border,
  },
  allPatternLeft: {
    flex: 1,
    marginRight: 12,
  },
  allPatternTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: CALMING_PALETTE.heading,
  },
  allPatternContext: {
    fontSize: 12,
    color: CALMING_PALETTE.muted,
    marginTop: 2,
  },
  allPatternBadge: {
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  allPatternBadgeText: {
    fontSize: 13,
    fontWeight: '700',
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
});
