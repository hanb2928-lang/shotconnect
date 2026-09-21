import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  RefreshControl,
  FlatList,
  Dimensions,
  ViewToken,
  KeyboardAvoidingView,
} from 'react-native';
import {
  Sprout,
  Plus,
  Check,
  Circle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Pause,
  Play,
  Lightbulb,
  X,
  Clock,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  fetchActiveSchedules,
  createWarmupSchedule,
  updateTaskStatus,
  updateScheduleStatus,
  deleteSchedule,
} from '@/lib/warmup';
import {
  PLATFORM_LABELS,
  TASK_TYPE_META,
  getDayLabel,
  getDayColor,
  type WarmupScheduleWithTasks,
  type WarmupTask,
  type WarmupPlatform,
} from '@/types/warmup';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorRetryBanner } from '@/components/ErrorRetryBanner';
import { friendlyError } from '@/lib/errors';
import { useSubTabBarHeight } from '@/hooks/useSubTabBarHeight';
import { useSafeTop } from '@/hooks/useSafeTop';

const { width: screenWidth } = Dimensions.get('window');

const PLATFORM_OPTIONS: { key: WarmupPlatform; label: string; emoji: string }[] = [
  { key: 'instagram', label: '인스타그램', emoji: 'IG' },
  { key: 'tiktok', label: '틱톡', emoji: 'TT' },
  { key: 'twitter', label: '트위터/스레드', emoji: 'X' },
  { key: 'blog', label: '블로그', emoji: 'B' },
  { key: 'pinterest', label: '핀터레스트', emoji: 'P' },
];

const DURATION_OPTIONS = [7, 14, 21, 30];

const WARMUP_TIPS = [
  '첫 3일은 게시물을 올리지 말고 좋아요와 댓글로 활동을 알리세요',
  '하루에 스토리 1-2개를 꾸준히 올리면 계정이 활성화된 것으로 인식됩니다',
  '같은 카테고리 계정과 소통하면 알고리즘이 관심사를 빠르게 파악합니다',
  '판매 링크는 7일차 이후에 자연스럽게 포함하는 것이 안전합니다',
  '게시물에 온 반응에 모두 답글을 달면 참여도 점수가 올라갑니다',
];

interface DaySlide {
  day: number;
  tasks: WarmupTask[];
  scheduledDate: string;
  isToday: boolean;
}

export default function WarmupScreen() {
  const tabBarHeight = useSubTabBarHeight();
  const safeTop = useSafeTop();
  const [schedules, setSchedules] = useState<WarmupScheduleWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const flatListRef = useRef<FlatList<DaySlide> | null>(null);

  // Create form
  const [selPlatform, setSelPlatform] = useState<WarmupPlatform>('instagram');
  const [accountName, setAccountName] = useState('');
  const [duration, setDuration] = useState(14);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const selectedScheduleIdRef = useRef<string | null>(null);
  selectedScheduleIdRef.current = selectedScheduleId;

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchActiveSchedules();
      setSchedules(data);
      if (data.length > 0 && !selectedScheduleIdRef.current) {
        setSelectedScheduleId(data[0].id);
      } else if (data.length > 0 && !data.some((s) => s.id === selectedScheduleIdRef.current)) {
        setSelectedScheduleId(data[0].id);
      } else if (data.length === 0) {
        setSelectedScheduleId(null);
      }
    } catch (err) {
      setSchedules([]);
      setLoadError(friendlyError(err, '육성 스케줄을 불러오지 못했습니다. 네트워크 연결을 확인해주세요.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleCreate = useCallback(async () => {
    if (!accountName.trim()) {
      setCreateError('계정 이름을 입력해주세요');
      return;
    }
    setSaving(true);
    try {
      const result = await createWarmupSchedule({
        platform: selPlatform,
        account_name: accountName.trim(),
        duration_days: duration,
      });
      if (!result) {
        setCreateError('생성에 실패했습니다. 다시 시도해주세요');
        return;
      }
      setShowCreateModal(false);
      setAccountName('');
      setSelPlatform('instagram');
      setDuration(14);
      setCreateError(null);
      setSelectedScheduleId(result.id);
      setCurrentSlideIndex(0);
      loadData(true);
    } catch {
      setCreateError('네트워크 오류로 생성에 실패했습니다');
    } finally {
      setSaving(false);
    }
  }, [accountName, selPlatform, duration, loadData]);

  const handleToggleTask = useCallback(async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    try {
      const ok = await updateTaskStatus(taskId, newStatus);
      if (!ok) {
        showToast('작업 상태 변경에 실패했어요. 다시 시도해주세요.');
        return;
      }
      loadData(true);
    } catch {
      showToast('작업 상태 변경에 실패했어요. 다시 시도해주세요.');
    }
  }, [loadData, showToast]);

  const handleSkipTask = useCallback(async (taskId: string) => {
    try {
      const ok = await updateTaskStatus(taskId, 'skipped');
      if (!ok) {
        showToast('작업 건너뛰기에 실패했어요. 다시 시도해주세요.');
        return;
      }
      loadData(true);
    } catch {
      showToast('작업 건너뛰기에 실패했어요. 다시 시도해주세요.');
    }
  }, [loadData, showToast]);

  const handlePauseSchedule = useCallback(async (scheduleId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      const ok = await updateScheduleStatus(scheduleId, newStatus);
      if (!ok) {
        showToast('스케줄 상태 변경에 실패했어요. 다시 시도해주세요.');
        return;
      }
      loadData(true);
    } catch {
      showToast('스케줄 상태 변경에 실패했어요. 다시 시도해주세요.');
    }
  }, [loadData, showToast]);

  const handleDeleteSchedule = useCallback(async (scheduleId: string) => {
    try {
      const ok = await deleteSchedule(scheduleId);
      if (!ok) {
        showToast('스케줄 삭제에 실패했어요. 다시 시도해주세요.');
        return;
      }
      setSelectedScheduleId(null);
      loadData(true);
    } catch {
      showToast('스케줄 삭제에 실패했어요. 다시 시도해주세요.');
    }
  }, [loadData, showToast]);

  const selectedSchedule = useMemo(
    () => schedules.find((s) => s.id === selectedScheduleId) || null,
    [schedules, selectedScheduleId]
  );

  const slides = useMemo<DaySlide[]>(() => {
    if (!selectedSchedule) return [];
    const map = new Map<number, WarmupTask[]>();
    for (const t of selectedSchedule.tasks) {
      const arr = map.get(t.day_number) || [];
      arr.push(t);
      map.set(t.day_number, arr);
    }
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, tasks]) => ({
        day,
        tasks,
        scheduledDate: tasks[0]?.scheduled_date || '',
        isToday: tasks[0]?.scheduled_date === today,
      }));
  }, [selectedSchedule]);

  const currentDay = useMemo(() => {
    if (!selectedSchedule) return 1;
    const [sy, sm, sd] = selectedSchedule.start_date.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, Math.min(diff, selectedSchedule.duration_days));
  }, [selectedSchedule]);

  const goToSlide = useCallback((index: number) => {
    if (index < 0 || index >= slides.length) return;
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, [slides.length]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentSlideIndex(viewableItems[0].index);
      }
    },
    []
  );

  if (loading) {
    return <LoadingScreen message="육성 스케줄을 불러오는 중..." />;
  }

  if (loadError && schedules.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
          <Text style={styles.headerTitle}>계정 육성</Text>
          <Text style={styles.headerSubtext}>
            주기적인 업로드와 자연스러운 반응으로 계정 기초 체력을 키웁니다
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorRetryBanner message={loadError} onRetry={loadData} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary[400]} />}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
      >
        <View style={[styles.header, { paddingTop: safeTop + 12 }]}>
          <Text style={styles.headerTitle}>계정 육성</Text>
          <Text style={styles.headerSubtext}>
            주기적인 업로드와 자연스러운 반응으로 계정 기초 체력을 키웁니다
          </Text>
        </View>

        {/* Schedule selector + create button */}
        <View style={styles.paddingHorizontal}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scheduleSelector}>
            {schedules.map((s) => {
              const isActive = s.id === selectedScheduleId;
              const label = PLATFORM_LABELS[s.platform] || s.platform;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.scheduleChip, isActive && styles.scheduleChipActive]}
                  onPress={() => {
                    setSelectedScheduleId(s.id);
                    setCurrentSlideIndex(0);
                    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.scheduleChipText, isActive && styles.scheduleChipTextActive]}>
                    {label} · {s.account_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.addChip}
              onPress={() => setShowCreateModal(true)}
              activeOpacity={0.7}
            >
              <Plus size={14} color={theme.colors.primary[400]} strokeWidth={2} />
              <Text style={styles.addChipText}>추가</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {selectedSchedule ? (
          <>
            {/* Schedule info card */}
            <View style={styles.paddingHorizontal}>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={[styles.platformBadge, { backgroundColor: getDayColor(currentDay) + '20' }]}>
                    <Text style={[styles.platformBadgeText, { color: getDayColor(currentDay) }]}>
                      {PLATFORM_LABELS[selectedSchedule.platform]?.charAt(0) || '?'}
                    </Text>
                  </View>
                  <View style={styles.infoBody}>
                    <Text style={styles.infoAccount}>{selectedSchedule.account_name}</Text>
                    <Text style={styles.infoMeta}>
                      {PLATFORM_LABELS[selectedSchedule.platform]} · {currentDay}일차 / {selectedSchedule.duration_days}일 · {getDayLabel(currentDay)}
                    </Text>
                  </View>
                  <View style={styles.infoActions}>
                    <TouchableOpacity
                      onPress={() => handlePauseSchedule(selectedSchedule.id, selectedSchedule.status)}
                      style={styles.iconActionBtn}
                      hitSlop={8}
                    >
                      {selectedSchedule.status === 'paused' ? (
                        <Play size={16} color={theme.colors.success[400]} strokeWidth={2} />
                      ) : (
                        <Pause size={16} color={theme.colors.warning[400]} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteSchedule(selectedSchedule.id)}
                      style={styles.iconActionBtn}
                      hitSlop={8}
                    >
                      <Trash2 size={16} color={theme.colors.error[400]} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.progressRow}>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${selectedSchedule.progress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{selectedSchedule.progress.toFixed(0)}%</Text>
                </View>
              </View>
            </View>

            {/* Slide navigation header */}
            <View style={styles.slideNavRow}>
              <TouchableOpacity
                onPress={() => goToSlide(currentSlideIndex - 1)}
                disabled={currentSlideIndex === 0}
                style={[styles.navArrow, currentSlideIndex === 0 && styles.navArrowDisabled]}
                hitSlop={8}
              >
                <ChevronLeft size={20} color={currentSlideIndex === 0 ? theme.colors.dark.textFaint : theme.colors.dark.text} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={styles.slideNavTitle}>
                {currentSlideIndex + 1} / {slides.length} 일차
              </Text>
              <TouchableOpacity
                onPress={() => goToSlide(currentSlideIndex + 1)}
                disabled={currentSlideIndex >= slides.length - 1}
                style={[styles.navArrow, currentSlideIndex >= slides.length - 1 && styles.navArrowDisabled]}
                hitSlop={8}
              >
                <ChevronRight size={20} color={currentSlideIndex >= slides.length - 1 ? theme.colors.dark.textFaint : theme.colors.dark.text} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Swipeable slides */}
            <FlatList
              ref={(ref) => { flatListRef.current = ref; }}
              data={slides}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
              keyExtractor={(item) => `day-${item.day}`}
              getItemLayout={(_, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
              onScrollToIndexFailed={({ index }) => {
                if (slides.length === 0) return;
                setTimeout(() => {
                  if (slides.length === 0) return;
                  try {
                    flatListRef.current?.scrollToIndex({ index: Math.min(index, slides.length - 1), animated: true });
                  } catch { /* ignore */ }
                }, 100);
              }}
              renderItem={({ item }) => (
                <View style={styles.slide}>
                  <View style={styles.slideHeader}>
                    <View style={[styles.dayBadge, { backgroundColor: getDayColor(item.day) + '20' }]}>
                      <Text style={[styles.dayBadgeText, { color: getDayColor(item.day) }]}>{item.day}일차</Text>
                    </View>
                    <Text style={styles.dayPhase}>{getDayLabel(item.day)}</Text>
                    {item.isToday && (
                      <View style={styles.todayTag}>
                        <Text style={styles.todayTagText}>오늘</Text>
                      </View>
                    )}
                  </View>

                  {item.tasks.map((task) => {
                    const meta = TASK_TYPE_META[task.task_type] || { label: task.task_type, color: '#8B5CF6' };
                    const isDone = task.status === 'done';
                    const isSkipped = task.status === 'skipped';
                    return (
                      <View key={task.id} style={styles.taskCard}>
                        <TouchableOpacity
                          onPress={() => handleToggleTask(task.id, task.status)}
                          style={styles.taskCheckButton}
                          activeOpacity={0.6}
                        >
                          {isDone ? (
                            <View style={[styles.taskCheckCircle, { backgroundColor: theme.colors.success[400] }]}>
                              <Check size={12} color="#fff" strokeWidth={2} />
                            </View>
                          ) : isSkipped ? (
                            <View style={[styles.taskCheckCircle, { backgroundColor: theme.colors.dark.border }]}>
                              <X size={10} color={theme.colors.dark.textFaint} strokeWidth={2} />
                            </View>
                          ) : (
                            <Circle size={20} color={theme.colors.dark.border} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
                        <View style={styles.taskBody}>
                          <View style={styles.taskTitleRow}>
                            <View style={[styles.taskTypeDot, { backgroundColor: meta.color }]} />
                            <Text style={[styles.taskTypeLabel, { color: meta.color }]}>{meta.label}</Text>
                          </View>
                          <Text
                            style={[styles.taskTitle, isDone && styles.taskTitleDone, isSkipped && styles.taskTitleSkipped]}
                          >
                            {task.title}
                          </Text>
                          {task.description && (
                            <Text style={styles.taskDesc}>{task.description}</Text>
                          )}
                        </View>
                        {!isDone && !isSkipped && (
                          <TouchableOpacity
                            onPress={() => handleSkipTask(task.id)}
                            style={styles.skipButton}
                            hitSlop={8}
                          >
                            <Text style={styles.skipButtonText}>건너뛰기</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}

                  {/* Day progress */}
                  <View style={styles.dayProgressRow}>
                    <Clock size={11} color={theme.colors.warning[400]} strokeWidth={2} />
                    <Text style={styles.dayProgressText}>
                      {item.tasks.filter((t) => t.status === 'done').length} / {item.tasks.length} 완료
                    </Text>
                  </View>
                </View>
              )}
            />

            {/* Dot indicator */}
            <View style={styles.dotRow}>
              {slides.map((s, i) => (
                <View
                  key={`dot-${s.day}`}
                  style={[styles.dot, i === currentSlideIndex && styles.dotActive]}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Sprout size={48} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>육성 스케줄이 없습니다</Text>
            <Text style={styles.emptyText}>
              새 스케줄을 만들면 일자별 체크리스트가 자동 생성됩니다. 매일 완료한 활동을 체크하며 계정을 성장시키세요
            </Text>
            <TouchableOpacity
              style={styles.createButtonEmpty}
              onPress={() => setShowCreateModal(true)}
              activeOpacity={0.8}
            >
              <Plus size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.createButtonText}>웜업 스케줄 만들기</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Warmup tips */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Lightbulb size={14} color={theme.colors.warning[400]} strokeWidth={2} />
            <Text style={styles.sectionLabel}>웜업 가이드라인</Text>
          </View>
          <View style={styles.tipsCard}>
            {WARMUP_TIPS.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipBadge}>
                  <Text style={styles.tipNum}>{i + 1}</Text>
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {toastMsg && (
        <View style={styles.toastWrap}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>웜업 스케줄 만들기</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)} hitSlop={8}>
                <X size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>플랫폼</Text>
            <View style={styles.platformRow}>
              {PLATFORM_OPTIONS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.platformChip, selPlatform === p.key && styles.platformChipActive]}
                  onPress={() => setSelPlatform(p.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.platformChipText, selPlatform === p.key && styles.platformChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>계정 이름</Text>
            <TextInput
              style={styles.textInput}
              value={accountName}
              onChangeText={setAccountName}
              placeholder="예: @my_store_official"
              placeholderTextColor={theme.colors.dark.textFaint}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>웜업 기간</Text>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, duration === d && styles.durationChipActive]}
                  onPress={() => setDuration(d)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.durationChipText, duration === d && styles.durationChipTextActive]}>
                    {d}일
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {createError && <Text style={styles.errorText}>{createError}</Text>}

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleCreate}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>스케줄 생성</Text>
              )}
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  paddingHorizontal: {
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
    paddingBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.title,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  headerSubtext: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 4,
    lineHeight: 20,
  },
  scheduleSelector: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    paddingBottom: 4,
  },
  scheduleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    marginRight: 8,
  },
  scheduleChipActive: {
    backgroundColor: theme.colors.primary[600],
  },
  scheduleChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  scheduleChipTextActive: {
    color: '#fff',
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '30',
  },
  addChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  infoCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.card,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  infoBody: {
    flex: 1,
  },
  infoAccount: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  infoMeta: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  infoActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary[400],
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
    minWidth: 32,
  },
  slideNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  navArrow: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowDisabled: {
    opacity: 0.4,
  },
  slideNavTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    minWidth: 90,
    textAlign: 'center',
  },
  slide: {
    width: screenWidth,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  slideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  dayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayBadgeText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
  },
  dayPhase: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  todayTag: {
    backgroundColor: theme.colors.warning[400],
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  todayTagText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: 8,
    ...theme.shadows.card,
  },
  taskCheckButton: {
    paddingTop: 2,
  },
  taskCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskBody: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  taskTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskTypeLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  taskTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    lineHeight: 20,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: theme.colors.dark.textDim,
  },
  taskTitleSkipped: {
    textDecorationLine: 'line-through',
    color: theme.colors.dark.textFaint,
  },
  taskDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 4,
    lineHeight: 18,
  },
  skipButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  skipButtonText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  dayProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.sm,
    justifyContent: 'center',
  },
  dayProgressText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.warning[400],
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.dark.border,
  },
  dotActive: {
    backgroundColor: theme.colors.primary[400],
    width: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 24,
  },
  createButtonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary[600],
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.md,
  },
  createButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tipsCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  tipRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  tipBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.warning[400] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  tipNum: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
  },
  platformBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformBadgeText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
    marginTop: theme.spacing.sm,
  },
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  platformChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  platformChipActive: {
    backgroundColor: theme.colors.primary[600],
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  platformChipTextActive: {
    color: '#fff',
  },
  textInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 6,
  },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  durationChipActive: {
    backgroundColor: theme.colors.primary[600],
  },
  durationChipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  durationChipTextActive: {
    color: '#fff',
  },
  errorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    marginTop: theme.spacing.sm,
  },
  saveButton: {
    backgroundColor: theme.colors.primary[600],
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  toastWrap: {
    position: 'absolute',
    bottom: 80,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    backgroundColor: theme.colors.error[500],
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.card,
  },
  toastText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#fff',
    textAlign: 'center',
  },
});
