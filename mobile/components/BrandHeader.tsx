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

export function BrandHeader({ showAccount = true }: { showAccount?: boolean }) {
  return (
    <View style={styles.header}>
      <BrandMark />
      {showAccount ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open My PROtv"
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
