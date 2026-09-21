import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useSubTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return 48 + Math.max(insets.bottom, 0);
}
