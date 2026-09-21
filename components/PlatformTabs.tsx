import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  FileText,
  Smartphone,
  Send,
  Instagram,
  MessageCircle,
  ImageIcon,
  ShoppingBag,
  VideoIcon,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { PlatformKey } from '@/types/database';

export type MediaType = 'image' | 'video';

interface PlatformTabsProps {
  selected: PlatformKey;
  onSelect: (key: PlatformKey) => void;
}

const PLATFORMS: { key: PlatformKey; label: string; icon: typeof FileText; color: string }[] = [
  { key: 'naverBlog', label: '네이버 블로그', icon: FileText, color: '#03C75A' },
  { key: 'shortform', label: '숏폼·틱톡', icon: Smartphone, color: '#E1306C' },
  { key: 'instagram', label: '인스타그램', icon: Instagram, color: '#C13584' },
  { key: 'threads', label: '스레드', icon: MessageCircle, color: '#0F0F0F' },
  { key: 'twitter', label: 'X(트위터)', icon: Send, color: '#1DA1F2' },
  { key: 'pinterest', label: '핀터레스트', icon: ImageIcon, color: '#E60023' },
  { key: 'smartstore', label: '스마트스토어', icon: ShoppingBag, color: '#00C73C' },
];

export function PlatformTabs({ selected, onSelect }: PlatformTabsProps) {
  return (
    <View style={styles.container}>
      {PLATFORMS.map(({ key, label, icon: Icon, color }) => {
        const isActive = selected === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelect(key)}
            activeOpacity={0.7}
          >
            <Icon
              size={16}
              color={isActive ? color : theme.colors.dark.textDim}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.tabText,
                isActive && { color },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface BoardTabsProps {
  platform: PlatformKey;
  selected: MediaType;
  onSelect: (media: MediaType) => void;
}

const PLATFORM_BOARDS: Partial<Record<PlatformKey, MediaType[]>> = {
  naverBlog: ['image'],
  shortform: ['video'],
  instagram: ['image', 'video'],
  threads: ['image'],
  twitter: ['image', 'video'],
  pinterest: ['image'],
  smartstore: ['image'],
};

const BOARD_LABELS: Record<MediaType, { label: string; icon: typeof FileText }> = {
  image: { label: '이미지', icon: ImageIcon },
  video: { label: '동영상', icon: VideoIcon },
};

export function BoardTabs({ platform, selected, onSelect }: BoardTabsProps) {
  const boards = PLATFORM_BOARDS[platform] || ['image'];

  if (boards.length <= 1) return null;

  return (
    <View style={styles.boardContainer}>
      {boards.map((media) => {
        const { label, icon: Icon } = BOARD_LABELS[media];
        const isActive = selected === media;
        return (
          <TouchableOpacity
            key={media}
            style={[styles.boardTab, isActive && styles.boardTabActive]}
            onPress={() => onSelect(media)}
            activeOpacity={0.7}
          >
            <Icon
              size={16}
              color={isActive ? theme.colors.primary[300] : theme.colors.dark.textDim}
              strokeWidth={2}
            />
            <Text
              style={[styles.boardTabText, isActive && styles.boardTabTextActive]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function getPlatformMediaType(platform: PlatformKey): MediaType {
  const boards = PLATFORM_BOARDS[platform] || ['image'];
  return boards[0];
}

export function platformSupportsBoth(platform: PlatformKey): boolean {
  const boards = PLATFORM_BOARDS[platform] || ['image'];
  return boards.length > 1;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: theme.colors.dark.surface,
  },
  tabText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    flexShrink: 1,
  },
  boardContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.md,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  boardTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  boardTabActive: {
    backgroundColor: theme.colors.primary[500] + '15',
    borderColor: theme.colors.primary[400] + '60',
  },
  boardTabText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  boardTabTextActive: {
    color: theme.colors.primary[300],
    fontFamily: theme.typography.fontFamily.semiBold,
  },
});
