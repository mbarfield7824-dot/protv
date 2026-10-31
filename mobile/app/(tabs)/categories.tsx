import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { Loading, Notice, ScreenFrame } from '../../components/ScreenFrame';
import { TitleCard } from '../../components/TitleCard';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';

export default function CategoriesScreen() {
  const [selected, setSelected] = useState('All');
  const { titles, catalogLoading, catalogError } = useMobile();
  const categories = useMemo(() => ['All', ...new Set(titles.flatMap((title) => [
    title.category, ...title.genres, ...(title.contentType === 'EPISODE' ? ['Series'] : []),
  ]).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)), [titles]);
  const { width } = useWindowDimensions();
  const columns = width >= 800 ? 5 : width >= 600 ? 4 : width < 350 ? 2 : 3;
  const cardWidth = (width - 40 - (columns - 1) * 12) / columns;
  const results = useMemo(() => selected === 'All' ? titles : titles.filter((title) => (
    title.category === selected || title.genres.includes(selected)
      || (selected === 'Series' && title.contentType === 'EPISODE')
  )), [selected, titles]);

  return (
    <ScreenFrame>
      <Text accessibilityRole="header" style={styles.title}>Categories</Text>
      {catalogLoading && !titles.length ? <Loading label="Loading categories" /> : null}
      {catalogError ? <Notice tone="error">{catalogError}</Notice> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {categories.map((category) => (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === category }}
            onPress={() => setSelected(category)}
            style={[styles.chip, selected === category && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected === category && styles.chipTextSelected]}>{category}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={results}
        key={columns}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        scrollEnabled={false}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TitleCard title={item} width={cardWidth} />
        )}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: { color: BRAND.text, fontSize: 32, fontWeight: '900', marginHorizontal: 20, marginTop: 8 },
  chips: { paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: BRAND.border, paddingHorizontal: 15, borderRadius: 22 },
  chipSelected: { backgroundColor: BRAND.accent, borderColor: BRAND.accent },
  chipText: { color: BRAND.muted, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: '#FFFFFF' },
  row: { gap: 12, marginBottom: 18 },
  grid: { paddingHorizontal: 20 },
});
