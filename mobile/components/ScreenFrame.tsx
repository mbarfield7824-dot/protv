import type { PropsWithChildren } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND } from '../constants/brand';
import { BrandHeader } from './BrandHeader';

export function ScreenFrame({
  children,
  scroll = true,
  header = true,
  refreshing,
  onRefresh,
}: PropsWithChildren<{ scroll?: boolean; header?: boolean; refreshing?: boolean; onRefresh?: () => void }>) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {header ? <BrandHeader /> : null}
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={BRAND.accentBright} />
          ) : undefined}
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      ) : <View style={styles.content}>{children}</View>}
    </SafeAreaView>
  );
}

export function Notice({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'error' }>) {
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.notice, tone === 'error' && styles.errorNotice]}>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View accessible accessibilityLabel={label} style={styles.loading}>
      <ActivityIndicator color={BRAND.accentBright} size="large" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND.background },
  content: { paddingBottom: 28 },
  notice: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
    backgroundColor: BRAND.elevated,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  errorNotice: { backgroundColor: '#351C22', borderColor: '#703741' },
  noticeText: { color: BRAND.text, fontSize: 13, lineHeight: 19 },
  loading: { alignItems: 'center', paddingVertical: 70 },
  loadingText: { color: BRAND.muted, fontSize: 13, marginTop: 12 },
});
