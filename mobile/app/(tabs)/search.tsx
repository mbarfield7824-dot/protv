import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Loading, Notice, ScreenFrame } from '../../components/ScreenFrame';
import { TitleGrid } from '../../components/TitleGrid';
import { BRAND } from '../../constants/brand';
import { titleMatchesQuery } from '../../data/catalog';
import { useMobile } from '../../context/MobileProvider';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const { titles, catalogLoading, catalogError, refreshCatalog } = useMobile();
  const results = useMemo(
    () => titles.filter((title) => titleMatchesQuery(title, query)),
    [query, titles],
  );

  return (
    <ScreenFrame>
      <Text accessibilityRole="header" style={styles.title}>Search</Text>
      <TextInput
        accessibilityLabel="Search titles, series, episodes, and credits"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        keyboardAppearance="dark"
        onChangeText={setQuery}
        placeholder="Titles, series, people"
        placeholderTextColor={BRAND.muted}
        returnKeyType="search"
        style={styles.input}
        value={query}
      />
      {catalogLoading && !titles.length ? <Loading label="Loading the PROtv collection" /> : null}
      {catalogError ? (
        <View>
          <Notice tone="error">{catalogError}</Notice>
          <Pressable accessibilityRole="button" onPress={refreshCatalog} style={styles.retry}>
            <Text style={styles.retryText}>Retry catalog</Text>
          </Pressable>
        </View>
      ) : null}
      {titles.length ? (
        <Text accessibilityLiveRegion="polite" style={styles.resultLabel}>
          {query ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'Explore the collection'}
        </Text>
      ) : null}
      {results.length ? (
        <TitleGrid items={results} />
      ) : titles.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyCopy}>Try a title, category, series, or name from the credits.</Text>
        </View>
      ) : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: { color: BRAND.text, fontSize: 32, fontWeight: '900', marginHorizontal: 20, marginTop: 8 },
  input: {
    minHeight: 50,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 15,
    color: BRAND.text,
    fontSize: 16,
    backgroundColor: BRAND.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  resultLabel: { color: BRAND.muted, fontSize: 13, fontWeight: '700', marginHorizontal: 20, marginTop: 20, marginBottom: 13 },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', margin: 20, paddingHorizontal: 16, borderRadius: 8, backgroundColor: BRAND.accent },
  retryText: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingVertical: 70 },
  emptyTitle: { color: BRAND.text, fontSize: 18, fontWeight: '800' },
  emptyCopy: { color: BRAND.muted, fontSize: 13, marginTop: 7, textAlign: 'center' },
});
