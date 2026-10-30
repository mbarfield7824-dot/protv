import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND } from '../constants/brand';
import { BrandHeader } from './BrandHeader';

export function ScreenFrame({
  children,
  scroll = true,
  header = true,
}: PropsWithChildren<{ scroll?: boolean; header?: boolean }>) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header ? <BrandHeader /> : null}
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      ) : <View style={styles.content}>{children}</View>}
    </SafeAreaView>
  );
}

export function Notice({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'error' }>) {
  return (
    <View style={[styles.notice, tone === 'error' && styles.errorNotice]}>
      <Text style={styles.noticeText}>{children}</Text>
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
    backgroundColor: '#18223E',
    borderWidth: 1,
    borderColor: '#2A3B68',
  },
  errorNotice: { backgroundColor: '#351C22', borderColor: '#703741' },
  noticeText: { color: BRAND.text, fontSize: 12, lineHeight: 18 },
});
