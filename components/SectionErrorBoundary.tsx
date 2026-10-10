import React, { Component } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { logError, addBreadcrumb } from '@/lib/errorLogger';

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  label: string;
  style?: ViewStyle;
  onReset?: () => void;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
}

const RETRY_COOLDOWN_MS = 2000;

/**
 * A lightweight, section-scoped error boundary for isolating crashes in
 * individual cards, panels, or media components. Unlike the top-level
 * ErrorBoundary which catches fatal app-wide errors, this one renders a
 * compact inline fallback with a "retry" button so the rest of the screen
 * stays functional when a single component fails.
 *
 * Use around individual feature cards, media viewers, editor panels, etc.
 * The `label` prop identifies the section in error logs and in the fallback UI.
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    hasError: false,
    error: null,
    retryKey: 0,
  };

  private lastRetryAt = 0;

  static getDerivedStateFromError(error: Error): Partial<SectionErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error, {
      component: 'SectionErrorBoundary',
      action: this.props.label,
      extra: { componentStack: info.componentStack ?? '' },
    });
    addBreadcrumb('sectionError', `Section error in ${this.props.label}`, 'warning', {
      message: error.message,
    });
  }

  handleReset = () => {
    const now = Date.now();
    if (now - this.lastRetryAt < RETRY_COOLDOWN_MS) return;
    this.lastRetryAt = now;
    this.props.onReset?.();
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.container, this.props.style]}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <AlertTriangle size={20} color={theme.colors.warning[400]} strokeWidth={2} />
            </View>
            <Text style={styles.label}>{this.props.label}</Text>
            <Text style={styles.message}>이 섹션을 불러오는 중 문제가 발생했어요.</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={this.handleReset}
              activeOpacity={0.8}
            >
              <RefreshCw size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.retryText}>다시 불러오기</Text>
            </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    borderWidth: 1,
    borderColor: theme.colors.warning[500] + '20',
  },
  card: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.warning[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  message: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[500],
    marginTop: theme.spacing.xs,
  },
  retryText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
