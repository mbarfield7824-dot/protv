import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ScreenFrame } from '../components/ScreenFrame';
import { BRAND } from '../constants/brand';
import { useMobile } from '../context/MobileProvider';
import { ACCOUNT_DELETION_ENABLED, PRIVACY_URL } from '../lib/config';
import { deleteViewerAccount } from '../lib/api';
import { reauthenticateViewer, sendEmailVerification, updateViewerName } from '../lib/firebase';

export default function AccountScreen() {
  const { user, resetPassword, signOut } = useMobile();
  const [name, setName] = useState(user?.displayName || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const perform = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Account action could not be completed.');
    } finally {
      setBusy(false);
    }
  };
  const deleteAccount = () => Alert.alert('Delete your PROtv account?',
    'This permanently deletes your viewer account, My List, and watch progress. This cannot be undone. Creator records requiring retention are handled separately by support.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => void perform(async () => {
        const current = await reauthenticateViewer(password);
        await deleteViewerAccount(await current.getIdToken(true));
        await signOut();
        router.replace('/');
      }, '') },
    ]);

  return (
    <ScreenFrame>
      <View style={styles.body}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.link}>Back to PROtv</Text></Pressable>
        <Text style={styles.title}>Account & privacy</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        {user ? <>
          <Text style={styles.copy}>{user.email}</Text>
          <TextInput accessibilityLabel="Display name" value={name} onChangeText={setName}
            style={styles.input} placeholder="Display name" placeholderTextColor={BRAND.muted} maxLength={100} />
          <Pressable disabled={busy} style={styles.button} onPress={() => void perform(
            () => updateViewerName(name), 'Display name updated.',
          )}><Text style={styles.buttonText}>Save display name</Text></Pressable>
          {!user.emailVerified ? (
            <Pressable disabled={busy} style={styles.button} onPress={() => void perform(
              () => sendEmailVerification(user), 'Verification email sent.',
            )}><Text style={styles.buttonText}>Send verification email</Text></Pressable>
          ) : null}
          <Pressable disabled={busy} style={styles.button} onPress={() => void perform(
            () => resetPassword(user.email || ''), 'Password reset instructions sent.',
          )}><Text style={styles.buttonText}>Reset password</Text></Pressable>
          <Pressable disabled={busy} style={styles.button} onPress={() => void perform(
            async () => { await signOut(); router.replace('/'); }, '',
          )}><Text style={styles.buttonText}>Sign out</Text></Pressable>
        </> : (
          <Pressable style={styles.button} onPress={() => router.push('/sign-in')}><Text style={styles.buttonText}>Sign in</Text></Pressable>
        )}
        <Pressable disabled={busy} style={styles.button} onPress={() => void perform(
          async () => { await WebBrowser.openBrowserAsync(PRIVACY_URL); }, '',
        )}><Text style={styles.buttonText}>Privacy policy</Text></Pressable>
        <Text style={styles.copy}>PROtv stores your account details, My List, and watch progress to support your viewing experience. Launch viewing is free; no ads or subscriptions are enabled.</Text>
        <Text style={styles.section}>Account deletion</Text>
        {ACCOUNT_DELETION_ENABLED && user ? <>
          <Text style={styles.copy}>Confirm your password to permanently delete your account and viewer data.</Text>
          <TextInput accessibilityLabel="Password to confirm account deletion" value={password}
            onChangeText={setPassword} secureTextEntry autoCapitalize="none" style={styles.input}
            placeholder="Current password" placeholderTextColor={BRAND.muted} />
          <Pressable accessibilityRole="button" disabled={busy || !password} style={styles.button} onPress={deleteAccount}>
            <Text style={styles.error}>Delete account permanently</Text>
          </Pressable>
        </> : <>
          <Text style={styles.copy}>Automatic deletion is not available in this build. Contact PROtv support to request account and associated data deletion.</Text>
          <Pressable disabled={busy} style={styles.button} onPress={() => void perform(async () => {
            await Linking.openURL('mailto:support@watchprotv.com?subject=PROtv%20account%20deletion%20request');
          }, '')}><Text style={styles.buttonText}>Request account deletion</Text></Pressable>
        </>}
        {busy ? <Text style={styles.copy}>Please wait...</Text> : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { padding: 22, maxWidth: 660, width: '100%', alignSelf: 'center' },
  title: { color: BRAND.text, fontSize: 28, fontWeight: '900', marginVertical: 18 },
  section: { color: BRAND.text, fontSize: 20, fontWeight: '800', marginTop: 24 },
  copy: { color: BRAND.muted, fontSize: 13, lineHeight: 20, marginVertical: 10 },
  input: { padding: 14, color: BRAND.text, borderWidth: 1, borderColor: BRAND.border, borderRadius: 8, marginVertical: 8 },
  button: { minHeight: 48, padding: 14, borderRadius: 8, backgroundColor: BRAND.elevated, marginVertical: 6 },
  buttonText: { color: BRAND.text, fontWeight: '700' },
  link: { color: BRAND.accentBright },
  error: { color: BRAND.danger, marginVertical: 8 },
  message: { color: BRAND.teal, marginVertical: 8 },
});
