import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { Bell, BellRing, Clock, Check, X, Copy, Trash2, Calendar, Info, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

export interface UploadSchedule {
  id: string;
  scan_id: string | null;
  scheduled_time: string;
  platform: string | null;
  caption: string | null;
  hashtags: string[] | null;
  affiliate_url: string | null;
  status: string;
  notification_enabled: boolean;
  created_at: string;
  fired_at: string | null;
}

interface SmartSchedulerProps {
  scanId: string;
  caption: string;
  hashtags: string[];
  affiliateUrl?: string;
  platform?: string;
}

const GOLDEN_TIME_PRESETS = [
  { label: '오전 8시 (출근길)', hour: 8, minute: 0 },
  { label: '점심 12시 (휴식)', hour: 12, minute: 0 },
  { label: '저녁 6시 (퇴근길)', hour: 18, minute: 0 },
  { label: '밤 8시 (골든타임)', hour: 20, minute: 0 },
  { label: '밤 10시 (심야)', hour: 22, minute: 0 },
];

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  shortform: '숏폼 (공통)',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = m < 10 ? `0${m}` : String(m);
  return `${month}/${day} ${ampm} ${h12}:${mm}`;
}

function getTimeUntil(iso: string): string {
  const now = Date.now();
  const target = new Date(iso).getTime();
  const diff = target - now;
  if (diff < 0) return '알림 시간 지남';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}일 ${hours % 24}시간 후`;
  }
  if (hours > 0) return `${hours}시간 ${mins}분 후`;
  return `${mins}분 후`;
}

export function SmartScheduler({
  scanId,
  caption,
  hashtags,
  affiliateUrl,
  platform = 'shortform',
}: SmartSchedulerProps) {
  const [schedules, setSchedules] = useState<UploadSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number>(-1);
  const [customHour, setCustomHour] = useState('20');
  const [customMinute, setCustomMinute] = useState('0');
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported' | 'unknown'>('unknown');
  const [firedPopup, setFiredPopup] = useState<UploadSchedule | null>(null);
  const [copied, setCopied] = useState(false);

  type NotificationPermission = 'granted' | 'denied' | 'default';

  // Check notification permission on mount
  useEffect(() => {
    if (Platform.OS !== 'web') {
      setNotificationPermission('unsupported');
      return;
    }
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    setNotificationPermission(Notification.permission as NotificationPermission);
  }, []);

  // Request notification permission
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web' || !('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    setNotificationPermission(result as NotificationPermission);
    return result === 'granted';
  }, []);

  // Load schedules from DB
  const loadSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryErr } = await supabase
        .from('upload_schedules')
        .select('*')
        .eq('scan_id', scanId)
        .order('scheduled_time', { ascending: true });
      if (queryErr) {
        setError('알림 일정을 불러오지 못했어요.');
      } else {
        setSchedules((data || []) as UploadSchedule[]);
      }
    } catch {
      setError('네트워크 오류가 발생했어요.');
    }
    setLoading(false);
  }, [scanId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Check for due schedules and fire notifications
  useEffect(() => {
    if (notificationPermission !== 'granted') return;
    const interval = setInterval(() => {
      const now = Date.now();
      schedules.forEach((sched) => {
        if (sched.status !== 'pending' || !sched.notification_enabled) return;
        const target = new Date(sched.scheduled_time).getTime();
        if (target <= now && (!sched.fired_at || new Date(sched.fired_at).getTime() < now - 1000)) {
          fireNotification(sched);
        }
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [schedules, notificationPermission]);

  const fireNotification = useCallback(async (sched: UploadSchedule) => {
    if (Platform.OS === 'web' && 'Notification' in window && Notification.permission === 'granted') {
      const platformLabel = sched.platform ? PLATFORM_LABELS[sched.platform] || sched.platform : 'SNS';
      const notif = new Notification('골든타임 업로드 알림', {
        body: `${platformLabel} 업로드 시간이에요! 지금 바로 올려보세요.`,
        tag: sched.id,
      });
      notif.onclick = () => {
        window.focus();
        setFiredPopup(sched);
      };
    }
    // Mark as fired in DB
    await supabase
      .from('upload_schedules')
      .update({ status: 'fired', fired_at: new Date().toISOString() })
      .eq('id', sched.id);
    setSchedules((prev) =>
      prev.map((s) => (s.id === sched.id ? { ...s, status: 'fired', fired_at: new Date().toISOString() } : s)),
    );
    setFiredPopup(sched);
  }, []);

  const handleSchedule = useCallback(async () => {
    let hour: number;
    let minute: number;
    if (isCustomTime) {
      hour = parseInt(customHour, 10) || 20;
      minute = parseInt(customMinute, 10) || 0;
    } else if (selectedPreset >= 0) {
      const preset = GOLDEN_TIME_PRESETS[selectedPreset];
      hour = preset.hour;
      minute = preset.minute;
    } else {
      return;
    }
    hour = Math.min(Math.max(hour, 0), 23);
    minute = Math.min(Math.max(minute, 0), 59);

    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, minute, 0, 0);
    if (scheduled.getTime() <= now.getTime()) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    setSaving(true);
    setError(null);

    let permGranted = notificationPermission === 'granted';
    if (notificationPermission === 'default') {
      permGranted = await requestNotificationPermission();
    }

    try {
      const { error: insertErr } = await supabase.from('upload_schedules').insert({
        scan_id: scanId,
        scheduled_time: scheduled.toISOString(),
        platform,
        caption,
        hashtags,
        affiliate_url: affiliateUrl || null,
        status: 'pending',
        notification_enabled: permGranted,
      });
      if (insertErr) {
        setError('알림 예약에 실패했어요.');
      } else {
        setShowTimePicker(false);
        setSelectedPreset(-1);
        await loadSchedules();
      }
    } catch {
      setError('네트워크 오류가 발생했어요.');
    }
    setSaving(false);
  }, [isCustomTime, customHour, customMinute, selectedPreset, notificationPermission, scanId, platform, caption, hashtags, affiliateUrl, requestNotificationPermission, loadSchedules]);

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from('upload_schedules').delete().eq('id', id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleDismiss = useCallback(async (id: string) => {
    await supabase
      .from('upload_schedules')
      .update({ status: 'dismissed' })
      .eq('id', id);
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'dismissed' } : s)));
    setFiredPopup(null);
  }, []);

  const handleCopyCaption = useCallback(async (sched: UploadSchedule) => {
    const parts: string[] = [];
    if (sched.caption) parts.push(sched.caption);
    if (sched.hashtags && sched.hashtags.length > 0) {
      parts.push(sched.hashtags.map((h) => `#${h}`).join(' '));
    }
    if (sched.affiliate_url) parts.push(sched.affiliate_url);
    const text = parts.join('\n\n');
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        await Clipboard.setStringAsync(text);
      }
    } else {
      await Clipboard.setStringAsync(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const pendingSchedules = useMemo(() => schedules.filter((s) => s.status === 'pending'), [schedules]);
  const firedSchedules = useMemo(() => schedules.filter((s) => s.status === 'fired'), [schedules]);

  const canSchedule = !!caption && !!scanId;

  if (!canSchedule) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BellRing size={16} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.title}>스마트 업로드 알림</Text>
        </View>
        {notificationPermission === 'denied' && (
          <TouchableOpacity style={styles.permBtn} onPress={requestNotificationPermission} activeOpacity={0.7}>
            <Text style={styles.permBtnText}>알림 허용</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.desc}>
        골든타임에 푸시 알림을 보내드려요. 알림 시간에 캡션과 해시태그가 원클릭으로 복사되어 바로 업로드할 수 있어요.
      </Text>

      {notificationPermission === 'unsupported' && (
        <View style={styles.noticeBox}>
          <Info size={11} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={styles.noticeText}>
            모바일 앱에서는 브라우저 알림 대신 예약 시간이 표시됩니다. 웹에서 사용하면 푸시 알림을 받을 수 있어요.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.scheduleBtn}
        onPress={() => setShowTimePicker(true)}
        activeOpacity={0.8}
      >
        <Calendar size={14} color="#fff" strokeWidth={2} />
        <Text style={styles.scheduleBtnText}>골든타임 알림 예약하기</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.primary[400]} />
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Info size={11} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && pendingSchedules.length === 0 && firedSchedules.length === 0 && (
        <Text style={styles.emptyText}>예약된 알림이 없어요. 골든타임에 맞춰 예약해보세요.</Text>
      )}

      {pendingSchedules.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>대기 중인 알림</Text>
          {pendingSchedules.map((sched) => (
            <View key={sched.id} style={styles.scheduleCard}>
              <View style={styles.scheduleCardLeft}>
                <View style={styles.scheduleTimeIcon}>
                  <Clock size={12} color={theme.colors.primary[400]} strokeWidth={2} />
                </View>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleTime}>{formatTime(sched.scheduled_time)}</Text>
                  <Text style={styles.scheduleCountdown}>{getTimeUntil(sched.scheduled_time)}</Text>
                  {sched.platform && (
                    <Text style={styles.schedulePlatform}>{PLATFORM_LABELS[sched.platform] || sched.platform}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(sched.id)}
                activeOpacity={0.7}
              >
                <Trash2 size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {firedSchedules.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>전송된 알림</Text>
          {firedSchedules.slice(0, 5).map((sched) => (
            <View key={sched.id} style={[styles.scheduleCard, styles.firedCard]}>
              <View style={styles.scheduleCardLeft}>
                <View style={[styles.scheduleTimeIcon, styles.firedIcon]}>
                  <Check size={12} color={theme.colors.success[400]} strokeWidth={2} />
                </View>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleTime}>{formatTime(sched.scheduled_time)}</Text>
                  <Text style={styles.firedLabel}>알림 전송 완료</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.copyBtnSmall}
                onPress={() => handleCopyCaption(sched)}
                activeOpacity={0.7}
              >
                <Copy size={11} color={theme.colors.primary[300]} strokeWidth={2} />
                <Text style={styles.copyBtnSmallText}>복사</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>골든타임 선택</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)} activeOpacity={0.7}>
                <X size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>플랫폼별 피크 시간대를 추천해드려요. 원하는 시간을 선택하세요.</Text>

            <ScrollView style={styles.presetList}>
              {GOLDEN_TIME_PRESETS.map((preset, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.presetRow, !isCustomTime && selectedPreset === i && styles.presetRowActive]}
                  onPress={() => {
                    setSelectedPreset(i);
                    setIsCustomTime(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.presetRowLeft}>
                    <Clock size={14} color={!isCustomTime && selectedPreset === i ? theme.colors.primary[400] : theme.colors.dark.textDim} strokeWidth={2} />
                    <Text style={[styles.presetText, !isCustomTime && selectedPreset === i && styles.presetTextActive]}>
                      {preset.label}
                    </Text>
                  </View>
                  {!isCustomTime && selectedPreset === i && (
                    <Check size={14} color={theme.colors.primary[400]} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.presetRow, isCustomTime && styles.presetRowActive]}
                onPress={() => setIsCustomTime(true)}
                activeOpacity={0.7}
              >
                <View style={styles.presetRowLeft}>
                  <Sparkles size={14} color={isCustomTime ? theme.colors.primary[400] : theme.colors.dark.textDim} strokeWidth={2} />
                  <Text style={[styles.presetText, isCustomTime && styles.presetTextActive]}>직접 시간 입력</Text>
                </View>
                {isCustomTime && <Check size={14} color={theme.colors.primary[400]} strokeWidth={2} />}
              </TouchableOpacity>

              {isCustomTime && (
                <View style={styles.customTimeRow}>
                  <TextInput
                    style={styles.timeInput}
                    value={customHour}
                    onChangeText={setCustomHour}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="20"
                  />
                  <Text style={styles.timeColon}>:</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={customMinute}
                    onChangeText={setCustomMinute}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="00"
                  />
                  <Text style={styles.timeHint}>시 (24시간제)</Text>
                </View>
              )}
            </ScrollView>

            {notificationPermission === 'default' && (
              <View style={styles.permNotice}>
                <Bell size={11} color={theme.colors.warning[400]} strokeWidth={2} />
                <Text style={styles.permNoticeText}>예약 시 브라우저 알림 권한을 요청해요.</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.confirmBtn, (!isCustomTime && selectedPreset < 0) && styles.confirmBtnDisabled]}
              onPress={handleSchedule}
              disabled={(!isCustomTime && selectedPreset < 0) || saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>알림 예약하기</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fired Popup — one-click caption copy */}
      <Modal visible={!!firedPopup} transparent animationType="slide" onRequestClose={() => setFiredPopup(null)}>
        <View style={styles.firedOverlay}>
          <View style={styles.firedPopupContent}>
            <View style={styles.firedPopupHeader}>
              <View style={styles.firedPopupIcon}>
                <BellRing size={24} color="#fff" strokeWidth={2} />
              </View>
              <Text style={styles.firedPopupTitle}>골든타임이에요!</Text>
              <Text style={styles.firedPopupSub}>
                {firedPopup?.platform ? PLATFORM_LABELS[firedPopup.platform] || firedPopup.platform : 'SNS'} 업로드 시간입니다
              </Text>
            </View>

            {firedPopup?.caption && (
              <View style={styles.firedPreviewBox}>
                <Text style={styles.firedPreviewLabel}>캡션</Text>
                <Text style={styles.firedPreviewText} numberOfLines={4}>{firedPopup.caption}</Text>
              </View>
            )}

            {firedPopup?.hashtags && firedPopup.hashtags.length > 0 && (
              <View style={styles.firedPreviewBox}>
                <Text style={styles.firedPreviewLabel}>해시태그</Text>
                <Text style={styles.firedPreviewText} numberOfLines={2}>
                  {firedPopup.hashtags.map((h) => `#${h}`).join(' ')}
                </Text>
              </View>
            )}

            {firedPopup?.affiliate_url && (
              <View style={styles.firedPreviewBox}>
                <Text style={styles.firedPreviewLabel}>링크</Text>
                <Text style={styles.firedPreviewText} numberOfLines={1}>{firedPopup.affiliate_url}</Text>
              </View>
            )}

            <View style={styles.firedActions}>
              <TouchableOpacity
                style={styles.firedCopyBtn}
                onPress={() => firedPopup && handleCopyCaption(firedPopup)}
                activeOpacity={0.8}
              >
                <Copy size={14} color="#fff" strokeWidth={2} />
                <Text style={styles.firedCopyBtnText}>{copied ? '복사 완료!' : '캡션+해시태그 복사'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.firedDismissBtn}
                onPress={() => firedPopup && handleDismiss(firedPopup.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.firedDismissBtnText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  desc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
    marginBottom: 10,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.warning[500] + '30',
    marginBottom: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
    lineHeight: 14,
  },
  permBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[500] + '20',
  },
  permBtnText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    marginBottom: 10,
  },
  scheduleBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  loadingBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.error[500] + '12',
    borderWidth: 1,
    borderColor: theme.colors.error[500] + '30',
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  emptyText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    paddingVertical: 12,
  },
  sectionWrap: {
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginBottom: 6,
  },
  firedCard: {
    opacity: 0.7,
  },
  scheduleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  scheduleTimeIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  firedIcon: {
    backgroundColor: theme.colors.success[500] + '18',
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleTime: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  scheduleCountdown: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300],
    marginTop: 1,
  },
  schedulePlatform: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 1,
  },
  firedLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.success[400],
    marginTop: 1,
  },
  deleteBtn: {
    padding: 6,
  },
  copyBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[500] + '18',
  },
  copyBtnSmallText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  modalDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: 12,
    lineHeight: 16,
  },
  presetList: {
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginBottom: 5,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetRowActive: {
    borderColor: theme.colors.primary[400],
    backgroundColor: theme.colors.primary[500] + '15',
  },
  presetRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  presetText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  presetTextActive: {
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  customTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  timeInput: {
    width: 44,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    color: theme.colors.dark.text,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  timeColon: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  timeHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginLeft: 4,
  },
  permNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.warning[500] + '10',
    marginBottom: 10,
  },
  permNoticeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.warning[400],
  },
  confirmBtn: {
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  firedOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
  },
  firedPopupContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.primary[500] + '40',
  },
  firedPopupHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  firedPopupIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  firedPopupTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 4,
  },
  firedPopupSub: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  firedPreviewBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 8,
  },
  firedPreviewLabel: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 3,
  },
  firedPreviewText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  firedActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  firedCopyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  firedCopyBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  firedDismissBtn: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  firedDismissBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
});
