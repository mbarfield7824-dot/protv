import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../constants/brand';

function TabGlyph({ symbol, glyph, color }: { symbol: SFSymbol; glyph: string; color: ColorValue }) {
  return (
    <SymbolView
      name={{ ios: symbol }}
      size={22}
      tintColor={color}
      fallback={<Text style={{ color, fontSize: 18, fontWeight: '700' }}>{glyph}</Text>}
    />
  );
}

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();
  const paddingBottom = Math.max(bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND.accentBright,
        tabBarInactiveTintColor: BRAND.muted,
        tabBarStyle: {
          backgroundColor: BRAND.surface,
          borderTopColor: BRAND.border,
          height: 58 + paddingBottom,
          paddingTop: 7,
          paddingBottom,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabGlyph symbol="house.fill" glyph="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', tabBarIcon: ({ color }) => <TabGlyph symbol="magnifyingglass" glyph="⌕" color={color} /> }}
      />
      <Tabs.Screen
        name="categories"
        options={{ title: 'Categories', tabBarIcon: ({ color }) => <TabGlyph symbol="square.grid.2x2.fill" glyph="▦" color={color} /> }}
      />
      <Tabs.Screen
        name="my-protv"
        options={{ title: 'My PROtv', tabBarIcon: ({ color }) => <TabGlyph symbol="person.crop.circle.fill" glyph="◎" color={color} /> }}
      />
    </Tabs>
  );
}
