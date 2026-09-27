import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web') return 0;
  return 94 + Math.max(insets.bottom, 0);
}
