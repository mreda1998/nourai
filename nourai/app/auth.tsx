import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as AppleAuthentication from 'expo-apple-authentication';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  Layout,
  scale,
  verticalScale,
} from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

type AuthMode = 'signin' | 'signup';

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithApple } = useAuth();
  const { name: prefillName } = useLocalSearchParams<{ name?: string }>();

  const [mode, setMode] = useState<AuthMode>(prefillName ? 'signup' : 'signin');
  const [name, setName] = useState(prefillName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        if (!name.trim()) {
          setError('Please enter your name');
          setIsLoading(false);
          return;
        }
        const { needsEmailConfirmation } = await signUp(email, password, name);
        if (needsEmailConfirmation) {
          setPendingConfirmation(true);
          return;
        }
      } else {
        await signIn(email, password);
      }
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  // ── Email confirmation pending screen ──────────────────────────────────────
  if (pendingConfirmation) {
    return (
      <View style={[styles.screen, styles.confirmScreen]}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.confirmContent}>
          <Text style={styles.logo}>ELORY</Text>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmBody}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.confirmEmail}>{email}</Text>
          </Text>
          <Text style={styles.confirmHint}>
            Click the link in the email to activate your account, then sign in below.
          </Text>
          <Pressable
            style={styles.submitButton}
            onPress={() => {
              setPendingConfirmation(false);
              setMode('signin');
              setPassword('');
            }}
          >
            <Text style={styles.submitButtonText}>Go to Sign In</Text>
          </Pressable>
          <Pressable style={styles.toggleMode} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.toggleModeText}>
              <Text style={styles.toggleModeLink}>Continue as Guest</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + verticalScale(60) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>ELORY</Text>
          <Text style={styles.tagline}>Evidence, made personal.</Text>
        </View>

        {/* Auth Form */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {mode === 'signin' ? 'Welcome Back' : 'Create your account'}
          </Text>

          {mode === 'signup' && (
            <Text style={styles.signupSubtitle}>
              Join Elory. Set your goals so we can personalize every recommendation for you.
            </Text>
          )}

          {mode === 'signup' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={Colors.inkTertiary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.inkTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor={Colors.inkTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          {error ? (
            <Animated.View entering={FadeIn.duration(300)}>
              <Text style={styles.error}>{error}</Text>
            </Animated.View>
          ) : null}

          <Pressable
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={styles.submitButtonText}>
              {isLoading
                ? 'Please wait...'
                : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
            </Text>
          </Pressable>

          {/* Toggle Mode */}
          <Pressable
            style={styles.toggleMode}
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            <Text style={styles.toggleModeText}>
              {mode === 'signin'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <Text style={styles.toggleModeLink}>
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </Text>
            </Text>
          </Pressable>

          {/* Step indicator — signup is step 1 of the account → personalize funnel */}
          {mode === 'signup' && (
            <View style={styles.stepDots}>
              <View style={styles.stepDotActive}>
                <Text style={styles.stepDotActiveText}>1</Text>
              </View>
              <View style={styles.stepDotLine} />
              <View style={styles.stepDotInactive} />
              <View style={styles.stepDotLine} />
              <View style={styles.stepDotInactive} />
            </View>
          )}

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Apple Sign-In — iOS only */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={100}
              style={styles.appleButton}
              onPress={async () => {
                setError('');
                setIsLoading(true);
                try {
                  await signInWithApple();
                  router.replace('/(tabs)');
                } catch (err: any) {
                  if (err?.code !== 'ERR_REQUEST_CANCELED') {
                    setError(err?.message ?? 'Apple Sign-In failed. Please try again.');
                  }
                } finally {
                  setIsLoading(false);
                }
              }}
            />
          )}

          {/* Skip Button */}
          <Pressable style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Continue as Guest</Text>
          </Pressable>

          {/* Terms */}
          <Text style={styles.terms}>
            By continuing, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: verticalScale(40),
  },
  header: {
    alignItems: 'center',
    marginBottom: verticalScale(48),
  },
  logo: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: scale(18),
    letterSpacing: 6,
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    letterSpacing: 1,
  },
  form: {
    flex: 1,
  },
  formTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  signupSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.body * 1.5,
    marginTop: -Spacing.md,
    marginBottom: Spacing.lg,
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  stepDotActive: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(11),
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActiveText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.bone,
  },
  stepDotInactive: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: Colors.borderHairline,
  },
  stepDotLine: {
    width: scale(24),
    height: 1,
    backgroundColor: Colors.borderHairline,
    marginHorizontal: Spacing.sm,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: verticalScale(16),
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  submitButton: {
    backgroundColor: Colors.accent,
    paddingVertical: verticalScale(18),
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  toggleMode: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  toggleModeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  toggleModeLink: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.ink,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderHairline,
  },
  dividerText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
    paddingHorizontal: Spacing.md,
  },
  appleButton: {
    width: '100%',
    height: verticalScale(52),
    marginBottom: Spacing.md,
  },
  skipButton: {
    borderWidth: 1,
    borderColor: Colors.ink,
    paddingVertical: verticalScale(16),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  skipButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  terms: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textAlign: 'center',
    marginTop: Spacing.xl,
    lineHeight: FontSizes.caption * 1.6,
  },
  termsLink: {
    color: Colors.inkSecondary,
    textDecorationLine: 'underline',
  },
  confirmScreen: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    alignItems: 'center',
    width: '100%',
  },
  confirmTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  confirmBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.6,
    marginBottom: Spacing.lg,
  },
  confirmEmail: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.ink,
  },
  confirmHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
    textAlign: 'center',
    lineHeight: FontSizes.body * 1.6,
    marginBottom: Spacing.xl * 2,
  },
});
