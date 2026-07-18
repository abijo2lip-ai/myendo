import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '@/lib/auth';
import { PremiumGate } from '@/components/PremiumGate';
import { useSubscription } from '@/hooks/useSubscription';

export default function HomeScreen() {
  const { user, profile, isLoading } = useAuth();
  const { isPremium } = useSubscription();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading Flointra...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome to Flointra</Text>
      <Text style={styles.subtitle}>
        Understand your body. Find your patterns. Advocate with confidence.
      </Text>

      {user ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            👋 Hello, {profile?.email ?? user.email}
          </Text>
          <Text style={styles.cardText}>
            Diagnosis: {profile?.diagnosis_status ?? 'Not set'}
          </Text>
          <Text style={styles.cardText}>
            Plan: {isPremium ? '✨ Premium' : 'Free'}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Get Started</Text>
          <Text style={styles.cardText}>
            Sign in to start tracking your symptoms and discovering your personal
            patterns.
          </Text>
        </View>
      )}

      <View style={styles.featureGrid}>
        <View style={styles.feature}>
          <Text style={styles.featureEmoji}>📋</Text>
          <Text style={styles.featureText}>Symptom Log</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureEmoji}>🍽️</Text>
          <Text style={styles.featureText}>Food Diary</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureEmoji}>🔄</Text>
          <Text style={styles.featureText}>Cycle Tracking</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureEmoji}>📊</Text>
          <Text style={styles.featureText}>Insights</Text>
        </View>
      </View>

      {/* PremiumGate demo — wraps a premium-only feature */}
      <PremiumGate featureName="Pattern Insights">
        <View style={styles.premiumFeature}>
          <Text style={styles.premiumTitle}>🔍 Your Pattern Insights</Text>
          <Text style={styles.premiumText}>
            Based on your logs, we'd show correlations between what you eat, your
            cycle phase, and your symptoms — always with sample sizes and medical
            disclaimers.
          </Text>
        </View>
      </PremiumGate>

      <Text style={styles.disclaimer}>
        ⚕️ Flointra is a tracking tool, not a medical diagnosis. Always discuss
        your findings with your healthcare provider.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2D1B69',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B5B8A',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 300,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B5B8A',
    marginTop: 100,
  },
  card: {
    backgroundColor: '#F9F5FF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8E0F0',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D1B69',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#5C4A7A',
    marginBottom: 4,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
    width: '100%',
  },
  feature: {
    alignItems: 'center',
    width: '22%',
    minWidth: 70,
  },
  featureEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  featureText: {
    fontSize: 12,
    color: '#5C4A7A',
    fontWeight: '600',
    textAlign: 'center',
  },
  premiumFeature: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#D1F2D9',
    marginBottom: 24,
  },
  premiumTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 8,
  },
  premiumText: {
    fontSize: 14,
    color: '#3B7A4E',
    lineHeight: 20,
  },
  disclaimer: {
    fontSize: 12,
    color: '#9B8AB5',
    textAlign: 'center',
    marginBottom: 40,
    maxWidth: 320,
    lineHeight: 18,
  },
});
