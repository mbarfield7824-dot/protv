import { Tabs } from 'expo-router';
import { NavMenuProvider } from '../../components/navigation/NavMenu';
import { BROWSE_ROUTE, SideNavigation } from '../../components/navigation/SideNavigation';
import { BRAND } from '../../constants/brand';

// Navigation lives on the left (a rail on tablets and sideways phones, a menu on narrow phones) so it can never
// cover rows, posters or the Android system navigation at the bottom of the screen.
export default function TabLayout() {
  return (
    <NavMenuProvider>
      <Tabs
        backBehavior="history"
        tabBar={() => <SideNavigation />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: 'left',
          sceneStyle: { backgroundColor: BRAND.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="search" options={{ title: 'Search' }} />
        <Tabs.Screen name="categories" options={{ title: 'Categories' }} />
        <Tabs.Screen name="my-protv" options={{ title: 'My PROtv' }} />
        <Tabs.Screen name={BROWSE_ROUTE} options={{ title: 'Browse' }} />
      </Tabs>
    </NavMenuProvider>
  );
}
