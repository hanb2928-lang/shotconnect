import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Shield, Clock, X, TrendingDown } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  checkShareCooldown,
  formatCooldownTime,
  type CooldownResult,
} from '@/lib/shareCooldown';

interface ShareCooldownModalProps {
  visible: boolean;
  onClose: () => void;
  onProceed?: () => void;
  platform?: string;
}

export function ShareCooldownModal({ visible, onClose, onProceed, platform }: ShareCooldownModalProps) {
  const [cooldown, setCooldown] = useState<CooldownResult | null>(null);

  useEffect(() => {
    if (visible) {
      checkShareCooldown().then(setCooldown);
    }
  }, [visible]);

  const formatTime = useCallback((ms: number) => formatCooldownTime(ms), []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconWrap}>
            <Shield size={32} color={theme.colors.warning[400]} strokeWidth={2} />
          </View>

          {/* Title */}
          <Text style={styles.title}>알고리즘 안정성 경고</Text>

          {/* Body */}
          {cooldown?.shouldBlock ? (
            <>
              <Text style={styles.bodyText}>
                최근 10분간 {cooldown.recentActions}회 이상 연속 업로드/복사를 하셨습니다.
                {'\n\n'}
                플랫폼 알고리즘이 스팸으로 감지할 위험이 높습니다.{' '}
                <Text style={styles.boldText}>
                  {formatTime(cooldown.remainingCooldown)} 후에 다시 시도하는 것을 권장합니다.
                </Text>
              </Text>

              {/* Cooldown timer card */}
              <View style={styles.timerCard}>
                <Clock size={14} color={theme.colors.warning[400]} strokeWidth={2} />
                <Text style={styles.timerLabel}>권장 대기 시간</Text>
                <Text style={styles.timerValue}>{formatTime(cooldown.remainingCooldown)}</Text>
              </View>

              {/* Risk indicators */}
              <View style={styles.riskRow}>
                <View style={styles.riskItem}>
                  <TrendingDown size={12} color={theme.colors.error[400]} strokeWidth={2} />
                  <Text style={styles.riskText}>계정 노출도 감소 위험</Text>
                </View>
                <View style={styles.riskItem}>
                  <TrendingDown size={12} color={theme.colors.error[400]} strokeWidth={2} />
                  <Text style={styles.riskText}>스팸 플래그 위험</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.bodyText}>
                최근 10분간 {cooldown?.recentActions ?? 0}회 업로드/복사 활동이 감지되었습니다.
                {'\n\n'}
                연속 업로드는 플랫폼 알고리즘이 스팸으로 감지할 수 있습니다.{' '}
                <Text style={styles.boldText}>1시간 간격을 두고 업로드하는 것을 권장합니다.</Text>
              </Text>

              {/* Safety tips */}
              <View style={styles.tipsBox}>
                <Text style={styles.tipsTitle}>안전한 업로드 팁</Text>
                <Text style={styles.tipItem}>• 한 번에 1~2개씩만 업로드</Text>
                <Text style={styles.tipItem}>• 플랫폼별로 30분 이상 간격</Text>
                <Text style={styles.tipItem}>• 같은 문구 반복 사용 피하기</Text>
              </View>
            </>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.waitBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.waitBtnText}>기다릴게요</Text>
            </TouchableOpacity>
            {cooldown?.shouldBlock ? null : (
              <TouchableOpacity
                style={styles.proceedBtn}
                onPress={() => {
                  onClose();
                  onProceed?.();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.proceedBtnText}>
                  {platform ? `${platform}에 계속` : '그래도 진행'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: 24,
    position: 'relative',
    ...theme.shadows.card,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.warning[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  boldText: {
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500] + '15',
    marginBottom: 16,
    justifyContent: 'center',
  },
  timerLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  timerValue: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  riskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  riskText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  tipsBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 6,
  },
  tipItem: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  waitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    alignItems: 'center',
  },
  waitBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  proceedBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500],
    alignItems: 'center',
  },
  proceedBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
