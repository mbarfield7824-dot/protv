import { router, usePathname, type Href } from 'expo-router';
import { useMemo } from 'react';
import {
  Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../constants/brand';
import { useMobile } from '../../context/MobileProvider';
import { buildHomeRails } from '../../data/catalog';
import { BrandMark, MenuGlyph } from '../BrandHeader';
import { goHome, RAIL_WIDTH, useNavMenu } from './NavMenu';

export const BROWSE_ROUTE = 'browse/[key]';

type Destination = {
  key: string;
  label: string;
  icon: ImageSourcePropType;
  path: string;
  collection?: string;
};

// Mirrors the Roku sidebar, adapted for touch. Collection destinations open the same filtered collections as the
// Home rails and are shown only while the live catalog has titles for them, so there is never a dead link.
const DESTINATIONS: Destination[] = [
  { key: 'home', label: 'Home', icon: require('../../assets/images/nav/home.png'), path: '/' },
  { key: 'search', label: 'Search', icon: require('../../assets/images/nav/search.png'), path: '/search' },
  { key: 'creators', label: 'Creators', icon: require('../../assets/images/nav/star.png'), path: '/browse/creators', collection: 'creators' },
  { key: 'movies', label: 'Movies', icon: require('../../assets/images/nav/film.png'), path: '/browse/movies', collection: 'movies' },
  { key: 'series', label: 'Series', icon: require('../../assets/images/nav/tv.png'), path: '/browse/series', collection: 'series' },
  { key: 'black-cinema', label: 'Black Cinema', icon: require('../../assets/images/nav/clapper.png'), path: '/browse/black-cinema', collection: 'black-cinema' },
  { key: 'categories', label: 'Categories', icon: require('../../assets/images/nav/planet.png'), path: '/categories' },
  { key: 'my-protv', label: 'My PROtv', icon: require('../../assets/images/nav/user.png'), path: '/my-protv' },
];

export function SideNavigation() {
  const { mode, railWidth, open, setOpen } = useNavMenu();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { titles, favorites, progress, originals } = useMobile();
  const available = useMemo(
    () => new Set(buildHomeRails(titles, favorites, progress, originals).map((rail) => rail.key)),
    [titles, favorites, progress, originals],
  );
  const destinations = DESTINATIONS.filter((item) => !item.collection || available.has(item.collection));
  const pathname = usePathname();
  const activeKey = DESTINATIONS.find((item) => item.path === decodeURIComponent(pathname))?.key;

  const go = (item: Destination) => {
    setOpen(false);
    if (item.key !== activeKey) router.navigate(item.path as Href);
  };
  const drawerWidth = Math.min(300, width * 0.82) + insets.left;

  return (
    <>
      {mode === 'rail' ? (
        <View
          accessibilityRole="tablist"
          style={[styles.rail, { width: railWidth, paddingLeft: insets.left, paddingTop: insets.top + 6, paddingBottom: insets.bottom }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expand navigation"
            onPress={() => setOpen(true)}
            style={({ pressed }) => [styles.railMenu, pressed && styles.pressed]}
          >
            <MenuGlyph />
          </Pressable>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.railItems}>
            {destinations.map((item) => {
              const active = item.key === activeKey;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => go(item)}
                  style={({ pressed }) => [styles.railItem, pressed && styles.pressed]}
                >
                  <View style={[styles.railIcon, active && styles.railIconActive]}>
                    <Image source={item.icon} style={[styles.icon, { tintColor: active ? BRAND.text : BRAND.muted }]} />
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[styles.railLabel, active && styles.railLabelActive]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <View
            accessibilityViewIsModal
            style={[styles.drawer, {
              width: drawerWidth,
              paddingLeft: insets.left + 12,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 8,
            }]}
          >
            <View style={styles.drawerHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="PROtv Home"
                onPress={() => { setOpen(false); goHome(); }}
                style={({ pressed }) => [styles.drawerBrand, pressed && styles.pressed]}
              >
                <BrandMark />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation"
                onPress={() => setOpen(false)}
                style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              >
                <Text style={styles.closeGlyph}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerItems}>
              {destinations.map((item) => {
                const active = item.key === activeKey;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => go(item)}
                    style={({ pressed }) => [styles.drawerItem, active && styles.drawerItemActive, pressed && styles.pressed]}
                  >
                    <Image source={item.icon} style={[styles.icon, { tintColor: active ? BRAND.accentBright : BRAND.text }]} />
                    <Text style={[styles.drawerLabel, active && styles.drawerLabelActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close navigation" style={styles.scrim} onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  rail: {
    backgroundColor: BRAND.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: BRAND.border,
    alignItems: 'stretch',
  },
  railMenu: { alignSelf: 'center', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  railItems: { paddingBottom: 12, alignItems: 'center' },
  railItem: { width: RAIL_WIDTH, minHeight: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  railIcon: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  railIconActive: { backgroundColor: BRAND.accent },
  railLabel: { color: BRAND.muted, fontSize: 11, fontWeight: '700', marginTop: 4, paddingHorizontal: 4, textAlign: 'center' },
  railLabelActive: { color: BRAND.text },
  icon: { width: 22, height: 22, resizeMode: 'contain' },
  overlay: { flex: 1, flexDirection: 'row' },
  drawer: {
    backgroundColor: BRAND.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: BRAND.border,
    paddingRight: 12,
  },
  scrim: { flex: 1, backgroundColor: 'rgba(2,4,12,0.62)' },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  drawerBrand: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: BRAND.muted, fontSize: 18, fontWeight: '700' },
  drawerItems: { paddingBottom: 12 },
  drawerItem: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  drawerItemActive: { backgroundColor: BRAND.elevated },
  drawerLabel: { color: BRAND.text, fontSize: 16, fontWeight: '700' },
  drawerLabelActive: { color: BRAND.accentBright },
  pressed: { opacity: 0.72 },
});
