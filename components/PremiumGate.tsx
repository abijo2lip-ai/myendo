import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSubscription } from '@/hooks/useSubscription';

interface PremiumGateProps {
  children: React.ReactNode;
  /** Custom message shown to free users. Falls back to a standard upsell message. */
  fallbackMessage?: string;
  /** Feature name for the standard upsell message. E.g. "Pattern Insights" */
  featureName?: string;
}

export function PremiumGate({
  children,
  fallbackMessage,
  featureName = 'this feature',
}: PremiumGateProps) {
  const { isPremium, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.lockIcon}>
        <Text style={styles.lockEmoji}>🔒</Text>
      </View>
      <Text style={styles.title}>Premium Feature</Text>
      <Text style={styles.message}>
        {fallbackMessage ??
          `${featureName} is available on the Premium plan. Upgrade to unlock personalized pattern insights, doctor-ready exports, and more.`}
      </Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Upgrade to Premium</Text>
      </TouchableOpacity>
      <Text style={styles.disclaimer}>
        Your data stays private. No ads, no data selling — ever.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F9F5FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E0F0',
    margin: 16,
  },
  lockIcon: {
    marginBottom: 12,
  },
  lockEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D1B69',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#5C4A7A',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 300,
  },
  loadingText: {
    fontSize: 15,
    color: '#5C4A7A',
  },
  button: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#9B8AB5',
    textAlign: 'center',
    maxWidth: 280,
  },
});
