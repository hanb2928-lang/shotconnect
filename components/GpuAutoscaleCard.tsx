import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Cpu, Zap, TrendingUp, Gauge } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { theme as staticTheme } from '@/lib/theme';

interface AutoscaleConfig {
  min_workers: number;
  max_workers: number;
  scale_up_threshold: number;
  enabled: boolean;
}

interface AutoscaleStatus {
  enabled: boolean;
  queueDepth: number;
  activeWorkers: number;
  targetWorkers: number;
  spawned: number;
  action: string;
}

export function GpuAutoscaleCard() {
  const [config, setConfig] = useState<AutoscaleConfig | null>(null);
  const [status, setStatus] = useState<AutoscaleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('gpu_autoscale_config')
        .select('min_workers, max_workers, scale_up_threshold, enabled')
        .eq('id', 1)
        .maybeSingle();
      if (!error && data) setConfig(data as AutoscaleConfig);
    } catch {
      // non-fatal
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('autoscale-manager', {
        body: { trigger: true },
      });
      if (!error && data) {
        setStatus(data as AutoscaleStatus);
      }
    } catch {
      // non-fatal
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      await loadConfig();
      setLoading(false);
    })();
  }, [loadConfig]);

  const handleToggle = async () => {
    if (!config) return;
    setToggling(true);
    try {
      const { error } = await supabase
        .from('gpu_autoscale_config')
        .update({ enabled: !config.enabled, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (!error) {
        setConfig({ ...config, enabled: !config.enabled });
      }
    } catch {
      // non-fatal
    }
    setToggling(false);
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={staticTheme.colors.accent[400]} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Cpu size={18} color={staticTheme.colors.accent[400]} strokeWidth={2} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>GPU 인프라 오토스케일링</Text>
          <Text style={styles.subtitle}>
            트래픽 폭주 시 자동으로 처리 워커를 확장합니다
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.toggle, config?.enabled && styles.toggleActive]}
          onPress={handleToggle}
          disabled={toggling}
          activeOpacity={0.7}
        >
          <View style={[styles.toggleKnob, config?.enabled && styles.toggleKnobActive]} />
        </TouchableOpacity>
      </View>

      {config?.enabled && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Gauge size={14} color={staticTheme.colors.primary[300]} strokeWidth={2} />
              </View>
              <Text style={styles.statLabel}>활성 워커</Text>
              <Text style={styles.statValue}>
                {status?.activeWorkers ?? '-'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <TrendingUp size={14} color={staticTheme.colors.warning[400]} strokeWidth={2} />
              </View>
              <Text style={styles.statLabel}>대기열</Text>
              <Text style={styles.statValue}>
                {status?.queueDepth ?? '-'}
              </Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Zap size={14} color={staticTheme.colors.accent[400]} strokeWidth={2} />
              </View>
              <Text style={styles.statLabel}>목표 워커</Text>
              <Text style={styles.statValue}>
                {status?.targetWorkers ?? '-'}
              </Text>
            </View>
          </View>

          <View style={styles.policyRow}>
            <Text style={styles.policyLabel}>스케일 정책</Text>
            <Text style={styles.policyValue}>
              최소 {config.min_workers} / 최대 {config.max_workers} 워커
            </Text>
            <Text style={styles.policyHint}>
              대기열 {config.scale_up_threshold}건 이상 시 확장
            </Text>
          </View>

          {status?.action && (
            <View style={styles.actionBanner}>
              <Text style={styles.actionText}>{status.action}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={loadStatus}
            disabled={refreshing}
            activeOpacity={0.7}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={staticTheme.colors.accent[400]} />
            ) : (
              <Text style={styles.refreshBtnText}>상태 새로고침</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {!config?.enabled && (
        <Text style={styles.disabledText}>
          오토스케일링이 비활성화되어 있습니다. 토글을 켜면 트래픽에 따라 워커가 자동 확장됩니다.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: staticTheme.colors.dark.surface,
    borderRadius: staticTheme.radius.lg,
    padding: staticTheme.spacing.md,
    ...staticTheme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: staticTheme.radius.md,
    backgroundColor: staticTheme.colors.accent[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 2,
  },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: staticTheme.radius.full,
    backgroundColor: staticTheme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: staticTheme.colors.accent[400],
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: staticTheme.radius.full,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleKnobActive: {
    transform: [{ translateX: 18 }],
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: staticTheme.colors.dark.surfaceLight,
    borderRadius: staticTheme.radius.md,
    paddingVertical: 10,
  },
  statIconWrap: {
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.dark.textDim,
  },
  statValue: {
    fontSize: 18,
    fontFamily: staticTheme.typography.fontFamily.bold,
    color: staticTheme.colors.dark.text,
    marginTop: 2,
  },
  policyRow: {
    marginTop: 12,
    paddingHorizontal: 4,
  },
  policyLabel: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.dark.textDim,
  },
  policyValue: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.text,
    marginTop: 2,
  },
  policyHint: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textFaint,
    marginTop: 2,
  },
  actionBanner: {
    marginTop: 10,
    backgroundColor: staticTheme.colors.accent[400] + '15',
    borderRadius: staticTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 10,
    fontFamily: staticTheme.typography.fontFamily.medium,
    color: staticTheme.colors.accent[300],
  },
  refreshBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: staticTheme.radius.sm,
    backgroundColor: staticTheme.colors.dark.surfaceLight,
  },
  refreshBtnText: {
    fontSize: 11,
    fontFamily: staticTheme.typography.fontFamily.semiBold,
    color: staticTheme.colors.accent[300],
  },
  disabledText: {
    fontSize: 12,
    fontFamily: staticTheme.typography.fontFamily.regular,
    color: staticTheme.colors.dark.textDim,
    marginTop: 10,
    lineHeight: 18,
  },
});
