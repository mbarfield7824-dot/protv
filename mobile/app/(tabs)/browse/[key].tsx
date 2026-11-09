import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { goHome } from '../../../components/navigation/NavMenu';
import { Loading, Notice, ScreenFrame } from '../../../components/ScreenFrame';
import { TitleGrid } from '../../../components/TitleGrid';
import { BRAND } from '../../../constants/brand';
import { useMobile } from '../../../context/MobileProvider';
import { collectionByKey } from '../../../data/catalog';

// One collection (a Home rail, a navigation destination or a category), filtered from the live catalog.
export default function BrowseScreen() {
  const { key = '' } = useLocalSearchParams<{ key: string }>();
  const {
    titles, favorites, progress, originals, catalogLoading, catalogError, refreshCatalog,
  } = useMobile();
  const collection = useMemo(
    () => collectionByKey(String(key), titles, favorites, progress, originals),
    [key, titles, favorites, progress, originals],
  );
  const count = collection.items.length;

  return (
    <ScreenFrame refreshing={catalogLoading && titles.length > 0} onRefresh={refreshCatalog}>
      <Text accessibilityRole="header" style={styles.title}>{collection.title}</Text>
      {count ? <Text style={styles.count}>{count === 1 ? '1 title' : `${count} titles`}</Text> : null}
      {catalogLoading && !titles.length ? <Loading label={`Loading ${collection.title}`} /> : null}
      {catalogError ? <Notice tone="error">{catalogError}</Notice> : null}
      {!catalogLoading && !catalogError && !count ? (
        <View>
          <Notice>Nothing is in {collection.title} right now. New titles appear here as soon as they are published.</Notice>
          <Pressable
            accessibilityRole="button"
            onPress={goHome}
            style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]}
          >
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      ) : null}
      {count ? <View style={styles.gridSpacing}><TitleGrid items={collection.items} /></View> : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: { color: BRAND.text, fontSize: 32, fontWeight: '900', marginHorizontal: 20, marginTop: 8 },
  count: { color: BRAND.muted, fontSize: 13, fontWeight: '600', marginHorizontal: 20, marginTop: 4 },
  gridSpacing: { marginTop: 18 },
  homeButton: {
    alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', margin: 20, paddingHorizontal: 18,
    borderRadius: 8, backgroundColor: BRAND.accent,
  },
  homeButtonText: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
