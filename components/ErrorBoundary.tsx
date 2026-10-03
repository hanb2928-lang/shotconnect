import React, { Component } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { AlertTriangle, RefreshCw, WifiOff, Wifi, PackageX } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { logFatal, addBreadcrumb } from '@/lib/errorLogger';
import { BootFallback } from '@/components/BootFallback';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
  isOffline: boolean;
  autoRetried: boolean;
  isChunkError: boolean;
}

const RETRY_COOLDOWN_MS = 3000;

/**
 * Detects whether an error is caused by a missing JS chunk after a
 * deployment. Browsers cache the old HTML which references hashed
 * chunk filenames that no longer exist on the server (404), causing
 * a ChunkLoadError or dynamic import failure.
 */
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message || '';
  const name = error.name || '';
  if (name === 'ChunkLoadError') return true;
  if (/Loading chunk \d+ failed/i.test(msg)) return true;
  if (/Loading CSS chunk \d+ failed/i.test(msg)) return true;
  if (/Failed to fetch dynamically imported module/i.test(msg)) return true;
  if (/Importing a module script failed/i.test(msg)) return true;
  return false;
}

/**
 * Forces a hard reload that bypasses browser cache by appending a
 * timestamp query parameter. This ensures the browser fetches the
 * latest index HTML rather than serving a stale cached copy that
 * references non-existent chunk files.
 */
function cacheBustingReload(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_cb', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    retryKey: 0,
    isOffline: false,
    autoRetried: false,
    isChunkError: false,
  };

  private lastRetryAt = 0;
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, autoRetried: false, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const chunkError = isChunkLoadError(error);
    if (chunkError) {
      addBreadcrumb('chunk', 'ChunkLoadError detected, auto-reloading with cache bust', 'warning', {
        message: error.message,
      });
    }
    logFatal(error, { action: 'ErrorBoundary', extra: { componentStack: info.componentStack ?? '', isChunkError: chunkError } });

    if (chunkError && Platform.OS === 'web' && typeof window !== 'undefined') {
      setTimeout(() => cacheBustingReload(), 500);
    }
  }

  componentDidMount() {
    this.attachNetworkListeners();
  }

  componentWillUnmount() {
    this.detachNetworkListeners();
  }

  private attachNetworkListeners() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const nav = navigator as any;
    this.setState({ isOffline: !nav.onLine });

    this.onlineListener = () => {
      this.setState({ isOffline: false });
      if (this.state.hasError && !this.state.autoRetried) {
        this.setState({ autoRetried: true });
        this.autoRetry();
      }
    };
    this.offlineListener = () => {
      this.setState({ isOffline: true });
    };

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
  }

  private detachNetworkListeners() {
    if (this.onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener);
    }
    if (this.offlineListener && typeof window !== 'undefined') {
      window.removeEventListener('offline', this.offlineListener);
    }
  }

  handleReset = () => {
    const now = Date.now();
    if (now - this.lastRetryAt < RETRY_COOLDOWN_MS) return;
    this.lastRetryAt = now;
    this.resetError();
  };

  private autoRetry = () => {
    this.resetError();
  };

  private resetError() {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryKey: prev.retryKey + 1,
      autoRetried: false,
      isChunkError: false,
    }));
  }

  handleChunkReload = () => {
    cacheBustingReload();
  };

  render() {
    if (this.state.hasError) {
      const { isOffline, autoRetried, isChunkError } = this.state;

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              {isOffline ? (
                <WifiOff size={36} color={theme.colors.warning[400]} strokeWidth={2} />
              ) : isChunkError ? (
                <PackageX size={36} color={theme.colors.warning[400]} strokeWidth={2} />
              ) : (
                <AlertTriangle size={36} color={theme.colors.warning[400]} strokeWidth={2} />
              )}
            </View>
            <Text style={styles.title}>문제가 발생했어요</Text>
            <Text style={styles.message}>
              {isOffline
                ? '인터넷 연결이 끊겨 있어요. 연결이 복구되면 자동으로 다시 시도해요.'
                : isChunkError
                  ? '앱이 업데이트되어 최신 버전을 불러오는 중이에요. 잠시 후 자동으로 새로고침됩니다.'
                  : '예상치 못한 오류가 발생했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.'}
            </Text>
            {this.state.error?.message ? (
              <Text style={styles.errorDetail} selectable>
                {this.state.error.message}
              </Text>
            ) : null}
            {this.state.error?.stack && !isChunkError ? (
              <Text style={styles.errorStack} selectable>
                {this.state.error.stack.split('\n').slice(0, 12).join('\n')}
              </Text>
            ) : null}
            {isOffline ? (
              <View style={styles.offlineBadge}>
                <WifiOff size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={styles.offlineBadgeText}>오프라인 · 연결 대기 중</Text>
              </View>
            ) : isChunkError ? (
              <TouchableOpacity
                style={styles.button}
                onPress={this.handleChunkReload}
                activeOpacity={0.8}
              >
                <RefreshCw size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.buttonText}>최신 버전으로 새로고침</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, autoRetried && styles.buttonAutoRetried]}
                onPress={this.handleReset}
                activeOpacity={0.8}
              >
                <RefreshCw size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.buttonText}>다시 시도</Text>
              </TouchableOpacity>
            )}
            {isOffline && (
              <View style={styles.autoRetryHint}>
                <Wifi size={12} color={theme.colors.primary[300]} strokeWidth={2} />
                <Text style={styles.autoRetryHintText}>
                  와이파이나 데이터가 켜지면 자동으로 복구돼요
                </Text>
              </View>
            )}
            {isChunkError && !isOffline && (
              <Text style={styles.chunkHintText}>
                캐시를 초기화하고 최신 버전을 불러올게요
              </Text>
            )}
          </View>
        </View>
      );
    }

    return <View key={this.state.retryKey} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xxl,
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.elevated,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.warning[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.title,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  message: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorDetail: {
    maxWidth: 320,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
    lineHeight: 16,
  },
  errorStack: {
    maxWidth: 360,
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'left',
    lineHeight: 13,
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    marginTop: theme.spacing.sm,
  },
  buttonAutoRetried: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginTop: theme.spacing.sm,
  },
  offlineBadgeText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  autoRetryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  autoRetryHintText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300],
  },
  chunkHintText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300],
    textAlign: 'center',
  },
  skeleton: {
    width: '100%',
    height: 200,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
  },
});

export function SafeLazyLoad({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <React.Suspense fallback={fallback ?? <BootFallback />}>
        {children}
      </React.Suspense>
    </ErrorBoundary>
  );
}
