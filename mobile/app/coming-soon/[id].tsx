import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { goHome } from '../../components/navigation/NavMenu';
import { Loading, Notice, ScreenFrame } from '../../components/ScreenFrame';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { airingText, premiereLong, releasedTitleFor } from '../../data/comingSoon';

// Details for an upcoming film or show. There is no Play button: playback exists only once the backend has released
// the title into the normal catalog, and then this page links to the regular title page instead.
export default function ComingSoonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { comingSoon, titles, catalogLoading } = useMobile();
  const { width } = useWindowDimensions();
  const item = comingSoon.find((entry) => entry.id === id);
  const released = item ? releasedTitleFor(item, titles) : titles.find((title) => title.id === id);

  if (!item) {
    return (
      <ScreenFrame header={false}>
        <BrandHeader showBack showAccount={false} />
        {catalogLoading ? <Loading label="Loading Coming Soon" /> : (
          <View>
            <Notice>{released ? `${released.title} is now available to watch.` : 'This title is no longer listed as Coming Soon.'}</Notice>
            <Pressable
              accessibilityRole="button"
              onPress={() => (released ? router.replace({ pathname: '/title/[id]', params: { id: released.id } }) : goHome())}
              style={({ pressed }) => [styles.primary, styles.inset, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>{released ? 'View title' : 'Back to Home'}</Text>
            </Pressable>
          </View>
        )}
      </ScreenFrame>
    );
  }

  const premiere = premiereLong(item.premiereAt);
  const airing = airingText(item.airingSchedule);
  return (
    <ScreenFrame header={false}>
      <BrandHeader showBack showAccount={false} />
      <View style={[styles.artwork, { height: Math.min(width * 1.05, 460) }]}>
        <LinearGradient colors={['#14306E', BRAND.background]} style={StyleSheet.absoluteFill} />
        {item.artwork ? (
          <Image source={{ uri: item.artwork }} style={StyleSheet.absoluteFill} contentFit="contain"
            cachePolicy="memory-disk" accessible={false} />
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.badges}>
          {item.protvOriginal ? <Text style={[styles.badge, styles.badgeOriginal]}>PROtv ORIGINAL</Text> : null}
          <Text style={styles.badge}>COMING SOON</Text>
          <Text style={styles.kind}>{item.kind === 'series' ? 'SERIES' : 'FILM'}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{item.title}</Text>
        <Text style={styles.premiere}>{premiere}</Text>
        {airing ? <Text style={styles.meta}>{airing}</Text> : null}
        {item.categories.length ? <Text style={styles.meta}>{item.categories.join('  ·  ')}</Text> : null}
        {released ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace({ pathname: '/title/[id]', params: { id: released.id } })}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Now available · View title</Text>
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={`Not yet available. ${premiere}.`} style={styles.unavailable}>
            <Text style={styles.unavailableText}>Available to watch after its premiere</Text>
          </View>
        )}
        {item.description ? <Text style={styles.description}>{item.description.trim()}</Text> : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  artwork: { overflow: 'hidden', backgroundColor: BRAND.surface },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  inset: { marginHorizontal: 20 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badge: {
    color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1, overflow: 'hidden',
    backgroundColor: BRAND.elevated, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4,
  },
  badgeOriginal: { backgroundColor: BRAND.accent },
  kind: { color: BRAND.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginLeft: 4 },
  title: { color: BRAND.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 38, marginTop: 12 },
  premiere: { color: BRAND.accentBright, fontSize: 15, fontWeight: '800', marginTop: 10 },
  meta: { color: BRAND.muted, fontSize: 13, fontWeight: '600', marginTop: 6 },
  primary: {
    alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', marginTop: 18, paddingHorizontal: 20,
    borderRadius: 8, backgroundColor: BRAND.text,
  },
  primaryText: { color: BRAND.background, fontSize: 15, fontWeight: '900' },
  unavailable: {
    alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', marginTop: 18, paddingHorizontal: 18,
    borderRadius: 8, borderWidth: 1, borderColor: BRAND.border, backgroundColor: BRAND.surface,
  },
  unavailableText: { color: BRAND.muted, fontSize: 14, fontWeight: '800' },
  description: { color: '#DDE4F2', fontSize: 15, lineHeight: 23, marginTop: 20 },
  pressed: { opacity: 0.8 },
});
