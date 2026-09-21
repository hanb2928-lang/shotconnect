import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Target, Gift, Check, Zap, ChevronRight } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { getActiveQuests, claimQuestReward, type Quest } from '@/lib/quests';

export function QuestCard() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const loadQuests = useCallback(async () => {
    const q = await getActiveQuests();
    setQuests(q);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadQuests();
  }, [loadQuests]);

  const handleClaim = useCallback(async (questId: string) => {
    setClaiming(questId);
    const reward = await claimQuestReward(questId);
    if (reward > 0) {
      setQuests((prev) => prev.filter((q) => q.id !== questId));
    }
    setClaiming(null);
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Target size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>오늘의 마케팅 퀘스트</Text>
        </View>
        <ActivityIndicator size="small" color={theme.colors.accent[400]} style={styles.loader} />
      </View>
    );
  }

  if (quests.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Target size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>오늘의 마케팅 퀘스트</Text>
        </View>
        <Text style={styles.emptyText}>모든 퀘스트를 완료했습니다! 내일 새로운 퀘스트가 열립니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Target size={18} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>오늘의 마케팅 퀘스트</Text>
      </View>

      <Text style={styles.description}>
        퀘스트를 완료하고 크레딧 보상을 받으세요. 매일 새로운 퀘스트가 열립니다.
      </Text>

      <ScrollView style={styles.questList} showsVerticalScrollIndicator={false}>
        {quests.map((quest) => {
          const percent = Math.min(100, Math.floor((quest.current_count / quest.target_count) * 100));
          const isCompleted = quest.status === 'completed' || quest.current_count >= quest.target_count;

          return (
            <View key={quest.id} style={styles.questItem}>
              <View style={styles.questLeft}>
                <View style={[styles.questIconWrap, isCompleted && styles.questIconWrapDone]}>
                  {isCompleted ? (
                    <Check size={14} color="#fff" strokeWidth={2.5} />
                  ) : (
                    <Zap size={14} color={theme.colors.accent[400]} strokeWidth={2} />
                  )}
                </View>
                <View style={styles.questInfo}>
                  <Text style={styles.questTitle}>{quest.title}</Text>
                  <Text style={styles.questDesc}>{quest.description}</Text>
                  <View style={styles.progressRow}>
                    <View style={styles.progressBg}>
                      <View
                        style={[styles.progressFill, {
                          width: `${percent}%`,
                          backgroundColor: isCompleted ? theme.colors.success[400] : theme.colors.accent[400],
                        }]}
                      />
                    </View>
                    <Text style={styles.progressText}>{quest.current_count}/{quest.target_count}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.questRight}>
                <View style={styles.rewardBadge}>
                  <Gift size={10} color={theme.colors.warning[400]} strokeWidth={2} />
                  <Text style={styles.rewardText}>+{quest.reward_credits}</Text>
                </View>
                {isCompleted ? (
                  <TouchableOpacity
                    style={styles.claimBtn}
                    onPress={() => handleClaim(quest.id)}
                    disabled={claiming === quest.id}
                    activeOpacity={0.7}
                  >
                    {claiming === quest.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.claimBtnText}>받기</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.progressPercent}>
                    <Text style={styles.progressPercentText}>{percent}%</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  description: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  questList: {
    maxHeight: 400,
  },
  questItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginBottom: 8,
  },
  questLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  questIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.accent[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  questIconWrapDone: {
    backgroundColor: theme.colors.success[500],
  },
  questInfo: {
    flex: 1,
  },
  questTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 2,
  },
  questDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.bg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  questRight: {
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.warning[500] + '20',
  },
  rewardText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  claimBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500],
  },
  claimBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  progressPercent: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  progressPercentText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.textDim,
  },
  loader: {
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
});
