import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { ContentRail } from '../../components/ContentRail';
import { Loading, Notice, ScreenFrame } from '../../components/ScreenFrame';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { buildHomeRails, featuredTitle } from '../../data/catalog';

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const {
    titles, progress, favorites, catalogError, catalogLoading, refreshCatalog, usingFixtures, toggleFavorite, user,
  } = useMobile();
  const progressById = useMemo(
    () => Object.fromEntries(Object.entries(progress).map(([id, entry]) => [id, entry.progressPercent])),
    [progress],
  );
  const rails = useMemo(() => buildHomeRails(titles, favorites, progress), [titles, favorites, progress]);
  const featured = featuredTitle(titles);
  const wide = width >= 700;
  const heroWidth = width - 32;
  const heroHeight = wide ? 460 : Math.min(heroWidth * 1.5, height * 0.68);
  const artwork = featured?.heroImageUrl || featured?.posterUrl || featured?.thumbnailUrl;
  const saved = featured ? favorites.includes(featured.id) : false;
  // Posters carry their own title, so on phones the text would sit on top of it.
  const showHeroText = wide || !featured?.posterUrl || Boolean(featured.heroImageUrl);

  return (
    <ScreenFrame header={false} refreshing={catalogLoading && titles.length > 0} onRefresh={refreshCatalog}>
      <BrandHeader />
      {catalogLoading && !titles.length ? <Loading label="Loading the PROtv collection" /> : null}
      {catalogError ? (
        <View>
          <Notice tone="error">{catalogError}</Notice>
          <Pressable accessibilityRole="button" onPress={refreshCatalog} style={styles.retry}>
            <Text style={styles.retryText}>Retry catalog</Text>
          </Pressable>
        </View>
      ) : null}
      {!catalogLoading && !catalogError && !titles.length ? <Notice>No titles are available right now.</Notice> : null}
      {usingFixtures ? <Notice>Prototype preview · sample titles and local-only My PROtv data</Notice> : null}
      {featured ? (
        <View style={[styles.hero, { height: heroHeight }]}>
          <LinearGradient colors={['#14306E', BRAND.background]} style={StyleSheet.absoluteFill} />
          {artwork ? (
            <Image
              source={{ uri: artwork }}
              style={wide && !featured.heroImageUrl ? [styles.widePoster, { width: heroHeight * 2 / 3 }] : StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="top"
              cachePolicy="memory-disk"
              accessible={false}
            />
          ) : null}
          <LinearGradient
            colors={['transparent', 'rgba(2,4,12,0.72)', BRAND.background]}
            locations={showHeroText ? [0.35, 0.68, 1] : [0.72, 0.88, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            {showHeroText ? <>
              <Text style={styles.eyebrow}>FEATURED ON PROtv</Text>
              <Text accessibilityRole="header" numberOfLines={3} style={[styles.heroTitle, wide && styles.heroTitleLarge]}>{featured.title}</Text>
              <Text numberOfLines={1} style={styles.meta}>
                {[featured.year || null, featured.maturityRating || null, featured.category || null].filter(Boolean).join('  ·  ')}
              </Text>
            </> : <Text accessibilityRole="header" style={styles.hiddenTitle}>{featured.title}</Text>}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${featured.title}`}
                onPress={() => router.push({ pathname: '/player/[id]', params: { id: featured.id } })}
                style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
              >
                <Text style={styles.playButtonText}>▶  Play</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saved ? `Remove ${featured.title} from My List` : `Add ${featured.title} to My List`}
                accessibilityState={{ selected: saved }}
                onPress={() => {
                  if (!user && !usingFixtures) router.push('/sign-in');
                  else void toggleFavorite(featured.id).catch(() => router.push({ pathname: '/title/[id]', params: { id: featured.id } }));
                }}
                style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}
              >
                <Text style={styles.infoButtonText}>{saved ? '✓  My List' : '+  My List'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`More about ${featured.title}`}
                onPress={() => router.push({ pathname: '/title/[id]', params: { id: featured.id } })}
                style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}
              >
                <Text style={styles.infoButtonText}>Info</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      {rails.map((rail) => (
        <ContentRail
          key={rail.key}
          title={rail.title}
          items={rail.items}
          progressById={rail.key === 'continue' ? progressById : undefined}
        />
      ))}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  hero: {
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginTop: 4,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(39,183,255,0.28)',
  },
  widePoster: { position: 'absolute', top: 0, right: 0, bottom: 0 },
  heroContent: { paddingHorizontal: 18, paddingBottom: 16 },
  hiddenTitle: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', margin: 20, paddingHorizontal: 16, borderRadius: 8, backgroundColor: BRAND.accent },
  retryText: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  eyebrow: { color: BRAND.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginBottom: 8 },
  heroTitle: { color: BRAND.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 38 },
  heroTitleLarge: { fontSize: 52, lineHeight: 56, maxWidth: 560 },
  meta: { color: '#DDE4F2', fontSize: 13, fontWeight: '600', marginTop: 9 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  playButton: { minHeight: 44, justifyContent: 'center', backgroundColor: BRAND.text, borderRadius: 8, paddingHorizontal: 22 },
  playButtonText: { color: BRAND.background, fontSize: 15, fontWeight: '900' },
  infoButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  infoButtonText: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
