import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { registerAppStateHandler } from '@/lib/appStateCoordinator';
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';

interface ProcessingBarrierProps {
  visible: boolean;
  label?: string;
  sublabel?: string;
}

export function ProcessingBarrier({
  visible,
  label = '처리 중...',
  sublabel,
}: ProcessingBarrierProps) {
  const rotateSV = useSharedValue(0);
  const appStateRef = useRef<string>('active');

  useEffect(() => {
    if (!visible) {
      cancelAnimation(rotateSV);
      return;
    }

    rotateSV.value = withRepeat(
      withSequence(
        withTiming(180, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(360, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    const sub = registerAppStateHandler('immediate', (state) => {
      appStateRef.current = state;
      if (state === 'background' || state === 'inactive') {
        cancelAnimation(rotateSV);
      } else if (state === 'active') {
        rotateSV.value = withRepeat(
          withSequence(
            withTiming(180, { duration: 900, easing: Easing.inOut(Easing.ease) }),
            withTiming(360, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          false,
        );
      }
    });

    return () => {
      sub();
      cancelAnimation(rotateSV);
    };
  }, [visible, rotateSV]);

  const iconStyle = {
    transform: [{ rotate: `${rotateSV.value}deg` }],
  } as const;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop} pointerEvents="auto">
        <View style={styles.card}>
          <Animated.View style={iconStyle}>
            <Sparkles size={32} color={theme.colors.primary[400]} strokeWidth={2} />
          </Animated.View>
          <Text style={styles.label}>{label}</Text>
          {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
          <ActivityIndicator size="small" color={theme.colors.primary[400]} style={styles.spinner} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '80%',
    maxWidth: 300,
    ...theme.shadows.elevated,
  },
  label: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: theme.spacing.sm,
  },
  sublabel: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  spinner: {
    marginTop: theme.spacing.xs,
  },
});
