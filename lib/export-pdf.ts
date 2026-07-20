// MyEndo — Doctor Export: PDF Generation
// Generates a shareable medical-report-style PDF for healthcare provider appointments.
// CONSTRAINT: NO calorie, macro, weight, BMI, diet, or goal language anywhere.

import type { SymptomLog, FoodLog, PatternInsight, CyclePhase, PainRegion } from '@/types';

// ─── Palette ────────────────────────────────────────────────────────────

const COLORS = {
  primary: '#7C3AED',
  heading: '#2D1B69',
  body: '#333333',
  muted: '#666666',
  border: '#E0D8F0',
  tableHeader: '#F5F0FF',
  tableStripe: '#FAF7FF',
  lavenderLight: '#F9F5FF',
};

// ─── Helpers ────────────────────────────────────────────────────────────

function formatTag(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

// ─── CSS ─────────────────────────────────────────────────────────────────

function getCss(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: ${COLORS.body};
      font-size: 11pt;
      line-height: 1.5;
      padding: 40px;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid ${COLORS.primary};
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 24pt;
      color: ${COLORS.heading};
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .header .subtitle {
      font-size: 10pt;
      color: ${COLORS.muted};
      margin-top: 4px;
    }
    .header .disclaimer {
      margin-top: 10px;
      font-size: 9pt;
      color: ${COLORS.muted};
      font-style: italic;
      border-top: 1px solid ${COLORS.border};
      padding-top: 8px;
    }
    .section {
      margin-bottom: 22px;
      page-break-inside: avoid;
    }
    .section h2 {
      font-size: 14pt;
      color: ${COLORS.primary};
      border-bottom: 1.5px solid ${COLORS.border};
      padding-bottom: 4px;
      margin-bottom: 12px;
      font-weight: 700;
    }
    .section h3 {
      font-size: 12pt;
      color: ${COLORS.heading};
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 12px;
    }
    table th {
      background: ${COLORS.tableHeader};
      color: ${COLORS.heading};
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border-bottom: 2px solid ${COLORS.border};
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    table td {
      padding: 7px 10px;
      border-bottom: 1px solid ${COLORS.border};
      vertical-align: top;
    }
    table tr:nth-child(even) td {
      background: ${COLORS.tableStripe};
    }
    .stat-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 12px;
    }
    .stat-card {
      background: ${COLORS.lavenderLight};
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      padding: 12px 16px;
      flex: 1 1 140px;
      text-align: center;
    }
    .stat-card .stat-value {
      font-size: 22pt;
      font-weight: 800;
      color: ${COLORS.primary};
    }
    .stat-card .stat-label {
      font-size: 8.5pt;
      color: ${COLORS.muted};
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .insight-row {
      padding: 8px 0;
      border-bottom: 1px solid ${COLORS.border};
    }
    .insight-row .food-symptom {
      font-weight: 700;
      color: ${COLORS.heading};
    }
    .insight-row .detail {
      font-size: 9pt;
      color: ${COLORS.muted};
    }
    .phase-bar {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
    }
    .footer {
      text-align: center;
      font-size: 8.5pt;
      color: ${COLORS.muted};
      font-style: italic;
      border-top: 1px solid ${COLORS.border};
      padding-top: 10px;
      margin-top: 30px;
    }
    .badge {
      display: inline-block;
      background: ${COLORS.lavenderLight};
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 8.5pt;
      margin: 1px 2px;
      color: ${COLORS.primary};
    }
  `;
}

// ─── Report Data Interface ───────────────────────────────────────────────

export interface ExportReportData {
  dateRange: { from: string; to: string };
  generatedDate: string;
  symptomLogs: SymptomLog[];
  foodLogs: FoodLog[];
  insights: PatternInsight[];
  diagnosisStatus: string;
  cycleTrackingEnabled: boolean;
  avgCycleLength: number;
}

// ─── HTML Template Builder ───────────────────────────────────────────────

export function buildPdfHtml(data: ExportReportData): string {
  const { dateRange, generatedDate, symptomLogs, foodLogs, insights, diagnosisStatus, cycleTrackingEnabled, avgCycleLength } = data;

  const symptomDays = symptomLogs.length;
  const mealCount = foodLogs.length;

  // ── Pain analysis ──────────────────────────────────────────────────
  const allPainRegions: { region: string; avgIntensity: number; count: number }[] = [];
  const regionMap = new Map<string, { total: number; count: number }>();

  for (const log of symptomLogs) {
    for (const pr of log.pain_regions ?? []) {
      const entry = regionMap.get(pr.region) ?? { total: 0, count: 0 };
      entry.total += pr.intensity ?? 0;
      entry.count += 1;
      regionMap.set(pr.region, entry);
    }
  }

  for (const [region, data] of regionMap.entries()) {
    allPainRegions.push({
      region,
      avgIntensity: Math.round((data.total / data.count) * 10) / 10,
      count: data.count,
    });
  }
  allPainRegions.sort((a, b) => b.avgIntensity - a.avgIntensity);

  const avgPainScore = symptomLogs.reduce((sum, log) => {
    const regions = log.pain_regions ?? [];
    if (regions.length === 0) return sum;
    const avg = regions.reduce((s, r) => s + (r.intensity ?? 0), 0) / regions.length;
    return sum + avg;
  }, 0) / (symptomLogs.length || 1);

  const flareDays = symptomLogs.filter((log) => {
    const regions = log.pain_regions ?? [];
    return regions.some((r) => (r.intensity ?? 0) >= 7);
  }).length;

  // ── Symptom frequencies ────────────────────────────────────────────
  const symptomFreq = new Map<string, number>();
  for (const log of symptomLogs) {
    for (const tag of log.symptom_tags ?? []) {
      symptomFreq.set(tag, (symptomFreq.get(tag) ?? 0) + 1);
    }
  }
  const topSymptoms = [...symptomFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // ── Food correlations ──────────────────────────────────────────────
  const topInsights = insights.slice(0, 5);

  // ── Cycle analysis ─────────────────────────────────────────────────
  const phaseDistribution = new Map<CyclePhase, { count: number; totalPain: number }>();
  for (const log of symptomLogs) {
    if (log.cycle_phase) {
      const entry = phaseDistribution.get(log.cycle_phase) ?? { count: 0, totalPain: 0 };
      entry.count += 1;
      const painAvg = (log.pain_regions ?? []).reduce((s, r) => s + (r.intensity ?? 0), 0) / ((log.pain_regions ?? []).length || 1);
      entry.totalPain += painAvg;
      phaseDistribution.set(log.cycle_phase, entry);
    }
  }

  // ── Last 14 days table ─────────────────────────────────────────────
  const last14Days = symptomLogs.slice(-14).reverse();

  function foodLogDate(food: FoodLog): string {
    return food.timestamp.slice(0, 10);
  }

  // Build HTML
  const css = getCss();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MyEndo Health Report</title>
  <style>${css}</style>
</head>
<body>

  <!-- ═══════════════════════════════════════════════════════ HEADER -->
  <div class="header">
    <h1>MyEndo Health Report</h1>
    <div class="subtitle">
      ${formatDate(dateRange.from)} — ${formatDate(dateRange.to)}
      &nbsp;·&nbsp; Generated ${formatDate(generatedDate)}
    </div>
    <div class="disclaimer">
      ⚕️ This report is generated from your personal tracking data in MyEndo.
      It is not a medical diagnosis. Please discuss these findings with your healthcare provider
      before making any changes to your treatment plan.
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ PATIENT SUMMARY -->
  <div class="section">
    <h2>Patient Summary</h2>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${diagnosisStatus === 'diagnosed' ? 'Diagnosed' : diagnosisStatus === 'suspected' ? 'Suspected' : 'In Process'}</div>
        <div class="stat-label">Diagnosis Status</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${symptomDays}</div>
        <div class="stat-label">Days Tracked</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${mealCount}</div>
        <div class="stat-label">Meals Logged</div>
      </div>
      ${cycleTrackingEnabled ? `
      <div class="stat-card">
        <div class="stat-value">${avgCycleLength}d</div>
        <div class="stat-label">Avg Cycle Length</div>
      </div>
      ` : ''}
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ SYMPTOM OVERVIEW -->
  <div class="section">
    <h2>Symptom Overview</h2>
    <table>
      <thead>
        <tr>
          <th>Symptom</th>
          <th>Days Reported</th>
          <th>Frequency</th>
        </tr>
      </thead>
      <tbody>
        ${topSymptoms.map(([tag, count]) => {
          const pct = Math.round((count / symptomDays) * 100);
          return `
          <tr>
            <td>${escapeHtml(formatTag(tag))}</td>
            <td>${count}</td>
            <td>${pct}% of tracked days</td>
          </tr>`;
        }).join('')}
        ${topSymptoms.length === 0 ? '<tr><td colspan="3">No symptom data in this date range.</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  <!-- ═══════════════════════════════════════════════════════ PAIN ANALYSIS -->
  <div class="section">
    <h2>Pain Analysis</h2>
    <p style="margin-bottom: 8px; font-size: 10pt; color: ${COLORS.muted};">
      Average pain score: <strong style="color: ${COLORS.primary};">${avgPainScore.toFixed(1)}</strong> / 10
      &nbsp;·&nbsp; Flare days (pain ≥ 7): <strong style="color: ${COLORS.primary};">${flareDays}</strong>
      &nbsp;·&nbsp; Based on ${symptomDays} days of data
    </p>

    <h3>Pain by Region</h3>
    <table>
      <thead>
        <tr>
          <th>Region</th>
          <th>Avg Intensity</th>
          <th>Days Reported</th>
        </tr>
      </thead>
      <tbody>
        ${allPainRegions.map((pr) => `
          <tr>
            <td>${escapeHtml(formatTag(pr.region))}</td>
            <td>${pr.avgIntensity.toFixed(1)} / 10</td>
            <td>${pr.count}</td>
          </tr>`).join('')}
        ${allPainRegions.length === 0 ? '<tr><td colspan="3">No pain data recorded in this date range.</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  <!-- ═══════════════════════════════════════════════════════ PATTERN INSIGHTS -->
  <div class="section">
    <h2>Pattern Insights</h2>
    <p style="margin-bottom: 8px; font-size: 9pt; color: ${COLORS.muted};">
      These patterns are discovered from your own tracking data. Each correlation shows
      how often a symptom was reported on days a particular food was logged compared to
      days it was not.
    </p>
    ${topInsights.length > 0 ? topInsights.map((insight) => `
      <div class="insight-row">
        <div class="food-symptom">
          ${escapeHtml(formatTag(insight.symptom))} × ${escapeHtml(formatTag(insight.food_tag))}
        </div>
        <div class="detail">
          ${insight.cycle_phase ? `During ${CYCLE_PHASE_LABELS[insight.cycle_phase as CyclePhase]} phase · ` : ''}
          Correlation: ${Math.round((insight.correlation_strength - 1) * 100)}% increase
          · Based on ${insight.sample_size} days
        </div>
        <div class="detail" style="margin-top: 2px;">${escapeHtml(insight.insight_text)}</div>
      </div>
    `).join('') : '<p style="color: ${COLORS.muted}; font-style: italic;">Not enough data to detect patterns in this date range.</p>'}
  </div>

  <!-- ═══════════════════════════════════════════════════════ CYCLE ANALYSIS -->
  ${cycleTrackingEnabled && phaseDistribution.size > 0 ? `
  <div class="section">
    <h2>Cycle Analysis</h2>
    <table>
      <thead>
        <tr>
          <th>Cycle Phase</th>
          <th>Days Tracked</th>
          <th>Avg Pain</th>
        </tr>
      </thead>
      <tbody>
        ${(['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]).map((phase) => {
          const entry = phaseDistribution.get(phase);
          if (!entry) return '';
          const avgP = entry.count > 0 ? (entry.totalPain / entry.count).toFixed(1) : '—';
          return `
          <tr>
            <td>${CYCLE_PHASE_LABELS[phase]}</td>
            <td>${entry.count}</td>
            <td>${avgP} / 10</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- ═══════════════════════════════════════════════════════ DAILY LOG TABLE -->
  <div class="section">
    <h2>Daily Log — Last ${Math.min(14, symptomDays)} Days</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Pain</th>
          <th>Top Symptoms</th>
          <th>Meals</th>
          <th>Mood</th>
          <th>Sleep</th>
          <th>Stress</th>
        </tr>
      </thead>
      <tbody>
        ${last14Days.map((log) => {
          const painAvg = (log.pain_regions ?? []).length > 0
            ? ((log.pain_regions ?? []).reduce((s, r) => s + (r.intensity ?? 0), 0) / (log.pain_regions ?? []).length).toFixed(1)
            : '—';
          const topSymptTags = (log.symptom_tags ?? []).slice(0, 3).map(formatTag).join(', ') || '—';
          const dayFoods = foodLogs.filter((f) => foodLogDate(f) === log.date);
          const mealNames = dayFoods.map((f) => escapeHtml(f.meal_name)).join(', ') || '—';

          return `
          <tr>
            <td>${formatDate(log.date)}</td>
            <td>${painAvg}</td>
            <td>${escapeHtml(topSymptTags)}</td>
            <td>${mealNames}</td>
            <td>${log.mood_score}/5</td>
            <td>${log.sleep_score}/5</td>
            <td>${log.stress_score}/5</td>
          </tr>`;
        }).join('')}
        ${last14Days.length === 0 ? '<tr><td colspan="7">No daily logs in this date range.</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  <!-- ═══════════════════════════════════════════════════════ FOOTER -->
  <div class="footer">
    Generated by MyEndo — This is not a medical diagnosis. Discuss with your doctor.
  </div>

</body>
</html>`;
}

// ─── CSV Builder ──────────────────────────────────────────────────────────

export interface ExportCsvRow {
  date: string;
  cycle_day: string;
  cycle_phase: string;
  pain_regions: string;
  symptom_tags: string;
  mood_score: string;
  sleep_score: string;
  stress_score: string;
  energy_score: string;
  meals_logged: string;
  food_tags: string;
  notes: string;
}

export function buildCsv(data: ExportReportData): string {
  const { symptomLogs, foodLogs } = data;

  function foodLogDate(food: FoodLog): string {
    return food.timestamp.slice(0, 10);
  }

  const rows: ExportCsvRow[] = symptomLogs.map((log) => {
    const dayFoods = foodLogs.filter((f) => foodLogDate(f) === log.date);
    const painRegionsJson = JSON.stringify(log.pain_regions ?? []);
    const symptomTagsStr = (log.symptom_tags ?? []).join(', ');
    const mealNames = dayFoods.map((f) => f.meal_name).join('; ');
    const allFoodTags = [...new Set(dayFoods.flatMap((f) => f.food_tags ?? []))].join(', ');

    return {
      date: log.date,
      cycle_day: log.cycle_day?.toString() ?? '',
      cycle_phase: log.cycle_phase ?? '',
      pain_regions: painRegionsJson,
      symptom_tags: symptomTagsStr,
      mood_score: log.mood_score.toString(),
      sleep_score: log.sleep_score.toString(),
      stress_score: log.stress_score.toString(),
      energy_score: (log.energy_score?.toString() ?? ''),
      meals_logged: mealNames,
      food_tags: allFoodTags,
      notes: (log.note ?? '').replace(/"/g, '""'),
    };
  });

  const header = 'date,cycle_day,cycle_phase,pain_regions,symptom_tags,mood_score,sleep_score,stress_score,energy_score,meals_logged,food_tags,notes';
  const csvRows = rows.map((r) =>
    [
      r.date,
      r.cycle_day,
      `"${r.cycle_phase}"`,
      `"${r.pain_regions.replace(/"/g, '""')}"`,
      `"${r.symptom_tags}"`,
      r.mood_score,
      r.sleep_score,
      r.stress_score,
      r.energy_score,
      `"${r.meals_logged}"`,
      `"${r.food_tags}"`,
      `"${r.notes}"`,
    ].join(',')
  );

  return [header, ...csvRows].join('\n');
}
