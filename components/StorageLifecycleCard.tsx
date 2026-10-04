import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { HardDrive, RefreshCw, Trash2, Flame, Snowflake, Archive, Clock } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { SectionCard } from '@/components/SectionCard';
import { useMountedRef } from '@/hooks/useMountedRef';
import {
  fetchLifecycleStats,
  triggerLifecycleSweep,
  formatBytes,
  describePolicy,
  tierLabel,
  tierColor,
  type StorageTier,
  type StorageLifecycleStats,
} from '@/lib/storageLifecycle';

const TIER_ICONS: Record<StorageTier, typeof Flame> = {
  hot: Flame,
  warm: Clock,
  cold: Snowflake,
  expired: Archive,
};

export function StorageLifecycleCard() {
  const mounted = useMountedRef();
  const [stats, setStats] = useState<StorageLifecycleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const data = await fetchLifecycleStats();
    if (!mounted.current) return;
    setStats(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleSweep = useCallback(async () => {
    setSweeping(true);
    setSweepResult(null);
    try {
      const result = await triggerLifecycleSweep();
      if (!mounted.current) return;
      if (result) {
        const classified = Object.entries(result.classified)
          .map(([tier, count]) => `${tier}: ${count}`)
          .join(', ');
        setSweepResult(`분류 완료 (${classified}) · 삭제 ${result.deleted}개`);
        await loadStats();
      } else {
        setSweepResult('스윕을 실행할 수 없습니다. 네트워크를 확인해주세요.');
      }
    } catch {
      if (!mounted.current) return;
      setSweepResult('스윕 중 오류가 발생했습니다.');
    } finally {
      if (mounted.current) setSweeping(false);
    }
  }, [loadStats]);

  const tiers: StorageTier[] = ['hot', 'warm', 'cold', 'expired'];

  return (
    <SectionCard title="스토리지 라이프사이클" icon={<HardDrive size={18} color={theme.colors.primary[400]} strokeWidth={2} />}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.primary[400]} />
        </View>
      ) : stats ? (
        <View style={styles.content}>
          {/* Summary row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stats.totalObjects}</Text>
              <Text style={styles.summaryLabel}>총 객체</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatBytes(stats.totalSizeBytes)}</Text>
              <Text style={styles.summaryLabel}>사용 용량</Text>
            </View>
          </View>

          {/* Tier breakdown */}
          <View style={styles.tierRow}>
            {tiers.map((tier) => {
              const Icon = TIER_ICONS[tier];
              const count = stats.byTier[tier] ?? 0;
              return (
                <View key={tier} style={styles.tierItem}>
                  <View style={[styles.tierIconWrap, { backgroundColor: tierColor(tier) + '20' }]}>
                    <Icon size={12} color={tierColor(tier)} strokeWidth={2} />
                  </View>
                  <Text style={styles.tierCount}>{count}</Text>
                  <Text style={styles.tierLabel}>{tierLabel(tier)}</Text>
                </View>
              );
            })}
          </View>

          {/* Policy descriptions */}
          {stats.policies.length > 0 && (
            <View style={styles.policySection}>
              <Text style={styles.policyTitle}>라이프사이클 정책</Text>
              {stats.policies.map((policy) => (
                <View key={policy.objectType} style={styles.policyRow}>
                  <Text style={styles.policyType}>
                    {policy.objectType === 'tts_audio' ? 'TTS' : policy.objectType}
                  </Text>
                  <Text style={styles.policyDesc}>{describePolicy(policy)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Sweep button */}
          <TouchableOpacity
            style={styles.sweepBtn}
            onPress={handleSweep}
            disabled={sweeping}
            activeOpacity={0.8}
          >
            {sweeping ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <RefreshCw size={15} color="#fff" strokeWidth={2.5} />
            )}
            <Text style={styles.sweepBtnText}>
              {sweeping ? '실행 중...' : '수동 스윕 실행'}
            </Text>
          </TouchableOpacity>

          {sweepResult && (
            <Text style={styles.sweepResult}>{sweepResult}</Text>
          )}

          <Text style={styles.hint}>
            완성된 영상은 48시간 후 웜, 7일 후 콜드, 30일 후 만료로 이관됩니다.
            다시보기·다운로드·공유 시 자동으로 HOT으로 재분류됩니다.
          </Text>
        </View>
      ) : (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>라이프사이클 데이터를 불러올 수 없습니다.</Text>
          <TouchableOpacity onPress={loadStats} activeOpacity={0.8}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  content: {
    gap: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.dark.border,
  },
  summaryItem: {
    flex: 1,
  },
  summaryValue: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tierItem: {
    alignItems: 'center',
    gap: 4,
  },
  tierIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierCount: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  tierLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
  },
  policySection: {
    gap: 6,
  },
  policyTitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  policyType: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
    minWidth: 50,
  },
  policyDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  sweepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary[500],
    paddingVertical: 10,
    borderRadius: 10,
  },
  sweepBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  sweepResult: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
  },
  hint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 15,
  },
  errorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.dark.textDim,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary[400],
  },
});
