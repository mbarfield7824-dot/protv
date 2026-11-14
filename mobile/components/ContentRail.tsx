import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../constants/brand';
import type { CatalogTitle } from '../data/catalog';
import { TitleCard } from './TitleCard';

export function ContentRail({
  title,
  items,
  progressById,
  compact = false,
  collectionKey,
}: {
  title: string;
  collectionKey?: string;
  items: CatalogTitle[];
  progressById?: Record<string, number>;
  compact?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.heading}>{title}</Text>
        {collectionKey ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`See all ${title}`}
            hitSlop={6}
            onPress={() => router.navigate({ pathname: '/browse/[key]', params: { key: collectionKey } })}
            style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
          >
            <Text style={styles.seeAllText}>See all  ›</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        initialNumToRender={5}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
        renderItem={({ item }) => (
          <TitleCard title={item} compact={compact} progress={progressById?.[item.id]} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 15 },
  headingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, paddingLeft: 20, paddingRight: 8 },
  heading: { flexShrink: 1, color: BRAND.text, fontSize: 19, fontWeight: '800' },
  seeAll: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 12 },
  seeAllText: { color: BRAND.accentBright, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  cards: { paddingHorizontal: 20, paddingBottom: 2 },
});
