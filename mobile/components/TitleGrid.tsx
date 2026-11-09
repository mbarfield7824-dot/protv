import { FlatList, StyleSheet } from 'react-native';
import type { CatalogTitle } from '../data/catalog';
import { useContentWidth } from './navigation/NavMenu';
import { TitleCard } from './TitleCard';

const GUTTER = 20;
const GAP = 12;

// Poster grid sized to the space the screen actually has (beside the navigation rail on tablets).
export function TitleGrid({ items }: { items: CatalogTitle[] }) {
  const width = useContentWidth();
  const columns = width >= 1000 ? 6 : width >= 800 ? 5 : width >= 600 ? 4 : width < 350 ? 2 : 3;
  const cardWidth = Math.floor((width - GUTTER * 2 - (columns - 1) * GAP) / columns);
  return (
    <FlatList
      data={items}
      key={columns}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      scrollEnabled={false}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => <TitleCard title={item} width={cardWidth} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: GAP, marginBottom: 18 },
  grid: { paddingHorizontal: GUTTER },
});
