import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../constants/brand';
import type { CatalogTitle } from '../data/catalog';

const PALETTES: [string, string][] = [
  ['#243A64', '#0E1323'],
  ['#693D51', '#17111C'],
  ['#4A654D', '#101A18'],
  ['#795D38', '#19140F'],
  ['#3E527A', '#10121C'],
  ['#54457A', '#15111E'],
];

export function TitleCard({
  title,
  progress,
  compact = false,
}: {
  title: CatalogTitle;
  progress?: number;
  compact?: boolean;
}) {
  const palette = PALETTES[Math.abs(title.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % PALETTES.length];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${title.title}`}
      onPress={() => router.push({ pathname: '/title/[id]', params: { id: title.id } })}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}
    >
      <LinearGradient colors={palette} style={[styles.art, compact && styles.compactArt]}>
        <View style={styles.artLine} />
        <Text style={styles.category}>{title.category || title.contentType}</Text>
        <Text numberOfLines={3} style={[styles.artTitle, compact && styles.compactTitle]}>{title.title}</Text>
        {title.seriesTitle ? (
          <Text style={styles.episode}>S{title.seasonNumber ?? 1} · E{title.episodeNumber ?? 1}</Text>
        ) : null}
        <Text style={styles.artMark}>PROtv</Text>
        {typeof progress === 'number' ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
          </View>
        ) : null}
      </LinearGradient>
      <Text numberOfLines={1} style={styles.title}>{title.title}</Text>
      <Text numberOfLines={1} style={styles.subtitle}>
        {title.seriesTitle ? `${title.seriesTitle} · Episode ${title.episodeNumber ?? 1}` : `${title.year || 'PROtv'} · ${title.category}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 142, marginRight: 12 },
  compact: { width: 116 },
  art: {
    height: 196,
    borderRadius: 12,
    padding: 13,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  compactArt: { height: 164 },
  artLine: {
    position: 'absolute',
    top: 16,
    left: 13,
    width: 28,
    height: 2,
    backgroundColor: BRAND.teal,
    opacity: 0.9,
  },
  category: { color: '#D5DBEC', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  artTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', lineHeight: 25, marginTop: 7 },
  compactTitle: { fontSize: 18, lineHeight: 20 },
  episode: { color: '#DFE3EF', fontSize: 10, fontWeight: '700', marginTop: 7 },
  artMark: { position: 'absolute', top: 16, right: 12, color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '900' },
  title: { color: BRAND.text, fontSize: 13, fontWeight: '700', marginTop: 9 },
  subtitle: { color: BRAND.muted, fontSize: 11, marginTop: 3 },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.32)', marginTop: 11, borderRadius: 4 },
  progressFill: { height: 3, backgroundColor: BRAND.accentBright, borderRadius: 4 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
