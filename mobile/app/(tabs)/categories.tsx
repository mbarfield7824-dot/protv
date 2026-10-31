import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenFrame } from '../../components/ScreenFrame';
import { TitleCard } from '../../components/TitleCard';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';

const CATEGORY_COLORS: [string, string][] = [
  ['#243A64', '#10131F'],
  ['#603746', '#181018'],
  ['#3E6252', '#101A18'],
  ['#705437', '#18140F'],
];

export default function CategoriesScreen() {
  const [selected, setSelected] = useState('All');
  const { titles } = useMobile();
  const categories = useMemo(() => ['All', ...new Set(titles.flatMap((title) => [
    title.category, ...title.genres, ...(title.contentType === 'EPISODE' ? ['Series'] : []),
  ]).filter(Boolean))].sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)), [titles]);
  const { width } = useWindowDimensions();
  const columns = width >= 800 ? 5 : width >= 600 ? 4 : 2;
  const cardWidth = (width - 40 - (columns - 1) * 12) / columns;
  const results = useMemo(() => selected === 'All' ? titles : titles.filter((title) => (
    title.category === selected || title.genres.includes(selected)
      || (selected === 'Series' && title.contentType === 'EPISODE')
  )), [selected, titles]);

  return (
    <ScreenFrame>
      <Text style={styles.kicker}>CURATED FOR YOUR MOOD</Text>
      <Text style={styles.title}>Categories</Text>
      <View style={styles.chips}>
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
      </View>
      <Text style={styles.resultTitle}>{selected === 'All' ? 'The collection' : selected}</Text>
      <FlatList
        data={results}
        key={columns}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        scrollEnabled={false}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={<Text style={styles.empty}>More titles are on the way.</Text>}
        renderItem={({ item }) => (
          <TitleCard title={item} width={cardWidth} />
        )}
      />
      <View style={styles.discoverCard}>
        <LinearGradient colors={CATEGORY_COLORS[indexFor(selected)]} style={StyleSheet.absoluteFill} />
        <Text style={styles.discoverEyebrow}>PROtv COLLECTIONS</Text>
        <Text style={styles.discoverTitle}>A new perspective is one story away.</Text>
      </View>
    </ScreenFrame>
  );
}

function indexFor(value: string) {
  return Math.abs(value.length + value.charCodeAt(0)) % CATEGORY_COLORS.length;
}

const styles = StyleSheet.create({
  kicker: { color: BRAND.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.6, marginHorizontal: 20, marginTop: 18 },
  title: { color: BRAND.text, fontSize: 32, fontWeight: '900', marginHorizontal: 20, marginTop: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, marginTop: 18, gap: 8 },
  chip: { borderWidth: 1, borderColor: BRAND.border, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  chipSelected: { backgroundColor: BRAND.accent, borderColor: BRAND.accent },
  chipText: { color: BRAND.muted, fontSize: 11, fontWeight: '700' },
  chipTextSelected: { color: '#FFFFFF' },
  resultTitle: { color: BRAND.text, fontSize: 18, fontWeight: '800', marginHorizontal: 20, marginTop: 22, marginBottom: 14 },
  row: { gap: 12, marginBottom: 18 },
  grid: { paddingHorizontal: 20 },
  empty: { color: BRAND.muted, paddingHorizontal: 20, paddingVertical: 35 },
  discoverCard: { minHeight: 135, marginHorizontal: 20, marginTop: 8, marginBottom: 10, borderRadius: 14, padding: 18, justifyContent: 'flex-end', overflow: 'hidden' },
  discoverEyebrow: { color: BRAND.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  discoverTitle: { color: BRAND.text, fontSize: 20, fontWeight: '900', maxWidth: 300, marginTop: 7 },
});
