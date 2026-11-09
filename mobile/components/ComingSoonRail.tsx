import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../constants/brand';
import { premiereShort, type ComingSoonItem } from '../data/comingSoon';

// A Coming Soon poster opens its details page. It never starts playback.
function ComingSoonCard({ item }: { item: ComingSoonItem }) {
  const [failed, setFailed] = useState(false);
  const label = premiereShort(item.premiereAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.protvOriginal ? ', a PROtv Original' : ''}, coming soon. ${label}.`}
      onPress={() => router.push({ pathname: '/coming-soon/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <LinearGradient colors={['#1F3F8F', '#060B1C']} style={styles.art}>
        {item.artwork && !failed ? (
          <Image
            source={{ uri: item.artwork }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={item.id}
            cachePolicy="memory-disk"
            transition={150}
            accessible={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <Text numberOfLines={3} style={styles.artTitle}>{item.title}</Text>
        )}
        <View style={styles.badges}>
          {item.protvOriginal ? <Text style={[styles.badge, styles.badgeOriginal]}>PROtv ORIGINAL</Text> : null}
          <Text style={styles.badge}>COMING SOON</Text>
        </View>
      </LinearGradient>
      <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
      <Text numberOfLines={2} style={styles.subtitle}>{label}</Text>
    </Pressable>
  );
}

export function ComingSoonRail({ items }: { items: ComingSoonItem[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text accessibilityRole="header" style={styles.heading}>Coming Soon</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        initialNumToRender={5}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
        renderItem={({ item }) => <ComingSoonCard item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 15 },
  headingRow: { minHeight: 44, justifyContent: 'center', marginBottom: 5, paddingLeft: 20, paddingRight: 8 },
  heading: { color: BRAND.text, fontSize: 19, fontWeight: '800' },
  cards: { paddingHorizontal: 20, paddingBottom: 2 },
  card: { width: 142, marginRight: 12 },
  art: {
    aspectRatio: 2 / 3,
    borderRadius: 12,
    padding: 13,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(39,183,255,0.45)',
  },
  artTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', lineHeight: 24, marginBottom: 34 },
  badges: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: {
    color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, overflow: 'hidden',
    backgroundColor: 'rgba(2,4,12,0.82)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3,
  },
  badgeOriginal: { backgroundColor: BRAND.accent },
  title: { color: BRAND.text, fontSize: 13, fontWeight: '700', marginTop: 9 },
  subtitle: { color: BRAND.accentBright, fontSize: 12, fontWeight: '600', marginTop: 3 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
