import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export function useNativeBridgeReady(): boolean {
  const [ready, setReady] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);
  return ready;
}
