import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { ContentRail } from '../../components/ContentRail';
import { Notice, ScreenFrame } from '../../components/ScreenFrame';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { titles, progress, catalogError, catalogLoading, refreshCatalog, usingFixtures } = useMobile();
  const progressById = useMemo(
    () => Object.fromEntries(Object.entries(progress).map(([id, entry]) => [id, entry.progressPercent])),
    [progress],
  );
  const featured = titles[0];
  const continueWatching = titles.filter((title) => progress[title.id]);
  const series = titles.filter((title) => title.contentType === 'EPISODE');
  const heroHeight = width >= 700 ? 450 : 390;

  return (
    <ScreenFrame header={false}>
      <BrandHeader />
      {catalogLoading ? <Notice>Loading the PROtv collection...</Notice> : null}
      {catalogError ? (
        <View>
          <Notice tone="error">{catalogError}</Notice>
          <Pressable accessibilityRole="button" onPress={refreshCatalog} style={styles.retry}>
            <Text style={styles.infoButtonText}>Retry catalog</Text>
          </Pressable>
        </View>
      ) : null}
      {!catalogLoading && !catalogError && !titles.length ? <Notice>No titles are available right now.</Notice> : null}
      {usingFixtures ? (
        <Notice tone={catalogError ? 'error' : 'info'}>
          {catalogError
            ? `Sample titles are shown. Live catalog unavailable: ${catalogError}`
            : 'Prototype preview · sample titles and local-only My PROtv data'}
        </Notice>
      ) : null}
      {featured ? (
        <View style={[styles.hero, { minHeight: heroHeight }]}>
          <LinearGradient
            colors={['#11182A', '#212B48', '#34283D', '#10121B']}
            locations={[0, 0.4, 0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
          {featured.heroImageUrl || featured.posterUrl || featured.thumbnailUrl ? (
            <Image
              source={{ uri: featured.heroImageUrl || featured.posterUrl || featured.thumbnailUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              onError={() => console.warn(`Featured artwork unavailable for ${featured.id}.`)}
            />
          ) : null}
          <LinearGradient colors={['rgba(7,8,13,0.12)', 'rgba(7,8,13,0.96)']} style={StyleSheet.absoluteFill} />
          <View style={styles.heroOrbit} />
          <View style={styles.heroShade} />
          <View style={styles.heroContent}>
            <Text style={styles.eyebrow}>A PROtv FEATURE</Text>
            <Text style={[styles.heroTitle, width >= 700 && styles.heroTitleLarge]}>{featured.title}</Text>
            <Text numberOfLines={3} style={styles.heroCopy}>{featured.description}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{featured.year}  ·  {featured.maturityRating || 'Not rated'}</Text>
              <Text style={styles.metaDot}>●</Text>
              <Text style={styles.meta}>{featured.category}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/player/[id]', params: { id: featured.id } })}
                style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
              >
                <Text style={styles.playButtonText}>▶   Play now</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/title/[id]', params: { id: featured.id } })}
                style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}
              >
                <Text style={styles.infoButtonText}>More info</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.heroIndex}><Text style={styles.heroIndexText}>FEATURED ON PROtv</Text></View>
        </View>
      ) : null}
      <View style={styles.welcome}>
        <Text style={styles.welcomeTitle}>Stories with their own point of view.</Text>
        <Text style={styles.welcomeCopy}>Independent film, original series, music, and more.</Text>
      </View>
      <ContentRail title="Continue Watching" items={continueWatching} progressById={progressById} />
      <ContentRail title="Movies" items={titles.filter((title) => title.contentType === 'MOVIE')} />
      <ContentRail title="Series & episodes" items={series} />
      <ContentRail title="Music" items={titles.filter((title) => title.contentType === 'MUSIC')} />
      <ContentRail title="Explore PROtv" items={titles} compact />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.footerTags}>
        {['Independent film', 'Documentaries', 'Black Cinema', 'Music'].map((tag) => (
          <View key={tag} style={styles.footerTag}><Text style={styles.footerTagText}>{tag}</Text></View>
        ))}
      </ScrollView>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  hero: { justifyContent: 'flex-end', overflow: 'hidden', marginTop: 4 },
  heroOrbit: {
    position: 'absolute',
    top: -150,
    right: -80,
    width: 360,
    height: 360,
    borderRadius: 200,
    borderWidth: 1,
    borderColor: 'rgba(177,196,255,0.2)',
    transform: [{ scaleX: 1.25 }],
  },
  heroShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(3,5,11,0.15)',
  },
  heroContent: { paddingHorizontal: 24, paddingTop: 80, paddingBottom: 30, maxWidth: 620 },
  retry: { alignSelf: 'flex-start', margin: 20, padding: 12, borderRadius: 8, backgroundColor: BRAND.accent },
  eyebrow: { color: BRAND.teal, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 12 },
  heroTitle: { color: BRAND.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.6, lineHeight: 47 },
  heroTitleLarge: { fontSize: 58, lineHeight: 62 },
  heroCopy: { color: '#D5D9E5', fontSize: 14, lineHeight: 21, marginTop: 12, maxWidth: 470 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  meta: { color: '#E4E7EF', fontSize: 11, fontWeight: '700' },
  metaDot: { color: BRAND.teal, fontSize: 5, marginHorizontal: 8 },
  actions: { flexDirection: 'row', marginTop: 18 },
  playButton: { backgroundColor: BRAND.text, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 17 },
  playButtonText: { color: '#10121A', fontSize: 13, fontWeight: '900' },
  infoButton: {
    marginLeft: 9,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 17,
  },
  infoButtonText: { color: BRAND.text, fontSize: 13, fontWeight: '800' },
  heroIndex: { position: 'absolute', top: 24, right: 20 },
  heroIndexText: { color: 'rgba(255,255,255,0.68)', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  welcome: { paddingHorizontal: 20, paddingTop: 22 },
  welcomeTitle: { color: BRAND.text, fontSize: 18, fontWeight: '800' },
  welcomeCopy: { color: BRAND.muted, fontSize: 12, marginTop: 4 },
  footerTags: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 10 },
  footerTag: { borderWidth: 1, borderColor: BRAND.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 },
  footerTagText: { color: BRAND.muted, fontSize: 10, fontWeight: '700' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
