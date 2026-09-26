import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AlertCircle, Eye, EyeOff, MailCheck, X } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { Button, EmptyState, IconButton, PressableScale, TextField, Txt } from '@/components/ui';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithApple } = useAuth();
  const { name: prefillName } = useLocalSearchParams<{ name?: string }>();
  const [mode, setMode] = useState<Mode>(prefillName ? 'signup' : 'signin');
  const [name, setName] = useState(prefillName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const guest = () => router.replace('/(tabs)');

  const submit = async () => {
    setError('');
    if (mode === 'signup' && !name.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp(email.trim(), password, name.trim());
        if (needsEmailConfirmation) { setPending(true); return; }
      } else {
        await signIn(email.trim(), password);
      }
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const apple = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithApple();
      router.replace('/(tabs)');
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') setError(err?.message ?? 'Apple sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (pending) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center', padding: 20 }]}>
        <EmptyState
          icon={MailCheck}
          title="Check your email"
          message={`We sent a confirmation link to ${email}. Open it to activate your account, then sign in.`}
        />
        <Button label="Go to sign in" onPress={() => { setPending(false); setMode('signin'); setPassword(''); }} />
        <Button label="Continue as guest" variant="tertiary" onPress={guest} style={{ marginTop: 6 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton icon={X} label="Close" onPress={leave} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View key={mode} entering={FadeInDown.duration(450)}>
          <Txt variant="largeTitle">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Txt>
          <Txt variant="callout" tone="secondary" style={{ marginTop: 8 }}>
            {mode === 'signin' ? 'Sign in to sync your stack, history and profile.' : 'Save your profile and unlock Ask Elory.'}
          </Txt>
        </Animated.View>

        {Platform.OS === 'ios' ? (
          <View style={{ marginTop: 28 }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={mode === 'signin' ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={Radius.lg}
              style={{ height: 56 }}
              onPress={apple}
            />
            <View style={styles.divider}>
              <View style={styles.rule} />
              <Txt variant="footnote" tone="tertiary">or with email</Txt>
              <View style={styles.rule} />
            </View>
          </View>
        ) : <View style={{ height: 28 }} />}

        <View style={{ gap: 12 }}>
          {mode === 'signup' ? (
            <TextField label="Name" value={name} onChangeText={setName} placeholder="Your first name" autoCapitalize="words" textContentType="givenName" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
          ) : null}
          <TextField ref={emailRef} label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
          <TextField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            secureTextEntry={!showPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            trailing={
              <PressableScale haptic={false} hitSlop={10} onPress={() => setShowPassword((v) => !v)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={20} color={Palette.ink3} /> : <Eye size={20} color={Palette.ink3} />}
              </PressableScale>
            }
          />
        </View>

        {error ? (
          <Animated.View entering={FadeIn} style={styles.error}>
            <AlertCircle size={18} color={Palette.weak} />
            <Txt variant="footnote" tone="weak" style={{ flex: 1 }}>{error}</Txt>
          </Animated.View>
        ) : null}

        <Button label={mode === 'signin' ? 'Sign in' : 'Create account'} loading={loading} onPress={submit} style={{ marginTop: 20 }} />

        <PressableScale haptic="selection" onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Txt variant="subhead" tone="secondary">
            {mode === 'signin' ? 'New to Elory? ' : 'Already have an account? '}
            <Txt variant="subheadStrong" tone="accent">{mode === 'signin' ? 'Create an account' : 'Sign in'}</Txt>
          </Txt>
        </PressableScale>

        <Button label="Continue as guest" variant="tertiary" onPress={guest} />

        <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 20, paddingHorizontal: 20 }}>
          By continuing you agree to Elory’s Terms of Service and Privacy Policy.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.canvas },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Palette.hairline },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 14, borderRadius: Radius.md, backgroundColor: Palette.weakSoft },
});
