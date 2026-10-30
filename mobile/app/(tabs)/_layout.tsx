import { Tabs } from 'expo-router';
import { Text, type TextStyle } from 'react-native';
import { BRAND } from '../../constants/brand';

function TabGlyph({ glyph, color }: { glyph: string; color: TextStyle['color'] }) {
  return <Text style={{ color, fontSize: 18, fontWeight: '700' }}>{glyph}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND.accentBright,
        tabBarInactiveTintColor: BRAND.muted,
        tabBarStyle: {
          backgroundColor: '#0B0D13',
          borderTopColor: BRAND.border,
          height: 66,
          paddingTop: 7,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabGlyph glyph="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', tabBarIcon: ({ color }) => <TabGlyph glyph="⌕" color={color} /> }}
      />
      <Tabs.Screen
        name="categories"
        options={{ title: 'Categories', tabBarIcon: ({ color }) => <TabGlyph glyph="▦" color={color} /> }}
      />
      <Tabs.Screen
        name="my-protv"
        options={{ title: 'My PROtv', tabBarIcon: ({ color }) => <TabGlyph glyph="◎" color={color} /> }}
      />
    </Tabs>
  );
}
