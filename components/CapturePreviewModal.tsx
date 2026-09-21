import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import {
  Check,
  X,
  Crop as CropIcon,
  RotateCcw,
  Eye,
  ScanSearch,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { buildDataUrl } from '@/lib/base64';
import { ImageCropModal } from '@/components/ImageCropModal';

interface CapturePreviewModalProps {
  visible: boolean;
  imageBase64: string;
  mimeType: string;
  onConfirm: (base64: string, mimeType: string) => void;
  onRetake: () => void;
}

const { width: screenWidth } = Dimensions.get('window');

export function CapturePreviewModal({
  visible,
  imageBase64,
  mimeType,
  onConfirm,
  onRetake,
}: CapturePreviewModalProps) {
  const [cropVisible, setCropVisible] = useState(false);
  const [currentBase64, setCurrentBase64] = useState(imageBase64);
  const [currentMime, setCurrentMime] = useState(mimeType);

  useEffect(() => {
    setCurrentBase64(imageBase64);
    setCurrentMime(mimeType);
  }, [imageBase64, mimeType]);

  const dataUrl = useMemo(
    () => buildDataUrl(currentBase64, currentMime),
    [currentBase64, currentMime],
  );

  const handleCropConfirm = (b64: string, mime: string) => {
    setCurrentBase64(b64);
    setCurrentMime(mime);
    setCropVisible(false);
  };

  const handleConfirm = () => {
    onConfirm(currentBase64, currentMime);
  };

  const handleRetake = () => {
    setCropVisible(false);
    onRetake();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRetake}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Eye size={20} color={theme.colors.primary[400]} strokeWidth={2} />
              <Text style={styles.title}>촬영 미리보기</Text>
            </View>
            <TouchableOpacity onPress={handleRetake} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            사진을 확인하고 필요하면 편집한 뒤 AI 분석을 시작하세요.
          </Text>

          <View style={styles.previewWrap}>
            <Image
              source={{ uri: dataUrl }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleRetake} activeOpacity={0.7}>
              <RotateCcw size={18} color={theme.colors.dark.text} strokeWidth={2} />
              <Text style={styles.secondaryBtnText}>다시 촬영</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setCropVisible(true)}
              activeOpacity={0.7}
            >
              <CropIcon size={18} color={theme.colors.dark.text} strokeWidth={2} />
              <Text style={styles.secondaryBtnText}>자르기 / 회전</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirm} activeOpacity={0.85}>
            <ScanSearch size={20} color="#fff" strokeWidth={2} />
            <Text style={styles.primaryBtnText}>AI 분석 시작하기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ImageCropModal
        visible={cropVisible}
        imageBase64={currentBase64}
        mimeType={currentMime}
        onConfirm={handleCropConfirm}
        onCancel={() => setCropVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    padding: theme.spacing.lg,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginBottom: theme.spacing.md,
    lineHeight: 19,
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: theme.spacing.md,
    ...theme.shadows.elevated,
  },
  previewImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.elevated,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
