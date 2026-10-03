import { View, StyleSheet } from 'react-native';
import { LoadingScreen } from '@/components/LoadingScreen';
import { theme } from '@/lib/theme';

/**
 * Consistent boot-time fallback for Suspense and ErrorBoundary.
 *
 * During preview updates, dynamic chunks may be swapped while the app
 * is still rendering. If a Suspense boundary suspends during this
 * window (e.g. a lazy-loaded component hasn't arrived yet), showing
 * `null` produces a blank white/dark flash that looks like a crash.
 *
 * This component ensures that any Suspense fallback — whether at the
 * root layout, tab bar, or SafeLazyLoad level — shows the same
 * animated loading screen the user sees during initial boot, so the
 * experience feels continuous rather than broken.
 */
export function BootFallback({ message }: { message?: string }) {
  return (
    <View style={styles.container}>
      <LoadingScreen message={message ?? '불러오는 중...'} fullScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
});
