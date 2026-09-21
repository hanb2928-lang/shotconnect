import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ViewStyle } from 'react-native';
import { Download, Share2, Play, Layers, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { OutputMode } from './PlatformModeSelectCard';

interface Props {
  outputMode: OutputMode;
  resultImageUrl: string | null;
  resultVideoUrl: string | null;
  onDownload: () => void;
  onShare: () => void;
  isExporting: boolean;
}

function PreviewExportTrayInner({
  outputMode,
  resultImageUrl,
  resultVideoUrl,
  onDownload,
  onShare,
  isExporting,
}: Props) {
  const hasResult = outputMode === 'image' ? !!resultImageUrl : !!resultVideoUrl;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>5</Text>
        </View>
        <Text style={styles.title}>미리보기 &amp; 내보내기</Text>
      </View>

      <View style={styles.viewerWrap}>
        {outputMode === 'image' ? (
          resultImageUrl ? (
            <Image source={{ uri: resultImageUrl }} style={styles.resultImage} resizeMode="contain" />
          ) : (
            <View style={styles.placeholder}>
              <Layers size={32} color={theme.colors.dark.textFaint} strokeWidth={2} />
              <Text style={styles.placeholderText}>이미지 결과물이 여기에 표시됩니다</Text>
            </View>
          )
        ) : resultVideoUrl ? (
          <View style={styles.videoPreview}>
            <Image source={{ uri: resultVideoUrl }} style={styles.resultImage} resizeMode="cover" />
            <View style={styles.playOverlay}>
              <Play size={32} color="#fff" strokeWidth={2.5} fill="#fff" />
            </View>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Play size={32} color={theme.colors.dark.textFaint} strokeWidth={2} />
            <Text style={styles.placeholderText}>동영상 결과물이 여기에 표시됩니다</Text>
          </View>
        )}
      </View>

      <View style={styles.exportRow}>
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnPrimary, !hasResult && styles.exportBtnDisabled]}
          onPress={onDownload}
          disabled={!hasResult || isExporting}
          activeOpacity={0.8}
        >
          <Download size={18} color="#fff" strokeWidth={2.5} />
          <Text style={styles.exportBtnText}>
            {isExporting ? '내보내는 중...' : '고해상도 저장'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnSecondary, !hasResult && styles.exportBtnDisabled]}
          onPress={onShare}
          disabled={!hasResult}
          activeOpacity={0.8}
        >
          <Share2 size={18} color={theme.colors.dark.text} strokeWidth={2.5} />
          <Text style={[styles.exportBtnText, styles.exportBtnTextSecondary]}>SNS 공유</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const PreviewExportTray = memo(PreviewExportTrayInner);

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
  viewerWrap: {
    height: 200,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultImage: {
    width: '100%',
    height: '100%',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10,15,30,0.3)',
  },
  placeholder: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  placeholderText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  exportRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  exportBtnPrimary: {
    backgroundColor: theme.colors.primary[600],
  },
  exportBtnSecondary: {
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  exportBtnDisabled: {
    opacity: 0.4,
  },
  exportBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  exportBtnTextSecondary: {
    color: theme.colors.dark.text,
  },
});
