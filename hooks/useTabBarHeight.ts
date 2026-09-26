import { Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: screenWidth } = Dimensions.get('window');
const isDesktop = Platform.OS === 'web' && screenWidth >= 768;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  if (isDesktop) return 0;
  return 94 + Math.max(insets.bottom, 0);
}
