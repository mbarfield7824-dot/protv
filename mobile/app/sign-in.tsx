import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BrandMark } from '../components/BrandHeader';
import { Notice } from '../components/ScreenFrame';
import { BRAND } from '../constants/brand';
import { useMobile } from '../context/MobileProvider';
import { FIREBASE_CONFIGURED } from '../lib/firebase';

export default function SignInScreen() {
  const { user, signIn, register, resetPassword } = useMobile();
  const [registerMode, setRegisterMode] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (registerMode) await register(email, password, displayName);
      else await signIn(email, password);
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    setError('');
    setMessage('');
    try {
      await resetPassword(email);
      setMessage('Password reset instructions were sent.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Password reset could not be sent.');
    }
  };

  if (user) {
    return (
      <View style={styles.center}>
        <BrandMark />
        <Text style={styles.title}>You&apos;re signed in.</Text>
        <Text style={styles.subtitle}>{user.email}</Text>
        <Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Continue</Text></Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <BrandMark />
      </View>
      <View style={styles.form}>
        <Text style={styles.kicker}>YOUR PROTV ACCOUNT</Text>
        <Text style={styles.title}>{registerMode ? 'Join PROtv' : 'Welcome back'}</Text>
        <Text style={styles.subtitle}>Sign in to save your list and continue across devices.</Text>
        {!FIREBASE_CONFIGURED ? (
          <Notice tone="error">
            Firebase client settings are not configured. This form will connect only after you add the local EXPO_PUBLIC_FIREBASE_* values from a development Firebase project.
          </Notice>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {registerMode ? (
          <TextInput
            autoCapitalize="words"
            onChangeText={setDisplayName}
            placeholder="Display name"
            placeholderTextColor={BRAND.muted}
            style={styles.input}
            value={displayName}
          />
        ) : null}
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={BRAND.muted}
          style={styles.input}
          value={email}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete={registerMode ? 'new-password' : 'password'}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={BRAND.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!FIREBASE_CONFIGURED || busy || (registerMode && !displayName.trim()) || !email || !password}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, (!FIREBASE_CONFIGURED || busy) && styles.disabled]}
        >
          <Text style={styles.buttonText}>{busy ? 'Please wait…' : registerMode ? 'Create account' : 'Sign in'}</Text>
        </Pressable>
        {!registerMode ? (
          <Pressable disabled={!FIREBASE_CONFIGURED || !email} onPress={() => void forgotPassword()} style={styles.textAction}>
            <Text style={styles.actionText}>Forgot password?</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => { setRegisterMode((current) => !current); setError(''); setMessage(''); }} style={styles.textAction}>
          <Text style={styles.actionText}>
            {registerMode ? 'Already have an account? Sign in' : 'New to PROtv? Create an account'}
          </Text>
        </Pressable>
        <Text style={styles.legal}>Free to watch · Your stories, your place.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  center: { flex: 1, backgroundColor: BRAND.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { height: 60, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  close: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: BRAND.elevated },
  closeText: { color: BRAND.text, fontSize: 24, lineHeight: 26 },
  form: { paddingHorizontal: 24, paddingTop: 24, maxWidth: 540, width: '100%', alignSelf: 'center' },
  kicker: { color: BRAND.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: BRAND.text, fontSize: 30, fontWeight: '900', marginTop: 8 },
  subtitle: { color: BRAND.muted, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 14 },
  input: { height: 50, color: BRAND.text, backgroundColor: BRAND.surface, borderColor: BRAND.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, marginTop: 10 },
  button: { height: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.accent, marginTop: 16 },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  textAction: { paddingVertical: 12, alignItems: 'center' },
  actionText: { color: BRAND.accentBright, fontSize: 12, fontWeight: '700' },
  error: { color: BRAND.danger, fontSize: 12, marginTop: 10 },
  message: { color: BRAND.teal, fontSize: 12, marginTop: 10 },
  legal: { color: BRAND.muted, fontSize: 10, textAlign: 'center', marginTop: 20 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
