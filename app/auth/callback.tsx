import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const redirectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    const access_token = Array.isArray(params.access_token) ? params.access_token[0] : params.access_token;
    const refresh_token = Array.isArray(params.refresh_token) ? params.refresh_token[0] : params.refresh_token;
    const errorParam = Array.isArray(params.error) ? params.error[0] : params.error;
    const errorDescription = Array.isArray(params.error_description) ? params.error_description[0] : params.error_description;

    if (errorParam || errorDescription) {
      setError(errorDescription || errorParam || '인증 중 오류가 발생했습니다.');
      return;
    }

    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(() => {
        router.replace('/(tabs)/index');
      }).catch(() => {
        setError('세션 설정에 실패했습니다. 다시 시도해주세요.');
      });
    } else {
      setError('인증 정보를 받지 못했습니다. 다시 시도해주세요.');
    }
  }, [params, router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>인증 실패</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => router.replace('/(tabs)/index')}
          activeOpacity={0.8}
        >
          <Text style={styles.retryBtnText}>홈으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary[400]} />
      <Text style={styles.loadingText}>로그인 처리 중...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.dark.bg,
    paddingHorizontal: 40,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.error[400],
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: theme.colors.primary[500],
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  loadingText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 12,
  },
});
