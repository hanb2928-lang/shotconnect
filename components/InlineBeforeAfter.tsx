import { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, LayoutAnimation } from 'react-native';
import { ChevronDown, Maximize2, Wand2, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';

export interface InlineBeforeAfterProps {
  beforeImage?: string | null;
  afterImage?: string | null;
  productName?: string;
  onExpand?: () => void;
}

export function InlineBeforeAfter({
  beforeImage,
  afterImage,
  productName,
  onExpand,
}: InlineBeforeAfterProps) {
  const [expanded, setExpanded] = useState(true);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  if (!beforeImage && !afterImage) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Wand2 size={14} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>보정 전/후 비교</Text>
        </View>
        <View style={styles.headerRight}>
          {onExpand && (
            <TouchableOpacity
              style={styles.expandIconBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                onExpand();
              }}
              activeOpacity={0.7}
            >
              <Maximize2 size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <ChevronDown
            size={16}
            color={theme.colors.dark.textDim}
            strokeWidth={2}
            style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.compareRow}>
          {/* Before */}
          <View style={styles.compareItem}>
            <View style={styles.compareImageWrap}>
              {beforeImage ? (
                <Image
                  source={{ uri: beforeImage }}
                  style={styles.compareImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.comparePlaceholder}>
                  <Text style={styles.comparePlaceholderText}>원본 없음</Text>
                </View>
              )}
            </View>
            <View style={styles.compareLabelRow}>
              <View style={[styles.compareBadge, { backgroundColor: theme.colors.dark.border }]}>
                <Text style={styles.compareBadgeText}>원본</Text>
              </View>
            </View>
          </View>

          {/* Arrow */}
          <View style={styles.arrowCol}>
            <View style={styles.arrowLine} />
            <Text style={styles.arrowText}>→</Text>
            <View style={styles.arrowLine} />
          </View>

          {/* After */}
          <View style={styles.compareItem}>
            <View style={styles.compareImageWrap}>
              {afterImage ? (
                <Image
                  source={{ uri: afterImage }}
                  style={styles.compareImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.comparePlaceholder}>
                  <Text style={styles.comparePlaceholderText}>보정 전</Text>
                </View>
              )}
              {afterImage && (
                <View style={styles.checkOverlay}>
                  <Check size={12} color="#fff" strokeWidth={3} />
                </View>
              )}
            </View>
            <View style={styles.compareLabelRow}>
              <View style={[styles.compareBadge, { backgroundColor: theme.colors.warning[400] }]}>
                <Text style={[styles.compareBadgeText, { color: '#fff' }]}>AI 보정</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {productName && expanded && (
        <Text style={styles.productName} numberOfLines={1}>{productName}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 10,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandIconBtn: {
    padding: 4,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  compareItem: {
    flex: 1,
    gap: 6,
  },
  compareImageWrap: {
    position: 'relative',
    aspectRatio: 1,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    backgroundColor: '#0a0f1e',
  },
  compareImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  comparePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.dark.surface,
  },
  comparePlaceholderText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  checkOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  compareLabelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  compareBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  compareBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  arrowCol: {
    alignItems: 'center',
    gap: 2,
  },
  arrowLine: {
    width: 1,
    height: 12,
    backgroundColor: theme.colors.dark.border,
  },
  arrowText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.warning[400],
  },
  productName: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
    textAlign: 'center',
    marginTop: 8,
  },
});
