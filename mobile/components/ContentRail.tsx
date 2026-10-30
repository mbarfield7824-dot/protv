import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../constants/brand';
import type { CatalogTitle } from '../data/catalog';
import { TitleCard } from './TitleCard';

export function ContentRail({
  title,
  items,
  progressById,
  compact = false,
}: {
  title: string;
  items: CatalogTitle[];
  progressById?: Record<string, number>;
  compact?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
        {items.map((item) => (
          <TitleCard
            key={item.id}
            title={item}
            compact={compact}
            progress={progressById?.[item.id]}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 25 },
  heading: { color: BRAND.text, fontSize: 19, fontWeight: '800', marginBottom: 13, paddingHorizontal: 20 },
  cards: { paddingHorizontal: 20, paddingBottom: 2 },
});
