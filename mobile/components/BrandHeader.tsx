import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BRAND } from '../constants/brand';

export function BrandMark() {
  return (
    <Text style={styles.wordmark} accessibilityLabel="PROtv">
      PRO<Text style={styles.wordmarkAccent}>tv</Text>
    </Text>
  );
}

export function BrandHeader({ showAccount = true, showBack = false }: { showAccount?: boolean; showBack?: boolean }) {
  return (
    <View style={styles.header}>
      <View style={styles.leading}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        <BrandMark />
      </View>
      {showAccount ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open My PROtv"
          hitSlop={6}
          onPress={() => router.push('/(tabs)/my-protv')}
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
  backButton: { width: 44, height: 44, marginLeft: -10, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { color: BRAND.text, fontSize: 36, lineHeight: 40 },
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
