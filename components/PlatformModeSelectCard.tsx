import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ViewStyle } from 'react-native';
import { Smartphone, LayoutGrid, FileText, Image as ImageIcon, Video, ChevronRight } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export type PlatformMode = 'shortform' | 'feed' | 'detail';
export type OutputMode = 'image' | 'video';

interface PlatformOption {
  key: PlatformMode;
  label: string;
  icon: React.ReactNode;
  desc: string;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  { key: 'shortform', label: '숏폼', icon: <Smartphone size={18} color="currentColor" strokeWidth={2} />, desc: 'TikTok / Reels' },
  { key: 'feed', label: '피드', icon: <LayoutGrid size={18} color="currentColor" strokeWidth={2} />, desc: 'Instagram' },
  { key: 'detail', label: '상세페이지', icon: <FileText size={18} color="currentColor" strokeWidth={2} />, desc: '스토어' },
];

interface Props {
  platform: PlatformMode;
  outputMode: OutputMode;
  onPlatformChange: (mode: PlatformMode) => void;
  onOutputModeChange: (mode: OutputMode) => void;
}

function PlatformModeSelectCardInner({ platform, outputMode, onPlatformChange, onOutputModeChange }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>1</Text>
        </View>
        <Text style={styles.title}>플랫폼 &amp; 출력 모드</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformRow}>
        {PLATFORM_OPTIONS.map((opt) => {
          const selected = platform === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.platformChip, selected && styles.platformChipActive]}
              onPress={() => onPlatformChange(opt.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.platformIconWrap, selected && styles.platformIconWrapActive]}>
                {opt.icon}
              </View>
              <View style={styles.platformTextWrap}>
                <Text style={[styles.platformLabel, selected && styles.platformLabelActive]}>{opt.label}</Text>
                <Text style={styles.platformDesc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.modeToggleWrap}>
        <TouchableOpacity
          style={[styles.modeToggleBtn, outputMode === 'image' && styles.modeToggleBtnActive]}
          onPress={() => onOutputModeChange('image')}
          activeOpacity={0.7}
        >
          <ImageIcon size={16} color={outputMode === 'image' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={[styles.modeToggleText, outputMode === 'image' && styles.modeToggleTextActive]}>이미지 모드</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeToggleBtn, outputMode === 'video' && styles.modeToggleBtnActive]}
          onPress={() => onOutputModeChange('video')}
          activeOpacity={0.7}
        >
          <Video size={16} color={outputMode === 'video' ? '#fff' : theme.colors.dark.textDim} strokeWidth={2} />
          <Text style={[styles.modeToggleText, outputMode === 'video' && styles.modeToggleTextActive]}>동영상 모드</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const PlatformModeSelectCard = memo(PlatformModeSelectCardInner);

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
  platformRow: {
    gap: theme.spacing.xs,
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  platformChipActive: {
    borderColor: theme.colors.primary[400],
    backgroundColor: theme.colors.primary[500] + '15',
  },
  platformIconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformIconWrapActive: {
    backgroundColor: theme.colors.primary[500],
  },
  platformTextWrap: {
    gap: 1,
  },
  platformLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  platformLabelActive: {
    color: theme.colors.dark.text,
  },
  platformDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  modeToggleWrap: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    padding: 4,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: theme.radius.sm,
  },
  modeToggleBtnActive: {
    backgroundColor: theme.colors.primary[600],
  },
  modeToggleText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  modeToggleTextActive: {
    color: '#fff',
  },
});
