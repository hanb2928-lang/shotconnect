import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Share as RNShare, ViewStyle, Alert } from 'react-native';
import { Check, Instagram, Youtube, Music2, Download, ExternalLink } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

interface DirectShareBridgeProps {
  videoUrl?: string | null;
  shareText?: string;
  fileName?: string;
  onSavedToGallery?: () => void;
}

type PlatformKey = 'instagram' | 'youtube' | 'tiktok';

interface PlatformConfig {
  key: PlatformKey;
  label: string;
  icon: typeof Instagram;
  color: string;
  deepLink: string;
  webUrl: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    key: 'instagram',
    label: '릴스',
    icon: Instagram,
    color: '#E1306C',
    deepLink: 'instagram://camera',
    webUrl: 'https://www.instagram.com',
  },
  {
    key: 'youtube',
    label: '쇼츠',
    icon: Youtube,
    color: '#FF0000',
    deepLink: 'youtube://',
    webUrl: 'https://www.youtube.com',
  },
  {
    key: 'tiktok',
    label: '틱톡',
    icon: Music2,
    color: '#000000',
    deepLink: 'tiktok://',
    webUrl: 'https://www.tiktok.com',
  },
];

export function DirectShareBridge({
  videoUrl,
  shareText = '',
  fileName = 'ai-shortform',
  onSavedToGallery,
}: DirectShareBridgeProps) {
  const [savedState, setSavedState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sharedPlatform, setSharedPlatform] = useState<PlatformKey | null>(null);

  const handleSaveToGallery = useCallback(async () => {
    if (savedState === 'saving') return;
    if (!videoUrl) {
      Alert.alert('알림', '저장할 영상이 없습니다.');
      return;
    }
    setSavedState('saving');
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = `${fileName}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다.');
          setSavedState('idle');
          return;
        }
        const dir = FileSystem.cacheDirectory;
        if (!dir) throw new Error('임시 저장 공간을 사용할 수 없습니다.');
        const fileUri = `${dir}${fileName}-${Date.now()}.mp4`;
        const downloadResult = await FileSystem.downloadAsync(videoUrl, fileUri);
        if (downloadResult.status !== 200) {
          throw new Error(`영상 다운로드 실패 (${downloadResult.status})`);
        }
        await MediaLibrary.createAssetAsync(downloadResult.uri);
      }
      setSavedState('saved');
      onSavedToGallery?.();
      setTimeout(() => setSavedState('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '영상 저장에 실패했습니다.';
      Alert.alert('저장 실패', msg);
      setSavedState('idle');
    }
  }, [savedState, videoUrl, fileName, onSavedToGallery]);

  const handleDirectShare = useCallback(async (platform: PlatformConfig) => {
    setSharedPlatform(platform.key);
    setTimeout(() => setSharedPlatform(null), 2000);

    const fullText = shareText ? `${shareText}` : '';

    if (Platform.OS === 'web') {
      window.open(platform.webUrl, '_blank');
      if (fullText && navigator.clipboard) {
        try { await navigator.clipboard.writeText(fullText); } catch { /* ignore */ }
      }
    } else {
      try {
        await RNShare.share({
          message: fullText,
          url: videoUrl ?? undefined,
        });
      } catch {
        // user cancelled
      }
    }
  }, [shareText, videoUrl]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>원탭 공유 & 갤러리 저장</Text>
        <Text style={styles.subtitle}>영상을 바로 갤러리에 저장하거나 플랫폼에 직접 내보내기</Text>
      </View>

      {/* Save to gallery */}
      <TouchableOpacity
        style={[styles.saveButton, savedState === 'saved' && styles.saveButtonDone]}
        onPress={handleSaveToGallery}
        disabled={savedState === 'saving'}
        activeOpacity={0.8}
      >
        {savedState === 'saved' ? (
          <Check size={16} color={theme.colors.success[400]} strokeWidth={2.5} />
        ) : savedState === 'saving' ? (
          <View style={styles.spinner} />
        ) : (
          <Download size={16} color={theme.colors.dark.text} strokeWidth={2} />
        )}
        <Text style={[styles.saveButtonText, savedState === 'saved' && styles.saveButtonTextDone]}>
          {savedState === 'saved' ? '갤러리에 저장됨' : savedState === 'saving' ? '저장 중...' : 'AI 영상 갤러리에 저장'}
        </Text>
      </TouchableOpacity>

      {/* Direct share buttons */}
      <View style={styles.shareRow}>
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          const isSharing = sharedPlatform === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.platformBtn,
                { borderColor: p.color + '40' },
                isSharing && { borderColor: p.color, backgroundColor: p.color + '15' },
              ]}
              onPress={() => handleDirectShare(p)}
              activeOpacity={0.7}
            >
              <Icon size={18} color={p.color} strokeWidth={2} />
              <Text style={[styles.platformLabel, { color: p.color }]}>
                {p.label}
              </Text>
              {isSharing && (
                <View style={[styles.sharedBadge, { backgroundColor: p.color }]}>
                  <ExternalLink size={8} color="#fff" strokeWidth={2.5} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {Platform.OS === 'web' && (
        <Text style={styles.webHint}>
          웹에서는 플랫폼이 새 탭에서 열리며, 공유 문구가 클립보드에 자동 복사됩니다.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  } as ViewStyle,
  header: {
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    marginBottom: 10,
  },
  saveButtonDone: {
    borderColor: theme.colors.success[400] + '60',
    backgroundColor: theme.colors.success[400] + '10',
  },
  saveButtonText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  saveButtonTextDone: {
    color: theme.colors.success[400],
  },
  spinner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.dark.border,
    borderTopColor: theme.colors.accent[400],
  },
  shareRow: {
    flexDirection: 'row',
    gap: 8,
  },
  platformBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
  },
  platformLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  sharedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webHint: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    marginTop: 8,
    textAlign: 'center',
  },
});
