import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Hero area */}
        <View style={styles.hero}>
          <Text style={styles.icon}>🌿</Text>
          <Text style={styles.appName}>MyEndo</Text>
          <Text style={styles.tagline}>
            Understand your body.{'\n'}Advocate for your health.
          </Text>
          <Text style={styles.oneLiner}>
            Track symptoms and food patterns — without the noise.
          </Text>
        </View>

        {/* CTAs */}
        <View style={styles.ctaArea}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/onboarding/auth')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() =>
              router.push({
                pathname: '/onboarding/auth',
                params: { mode: 'signin' },
              })
            }
            activeOpacity={0.6}
          >
            <Text style={styles.linkText}>I already have an account</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          A tracker for endometriosis — not a nutrition app.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  icon: {
    fontSize: 56,
    marginBottom: 20,
  },
  appName: {
    fontSize: 40,
    fontWeight: '800',
    color: '#2D1B69',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: '#4A3580',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 16,
  },
  oneLiner: {
    fontSize: 15,
    color: '#6B5B8A',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  ctaArea: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  linkButton: {
    paddingVertical: 10,
  },
  linkText: {
    color: '#7C3AED',
    fontSize: 15,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 12,
    color: '#9B8AB5',
    textAlign: 'center',
  },
});
