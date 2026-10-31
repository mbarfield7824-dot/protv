import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { BrandHeader } from '../components/BrandHeader';
import { ScreenFrame } from '../components/ScreenFrame';
import { BRAND } from '../constants/brand';
import { useMobile } from '../context/MobileProvider';
import { ACCOUNT_DELETION_ENABLED, PRIVACY_URL } from '../lib/config';
import { fetchDeletionRequest, submitDeletionRequest, type DeletionRequest } from '../lib/api';
import { reauthenticateViewer, reload, sendEmailVerification, updateViewerName } from '../lib/firebase';

function deletionStatusText(request: DeletionRequest) {
  if (request.status === 'pending_review') return 'Your request was received and is waiting for PROtv review.';
  if (request.status === 'additional_information_required') {
    return `PROtv needs more information: ${request.adminMessage || 'contact support@watchprotv.com.'}`;
  }
  if (request.status === 'completed') return 'Your account deletion is complete.';
  return `Request status: ${request.status.replace(/_/g, ' ')}. Contact support@watchprotv.com with any questions.`;
}

export default function AccountScreen() {
  const { user, resetPassword, signOut } = useMobile();
  const [name, setName] = useState(user?.displayName || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(Boolean(user?.emailVerified));
  const [deletion, setDeletion] = useState<DeletionRequest | null>(null);
  const [deletionLoaded, setDeletionLoaded] = useState(false);

  const refreshVerified = useCallback(async () => {
    if (!user) return false;
    await reload(user);
    setVerified(user.emailVerified);
    return user.emailVerified;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    reload(user)
      .then(() => { if (active) setVerified(user.emailVerified); })
      .catch(() => undefined);
    if (!ACCOUNT_DELETION_ENABLED) return () => { active = false; };
    user.getIdToken()
      .then(fetchDeletionRequest)
      .then((request) => { if (active) setDeletion(request); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Account deletion status could not be loaded.');
      })
      .finally(() => { if (active) setDeletionLoaded(true); });
    return () => { active = false; };
  }, [user]);

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
  const requestDeletion = () => Alert.alert('Request account deletion?',
    'PROtv will review your request, then delete your sign-in account, My List, and watch history. This cannot be undone once processed. Records PROtv must keep, such as signed creator agreements, are reviewed separately. You can keep using PROtv until the review is finished.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request deletion', style: 'destructive', onPress: () => void perform(async () => {
        const current = await reauthenticateViewer(password);
        setDeletion(await submitDeletionRequest(await current.getIdToken(true)));
        setPassword('');
      }, 'Your deletion request was received.') },
    ]);

  return (
    <ScreenFrame header={false}>
      <BrandHeader showBack showAccount={false} />
      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.title}>Account & privacy</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        {user ? <>
          <Text style={styles.copy}>{user.email}</Text>
          <TextInput accessibilityLabel="Display name" value={name} onChangeText={setName} keyboardAppearance="dark"
            textContentType="name" style={styles.input} placeholder="Display name" placeholderTextColor={BRAND.muted} maxLength={100} />
          <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void perform(
            () => updateViewerName(name), 'Display name updated.',
          )}><Text style={styles.buttonText}>Save display name</Text></Pressable>
          {!verified ? <>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void perform(
              () => sendEmailVerification(user), 'Verification email sent.',
            )}><Text style={styles.buttonText}>Send verification email</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void perform(async () => {
              if (!await refreshVerified()) throw new Error('This email is not verified yet. Use the link in the email, then try again.');
            }, 'Your email is verified.')}><Text style={styles.buttonText}>I verified my email</Text></Pressable>
          </> : null}
          <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void perform(
            () => resetPassword(user.email || ''), 'Password reset instructions sent.',
          )}><Text style={styles.buttonText}>Reset password</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void perform(
            async () => { await signOut(); router.replace('/'); }, '',
          )}><Text style={styles.buttonText}>Sign out</Text></Pressable>
        </> : (
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.push('/sign-in')}><Text style={styles.buttonText}>Sign in</Text></Pressable>
        )}
        <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void perform(
          async () => { await WebBrowser.openBrowserAsync(PRIVACY_URL); }, '',
        )}><Text style={styles.buttonText}>Privacy policy</Text></Pressable>
        <Text style={styles.copy}>PROtv stores your account details, My List, and watch progress to support your viewing experience. Launch viewing is free; no ads or subscriptions are enabled.</Text>
        <Text accessibilityRole="header" style={styles.section}>Account deletion</Text>
        {ACCOUNT_DELETION_ENABLED && user ? (
          deletion ? <Text style={styles.copy}>{deletionStatusText(deletion)}</Text> : deletionLoaded ? <>
            <Text style={styles.copy}>Confirm your password to request deletion of your account and viewer data.</Text>
            <TextInput accessibilityLabel="Password to confirm account deletion" value={password} keyboardAppearance="dark"
              onChangeText={setPassword} secureTextEntry autoCapitalize="none" textContentType="password" style={styles.input}
              placeholder="Current password" placeholderTextColor={BRAND.muted} />
            <Pressable accessibilityRole="button" disabled={busy || !password} style={styles.button} onPress={requestDeletion}>
              <Text style={styles.danger}>Request account deletion</Text>
            </Pressable>
          </> : <Text style={styles.copy}>Checking for an existing request...</Text>
        ) : user ? <>
          <Text style={styles.copy}>Automatic deletion is not available in this build. Contact PROtv support to request account and associated data deletion.</Text>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void perform(async () => {
            await Linking.openURL('mailto:support@watchprotv.com?subject=PROtv%20account%20deletion%20request');
          }, '')}><Text style={styles.buttonText}>Request account deletion</Text></Pressable>
        </> : <Text style={styles.copy}>Sign in to request deletion of your account.</Text>}
        {busy ? <Text style={styles.copy}>Please wait...</Text> : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { padding: 22, paddingTop: 4, maxWidth: 660, width: '100%', alignSelf: 'center' },
  title: { color: BRAND.text, fontSize: 28, fontWeight: '900', marginBottom: 12 },
  section: { color: BRAND.text, fontSize: 20, fontWeight: '800', marginTop: 24 },
  copy: { color: BRAND.muted, fontSize: 14, lineHeight: 20, marginVertical: 10 },
  input: { minHeight: 48, paddingHorizontal: 14, color: BRAND.text, fontSize: 16, borderWidth: 1, borderColor: BRAND.border, borderRadius: 8, marginVertical: 8 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: BRAND.elevated, marginVertical: 6 },
  buttonText: { color: BRAND.text, fontSize: 15, fontWeight: '700' },
  danger: { color: BRAND.danger, fontSize: 15, fontWeight: '700' },
  error: { color: BRAND.danger, fontSize: 14, marginVertical: 8 },
  message: { color: BRAND.accentBright, fontSize: 14, marginVertical: 8 },
});
