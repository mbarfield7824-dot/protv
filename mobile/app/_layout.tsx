import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { MobileProvider } from '../context/MobileProvider';
import { BRAND } from '../constants/brand';
import 'react-native-reanimated';

export { ErrorBoundary } from 'expo-router';

// iPhones browse in portrait and rotate only for video. iPad and Android keep free rotation.
const BROWSE_ORIENTATION = Platform.OS === 'ios' && !Platform.isPad ? { orientation: 'portrait' as const } : {};
const PLAYER_ORIENTATION = Platform.OS === 'ios' ? { orientation: 'all' as const } : {};

export default function RootLayout() {
  return (
    <ThemeProvider value={{
      ...DarkTheme,
      colors: { ...DarkTheme.colors, background: BRAND.background, card: BRAND.surface },
    }}>
      <MobileProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: BRAND.background }, ...BROWSE_ORIENTATION }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="title/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="coming-soon/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="player/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', ...PLAYER_ORIENTATION }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="account" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        </Stack>
      </MobileProvider>
    </ThemeProvider>
  );
}
