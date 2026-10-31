import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ScreenFrame } from '../../components/ScreenFrame';
import { TitleCard } from '../../components/TitleCard';
import { BRAND } from '../../constants/brand';
import { titleMatchesQuery } from '../../data/catalog';
import { useMobile } from '../../context/MobileProvider';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const { titles } = useMobile();
  const { width } = useWindowDimensions();
  const columns = width >= 800 ? 5 : width >= 600 ? 4 : 2;
  const results = useMemo(
    () => titles.filter((title) => titleMatchesQuery(title, query)),
    [query, titles],
  );
  const cardWidth = (width - 40 - (columns - 1) * 12) / columns;

  return (
    <ScreenFrame>
      <Text style={styles.kicker}>FIND YOUR NEXT FAVORITE</Text>
      <Text style={styles.title}>Search</Text>
      <TextInput
        accessibilityLabel="Search titles, series, and episodes"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder="Titles, series, episodes"
        placeholderTextColor={BRAND.muted}
        returnKeyType="search"
        style={styles.input}
        value={query}
      />
      <Text style={styles.resultLabel}>{query ? `${results.length} results` : 'Explore the collection'}</Text>
      {results.length ? (
        <FlatList
          data={results}
          key={columns}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          scrollEnabled={false}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <TitleCard title={item} width={cardWidth} />}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyCopy}>Try a title, genre, or series name.</Text>
        </View>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  kicker: { color: BRAND.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.6, marginHorizontal: 20, marginTop: 18 },
  title: { color: BRAND.text, fontSize: 32, fontWeight: '900', marginHorizontal: 20, marginTop: 5 },
  input: {
    height: 50,
    marginHorizontal: 20,
    marginTop: 19,
    paddingHorizontal: 15,
    color: BRAND.text,
    backgroundColor: BRAND.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  resultLabel: { color: BRAND.muted, fontSize: 12, fontWeight: '700', marginHorizontal: 20, marginTop: 22, marginBottom: 13 },
  row: { justifyContent: 'flex-start', gap: 12, marginBottom: 18 },
  grid: { paddingHorizontal: 20 },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingVertical: 70 },
  emptyTitle: { color: BRAND.text, fontSize: 18, fontWeight: '800' },
  emptyCopy: { color: BRAND.muted, fontSize: 13, marginTop: 7, textAlign: 'center' },
});
