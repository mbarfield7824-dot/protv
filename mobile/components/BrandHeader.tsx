import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BRAND } from '../constants/brand';
import { goHome, useNavMenu } from './navigation/NavMenu';

export function BrandMark() {
  return (
    <Text style={styles.wordmark} accessibilityLabel="PROtv">
      PRO<Text style={styles.wordmarkAccent}>tv</Text>
    </Text>
  );
}

export function MenuGlyph({ color = BRAND.text }: { color?: string }) {
  return (
    <View style={styles.menuGlyph}>
      {[0, 1, 2].map((bar) => <View key={bar} style={[styles.menuBar, { backgroundColor: color }]} />)}
    </View>
  );
}

export function BrandHeader({ showAccount = true, showBack = false }: { showAccount?: boolean; showBack?: boolean }) {
  const { mode, setOpen } = useNavMenu();
  return (
    <View style={styles.header}>
      <View style={styles.leading}>
        {mode === 'drawer' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation"
            onPress={() => setOpen(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MenuGlyph />
          </Pressable>
        ) : null}
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => (router.canGoBack() ? router.back() : goHome())}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="PROtv Home"
          hitSlop={8}
          onPress={goHome}
          style={({ pressed }) => [styles.brandButton, pressed && styles.pressed]}
        >
          <BrandMark />
        </Pressable>
      </View>
      {showAccount ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open My PROtv"
          hitSlop={6}
          onPress={() => router.navigate('/(tabs)/my-protv')}
          style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}
        >
          <Text style={styles.accountInitial}>P</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 54,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leading: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 44, height: 44, marginLeft: -10, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { color: BRAND.text, fontSize: 36, lineHeight: 40 },
  brandButton: { minHeight: 44, justifyContent: 'center' },
  menuGlyph: { width: 20, height: 14, justifyContent: 'space-between' },
  menuBar: { height: 2, borderRadius: 1 },
  wordmark: { color: BRAND.text, fontSize: 24, fontWeight: '900', letterSpacing: -1.5 },
  wordmarkAccent: { color: BRAND.accentBright, fontWeight: '600' },
  accountButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.elevated,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  accountInitial: { color: BRAND.text, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
