import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { ContentRail } from '../../components/ContentRail';
import { useContentWidth } from '../../components/navigation/NavMenu';
import { Notice, ScreenFrame } from '../../components/ScreenFrame';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { continueWatching, watchHistory } from '../../data/catalog';

function ActionRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Text style={styles.actionArrow}>›</Text>
    </Pressable>
  );
}

export default function MyProtvScreen() {
  const {
    user, authLoading, favorites, progress, titles, usingFixtures,
    accountError, creatorPortalUrl, signOut,
  } = useMobile();
  const [creatorError, setCreatorError] = useState('');
  const width = useContentWidth();
  const progressById = useMemo(
    () => Object.fromEntries(Object.entries(progress).map(([id, entry]) => [id, entry.progressPercent])),
    [progress],
  );
  const savedTitles = titles.filter((title) => favorites.includes(title.id));
  const continueTitles = continueWatching(titles, progress);
  const historyTitles = watchHistory(titles, progress);
  const tablet = width >= 700;

  const openCreator = async () => {
    setCreatorError('');
    try {
      const url = await creatorPortalUrl();
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      setCreatorError(error instanceof Error ? error.message : 'Creator Portal is unavailable.');
    }
  };

  return (
    <ScreenFrame header={false}>
      <BrandHeader />
      <View style={styles.heading}>
        <Text style={styles.kicker}>YOUR PROTV</Text>
        <Text style={styles.title}>My PROtv</Text>
      </View>
      {usingFixtures ? (
        <Notice>Preview mode · My List and watch progress are stored only in this app session.</Notice>
      ) : null}
      {accountError ? <Notice tone="error">{accountError}</Notice> : null}
      {user ? (
        <View style={[styles.profileCard, tablet && styles.profileCardTablet]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user.displayName || user.email || 'P').slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileEyebrow}>SIGNED IN</Text>
            <Text style={styles.profileName}>{user.displayName || 'PROtv viewer'}</Text>
            <Text style={styles.profileEmail}>{user.email || ''}</Text>
            {!user.emailVerified ? <Text style={styles.verifyText}>Verify your email to access Creator Portal.</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCreatorError('');
              void signOut().catch((error: unknown) => setCreatorError(
                error instanceof Error ? error.message : 'Sign out failed.',
              ));
            }}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.profileCard}>
          <View style={styles.profileCopy}>
            <Text style={styles.profileEyebrow}>YOUR STORIES, YOUR PLACE</Text>
            <Text style={styles.profileName}>Make it yours.</Text>
            <Text style={styles.profileEmail}>Sign in to sync My List and Continue Watching.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={authLoading}
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => [styles.signInButton, pressed && styles.pressed]}
          >
            <Text style={styles.signInText}>{authLoading ? 'Loading…' : 'Sign in'}</Text>
          </Pressable>
        </View>
      )}
      {favorites.length || continueTitles.length ? (
        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statValue}>{favorites.length}</Text><Text style={styles.statLabel}>IN MY LIST</Text></View>
          <View style={styles.statLine} />
          <View style={styles.stat}><Text style={styles.statValue}>{continueTitles.length}</Text><Text style={styles.statLabel}>IN PROGRESS</Text></View>
        </View>
      ) : null}
      {creatorError ? <Notice tone="error">{creatorError}</Notice> : null}
      <View style={styles.actions}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Account and creators</Text>
        <ActionRow
          title="Account & privacy"
          detail="Profile, password, privacy, and deletion"
          onPress={() => router.push('/account')}
        />
        <ActionRow
          title="Open Creator Portal"
          detail="Share your film or series with PROtv"
          onPress={() => void openCreator()}
        />
      </View>
      <ContentRail title="Continue Watching" items={continueTitles} progressById={progressById} />
      <ContentRail title="My List" items={savedTitles} compact />
      <ContentRail title="Watch History" items={historyTitles} progressById={progressById} compact />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  kicker: { color: BRAND.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: BRAND.text, fontSize: 32, fontWeight: '900', marginTop: 5 },
  profileCard: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: BRAND.surface,
    borderWidth: 1,
    borderColor: BRAND.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileCardTablet: { maxWidth: 760 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#26345E', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  avatarText: { color: BRAND.accentBright, fontSize: 20, fontWeight: '900' },
  profileCopy: { flex: 1 },
  profileEyebrow: { color: BRAND.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  profileName: { color: BRAND.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  profileEmail: { color: BRAND.muted, fontSize: 11, marginTop: 3 },
  verifyText: { color: BRAND.gold, fontSize: 10, marginTop: 6 },
  signInButton: { minHeight: 44, justifyContent: 'center', backgroundColor: BRAND.accent, borderRadius: 8, paddingHorizontal: 15, marginLeft: 12 },
  signInText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  signOutButton: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: BRAND.border, borderRadius: 8, paddingHorizontal: 12, marginLeft: 10 },
  signOutText: { color: BRAND.text, fontSize: 11, fontWeight: '700' },
  stats: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 18, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: BRAND.border },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: BRAND.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: BRAND.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  statLine: { width: 1, height: 30, backgroundColor: BRAND.border },
  actions: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: { color: BRAND.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  actionRow: { minHeight: 65, borderBottomWidth: 1, borderColor: BRAND.border, flexDirection: 'row', alignItems: 'center' },
  actionCopy: { flex: 1 },
  actionTitle: { color: BRAND.text, fontSize: 13, fontWeight: '800' },
  actionDetail: { color: BRAND.muted, fontSize: 11, marginTop: 4 },
  actionArrow: { color: BRAND.muted, fontSize: 27, paddingLeft: 12 },
  pressed: { opacity: 0.76 },
});
