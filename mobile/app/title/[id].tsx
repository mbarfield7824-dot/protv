import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { ContentRail } from '../../components/ContentRail';
import { Loading, Notice, ScreenFrame } from '../../components/ScreenFrame';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { relatedTitles, seriesEpisodes } from '../../data/catalog';

export default function TitleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { titles, favorites, toggleFavorite, progress, usingFixtures, user, catalogLoading } = useMobile();
  const { width } = useWindowDimensions();
  const [favoriteError, setFavoriteError] = useState('');
  const [pickedSeason, setPickedSeason] = useState<number | null>(null);
  const title = titles.find((item) => item.id === id);
  const episodes = useMemo(
    () => seriesEpisodes(title, titles),
    [title, titles],
  );
  const related = useMemo(() => (title ? relatedTitles(title, titles) : []), [title, titles]);

  if (!title) {
    return (
      <ScreenFrame header={false}>
        <BrandHeader showBack showAccount={false} />
        {catalogLoading ? <Loading label="Loading this title" /> : (
          <Text style={styles.notFound}>This title is not available in the current catalog.</Text>
        )}
      </ScreenFrame>
    );
  }

  const isEpisode = title.contentType === 'EPISODE';
  const watched = progress[title.id]?.positionSeconds ?? 0;
  const duration = progress[title.id]?.durationSeconds ?? title.duration * 60;
  const resume = watched > 10 && watched < duration * 0.95;
  const artwork = title.heroImageUrl || title.posterUrl || title.thumbnailUrl;
  const saved = favorites.includes(title.id);
  const seasons = [...new Set(episodes.map((episode) => episode.seasonNumber ?? 1))];
  const season = pickedSeason ?? title.seasonNumber ?? seasons[0];
  const shownEpisodes = episodes.filter((episode) => (episode.seasonNumber ?? 1) === season);
  const details = [
    title.year || null,
    title.maturityRating || 'Not rated',
    title.duration ? `${title.duration} min` : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <ScreenFrame header={false}>
      <BrandHeader showBack showAccount={false} />
      {usingFixtures ? <Notice>Prototype preview · title and playback data are samples.</Notice> : null}
      <View style={[styles.artwork, { height: Math.min(width * 1.05, 460) }]}>
        <LinearGradient colors={['#14306E', BRAND.background]} style={StyleSheet.absoluteFill} />
        {artwork ? (
          <Image source={{ uri: artwork }} style={StyleSheet.absoluteFill} contentFit="contain"
            cachePolicy="memory-disk" accessible={false} />
        ) : null}
      </View>
      <View style={styles.hero}>
        {title.category ? <Text style={styles.heroLabel}>{title.category.toUpperCase()}</Text> : null}
        <Text accessibilityRole="header" style={styles.heroTitle}>{title.title}</Text>
        <Text style={styles.heroSub}>{details}</Text>
      </View>
      <View style={styles.body}>
        {isEpisode && title.seriesTitle ? (
          <Text style={styles.seriesLabel}>
            {title.seriesTitle}  ·  Season {title.seasonNumber ?? 1}, Episode {title.episodeNumber ?? 1}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${resume ? 'Resume' : 'Play'} ${title.title}`}
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: title.id } })}
            style={({ pressed }) => [styles.play, pressed && styles.pressed]}
          >
            <Text style={styles.playText}>{resume ? '▶  Resume' : '▶  Play'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? `Remove ${title.title} from My List` : `Add ${title.title} to My List`}
            accessibilityState={{ selected: saved }}
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
            <Text style={styles.listText}>{saved ? '✓  My List' : '+  My List'}</Text>
          </Pressable>
        </View>
        {favoriteError ? <Text accessibilityRole="alert" style={styles.favoriteError}>{favoriteError}</Text> : null}
        <Text style={styles.description}>{title.description}</Text>
        {title.credits ? <Text style={styles.credits}>{title.credits}</Text> : null}
      </View>
      {episodes.length > 0 ? (
        <View style={styles.episodes}>
          <Text accessibilityRole="header" style={styles.episodesTitle}>Episodes</Text>
          {seasons.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasons}>
              {seasons.map((number) => (
                <Pressable
                  key={number}
                  accessibilityRole="button"
                  accessibilityState={{ selected: number === season }}
                  onPress={() => setPickedSeason(number)}
                  style={[styles.season, number === season && styles.seasonSelected]}
                >
                  <Text style={styles.seasonText}>Season {number}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {shownEpisodes.map((episode) => {
            const percent = progress[episode.id]?.progressPercent;
            const art = episode.thumbnailUrl || episode.posterUrl;
            return (
              <Pressable
                key={episode.id}
                accessibilityRole="button"
                accessibilityLabel={`Play episode ${episode.episodeNumber ?? 1}, ${episode.title}${percent ? `, ${percent} percent watched` : ''}`}
                onPress={() => router.push({ pathname: '/player/[id]', params: { id: episode.id } })}
                style={({ pressed }) => [styles.episodeRow, episode.id === title.id && styles.episodeCurrent, pressed && styles.pressed]}
              >
                <View style={styles.episodeArt}>
                  {art ? <Image source={{ uri: art }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" accessible={false} /> : null}
                  {percent ? (
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View>
                  ) : null}
                </View>
                <View style={styles.episodeCopy}>
                  <Text style={styles.episodeName} numberOfLines={2}>{episode.episodeNumber ?? 1}. {episode.title}</Text>
                  {episode.duration ? <Text style={styles.episodeRuntime}>{episode.duration} min</Text> : null}
                  <Text style={styles.episodeDescription} numberOfLines={3}>{episode.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <ContentRail title="More to discover" items={related} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  notFound: { color: BRAND.muted, fontSize: 15, padding: 22 },
  artwork: { overflow: 'hidden' },
  hero: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  heroLabel: { color: BRAND.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  heroTitle: { color: BRAND.text, fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1, marginTop: 8 },
  heroSub: { color: '#DDE4F2', fontSize: 13, marginTop: 8 },
  body: { paddingHorizontal: 22, paddingTop: 8 },
  seriesLabel: { color: BRAND.accentBright, fontSize: 13, fontWeight: '800', marginBottom: 12 },
  description: { color: '#D5DCEA', fontSize: 15, lineHeight: 22, marginTop: 16 },
  credits: { color: BRAND.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  play: { minHeight: 46, minWidth: 130, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: BRAND.text, paddingHorizontal: 20 },
  playText: { color: BRAND.background, fontSize: 15, fontWeight: '900' },
  listButton: { minHeight: 46, justifyContent: 'center', borderRadius: 8, backgroundColor: BRAND.elevated, borderWidth: 1, borderColor: BRAND.border, paddingHorizontal: 16 },
  listText: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  favoriteError: { color: BRAND.danger, fontSize: 13, marginTop: 9 },
  episodes: { marginTop: 27 },
  episodesTitle: { color: BRAND.text, fontSize: 19, fontWeight: '800', paddingHorizontal: 20, marginBottom: 12 },
  seasons: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  season: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 22, borderWidth: 1, borderColor: BRAND.border },
  seasonSelected: { backgroundColor: BRAND.accent, borderColor: BRAND.accent },
  seasonText: { color: BRAND.text, fontSize: 13, fontWeight: '700' },
  episodeRow: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, padding: 8, borderRadius: 12, backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border },
  episodeCurrent: { borderColor: BRAND.accentBright },
  episodeArt: { width: 84, aspectRatio: 2 / 3, borderRadius: 8, overflow: 'hidden', backgroundColor: BRAND.elevated, justifyContent: 'flex-end' },
  episodeCopy: { flex: 1, marginLeft: 12 },
  episodeName: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  episodeRuntime: { color: BRAND.muted, fontSize: 12, marginTop: 3 },
  episodeDescription: { color: BRAND.muted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.32)' },
  progressFill: { height: 3, backgroundColor: BRAND.accentBright },
  pressed: { opacity: 0.78 },
});
