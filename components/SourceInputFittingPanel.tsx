import { memo, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ViewStyle } from 'react-native';
import { Plus, Check, Upload, UserSquare2, Link2, AlertCircle } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export interface SourceImage {
  id: string;
  uri: string;
  angle?: string;
}

interface Props {
  productImages: SourceImage[];
  modelImage: SourceImage | null;
  onProductImageAdd: (images: SourceImage[]) => void;
  onModelImageSet: (image: SourceImage | null) => void;
  fittingReady: boolean;
  onWebProductPick: () => void;
  onWebModelPick: () => void;
}

const ANGLE_LABELS = ['정면', '좌측', '우측', '후면', '상부'];
const MAX_PRODUCT_IMAGES = 5;
const MIN_PRODUCT_IMAGES = 3;

function SourceInputFittingPanelInner({
  productImages,
  modelImage,
  onProductImageAdd,
  onModelImageSet,
  fittingReady,
  onWebProductPick,
  onWebModelPick,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: SourceImage[] = [];
    const remaining = MAX_PRODUCT_IMAGES - productImages.length;
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      createdUrlsRef.current.push(url);
      newImages.push({
        id: `prod-${Date.now()}-${i}`,
        uri: url,
        angle: ANGLE_LABELS[productImages.length + i] || `사진 ${productImages.length + i + 1}`,
      });
    }
    if (newImages.length > 0) onProductImageAdd([...productImages, ...newImages]);
    e.target.value = '';
  }, [productImages, onProductImageAdd]);

  const handleModelFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    createdUrlsRef.current.push(url);
    onModelImageSet({ id: `model-${Date.now()}`, uri: url });
    e.target.value = '';
  }, [onModelImageSet]);

  const createdUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    return () => {
    if (Platform.OS === 'web') {
      for (const url of createdUrlsRef.current) URL.revokeObjectURL(url);
    }
    createdUrlsRef.current = [];
    };
  }, []);

  const needsMoreImages = productImages.length < MIN_PRODUCT_IMAGES;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>3</Text>
        </View>
        <Text style={styles.title}>소스 입력 &amp; 피팅</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>제품 소스 ({productImages.length}/{MAX_PRODUCT_IMAGES})</Text>
          {needsMoreImages && (
            <View style={styles.warnBadge}>
              <AlertCircle size={10} color={theme.colors.warning[400]} strokeWidth={2.5} />
              <Text style={styles.warnText}>최소 {MIN_PRODUCT_IMAGES}컷 필요</Text>
            </View>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
          {productImages.map((img, i) => (
            <View key={img.id} style={styles.imageSlot}>
              <Image source={{ uri: img.uri }} style={styles.image} resizeMode="cover" />
              <View style={styles.imageLabelWrap}>
                <Text style={styles.imageLabel}>{img.angle || ANGLE_LABELS[i] || `사진 ${i + 1}`}</Text>
              </View>
            </View>
          ))}
          {productImages.length < MAX_PRODUCT_IMAGES && (
            <TouchableOpacity
              style={styles.addSlot}
              onPress={onWebProductPick}
              activeOpacity={0.7}
            >
              <Plus size={24} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.addSlotText}>추가</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>모델 소스 (가상 피팅용)</Text>
        <View style={styles.modelRow}>
          {modelImage ? (
            <View style={styles.modelPreview}>
              <Image source={{ uri: modelImage.uri }} style={styles.modelImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.modelRemoveBtn}
                onPress={() => onModelImageSet(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.modelRemoveText}>제거</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.modelAddSlot}
              onPress={onWebModelPick}
              activeOpacity={0.7}
            >
              <UserSquare2 size={28} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.modelAddText}>모델 이미지 등록</Text>
              <Text style={styles.modelAddHint}>AI 가상 피팅용</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.fittingStatusBar}>
        <View style={[styles.fittingDot, fittingReady ? styles.fittingDotReady : styles.fittingDotPending]} />
        <Link2 size={13} color={fittingReady ? theme.colors.success[400] : theme.colors.dark.textFaint} strokeWidth={2} />
        <Text style={[styles.fittingStatusText, fittingReady && styles.fittingStatusTextReady]}>
          {fittingReady ? '피팅 매칭 완료 — AI 합성 준비됨' : '제품과 모델을 모두 등록하면 피팅이 시작됩니다'}
        </Text>
      </View>
    </View>
  );
}

export const SourceInputFittingPanel = memo(SourceInputFittingPanelInner);

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  section: {
    gap: theme.spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  warnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.warning[500] + '18',
    borderRadius: theme.radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  warnText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.warning[400],
  },
  imageRow: {
    gap: theme.spacing.xs,
  },
  imageSlot: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageLabelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,15,30,0.65)',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  imageLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#fff',
    textAlign: 'center',
  },
  addSlot: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  addSlotText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.dark.border,
    marginVertical: 2,
  },
  modelRow: {
    flexDirection: 'row',
  },
  modelPreview: {
    width: 80,
    height: 100,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  modelImage: {
    width: '100%',
    height: '100%',
  },
  modelRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(10,15,30,0.7)',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  modelRemoveText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#fff',
  },
  modelAddSlot: {
    flex: 1,
    height: 100,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  modelAddText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  modelAddHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  fittingStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fittingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  fittingDotReady: {
    backgroundColor: theme.colors.success[400],
  },
  fittingDotPending: {
    backgroundColor: theme.colors.dark.textFaint,
  },
  fittingStatusText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    flex: 1,
  },
  fittingStatusTextReady: {
    color: theme.colors.success[400],
    fontFamily: theme.typography.fontFamily.medium,
  },
});
