import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, AppState, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { BRAND } from '../constants/brand';
import { useMobile } from '../context/MobileProvider';
import { isCreatorTitle, isOriginalTitle, type CatalogTitle } from '../data/catalog';

const ROTATE_MS = 7000;
const RESUME_AFTER_TOUCH_MS = 10000;
const SIDE_MARGIN = 16;

// Rotation stops while the app is in the background, Home is not the visible screen, the viewer is touching the
// hero, or the system asks for reduced motion or a screen reader is on.
function useCalmMotion() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    let active = true;
    const update = async () => {
      const [reduceMotion, screenReader] = await Promise.all([
        AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        AccessibilityInfo.isScreenReaderEnabled().catch(() => false),
      ]);
      if (active) setCalm(reduceMotion || screenReader);
    };
    void update();
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', update);
    return () => { active = false; motion.remove(); reader.remove(); };
  }, []);
  return calm;
}

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

function HeroSlide({ title, width, height }: { title: CatalogTitle; width: number; height: number }) {
  const { favorites, toggleFavorite, user, usingFixtures, originals } = useMobile();
  const wide = width >= 700;
  const artwork = title.heroImageUrl || title.posterUrl || title.thumbnailUrl;
  const saved = favorites.includes(title.id);
  // Posters carry their own title, so on phones the text would sit on top of it.
  const showText = wide || !title.posterUrl || Boolean(title.heroImageUrl);
  const eyebrow = isOriginalTitle(title, originals) ? 'A PROtv ORIGINAL'
    : isCreatorTitle(title) ? 'FROM PROtv CREATORS' : 'FEATURED ON PROtv';
  return (
    <View style={[styles.hero, { width: width - SIDE_MARGIN * 2, height }]}>
      <LinearGradient colors={['#14306E', BRAND.background]} style={StyleSheet.absoluteFill} />
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={wide && !title.heroImageUrl ? [styles.widePoster, { width: height * 2 / 3 }] : StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          cachePolicy="memory-disk"
          recyclingKey={title.id}
          accessible={false}
        />
      ) : null}
      <LinearGradient
        colors={['transparent', 'rgba(2,4,12,0.72)', BRAND.background]}
        locations={showText ? [0.35, 0.68, 1] : [0.72, 0.88, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroContent}>
        {showText ? <>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text accessibilityRole="header" numberOfLines={3} style={[styles.heroTitle, wide && styles.heroTitleLarge]}>{title.title}</Text>
          <Text numberOfLines={1} style={styles.meta}>
            {[title.year || null, title.maturityRating || null, title.category || null].filter(Boolean).join('  ·  ')}
          </Text>
        </> : <Text accessibilityRole="header" style={styles.hiddenTitle}>{title.title}</Text>}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Watch ${title.title}`}
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: title.id } })}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          >
            <Text style={styles.playButtonText}>▶  Watch</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Details for ${title.title}`}
            onPress={() => router.push({ pathname: '/title/[id]', params: { id: title.id } })}
            style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}
          >
            <Text style={styles.infoButtonText}>Details</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? `Remove ${title.title} from My List` : `Add ${title.title} to My List`}
            accessibilityState={{ selected: saved }}
            onPress={() => {
              if (!user && !usingFixtures) router.push('/sign-in');
              else void toggleFavorite(title.id).catch(() => router.push({ pathname: '/title/[id]', params: { id: title.id } }));
            }}
            style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}
          >
            <Text style={styles.infoButtonText}>{saved ? '✓  My List' : '+  My List'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Rotating Home hero: swipe between titles, tap a dot to jump, and it advances on its own every few seconds.
// A single eligible title is shown on its own, without dots, swiping or rotation.
export function HeroCarousel({ items, width }: { items: CatalogTitle[]; width: number }) {
  const { height: windowHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<CatalogTitle>>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const focused = useIsFocused();
  const appActive = useAppActive();
  const calm = useCalmMotion();
  const count = items.length;
  const current = count ? Math.min(index, count - 1) : 0;
  const cardWidth = width - SIDE_MARGIN * 2;
  const height = width >= 700 ? 460 : Math.max(240, Math.min(cardWidth * 1.5, windowHeight * 0.68));
  const rotating = count > 1 && focused && appActive && !touched && !calm;

  const show = useCallback((next: number, animated = true) => {
    setIndex(next);
    listRef.current?.scrollToOffset({ offset: next * width, animated });
  }, [width]);

  useEffect(() => {
    if (!rotating) return undefined;
    const timer = setTimeout(() => show((current + 1) % count, true), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [rotating, current, count, show]);

  // Keep the visible title in place when the screen rotates or the catalog changes.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: current * width, animated: false });
  }, [width, count]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);

  const pause = useCallback(() => {
    setTouched(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setTouched(false), RESUME_AFTER_TOUCH_MS);
  }, []);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    setIndex(Math.max(0, Math.min(count - 1, next)));
    pause();
  };

  if (!count || width <= 0) return null;
  return (
    <View accessibilityLabel="Featured titles" onTouchStart={pause} style={styles.carousel}>
      <FlatList
        ref={listRef}
        horizontal
        pagingEnabled
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: SIDE_MARGIN }}>
            <HeroSlide title={item} width={width} height={height} />
          </View>
        )}
        getItemLayout={(_data, position) => ({ length: width, offset: width * position, index: position })}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        scrollEnabled={count > 1}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onScrollBeginDrag={pause}
        onMomentumScrollEnd={settle}
      />
      {count > 1 ? (
        <View style={styles.dots}>
          {items.map((item, position) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Show featured title ${position + 1} of ${count}: ${item.title}`}
              accessibilityState={{ selected: position === current }}
              onPress={() => { pause(); show(position); }}
              style={styles.dotTarget}
            >
              <View style={[styles.dot, position === current && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { marginTop: 4 },
  hero: {
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(39,183,255,0.28)',
  },
  widePoster: { position: 'absolute', top: 0, right: 0, bottom: 0 },
  heroContent: { paddingHorizontal: 18, paddingBottom: 16 },
  hiddenTitle: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  eyebrow: { color: BRAND.accentBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginBottom: 8 },
  heroTitle: { color: BRAND.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, lineHeight: 38 },
  heroTitleLarge: { fontSize: 52, lineHeight: 56, maxWidth: 560 },
  meta: { color: '#DDE4F2', fontSize: 13, fontWeight: '600', marginTop: 9 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  playButton: { minHeight: 44, justifyContent: 'center', backgroundColor: BRAND.text, borderRadius: 8, paddingHorizontal: 22 },
  playButtonText: { color: BRAND.background, fontSize: 15, fontWeight: '900' },
  infoButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  infoButtonText: { color: BRAND.text, fontSize: 14, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 2 },
  dotTarget: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.32)' },
  dotActive: { width: 22, backgroundColor: BRAND.accentBright },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
