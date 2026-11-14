import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import { ComingSoonRail } from '../../components/ComingSoonRail';
import { ContentRail } from '../../components/ContentRail';
import { HeroCarousel } from '../../components/HeroCarousel';
import { useContentWidth } from '../../components/navigation/NavMenu';
import { Loading, Notice, ScreenFrame } from '../../components/ScreenFrame';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { buildHomeRails, featuredTitles } from '../../data/catalog';
import { upcomingItems } from '../../data/comingSoon';

const PERSONAL_RAILS = new Set(['continue', 'my-list']);

export default function HomeScreen() {
  const width = useContentWidth();
  const {
    titles, originals, comingSoon, progress, favorites, catalogError, catalogLoading, refreshCatalog, usingFixtures,
  } = useMobile();
  const progressById = useMemo(
    () => Object.fromEntries(Object.entries(progress).map(([id, entry]) => [id, entry.progressPercent])),
    [progress],
  );
  const rails = useMemo(
    () => buildHomeRails(titles, favorites, progress, originals),
    [titles, favorites, progress, originals],
  );
  const featured = useMemo(() => featuredTitles(titles, originals), [titles, originals]);
  // Upcoming titles get their own row and never enter the hero, which only features watchable titles.
  const upcoming = useMemo(() => upcomingItems(comingSoon, titles), [comingSoon, titles]);
  const personal = rails.filter((rail) => PERSONAL_RAILS.has(rail.key));
  const discovery = rails.filter((rail) => !PERSONAL_RAILS.has(rail.key));
  const renderRail = (rail: (typeof rails)[number]) => (
    <ContentRail
      key={rail.key}
      title={rail.title}
      items={rail.items}
      collectionKey={rail.key}
      progressById={rail.key === 'continue' ? progressById : undefined}
    />
  );

  return (
    <ScreenFrame header={false} refreshing={catalogLoading && titles.length > 0} onRefresh={refreshCatalog}>
      <BrandHeader />
      {catalogLoading && !titles.length ? <Loading label="Loading the PROtv collection" /> : null}
      {catalogError ? (
        <View>
          <Notice tone="error">{catalogError}</Notice>
          <Pressable accessibilityRole="button" onPress={refreshCatalog} style={styles.retry}>
            <Text style={styles.retryText}>Retry catalog</Text>
          </Pressable>
        </View>
      ) : null}
      {!catalogLoading && !catalogError && !titles.length ? <Notice>No titles are available right now.</Notice> : null}
      {usingFixtures ? <Notice>Prototype preview · sample titles and local-only My PROtv data</Notice> : null}
      <HeroCarousel items={featured} width={width} />
      {personal.map(renderRail)}
      <ComingSoonRail items={upcoming} />
      {discovery.map(renderRail)}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', margin: 20, paddingHorizontal: 16, borderRadius: 8, backgroundColor: BRAND.accent },
  retryText: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
});
