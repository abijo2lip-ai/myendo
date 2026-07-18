import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DiagnosisStatus } from '@/types';

const DIAGNOSIS_OPTIONS: { value: DiagnosisStatus; label: string; description: string }[] = [
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

const SYMPTOM_OPTIONS = [
  'pelvic pain',
  'lower back pain',
  'leg pain',
  'bloating',
  'fatigue',
  'nausea',
  'headache',
  'mood swings',
  'bowel changes',
  'bladder pain',
  'brain fog',
  'painful periods',
  'heavy bleeding',
  'pain during sex',
];

export default function ProfileScreen() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisStatus | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<Set<string>>(
    new Set()
  );

  const canContinue = diagnosis !== null;

  const toggleSymptom = (symptom: string) => {
    setSelectedSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(symptom)) {
        next.delete(symptom);
      } else {
        next.add(symptom);
      }
      return next;
    });
  };

  const handleContinue = () => {
    if (!canContinue) return;
    router.push({
      pathname: '/onboarding/cycle',
      params: {
        diagnosisStatus: diagnosis,
        symptomChecklist: JSON.stringify([...selectedSymptoms]),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.heading}>Tell us about your journey</Text>
        <Text style={styles.subtitle}>
          This helps us personalize your experience. You can change these
          anytime.
        </Text>

        {/* Diagnosis status */}
        <Text style={styles.sectionTitle}>Diagnosis status</Text>
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

        {/* Symptom checklist */}
        <Text style={styles.sectionTitle}>
          Which symptoms do you experience?
        </Text>
        <Text style={styles.sectionHint}>Select all that apply.</Text>
        <View style={styles.chipGrid}>
          {SYMPTOM_OPTIONS.map((symptom) => {
            const isSelected = selectedSymptoms.has(symptom);
            return (
              <TouchableOpacity
                key={symptom}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => toggleSymptom(symptom)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextSelected,
                  ]}
                >
                  {symptom}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Continue */}
        <TouchableOpacity
          style={[
            styles.continueButton,
            !canContinue && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>

        {/* Step indicator */}
        <Text style={styles.stepIndicator}>Step 2 of 3</Text>
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
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D1B69',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: '#9B8AB5',
    marginBottom: 14,
  },
  diagnosisCard: {
    backgroundColor: '#F9F5FF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E0F0',
    padding: 16,
    marginBottom: 10,
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
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 32,
  },
  chip: {
    backgroundColor: '#F9F5FF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E8E0F0',
  },
  chipSelected: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5C4A7A',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  continueButton: {
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
  continueButtonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  stepIndicator: {
    fontSize: 13,
    color: '#9B8AB5',
    textAlign: 'center',
    fontWeight: '500',
  },
});
