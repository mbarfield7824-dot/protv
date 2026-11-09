import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Loading, Notice, ScreenFrame } from '../../components/ScreenFrame';
import { TitleGrid } from '../../components/TitleGrid';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';

export default function CategoriesScreen() {
  const [selected, setSelected] = useState('All');
  const { titles, catalogLoading, catalogError } = useMobile();
  const categories = useMemo(() => ['All', ...new Set(titles.flatMap((title) => [
    title.category, ...title.genres, ...(title.contentType === 'EPISODE' ? ['Series'] : []),
  ]).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)), [titles]);
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
      {results.length ? <TitleGrid items={results} /> : null}
      {!catalogLoading && !catalogError && titles.length && !results.length ? (
        <Notice>Nothing is in {selected} right now. New titles appear here as soon as they are published.</Notice>
      ) : null}
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
});
