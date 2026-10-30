import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { ContentRail } from '../../components/ContentRail';
import { Notice, ScreenFrame } from '../../components/ScreenFrame';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';

export default function TitleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { titles, favorites, toggleFavorite, progress, usingFixtures, user } = useMobile();
  const [favoriteError, setFavoriteError] = useState('');
  const title = titles.find((item) => item.id === id);
  const episodes = useMemo(
    () => title?.seriesId ? titles.filter((item) => item.seriesId === title.seriesId) : [],
    [title, titles],
  );

  if (!title) {
    return (
      <ScreenFrame>
        <Text style={styles.notFound}>This title is not available in the current catalog.</Text>
      </ScreenFrame>
    );
  }

  const isEpisode = title.contentType === 'EPISODE';
  const watched = progress[title.id]?.positionSeconds ?? 0;
  const duration = progress[title.id]?.durationSeconds ?? title.duration * 60;
  const resume = watched > 10 && watched < duration * 0.95;

  return (
    <ScreenFrame header={false}>
      <BrandHeader showAccount={false} />
      {usingFixtures ? <Notice>Prototype preview · title and playback data are samples.</Notice> : null}
      <View style={styles.hero}>
        <LinearGradient colors={['#243A64', '#392B45', '#0B0D14']} style={StyleSheet.absoluteFill} />
        <View style={styles.heroOrnament} />
        <Text style={styles.heroLabel}>{title.category.toUpperCase()}  ·  PROtv</Text>
        <Text style={styles.heroTitle}>{title.title}</Text>
        <Text style={styles.heroSub}>{title.year || 'PROtv'}  ·  {title.maturityRating || 'All audiences'}  ·  {title.duration} min</Text>
      </View>
      <View style={styles.body}>
        {isEpisode && title.seriesTitle ? (
          <Text style={styles.seriesLabel}>
            {title.seriesTitle}  ·  Season {title.seasonNumber ?? 1}, Episode {title.episodeNumber ?? 1}
          </Text>
        ) : null}
        <Text style={styles.description}>{title.description}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: title.id } })}
            style={({ pressed }) => [styles.play, pressed && styles.pressed]}
          >
            <Text style={styles.playText}>{resume ? '▶   Resume' : '▶   Play now'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: favorites.includes(title.id) }}
            onPress={() => {
              if (!user && !usingFixtures) {
                router.push('/sign-in');
                return;
              }
              setFavoriteError('');
              void toggleFavorite(title.id).catch((error: unknown) => {
                setFavoriteError(error instanceof Error ? error.message : 'My List could not be updated.');
              });
            }}
            style={({ pressed }) => [styles.listButton, pressed && styles.pressed]}
          >
            <Text style={styles.listText}>{favorites.includes(title.id) ? '✓  My List' : '+  My List'}</Text>
          </Pressable>
        </View>
        {favoriteError ? <Text style={styles.favoriteError}>{favoriteError}</Text> : null}
        <Text style={styles.freeLabel}>FREE TO WATCH</Text>
      </View>
      {episodes.length > 0 ? (
        <View style={styles.episodes}>
          <Text style={styles.episodesTitle}>Episodes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {episodes.map((episode) => (
              <Pressable
                key={episode.id}
                accessibilityRole="button"
                onPress={() => router.replace({ pathname: '/title/[id]', params: { id: episode.id } })}
                style={styles.episodeCard}
              >
                <View style={styles.episodeNumber}><Text style={styles.episodeNumberText}>{episode.episodeNumber}</Text></View>
                <Text style={styles.episodeName} numberOfLines={2}>{episode.title}</Text>
                <Text style={styles.episodeRuntime}>{episode.duration} min</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ContentRail
        title="More to discover"
        items={titles.filter((item) => item.id !== title.id && item.genres.some((genre) => title.genres.includes(genre))).slice(0, 5)}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  notFound: { color: BRAND.muted, fontSize: 15, padding: 22 },
  hero: { minHeight: 320, paddingHorizontal: 24, paddingBottom: 28, justifyContent: 'flex-end', overflow: 'hidden' },
  heroOrnament: { position: 'absolute', width: 290, height: 290, borderRadius: 160, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', top: -50, right: -80 },
  heroLabel: { color: BRAND.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  heroTitle: { color: BRAND.text, fontSize: 40, lineHeight: 44, fontWeight: '900', letterSpacing: -1.2, marginTop: 10 },
  heroSub: { color: '#D5D9E5', fontSize: 12, marginTop: 9 },
  body: { paddingHorizontal: 22, paddingTop: 20 },
  seriesLabel: { color: BRAND.accentBright, fontSize: 12, fontWeight: '800', marginBottom: 8 },
  description: { color: '#D2D6E0', fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', marginTop: 20 },
  play: { borderRadius: 8, backgroundColor: BRAND.text, paddingVertical: 12, paddingHorizontal: 17 },
  playText: { color: BRAND.background, fontSize: 13, fontWeight: '900' },
  listButton: { marginLeft: 9, borderRadius: 8, backgroundColor: BRAND.elevated, borderWidth: 1, borderColor: BRAND.border, paddingVertical: 12, paddingHorizontal: 16 },
  listText: { color: BRAND.text, fontSize: 13, fontWeight: '800' },
  freeLabel: { color: BRAND.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 13 },
  favoriteError: { color: BRAND.danger, fontSize: 11, marginTop: 9 },
  episodes: { marginTop: 27 },
  episodesTitle: { color: BRAND.text, fontSize: 18, fontWeight: '800', paddingHorizontal: 20, marginBottom: 12 },
  episodeCard: { width: 165, minHeight: 104, marginLeft: 20, padding: 13, borderRadius: 11, backgroundColor: BRAND.surface, borderColor: BRAND.border, borderWidth: 1 },
  episodeNumber: { width: 24, height: 24, borderRadius: 7, backgroundColor: '#25345F', alignItems: 'center', justifyContent: 'center' },
  episodeNumberText: { color: BRAND.accentBright, fontSize: 11, fontWeight: '900' },
  episodeName: { color: BRAND.text, fontSize: 12, fontWeight: '800', marginTop: 8 },
  episodeRuntime: { color: BRAND.muted, fontSize: 10, marginTop: 4 },
  pressed: { opacity: 0.78 },
});
