import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coins, X, Check, Zap, TrendingUp, History } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  getCreditBalance,
  getCreditHistory,
  addCredits,
  CREDIT_PACKAGES,
  formatKRW,
  formatCredits,
  type CreditBalance,
  type CreditTransaction,
} from '@/lib/credits';

interface CreditPurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchased?: () => void;
}

export function CreditPurchaseModal({ visible, onClose, onPurchased }: CreditPurchaseModalProps) {
  const insets = useSafeAreaInsets();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadData = useCallback(async () => {
    const [bal, hist] = await Promise.all([getCreditBalance(), getCreditHistory(10)]);
    setBalance(bal);
    setHistory(hist);
  }, []);

  useEffect(() => {
    if (visible) {
      loadData();
      setError(null);
      setSuccess(false);
      setShowHistory(false);
    }
  }, [visible, loadData]);

  const handlePurchase = async (packageId: string, credits: number, price: number, name: string) => {
    setPurchasing(packageId);
    setError(null);
    try {
      await addCredits(credits, 'purchase', `${name} 구매`, packageId);
      await loadData();
      setSuccess(true);
      onPurchased?.();
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '충전 중 오류가 발생했습니다');
    }
    setPurchasing(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalContainer, { marginBottom: insets.bottom > 0 ? insets.bottom : 0 }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Coins size={22} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.title}>크레딧 충전</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <X size={20} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {balance && (
            <View style={styles.balanceCard}>
              <View style={styles.balanceIconWrap}>
                <Zap size={18} color="#fff" strokeWidth={2} />
              </View>
              <View style={styles.balanceInfo}>
                <Text style={styles.balanceLabel}>현재 보유 크레딧</Text>
                <Text style={styles.balanceValue}>{balance.balance.toLocaleString()}</Text>
              </View>
              <View style={styles.balanceStats}>
                <View style={styles.balanceStatRow}>
                  <TrendingUp size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                  <Text style={styles.balanceStatText}>{balance.total_consumed} 사용</Text>
                </View>
              </View>
            </View>
          )}

          {success && (
            <View style={styles.successBanner}>
              <Check size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.successText}>충전이 완료되었습니다</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <X size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>충전 패키지 선택</Text>
            {CREDIT_PACKAGES.map((pkg) => {
              const perCredit = Math.round(pkg.price / pkg.credits);
              return (
                <TouchableOpacity
                  key={pkg.id}
                  style={styles.packageCard}
                  onPress={() => handlePurchase(pkg.id, pkg.credits, pkg.price, pkg.name)}
                  disabled={purchasing !== null}
                  activeOpacity={0.8}
                >
                  <View style={styles.packageLeft}>
                    <View style={styles.packageCreditsWrap}>
                      <Text style={styles.packageCredits}>{pkg.credits}</Text>
                      <Text style={styles.packageCreditsUnit}>크레딧</Text>
                    </View>
                    {pkg.badge && (
                      <View style={styles.packageBadge}>
                        <Text style={styles.packageBadgeText}>{pkg.badge}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.packageRight}>
                    <Text style={styles.packagePerCredit}>크레딧당 {perCredit}원</Text>
                    <Text style={styles.packagePrice}>{formatKRW(pkg.price)}</Text>
                    <View style={[styles.buyBtn, purchasing === pkg.id && styles.buyBtnDisabled]}>
                      {purchasing === pkg.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.buyBtnText}>충전하기</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.historyToggle}
              onPress={() => setShowHistory(!showHistory)}
              activeOpacity={0.7}
            >
              <History size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.historyToggleText}>사용 내역</Text>
            </TouchableOpacity>

            {showHistory && (
              <View style={styles.historyList}>
                {history.length === 0 ? (
                  <Text style={styles.historyEmpty}>아직 사용 내역이 없습니다</Text>
                ) : (
                  history.map((tx) => (
                    <View key={tx.id} style={styles.historyRow}>
                      <View style={styles.historyLeft}>
                        <View style={[
                          styles.historyIcon,
                          tx.amount > 0 ? styles.historyIconPlus : styles.historyIconMinus,
                        ]}>
                          <Text style={styles.historyIconText}>
                            {tx.amount > 0 ? '+' : ''}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.historyDesc}>{tx.description || (tx.amount > 0 ? '충전' : '사용')}</Text>
                          <Text style={styles.historyDate}>
                            {new Date(tx.created_at).toLocaleDateString('ko-KR')}
                          </Text>
                        </View>
                      </View>
                      <Text style={[
                        styles.historyAmount,
                        tx.amount > 0 ? styles.historyAmountPlus : styles.historyAmountMinus,
                      ]}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>

          <Text style={styles.footerNote}>
            결제 시스템 연동 전까지는 테스트용으로 즉시 충전됩니다.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  closeBtn: {
    padding: 4,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  balanceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceInfo: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  balanceValue: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  balanceStats: {
    alignItems: 'flex-end',
  },
  balanceStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceStatText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.success[500] + '20',
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  successText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.error[500] + '20',
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  scrollArea: {
    maxHeight: 380,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.sm,
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  packageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  packageCreditsWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  packageCredits: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  packageCreditsUnit: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  packageBadge: {
    backgroundColor: theme.colors.warning[500],
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  packageBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  packageRight: {
    alignItems: 'flex-end',
  },
  packagePerCredit: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  packagePrice: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginTop: 2,
  },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary[600],
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  buyBtnDisabled: {
    opacity: 0.6,
  },
  buyBtnText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  historyToggleText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  historyList: {
    gap: 8,
    paddingBottom: theme.spacing.md,
  },
  historyEmpty: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyIconPlus: {
    backgroundColor: theme.colors.success[500] + '20',
  },
  historyIconMinus: {
    backgroundColor: theme.colors.error[500] + '20',
  },
  historyIconText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
  },
  historyDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  historyDate: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
  },
  historyAmountPlus: {
    color: theme.colors.success[400],
  },
  historyAmountMinus: {
    color: theme.colors.error[400],
  },
  footerNote: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});
