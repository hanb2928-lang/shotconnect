import { View, Text, StyleSheet, TouchableOpacity, Share, Platform, Linking, Modal, Pressable, Image, ScrollView } from 'react-native';
import { Copy, Check, Clapperboard, Download, CloudUpload, Loader as Loader2, Instagram, MessageCircle, Globe, ClipboardCheck, ChevronDown, Share2, X, ExternalLink, Eye, ArrowLeft, Send } from 'lucide-react-native';
import { useRef, useState, useCallback, useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, Easing } from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { getShareDisclosureForPlatforms } from '@/lib/disclosure';
import { smartRedirect } from '@/lib/smartRedirector';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { uploadAssetBlob, saveAssetRecord } from '@/lib/savedAssets';
import { getUserSettings } from '@/lib/settings';
import { recordShareAction, checkShareCooldown, type CooldownResult } from '@/lib/shareCooldown';
import { ShareCooldownModal } from '@/components/ShareCooldownModal';

interface ShareBarProps {
  cardRef: React.RefObject<View | null>;
  shareText: string;
  affiliateUrl: string | null;
  shortUrl?: string | null;
  fileName: string;
  affiliatePlatforms?: string[];
}

export function ShareBar({ cardRef, shareText, affiliateUrl, shortUrl, fileName, affiliatePlatforms = [] }: ShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareModal, setShareModal] = useState<{ url: string; label: string } | null>(null);
  const [previewModal, setPreviewModal] = useState<{ uri: string | null; fullText: string; platformLabel: string; siteUrl: string; platformKey?: string } | null>(null);
  const [autoDisclosure, setAutoDisclosure] = useState(true);
  const [cooldownModal, setCooldownModal] = useState(false);
  const [cooldownInfo, setCooldownInfo] = useState<CooldownResult | null>(null);
  const [pendingShare, setPendingShare] = useState<{ fn: () => void; platform: string } | null>(null);
  const toastAnim = useSharedValue(0);
  const accordionHeight = useSharedValue(0);
  const accordionOpacity = useSharedValue(0);
  const chevronRot = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    getUserSettings().then((s) => { if (mounted && s) setAutoDisclosure(s.auto_disclosure ?? true); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const toggleShareAccordion = useCallback(() => {
    const next = !shareOpen;
    setShareOpen(next);
    chevronRot.value = withTiming(next ? 180 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
    accordionHeight.value = withTiming(next ? 180 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
    accordionOpacity.value = withTiming(next ? 1 : 0, { duration: next ? 250 : 150, easing: Easing.out(Easing.cubic) });
  }, [shareOpen, chevronRot, accordionHeight, accordionOpacity]);

  const accordionContentStyle = useAnimatedStyle(() => ({
    height: accordionHeight.value,
    opacity: accordionOpacity.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRot.value}deg` }],
  }));

  const captureCard = useCallback(async (): Promise<string | null> => {
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        fileName,
      });
      return uri;
    } catch {
      return null;
    }
  }, [cardRef, fileName]);

  const checkBeforeShare = useCallback(async (platform: string, action: () => void): Promise<boolean> => {
    const cooldown = await checkShareCooldown();
    if (cooldown.shouldBlock) {
      setCooldownInfo(cooldown);
      setCooldownModal(true);
      return false;
    }
    if (cooldown.recentActions >= 3 && cooldown.recentActions < 5) {
      // Warning zone — show modal but allow proceed
      setCooldownInfo(cooldown);
      setCooldownModal(true);
      setPendingShare({ fn: action, platform });
      return false;
    }
    await recordShareAction(platform);
    return true;
  }, []);

  const handleCooldownProceed = useCallback(() => {
    setCooldownModal(false);
    if (pendingShare) {
      recordShareAction(pendingShare.platform).then(() => {
        pendingShare.fn();
        setPendingShare(null);
      });
    }
  }, [pendingShare]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    toastAnim.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 350, easing: Easing.out(Easing.back(1.2)) }),
    );
    setTimeout(() => {
      toastAnim.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) });
      setTimeout(() => setToast(null), 450);
    }, 3500);
  }, [toastAnim]);

  const handleSaveToGallery = useCallback(async () => {
    setSharing(true);
    try {
      const uri = await captureCard();
      if (!uri) {
        showToast('이미지 캡처에 실패했어요');
        setSharing(false);
        return;
      }
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = uri;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('이미지를 다운로드했어요');
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          showToast('사진 접근 권한이 필요해요. 설정에서 허용해주세요');
          setSharing(false);
          return;
        }
        const asset = await MediaLibrary.createAssetAsync(uri);
        try {
          await MediaLibrary.createAlbumAsync('숏커넥트', asset, false);
        } catch {
          // Album creation can fail on scoped storage; the asset is already saved to gallery.
        }
        showToast('갤러리에 저장됐어요');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      showToast(msg ? `저장 실패: ${msg}` : '저장 중 오류가 발생했어요');
    }
    setSharing(false);
  }, [captureCard, showToast, fileName]);

  const copyImageToClipboard = useCallback(async (uri: string): Promise<boolean> => {
    if (Platform.OS !== 'web') return false;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      // @ts-ignore ClipboardItem is web-only
      const item = new ClipboardItem({ 'image/png': blob });
      // @ts-ignore navigator.clipboard.write is web-only
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      return false;
    }
  }, []);

  const copyTextToClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (Platform.OS !== 'web') return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);

  const buildShareText = useCallback(() => {
    const disclosureText = getShareDisclosureForPlatforms(affiliatePlatforms, autoDisclosure);
    const shareLink = shortUrl || affiliateUrl;
    const linkLine = shareLink && !shareText.includes(shareLink) ? `\n\n${shareLink}` : '';
    return disclosureText ? `${shareText}${linkLine}\n\n${disclosureText}` : `${shareText}${linkLine}`;
  }, [shareText, affiliateUrl, shortUrl, affiliatePlatforms, autoDisclosure]);

  const executeShare = useCallback(async (uri: string | null, fullText: string, siteUrl: string, label: string, platformKey?: string) => {
    let imageCopied = false;
    let textCopied = false;

    // On web, copy first then open platform
    if (Platform.OS === 'web') {
      if (uri) {
        imageCopied = await copyImageToClipboard(uri);
        if (imageCopied) {
          await new Promise((r) => setTimeout(r, 300));
          textCopied = await copyTextToClipboard(fullText);
        } else {
          textCopied = await copyTextToClipboard(fullText);
        }
      } else {
        textCopied = await copyTextToClipboard(fullText);
      }

      if (imageCopied && textCopied) {
        showToast('홍보 문구와 이미지가 복사됐어요!\n' + label + '에서 붙여넣기(Ctrl+V)만 하세요');
      } else if (imageCopied) {
        showToast('이미지가 복사됐어요!\n' + label + '에서 붙여넣기(Ctrl+V)만 하세요');
      } else if (textCopied) {
        showToast('홍보 문구가 복사됐어요!\n이미지는 아래 버튼으로 저장 후 업로드하세요');
      } else {
        showToast('복사 실패. 수동으로 업로드해주세요');
      }
      setShareModal({ url: siteUrl, label });
    } else {
      // Use smart redirector: clipboard-first, then app launch with web fallback
      if (uri) {
        try {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Share to ${label}` });
        } catch {
          await Share.share({ message: fullText });
        }
      }
      if (platformKey) {
        const result = await smartRedirect(platformKey, fullText, {
          onClipboardCopied: () => {
            showToast('문구가 복사됐어요. 앱이 열리면 붙여넣으세요');
          },
        });
        if (result.method === 'web') {
          showToast(result.message);
        }
      } else {
        Linking.openURL(siteUrl).catch(() => {});
      }
    }
  }, [copyImageToClipboard, copyTextToClipboard, showToast]);

  const startPreview = useCallback(async (siteUrl: string, platformLabel: string, platformKey?: string) => {
    const allowed = await checkBeforeShare(platformLabel, () => {});
    if (!allowed) {
      setPendingShare({ fn: () => {
        setSharing(true);
        captureCard().then((uri) => {
          const fullText = buildShareText();
          setPreviewModal({ uri, fullText, platformLabel, siteUrl, platformKey });
          setSharing(false);
        }).catch(() => {
          showToast('이미지 캡처에 실패했어요');
          setSharing(false);
        });
      }, platform: platformLabel });
      return;
    }
    setSharing(true);
    try {
      const uri = await captureCard();
      const fullText = buildShareText();
      setPreviewModal({ uri, fullText, platformLabel, siteUrl, platformKey });
    } catch {
      showToast('이미지 캡처에 실패했어요');
    }
    setSharing(false);
  }, [captureCard, buildShareText, showToast, checkBeforeShare]);

  const confirmPreview = useCallback(async () => {
    if (!previewModal) return;
    setSharing(true);
    try {
      await executeShare(previewModal.uri, previewModal.fullText, previewModal.siteUrl, previewModal.platformLabel, previewModal.platformKey);
    } finally {
      setSharing(false);
      setPreviewModal(null);
    }
  }, [previewModal, executeShare]);

  const handleNaverShare = useCallback(() => {
    startPreview('https://clip.naver.com', '네이버클립', 'naverBlog');
  }, [startPreview]);

  const handleSaveToCloud = useCallback(async () => {
    setCloudSaving(true);
    try {
      const uri = await captureCard();
      if (!uri) {
        showToast('이미지 캡처에 실패했어요');
        setCloudSaving(false);
        return;
      }

      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        const blob = await res.blob();
        const cloudFileName = fileName.replace(/\.png$/, '') + '-' + Date.now() + '.png';
        const fileUrl = await uploadAssetBlob(blob, cloudFileName, 'image/png');
        if (!fileUrl) {
          showToast('클라우드 업로드에 실패했어요');
          setCloudSaving(false);
          return;
        }
        await saveAssetRecord({
          scan_id: null,
          asset_type: 'image',
          title: '템플릿 카드',
          file_url: fileUrl,
          file_name: cloudFileName,
          file_size: blob.size,
          mime_type: 'image/png',
          platform: affiliatePlatforms[0] || null,
          affiliate_platform: affiliatePlatforms[0] || null,
        });
        showToast('클라우드에 저장됐어요. 내 제작물 탭에서 확인하세요');
      } else {
        showToast('클라우드 저장은 웹에서만 가능해요. 갤러리 저장을 이용하세요');
      }
    } catch {
      showToast('저장 중 오류가 발생했어요');
    }
    setCloudSaving(false);
  }, [captureCard, fileName, affiliatePlatforms, showToast]);

  const handleInstagramShare = useCallback(() => {
    startPreview('https://www.instagram.com', '인스타그램', 'instagram');
  }, [startPreview]);

  const handleKakaoShare = useCallback(() => {
    startPreview('https://accounts.kakao.com/weblogin/share', '카카오톡', 'kakao');
  }, [startPreview]);

  const handleBlogShare = useCallback(() => {
    startPreview('https://blog.naver.com', '네이버 블로그', 'naverBlog');
  }, [startPreview]);

  const toastStyle = useAnimatedStyle(() => ({
    opacity: toastAnim.value,
    transform: [{ translateY: (1 - toastAnim.value) * -10 }],
  }));

  const handleCopyLink = useCallback(async () => {
    const linkToCopy = shortUrl || affiliateUrl;
    if (!linkToCopy) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(linkToCopy);
      } else {
        await Clipboard.setStringAsync(linkToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('링크 복사에 실패했어요');
    }
  }, [shortUrl, affiliateUrl, showToast]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={toggleShareAccordion}
        activeOpacity={0.7}
      >
        <View style={styles.accordionHeaderLeft}>
          <View style={styles.accordionIconWrap}>
            <Share2 size={16} color={theme.colors.accent[400]} strokeWidth={2} />
          </View>
          <Text style={styles.accordionTitle}>SNS 원터치 공유</Text>
        </View>
        <View style={styles.accordionRight}>
          <Text style={styles.accordionCount}>{shareOpen ? '접기' : '펼치기'}</Text>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      <Animated.View style={[styles.accordionContent, accordionContentStyle]} pointerEvents={shareOpen ? 'auto' : 'none'}>
        <View style={styles.buttonRow}>
          <ShareButton
            icon={<Clapperboard size={22} color="#fff" strokeWidth={2} />}
            bg="#03C75A"
            label="네이버클립"
            onPress={handleNaverShare}
            disabled={sharing}
          />
          <ShareButton
            icon={<Instagram size={22} color="#fff" strokeWidth={2} />}
            bg="#E1306C"
            label="인스타"
            onPress={handleInstagramShare}
            disabled={sharing}
          />
          <ShareButton
            icon={<MessageCircle size={22} color="#fff" strokeWidth={2} />}
            bg="#FEE500"
            label="카카오톡"
            onPress={handleKakaoShare}
            disabled={sharing}
          />
          <ShareButton
            icon={<Globe size={22} color="#fff" strokeWidth={2} />}
            bg="#2DB400"
            label="블로그"
            onPress={handleBlogShare}
            disabled={sharing}
          />
        </View>
      </Animated.View>

      {(shortUrl || affiliateUrl) ? (
        <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink} activeOpacity={0.7}>
          {copied ? (
            <Check size={16} color={theme.colors.success[400]} strokeWidth={2} />
          ) : (
            <Copy size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
          )}
          <Text style={[styles.copyText, copied && { color: theme.colors.success[400] }]}>
            {copied ? '링크 복사됨!' : '제휴 링크 복사'}
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={styles.galleryButton}
        onPress={handleSaveToGallery}
        disabled={sharing}
        activeOpacity={0.7}
      >
        <Download size={18} color="#fff" strokeWidth={2.5} />
        <Text style={styles.galleryButtonText}>
          {sharing ? '저장 중...' : '갤러리에 저장'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.cloudButton}
        onPress={handleSaveToCloud}
        disabled={cloudSaving}
        activeOpacity={0.7}
      >
        {cloudSaving ? (
          <Loader2 size={16} color={theme.colors.primary[300]} strokeWidth={2} />
        ) : (
          <CloudUpload size={16} color={theme.colors.primary[300]} strokeWidth={2} />
        )}
        <Text style={styles.cloudButtonText}>
          {cloudSaving ? '저장 중...' : '클라우드에 저장'}
        </Text>
      </TouchableOpacity>
      {toast && (
        <Animated.View style={[styles.toastPopup, toastStyle]} pointerEvents="none">
          <View style={styles.toastIconWrap}>
            <ClipboardCheck size={20} color="#fff" strokeWidth={2.5} />
          </View>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      <Modal visible={!!previewModal} transparent animationType="slide" onRequestClose={() => setPreviewModal(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewModal(null)}>
          <Pressable style={styles.previewSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.previewHeader}>
              <View style={styles.previewHeaderLeft}>
                <Eye size={18} color={theme.colors.primary[400]} strokeWidth={2} />
                <Text style={styles.previewTitle}>공유 전 미리보기</Text>
              </View>
              <TouchableOpacity onPress={() => setPreviewModal(null)} hitSlop={8} activeOpacity={0.7}>
                <X size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.previewPlatformLabel}>
              {previewModal?.platformLabel}에 공유할 내용
            </Text>

            <ScrollView style={styles.previewScroll} showsVerticalScrollIndicator={false}>
              {previewModal?.uri ? (
                <View style={styles.previewImageWrap}>
                  <Image
                    source={{ uri: previewModal.uri }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <View style={styles.previewNoImage}>
                  <Text style={styles.previewNoImageText}>이미지 없음</Text>
                </View>
              )}

              <Text style={styles.previewTextLabel}>홍보 문구</Text>
              <View style={styles.previewTextBox}>
                <Text style={styles.previewTextContent}>
                  {previewModal?.fullText}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.previewBtnRow}>
              <TouchableOpacity
                style={styles.previewBackBtn}
                onPress={() => setPreviewModal(null)}
                activeOpacity={0.7}
              >
                <ArrowLeft size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={styles.previewBackBtnText}>수정하기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.previewConfirmBtn, sharing && { opacity: 0.5 }]}
                onPress={confirmPreview}
                disabled={sharing}
                activeOpacity={0.8}
              >
                {sharing ? (
                  <Loader2 size={16} color="#fff" strokeWidth={2} />
                ) : (
                  <Send size={16} color="#fff" strokeWidth={2} />
                )}
                <Text style={styles.previewConfirmBtnText}>
                  {sharing ? '준비 중...' : '확인 후 공유'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!shareModal} transparent animationType="fade" onRequestClose={() => setShareModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShareModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShareModal(null)} activeOpacity={0.7} hitSlop={8}>
              <X size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.modalIconWrap}>
              <Instagram size={28} color={theme.colors.accent[400]} strokeWidth={2} />
            </View>
            <Text style={styles.modalTitle}>{shareModal?.label}로 이동</Text>
            <Text style={styles.modalDesc}>
              홍보 문구와 이미지가 클립보드에 복사됐어요. {shareModal?.label}에서 붙여넣기(Ctrl+V)하세요.
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalStayBtn} onPress={() => setShareModal(null)} activeOpacity={0.7}>
                <Text style={styles.modalStayBtnText}>이 화면에 머무르기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOpenBtn}
                onPress={() => {
                  if (shareModal) window.open(shareModal.url, '_blank');
                  setShareModal(null);
                }}
                activeOpacity={0.8}
              >
                <ExternalLink size={16} color="#fff" strokeWidth={2.5} />
                <Text style={styles.modalOpenBtnText}>{shareModal?.label} 열기</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <ShareCooldownModal
        visible={cooldownModal}
        onClose={() => {
          setCooldownModal(false);
          setPendingShare(null);
        }}
        onProceed={handleCooldownProceed}
        platform={pendingShare?.platform}
      />
    </View>
  );
}

function ShareButton({
  icon,
  bg,
  label,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.shareButton}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.shareIcon, { backgroundColor: bg }]}>
        {icon}
      </View>
      <Text style={styles.shareLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accordionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accordionTitle: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  accordionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accordionCount: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  accordionContent: {
    overflow: 'hidden',
  },
  label: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: theme.spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  shareButton: {
    alignItems: 'center',
    gap: 6,
  },
  shareIcon: {
    width: 50,
    height: 50,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  copyText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    borderWidth: 1.5,
    borderColor: theme.colors.primary[400],
    ...theme.shadows.card,
  },
  galleryButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  cloudButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500] + '15',
    borderWidth: 1,
    borderColor: theme.colors.primary[400] + '30',
  },
  cloudButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[300],
  },
  toastPopup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.success[400],
    ...theme.shadows.elevated,
  },
  toastIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastText: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
    lineHeight: 22,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    ...theme.shadows.elevated,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: theme.spacing.xs,
  },
  modalDesc: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
  },
  modalStayBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStayBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  modalOpenBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  modalOpenBtnText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  previewSheet: {
    backgroundColor: theme.colors.dark.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    maxHeight: '90%',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  previewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  previewPlatformLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.sm,
  },
  previewScroll: {
    maxHeight: 400,
  },
  previewImageWrap: {
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.surfaceLight,
    marginBottom: theme.spacing.md,
  },
  previewImage: {
    width: '100%',
    height: 240,
    resizeMode: 'contain',
  },
  previewNoImage: {
    height: 100,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  previewNoImageText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  previewTextLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 6,
  },
  previewTextBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  previewTextContent: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 20,
  },
  previewBtnRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  previewBackBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  previewBackBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  previewConfirmBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
  },
  previewConfirmBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
