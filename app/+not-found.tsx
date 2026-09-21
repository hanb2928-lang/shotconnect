import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { theme } from '@/lib/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      router.replace('/(tabs)/index');
    }, 100);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ title: 'Redirecting' }} />
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary[400]} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.dark.bg,
  },
});
