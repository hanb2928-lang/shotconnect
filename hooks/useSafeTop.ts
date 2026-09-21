import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Returns a safe top inset that works across all Android versions.
 * On Android 16+ with edge-to-edge enforced, useSafeAreaInsets already
 * returns the correct top inset. On older Android without a notch,
 * safe-area-context may return 0, so we fall back to StatusBar height.
 */
export function useSafeTop(): number {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'ios') {
    return insets.top;
  }

  if (insets.top > 0) {
    return insets.top;
  }

  return StatusBar.currentHeight ?? 0;
}
