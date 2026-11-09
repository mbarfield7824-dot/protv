import { router } from 'expo-router';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Tablets (and phones held sideways) keep a slim navigation rail on the left; narrower phones open the same
// destinations from a menu button beside the PROtv logo. Nothing sits at the bottom of the screen.
export const RAIL_WIDTH = 84;
export const RAIL_BREAKPOINT = 600;

export type NavMode = 'rail' | 'drawer' | 'none';

type NavMenu = {
  mode: NavMode;
  railWidth: number;
  open: boolean;
  setOpen: (open: boolean) => void;
};

// Screens outside the tab area (title details, account) get 'none': no rail, no menu button.
const NavMenuContext = createContext<NavMenu>({ mode: 'none', railWidth: 0, open: false, setOpen: () => undefined });

export function NavMenuProvider({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const mode: NavMode = width >= RAIL_BREAKPOINT ? 'rail' : 'drawer';
  const railWidth = mode === 'rail' ? RAIL_WIDTH + insets.left : 0;
  const value = useMemo(() => ({ mode, railWidth, open, setOpen }), [mode, railWidth, open]);
  return <NavMenuContext.Provider value={value}>{children}</NavMenuContext.Provider>;
}

export function useNavMenu(): NavMenu {
  return useContext(NavMenuContext);
}

// The width a screen's content actually has: the window minus the rail and the system safe areas.
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { mode, railWidth } = useNavMenu();
  return Math.max(0, mode === 'rail' ? width - railWidth - insets.right : width - insets.left - insets.right);
}

// The PROtv logo always leads back to the main Home screen: it closes any detail or account screens stacked above
// the tabs, then selects Home. The Android back button keeps its normal history.
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/');
}
