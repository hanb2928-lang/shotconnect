import { useState, useEffect, useRef, type ReactNode } from 'react';
import { View, InteractionManager, Platform } from 'react-native';

interface LazySectionProps {
  children: ReactNode;
  /** Minimum delay in ms before mounting children (default 50) */
  delayMs?: number;
  /** Placeholder height to reserve layout space (default 0) */
  placeholderHeight?: number;
}

/**
 * Defers mounting of heavy children until after the current interaction
 * (navigation, scroll, gesture) completes. On web this is effectively
 * a no-op since JS is single-threaded and InteractionManager fires immediately.
 */
export function LazySection({ children, delayMs = 50, placeholderHeight = 0 }: LazySectionProps) {
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setMounted(true);
      return;
    }

    const handle = InteractionManager.runAfterInteractions(() => {
      timerRef.current = setTimeout(() => setMounted(true), delayMs);
    });

    return () => {
      handle.cancel();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [delayMs]);

  if (!mounted) {
    return <View style={{ height: placeholderHeight }} />;
  }

  return <>{children}</>;
}
