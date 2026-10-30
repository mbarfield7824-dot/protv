import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MobileProvider } from '../context/MobileProvider';
import { BRAND } from '../constants/brand';
import 'react-native-reanimated';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <ThemeProvider value={{
      ...DarkTheme,
      colors: { ...DarkTheme.colors, background: BRAND.background, card: BRAND.surface },
    }}>
      <MobileProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: BRAND.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="title/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="player/[id]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        </Stack>
      </MobileProvider>
    </ThemeProvider>
  );
}
