import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RefreshCw, CircleAlert as AlertCircle } from 'lucide-react-native';
import { theme } from '@/lib/theme';

interface ErrorRetryBannerProps {
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
}

export function ErrorRetryBanner({
  message = '데이터를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.',
  onRetry,
  retrying = false,
}: ErrorRetryBannerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <AlertCircle size={20} color={theme.colors.error[400]} strokeWidth={2} />
        <Text style={styles.message} numberOfLines={3}>
          {message}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={onRetry}
        disabled={retrying}
        activeOpacity={0.7}
      >
        <RefreshCw
          size={16}
          color={retrying ? theme.colors.dark.textDim : theme.colors.error[400]}
          strokeWidth={2.2}
        />
        <Text style={[styles.retryText, retrying && styles.retryTextDim]}>
          {retrying ? '불러오는 중...' : '다시 시도'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.error[500] + '14',
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.error[400] + '30',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.error[500] + '18',
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  retryTextDim: {
    color: theme.colors.dark.textDim,
  },
});
