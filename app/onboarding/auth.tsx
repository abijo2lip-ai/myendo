import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type AuthMode = 'signup' | 'signin';

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: AuthMode = params.mode === 'signin' ? 'signin' : 'signup';

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(
    null
  );

  const { signUp, signIn } = useAuth();

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
      // AuthProvider's onAuthStateChange will fire and update state
      router.replace('/onboarding/profile');
    } catch (err: any) {
      const message =
        err?.message ?? 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [email, password, mode, signUp, signIn]);

  const handleOAuth = useCallback(
    async (provider: 'apple' | 'google') => {
      setError(null);
      setOauthLoading(provider);
      try {
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: provider === 'apple' ? 'apple' : 'google',
          options: {
            redirectTo: undefined, // Will use the default
          },
        });
        if (oauthError) throw oauthError;
        // OAuth redirects out of app; on return, auth state change handles navigation
      } catch (err: any) {
        setError(err?.message ?? `Could not sign in with ${provider}.`);
        setOauthLoading(null);
      }
    },
    []
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Tab toggle */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => {
                setMode('signup');
                setError(null);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === 'signup' && styles.tabTextActive,
                ]}
              >
                Sign Up
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'signin' && styles.tabActive]}
              onPress={() => {
                setMode('signin');
                setError(null);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === 'signin' && styles.tabTextActive,
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {/* Heading */}
            <Text style={styles.heading}>
              {mode === 'signup'
                ? 'Create your account'
                : 'Welcome back'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'signup'
                ? 'Start understanding your body\'s patterns.'
                : 'Continue your journey.'}
            </Text>

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#B5A8CC"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              editable={!loading}
            />

            {/* Password */}
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor="#B5A8CC"
              secureTextEntry
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              editable={!loading}
              onSubmitEditing={handleSubmit}
            />

            {/* Submit */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'signup' ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* OAuth */}
            <TouchableOpacity
              style={styles.oauthButton}
              onPress={() => handleOAuth('apple')}
              disabled={oauthLoading !== null}
              activeOpacity={0.7}
            >
              {oauthLoading === 'apple' ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.oauthButtonText}>
                   Continue with Apple
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.oauthButton, styles.oauthGoogle]}
              onPress={() => handleOAuth('google')}
              disabled={oauthLoading !== null}
              activeOpacity={0.7}
            >
              {oauthLoading === 'google' ? (
                <ActivityIndicator color="#444444" />
              ) : (
                <Text style={styles.oauthButtonText}>Continue with Google</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Back link */}
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.back()}
            activeOpacity={0.6}
          >
            <Text style={styles.backLinkText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 40,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F3EEFA',
    borderRadius: 12,
    padding: 4,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#2D1B69',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8B7AAA',
  },
  tabTextActive: {
    color: '#2D1B69',
  },
  form: {
    flex: 1,
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
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A3580',
    marginBottom: 6,
    marginTop: 12,
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
  primaryButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E8E0F0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#9B8AB5',
    fontWeight: '500',
  },
  oauthButton: {
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  oauthGoogle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  oauthButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  backLinkText: {
    fontSize: 15,
    color: '#7C3AED',
    fontWeight: '600',
  },
});
