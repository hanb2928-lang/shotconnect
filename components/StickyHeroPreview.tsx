import { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Camera, Wand2, Film, Maximize2 } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type PreviewStep = 'idle' | 'photo' | 'edited' | 'comic';

export interface StickyHeroPreviewProps {
  step: PreviewStep;
  originalImage?: string | null;
  editedImage?: string | null;
  comicFirstImage?: string | null;
  productName?: string;
  onExpand?: () => void;
}

const STEP_CONFIG: Record<PreviewStep, { label: string; icon: typeof Camera; color: string }> = {
  idle: { label: '대기 중', icon: Camera, color: theme.colors.dark.textFaint },
  photo: { label: '1단계: 원본 사진', icon: Camera, color: theme.colors.accent[400] },
  edited: { label: '2단계: 보정 완료', icon: Wand2, color: theme.colors.warning[400] },
  comic: { label: '3단계: 만화숏폼 생성', icon: Film, color: theme.colors.success[400] },
};

export function StickyHeroPreview({
  step,
  originalImage,
  editedImage,
  comicFirstImage,
  productName,
  onExpand,
}: StickyHeroPreviewProps) {
  const displayImage = useMemo(() => {
    if (step === 'comic' && comicFirstImage) return comicFirstImage;
    if (step === 'edited' && editedImage) return editedImage;
    if ((step === 'photo' || step === 'edited' || step === 'comic') && originalImage) return originalImage;
    return null;
  }, [step, originalImage, editedImage, comicFirstImage]);

  const config = STEP_CONFIG[step];
  const Icon = config.icon;

  if (step === 'idle' || !displayImage) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Camera size={28} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
          <Text style={styles.placeholderText}>사진을 업로드하면 여기에 미리보기가 표시됩니다</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.contentRow}>
        <View style={styles.thumbnailWrap}>
          <Image
            source={{ uri: displayImage }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          <View style={[styles.stepBadge, { backgroundColor: config.color + '30' }]}>
            <Icon size={10} color={config.color} strokeWidth={2.5} />
            <Text style={[styles.stepBadgeText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          {productName ? (
            <Text style={styles.productName} numberOfLines={1}>{productName}</Text>
          ) : null}
          <Text style={styles.hintText}>
            {step === 'photo' && 'AI 보정 및 만화숏폼 생성을 진행해주세요'}
            {step === 'edited' && '만화숏폼 자동 생성 버튼을 눌러주세요'}
            {step === 'comic' && '4컷 만화숏폼이 완성되었습니다'}
          </Text>

          {onExpand && (
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={onExpand}
              activeOpacity={0.7}
            >
              <Maximize2 size={12} color="#fff" strokeWidth={2} />
              <Text style={styles.expandBtnText}>전체 화면으로 보기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  placeholder: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  placeholderText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    textAlign: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbnailWrap: {
    position: 'relative',
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  stepBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  stepBadgeText: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.bold,
  },
  infoSection: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  productName: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  hintText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 15,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[500],
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  expandBtnText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
});
