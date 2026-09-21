import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { useVideoJobRecovery } from '@/hooks/useVideoJobRecovery';
import { useI18n } from '@/hooks/useI18n';
import { theme } from '@/lib/theme';
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react-native';

export function VideoJobRecoveryToast() {
  const { info, dismiss } = useVideoJobRecovery();
  const { t } = useI18n();
  const fadeAnim = useRef(new Animated.Value(0));

  const visible = info.state === 'in_progress' || info.state === 'completed' || info.state === 'failed';

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim.current, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim.current, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (info.state === 'idle' || info.state === 'checking' || info.state === 'not_found') {
    return null;
  }

  const isInProgress = info.state === 'in_progress';
  const isCompleted = info.state === 'completed';
  const isFailed = info.state === 'failed';

  const accentColor = isInProgress
    ? theme.colors.primary[500]
    : isCompleted
      ? theme.colors.success[600]
      : theme.colors.error[600];

  const message = isInProgress
    ? t('recovery.inProgress')
    : isCompleted
      ? t('recovery.completed')
      : t('recovery.failed');

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.container, { opacity: fadeAnim.current }]}
    >
      <Pressable style={styles.pressable} onPress={dismiss}>
        <View style={[styles.iconWrap, { backgroundColor: accentColor + '20' }]}>
          {isInProgress ? (
            <Loader2 size={20} color={accentColor} strokeWidth={2} />
          ) : isCompleted ? (
            <CheckCircle2 size={20} color={accentColor} strokeWidth={2} />
          ) : (
            <AlertCircle size={20} color={accentColor} strokeWidth={2} />
          )}
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {message}
          </Text>
          {isInProgress && info.step && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {info.step}
            </Text>
          )}
          {isFailed && info.errorMsg && (
            <Text style={styles.subtitle} numberOfLines={2}>
              {info.errorMsg}
            </Text>
          )}
          {isCompleted && info.videoUrl && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {info.videoUrl}
            </Text>
          )}
        </View>
        <Pressable style={styles.closeBtn} onPress={dismiss} hitSlop={8}>
          <X size={16} color={theme.colors.neutral[400]} strokeWidth={2} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 9998,
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.neutral[900],
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: theme.colors.neutral[800],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.neutral[50],
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.neutral[400],
  },
  closeBtn: {
    padding: 4,
  },
});
