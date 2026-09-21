import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Switch,
  Platform,
  Linking,
} from 'react-native';
import { X, Check, Share2, CreditCard as Edit3, Eye, ShieldCheck, Link2, Camera, Film, FileText, Hash, Sparkles } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface UploadPreviewData {
  platformKey: string;
  platformLabel: string;
  platformColor: string;
  platformIcon: React.ReactNode;
  mediaUri: string | null;
  mediaType: 'photo' | 'video' | null;
  caption: string;
  affiliateUrl: string;
  disclosureText: string;
  autoDisclosure: boolean;
  templateLabel: string;
  productName: string;
}

interface UploadPreviewModalProps {
  visible: boolean;
  data: UploadPreviewData | null;
  onConfirm: (edited: { caption: string; affiliateUrl: string; autoDisclosure: boolean }) => void;
  onClose: () => void;
}

type Mode = 'preview' | 'edit';

export function UploadPreviewModal({ visible, data, onConfirm, onClose }: UploadPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('preview');
  const [caption, setCaption] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [autoDisclosure, setAutoDisclosure] = useState(true);

  useMemo(() => {
    if (data) {
      setCaption(data.caption);
      setAffiliateUrl(data.affiliateUrl);
      setAutoDisclosure(data.autoDisclosure);
      setMode('preview');
    }
  }, [data]);

  if (!data) return null;

  const platformIcon = data.platformIcon;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <X size={22} color={theme.colors.dark.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{data.mediaType === 'photo' ? '이미지 최종 확인' : '영상 최종 확인'}</Text>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'preview' && styles.modeBtnActive]}
              onPress={() => setMode('preview')}
            >
              <Eye size={14} color={mode === 'preview' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={[styles.modeBtnText, mode === 'preview' && styles.modeBtnTextActive]}>미리보기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'edit' && styles.modeBtnActive]}
              onPress={() => setMode('edit')}
            >
              <Edit3 size={14} color={mode === 'edit' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={[styles.modeBtnText, mode === 'edit' && styles.modeBtnTextActive]}>수정</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Platform badge */}
          <View style={[styles.platformBadge, { borderColor: data.platformColor + '40', backgroundColor: data.platformColor + '12' }]}>
            <View style={[styles.platformBadgeIcon, { backgroundColor: data.platformColor + '20' }]}>
              {platformIcon}
            </View>
            <View style={styles.platformBadgeInfo}>
              <Text style={[styles.platformBadgeLabel, { color: data.platformColor }]}>{data.platformLabel}</Text>
              <Text style={styles.platformBadgeHint}>업로드할 플랫폼</Text>
            </View>
          </View>

          {/* Media preview */}
          {data.mediaUri ? (
            <View style={styles.mediaWrap}>
              <View style={styles.finalCheckBadge}>
                <ShieldCheck size={13} color={theme.colors.success[400]} strokeWidth={2} />
                <Text style={styles.finalCheckBadgeText}>게시 전 최종 확인</Text>
              </View>
              {data.mediaType === 'video' ? (
                <View style={styles.videoPlaceholder}>
                  <Film size={40} color={theme.colors.dark.textDim} strokeWidth={1.5} />
                  <Text style={styles.videoPlaceholderText}>동영상 미리보기</Text>
                </View>
              ) : (
                <Image source={{ uri: data.mediaUri }} style={styles.mediaImage} resizeMode="cover" />
              )}
              {data.templateLabel ? (
                <View style={styles.templateTag}>
                  <Sparkles size={10} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.templateTagText}>{data.templateLabel}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.mediaEmpty}>
              <Camera size={32} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
              <Text style={styles.mediaEmptyText}>선택된 미디어가 없습니다</Text>
            </View>
          )}

          {data.productName ? (
            <View style={styles.productNameBox}>
              <Text style={styles.productNameLabel}>상품명</Text>
              <Text style={styles.productNameValue}>{data.productName}</Text>
            </View>
          ) : null}

          {mode === 'preview' ? (
            <PreviewMode
              data={data}
              caption={caption}
              affiliateUrl={affiliateUrl}
              autoDisclosure={autoDisclosure}
            />
          ) : (
            <EditMode
              caption={caption}
              setCaption={setCaption}
              affiliateUrl={affiliateUrl}
              setAffiliateUrl={setAffiliateUrl}
              autoDisclosure={autoDisclosure}
              setAutoDisclosure={setAutoDisclosure}
              disclosureText={data.disclosureText}
            />
          )}
        </ScrollView>

        {/* Bottom action bar */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.uploadBtn, { backgroundColor: data.platformColor }]}
            onPress={() => onConfirm({ caption, affiliateUrl, autoDisclosure })}
            activeOpacity={0.8}
          >
            <Share2 size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.uploadBtnText}>저장 후 {data.platformLabel} 게시판 열기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PreviewMode({
  data,
  caption,
  affiliateUrl,
  autoDisclosure,
}: {
  data: UploadPreviewData;
  caption: string;
  affiliateUrl: string;
  autoDisclosure: boolean;
}) {
  return (
    <View style={styles.previewSection}>
      <Text style={styles.previewSectionLabel}>{data.mediaType === 'photo' ? '생성 이미지와 문구 최종 확인' : '생성 영상과 문구 최종 확인'}</Text>
      <View style={styles.captionCard}>
        {autoDisclosure && data.disclosureText ? (
          <>
            <Text style={styles.captionDisclosure}>{data.disclosureText}</Text>
            <Text style={styles.captionDivider}>{'─'.repeat(24)}</Text>
          </>
        ) : null}
        <Text style={styles.captionContent}>
          {caption || '마케팅 문구가 여기에 표시됩니다.'}
        </Text>
        {affiliateUrl.trim() ? (
          <Text style={styles.captionLink} numberOfLines={2}>{affiliateUrl.trim()}</Text>
        ) : null}
      </View>

      {/* Summary items */}
      <View style={styles.summaryList}>
        <SummaryRow icon={<FileText size={16} color={theme.colors.primary[300]} strokeWidth={2} />} label="템플릿" value={data.templateLabel || '선택 안 됨'} />
        <SummaryRow icon={<Link2 size={16} color={theme.colors.accent[400]} strokeWidth={2} />} label="제휴 링크" value={affiliateUrl.trim() ? '연결됨' : '없음'} />
        <SummaryRow
          icon={<ShieldCheck size={16} color={autoDisclosure ? theme.colors.success[400] : theme.colors.dark.textDim} strokeWidth={2} />}
          label="공정위 문구"
          value={autoDisclosure ? '자동 추가됨' : '미사용'}
        />
      </View>
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      {icon}
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function EditMode({
  caption,
  setCaption,
  affiliateUrl,
  setAffiliateUrl,
  autoDisclosure,
  setAutoDisclosure,
  disclosureText,
}: {
  caption: string;
  setCaption: (v: string) => void;
  affiliateUrl: string;
  setAffiliateUrl: (v: string) => void;
  autoDisclosure: boolean;
  setAutoDisclosure: (v: boolean) => void;
  disclosureText: string;
}) {
  return (
    <View style={styles.editSection}>
      <Text style={styles.editLabel}>{'마케팅 문구 수정'}</Text>
      <TextInput
        style={styles.captionInput}
        value={caption}
        onChangeText={setCaption}
        placeholder="마케팅 문구를 입력하세요..."
        placeholderTextColor={theme.colors.dark.textFaint}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      <Text style={styles.editLabel}>제휴 링크 수정</Text>
      <TextInput
        style={styles.linkInput}
        value={affiliateUrl}
        onChangeText={setAffiliateUrl}
        placeholder="제휴 링크 URL"
        placeholderTextColor={theme.colors.dark.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        multiline
      />

      <TouchableOpacity
        style={styles.disclosureToggle}
        onPress={() => setAutoDisclosure(!autoDisclosure)}
        activeOpacity={0.7}
      >
        <View style={styles.disclosureToggleInfo}>
          <ShieldCheck size={18} color={theme.colors.success[400]} strokeWidth={2} />
          <View style={styles.disclosureToggleTextWrap}>
            <Text style={styles.disclosureToggleTitle}>공정위 문구 자동 추가</Text>
            <Text style={styles.disclosureToggleDesc}>
              캡션 최상단에 제휴 광고 문구가 자동으로 들어갑니다
            </Text>
          </View>
        </View>
        <Switch
          value={autoDisclosure}
          onValueChange={setAutoDisclosure}
          trackColor={{ false: theme.colors.dark.border, true: theme.colors.success[500] }}
          thumbColor="#fff"
        />
      </TouchableOpacity>

      {autoDisclosure && disclosureText ? (
        <View style={styles.disclosurePreviewBox}>
          <Text style={styles.disclosurePreviewLabel}>추가될 문구</Text>
          <Text style={styles.disclosurePreviewText}>{disclosureText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.glass.border,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.full,
    padding: 3,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  modeBtnActive: {
    backgroundColor: theme.colors.primary[500],
  },
  modeBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  modeBtnTextActive: {
    color: '#fff',
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    marginTop: theme.spacing.md,
    borderWidth: 1.5,
  },
  platformBadgeIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformBadgeInfo: {
    flex: 1,
  },
  platformBadgeLabel: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
  },
  platformBadgeHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  mediaWrap: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginTop: theme.spacing.md,
    position: 'relative',
  },
  finalCheckBadge: {
    position: 'absolute',
    zIndex: 2,
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(10, 15, 30, 0.82)',
  },
  finalCheckBadgeText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 0.8,
    backgroundColor: '#000',
  },
  videoPlaceholder: {
    width: '100%',
    aspectRatio: 0.8,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  videoPlaceholderText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  templateTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
  },
  templateTagText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  mediaEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    gap: 8,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    marginTop: theme.spacing.md,
  },
  mediaEmptyText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  productNameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
  },
  productNameLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  productNameValue: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  previewSection: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  previewSectionLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  captionCard: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.glass.border,
    gap: 6,
  },
  captionDisclosure: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.success[400],
    lineHeight: 16,
  },
  captionDivider: {
    fontSize: 10,
    color: theme.colors.dark.textFaint,
    lineHeight: 14,
  },
  captionContent: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 19,
  },
  captionLink: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.accent[400],
    marginTop: 2,
  },
  summaryList: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.glass.border,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    flex: 1,
  },
  summaryValue: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  editSection: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  editLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  captionInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    borderWidth: 1.5,
    borderColor: theme.glass.border,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  linkInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    borderWidth: 1.5,
    borderColor: theme.glass.border,
    minHeight: 50,
  },
  disclosureToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.glass.border,
  },
  disclosureToggleInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  disclosureToggleTextWrap: {
    flex: 1,
    gap: 2,
  },
  disclosureToggleTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  disclosureToggleDesc: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
  },
  disclosurePreviewBox: {
    backgroundColor: theme.colors.success[500] + '12',
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.colors.success[400] + '30',
  },
  disclosurePreviewLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    marginBottom: 4,
  },
  disclosurePreviewText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.success[400],
    lineHeight: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: theme.glass.border,
    backgroundColor: theme.glass.surface,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(16px)' as unknown as undefined } : {}),
  },
  cancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.glass.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    ...theme.shadows.elevated,
  },
  uploadBtnText: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
