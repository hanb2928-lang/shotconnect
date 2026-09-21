import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  Youtube,
  Instagram,
  Music2,
  Link2,
  Check,
  Loader2,
  Upload,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';

export interface PublishActionToolbarProps {
  onPublish: (platform: 'youtube' | 'instagram' | 'tiktok') => void;
  onCopyLink: () => void;
  isPublishing: boolean;
}

type PlatformKey = 'youtube' | 'instagram' | 'tiktok';

interface PlatformConfig {
  key: PlatformKey;
  label: string;
  icon: typeof Youtube;
  color: string;
}

const PLATFORMS: PlatformConfig[] = [
  { key: 'youtube', label: '유튜브', icon: Youtube, color: '#FF0000' },
  { key: 'instagram', label: '인스타그램', icon: Instagram, color: '#E1306C' },
  { key: 'tiktok', label: '틱톡', icon: Music2, color: '#000000' },
];

export function PublishActionToolbar({
  onPublish,
  onCopyLink,
  isPublishing,
}: PublishActionToolbarProps) {
  const [publishingPlatform, setPublishingPlatform] = useState<PlatformKey | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const handlePublish = (platform: PlatformKey) => {
    if (isPublishing) return;
    setPublishingPlatform(platform);
    onPublish(platform);
  };

  const handleCopyLink = () => {
    onCopyLink();
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Upload size={15} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>플랫폼에 내보내기</Text>
      </View>

      {/* Platform publish buttons */}
      <View style={styles.publishRow}>
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          const isThisPublishing = publishingPlatform === p.key && isPublishing;
          return (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.platformBtn,
                { borderColor: p.color + '40' },
                isThisPublishing && { borderColor: p.color, backgroundColor: p.color + '15' },
              ]}
              onPress={() => handlePublish(p.key)}
              disabled={isPublishing}
              activeOpacity={0.7}
            >
              {isThisPublishing ? (
                <Loader2 size={16} color={p.color} strokeWidth={2} />
              ) : (
                <Icon size={16} color={p.color} strokeWidth={2} />
              )}
              <Text style={[styles.platformLabel, { color: p.color }]}>
                {isThisPublishing ? '내보내는 중...' : p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Copy share link */}
      <TouchableOpacity
        style={[styles.copyLinkBtn, linkCopied && styles.copyLinkBtnDone]}
        onPress={handleCopyLink}
        disabled={isPublishing}
        activeOpacity={0.7}
      >
        {linkCopied ? (
          <Check size={15} color={theme.colors.success[400]} strokeWidth={2.5} />
        ) : (
          <Link2 size={15} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
        <Text style={[styles.copyLinkText, linkCopied && styles.copyLinkTextDone]}>
          {linkCopied ? '링크 복사됨' : '공유 링크 복사'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  publishRow: {
    flexDirection: 'row',
    gap: 8,
  },
  platformBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
  },
  platformLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    marginTop: 10,
  },
  copyLinkBtnDone: {
    borderColor: theme.colors.success[400] + '60',
    backgroundColor: theme.colors.success[400] + '10',
  },
  copyLinkText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  copyLinkTextDone: {
    color: theme.colors.success[400],
  },
});
