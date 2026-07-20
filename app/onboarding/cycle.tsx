import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { DiagnosisStatus } from '@/types';

export default function CycleScreen() {
  const params = useLocalSearchParams<{
    diagnosisStatus?: string;
    symptomChecklist?: string;
  }>();

  const { user, refreshProfile } = useAuth();

  const diagnosisStatus = (params.diagnosisStatus ?? 'suspected') as DiagnosisStatus;
  const symptomChecklist: string[] = (() => {
    try {
      return JSON.parse(params.symptomChecklist ?? '[]');
    } catch {
      return [];
    }
  })();

  const [cycleEnabled, setCycleEnabled] = useState(true);
  const [lastPeriodDate, setLastPeriodDate] = useState('');
  const [cycleLength, setCycleLength] = useState('28');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple date validation: YYYY-MM-DD format
  const dateHint = 'YYYY-MM-DD';

  const handleStartTracking = useCallback(async () => {
    setError(null);

    if (!user) {
      setError('Please sign in first.');
      return;
    }

    // Validate date format if cycle tracking enabled and date provided
    let parsedDate: string | null = null;
    if (cycleEnabled && lastPeriodDate.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(lastPeriodDate.trim())) {
        setError('Please enter the date as YYYY-MM-DD (e.g. 2026-07-01).');
        return;
      }
      const d = new Date(lastPeriodDate.trim());
      if (isNaN(d.getTime())) {
        setError('Please enter a valid date.');
        return;
      }
      parsedDate = lastPeriodDate.trim();
    }

    // Validate cycle length
    const lengthNum = parseInt(cycleLength, 10);
    if (cycleEnabled && (isNaN(lengthNum) || lengthNum < 15 || lengthNum > 60)) {
      setError('Cycle length should be between 15 and 60 days.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          diagnosis_status: diagnosisStatus,
          symptom_checklist: symptomChecklist,
          cycle_tracking_enabled: cycleEnabled,
          last_period_start_date: parsedDate,
          avg_cycle_length_days: cycleEnabled ? lengthNum : 28,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await refreshProfile();
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.message ?? 'Could not save your preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [
    user,
    diagnosisStatus,
    symptomChecklist,
    cycleEnabled,
    lastPeriodDate,
    cycleLength,
    refreshProfile,
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={styles.heading}>Track your cycle?</Text>
        <Text style={styles.subtitle}>
          Cycle phase context helps us find more accurate patterns — but it's
          entirely optional.
        </Text>

        {/* Toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Enable cycle tracking</Text>
          <Switch
            value={cycleEnabled}
            onValueChange={(v) => {
              setCycleEnabled(v);
              setError(null);
            }}
            trackColor={{ false: '#E8E0F0', true: '#C4B5E0' }}
            thumbColor={cycleEnabled ? '#7C3AED' : '#B5A8CC'}
          />
        </View>

        {/* Cycle fields */}
        {cycleEnabled && (
          <View style={styles.cycleFields}>
            <Text style={styles.label}>When did your last period start?</Text>
            <TextInput
              style={styles.input}
              placeholder={dateHint}
              placeholderTextColor="#B5A8CC"
              value={lastPeriodDate}
              onChangeText={(t) => {
                setLastPeriodDate(t);
                setError(null);
              }}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              editable={!saving}
            />

            <Text style={styles.label}>Average cycle length (days)</Text>
            <TextInput
              style={styles.input}
              placeholder="28"
              placeholderTextColor="#B5A8CC"
              value={cycleLength}
              onChangeText={(t) => {
                setCycleLength(t.replace(/[^0-9]/g, ''));
                setError(null);
              }}
              keyboardType="number-pad"
              maxLength={2}
              editable={!saving}
            />
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Pledge — non-negotiable, prominent */}
        <View style={styles.pledgeContainer}>
          <View style={styles.pledgeIconCircle}>
            <Text style={styles.pledgeCheckmark}>✓</Text>
          </View>
          <Text style={styles.pledgeTitle}>Our promise to you</Text>
          <Text style={styles.pledgeText}>
            We never track calories, macros, or weight.{'\n'}
            Not now, not ever.{'\n\n'}
            This is a safe space to understand your body{'\n'}
            — not a nutrition tracker.
          </Text>
        </View>

        {/* Start tracking */}
        <TouchableOpacity
          style={[styles.startButton, saving && styles.startButtonDisabled]}
          onPress={handleStartTracking}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.startButtonText}>Start tracking</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.stepIndicator}>Step 3 of 3</Text>

        <Text style={styles.disclaimer}>
          ⚕️ MyEndo is a tracking tool, not a medical diagnosis. Always discuss
          your findings with your healthcare provider.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2D1B69',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B5B8A',
    lineHeight: 22,
    marginBottom: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9F5FF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E0F0',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D1B69',
  },
  cycleFields: {
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A3580',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F9F5FF',
    borderWidth: 1,
    borderColor: '#E8E0F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#2D1B69',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  pledgeContainer: {
    backgroundColor: '#F5F0FF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#C4B5E0',
    padding: 28,
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 24,
  },
  pledgeIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pledgeCheckmark: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pledgeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2D1B69',
    marginBottom: 12,
    textAlign: 'center',
  },
  pledgeText: {
    fontSize: 15,
    color: '#5C4A7A',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  startButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  stepIndicator: {
    fontSize: 13,
    color: '#9B8AB5',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 16,
  },
  disclaimer: {
    fontSize: 12,
    color: '#9B8AB5',
    textAlign: 'center',
    lineHeight: 18,
  },
});
