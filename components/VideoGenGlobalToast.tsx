import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, XCircle, X } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useVideoGen } from '@/hooks/useVideoGen';

export function VideoGenGlobalToast() {
  const router = useRouter();
  const { isGenerating, videoProgress, resultVideoUrl, error } = useVideoGen();
  const [visible, setVisible] = useState(false);
  const [toastData, setToastData] = useState<{ type: 'completed' | 'error'; message: string } | null>(null);
  const slideAnim = useRef(new Animated.Value(100)).current;
  const prevGeneratingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current;
    prevGeneratingRef.current = isGenerating;

    if (wasGenerating && !isGenerating) {
      if (videoProgress?.phase === 'completed' || resultVideoUrl) {
        setToastData({ type: 'completed', message: 'AI 영상 생성이 완료되었습니다!' });
        setVisible(true);
      } else if (error) {
        setToastData({ type: 'error', message: error });
        setVisible(true);
      }
    }
  }, [isGenerating, videoProgress, resultVideoUrl, error]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }).start();
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => dismiss(), 6000);
    } else {
      Animated.timing(slideAnim, {
        toValue: 100,
        useNativeDriver: true,
        duration: 300,
      }).start();
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [visible, slideAnim]);

  const dismiss = () => {
    setVisible(false);
    setToastData(null);
  };

  const handlePress = () => {
    dismiss();
    router.push('/synthesis');
  };

  if (!visible || !toastData) return null;

  const isCompleted = toastData.type === 'completed';

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="auto"
    >
      <TouchableOpacity style={styles.content} onPress={handlePress} activeOpacity={0.9}>
        {isCompleted ? (
          <CheckCircle2 size={22} color={theme.colors.success[400]} strokeWidth={2} />
        ) : (
          <XCircle size={22} color={theme.colors.error[400]} strokeWidth={2} />
        )}
        <View style={styles.textWrap}>
          <Text style={styles.title}>
            {isCompleted ? '영상 생성 완료' : '영상 생성 실패'}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {isCompleted ? '탭하여 합성 화면에서 결과를 확인하세요' : toastData.message}
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={8}>
          <X size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
    ...theme.shadows.elevated,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  message: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  closeBtn: {
    padding: 4,
  },
});
