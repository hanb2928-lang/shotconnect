import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Clock, Trash2, RefreshCw, ImageIcon } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { CachedImage } from './CachedImage';
import { listDrafts, deleteDraft, type DraftEntry } from '@/lib/draftStorage';

interface DraftHistoryProps {
  onResume: (draft: DraftEntry) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function DraftHistory({ onResume }: DraftHistoryProps) {
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await listDrafts();
    setDrafts(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={theme.colors.dark.textFaint} />
      </View>
    );
  }

  if (drafts.length === 0) return <></>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Clock size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
        <Text style={styles.title}>최근 작업 보관함</Text>
        <Text style={styles.count}>{drafts.length}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {drafts.map((draft) => (
          <View key={draft.id} style={styles.draftCard}>
            <TouchableOpacity
              style={styles.draftThumbWrap}
              onPress={() => onResume(draft)}
              activeOpacity={0.8}
            >
              {draft.thumbnailUri ? (
                <CachedImage uri={draft.thumbnailUri} style={styles.draftThumb} resizeMode="cover" />
              ) : (
                <View style={styles.draftThumbPlaceholder}>
                  <ImageIcon size={20} color={theme.colors.dark.textFaint} strokeWidth={2} />
                </View>
              )}
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {draft.status === 'generating' ? '생성 중'
                    : draft.status === 'completed' ? '완료'
                    : draft.status === 'failed' ? '실패'
                    : draft.status === 'capturing' ? '촬영 중'
                    : '편집 중'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.draftInfo}>
              <Text style={styles.draftLabel} numberOfLines={1}>{draft.label}</Text>
              <Text style={styles.draftTime}>{formatRelativeTime(draft.updatedAt)}</Text>
            </View>

            <View style={styles.draftActions}>
              <TouchableOpacity
                style={styles.resumeBtn}
                onPress={() => onResume(draft)}
                activeOpacity={0.7}
              >
                <RefreshCw size={11} color={theme.colors.primary[300]} strokeWidth={2.5} />
                <Text style={styles.resumeText}>이어서</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(draft.id)}
                activeOpacity={0.7}
              >
                <Trash2 size={11} color={theme.colors.dark.textFaint} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  title: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  count: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
    backgroundColor: theme.colors.dark.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  loadingRow: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  draftCard: {
    width: 130,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.xs,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  draftThumbWrap: {
    width: '100%',
    aspectRatio: 9 / 12,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  draftThumb: {
    width: '100%',
    height: '100%',
  },
  draftThumbPlaceholder: {
    flex: 1,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: theme.radius.full,
  },
  statusText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  draftInfo: {
    gap: 1,
    paddingHorizontal: 2,
  },
  draftLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  draftTime: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  draftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  resumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: theme.colors.primary[500] + '15',
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  resumeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  deleteBtn: {
    padding: 4,
  },
});
