import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Check, Copy, Link2, Hash, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  buildPlatformCaption,
  getHashtagStrategy,
  getLinkGuidance,
  getCaptionTemplate,
  type UploadPlatformKey,
  type DisclosurePlacement,
} from '@/lib/platformUpload';

interface PlatformCaptionOptimizerProps {
  platformKey: UploadPlatformKey;
  platformLabel: string;
  platformColor: string;
  contentText: string;
  affiliateUrl: string;
  disclosurePlatforms: string[];
  autoDisclosure: boolean;
  disclosurePlacement: DisclosurePlacement;
  isActive: boolean;
  onCopy: (text: string) => void;
}

export function PlatformCaptionOptimizer({
  platformKey,
  platformLabel,
  platformColor,
  contentText,
  affiliateUrl,
  disclosurePlatforms,
  autoDisclosure,
  disclosurePlacement,
  isActive,
  onCopy,
}: PlatformCaptionOptimizerProps) {
  const [expanded, setExpanded] = useState(isActive);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const built = buildPlatformCaption(
    platformKey,
    contentText,
    affiliateUrl,
    disclosurePlatforms,
    autoDisclosure,
    disclosurePlacement,
  );
  const hashtagStrategy = getHashtagStrategy(platformKey);
  const linkGuidance = getLinkGuidance(platformKey);
  const tmpl = getCaptionTemplate(platformKey);

  const handleCopy = (section: string, text: string) => {
    onCopy(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const titleLen = built.title.length;
  const titleOverLimit = titleLen > tmpl.titleMaxLen;

  return (
    <View style={[styles.container, isActive && { borderColor: platformColor + '80' }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={[styles.headerIcon, { backgroundColor: platformColor + '20' }]}>
          <Hash size={14} color={platformColor} strokeWidth={2} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{platformLabel} 알고리즘 최적화</Text>
          <Text style={styles.headerDesc} numberOfLines={1}>{tmpl.captionStyle}</Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
        ) : (
          <ChevronDown size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* Title section with char counter */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>제목 / 첫 줄</Text>
              <Text style={[styles.charCounter, titleOverLimit && styles.charOverLimit]}>
                {titleLen}/{tmpl.titleMaxLen}
              </Text>
            </View>
            <Text style={styles.sectionHint}>{tmpl.titleHint}</Text>
            <View style={styles.copyableRow}>
              <Text style={styles.copyableText} numberOfLines={3}>{built.title}</Text>
              <TouchableOpacity
                style={styles.miniCopyBtn}
                onPress={() => handleCopy('title', built.title)}
                activeOpacity={0.7}
              >
                {copiedSection === 'title' ? (
                  <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                ) : (
                  <Copy size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
            {titleOverLimit && (
              <Text style={styles.warnText}>제목이 {tmpl.titleMaxLen}자를 초과했습니다. 줄이세요.</Text>
            )}
          </View>

          {/* Body section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>본문</Text>
            <Text style={styles.sectionHint}>{tmpl.bodyHint}</Text>
            <View style={styles.copyableRow}>
              <Text style={styles.copyableText} numberOfLines={4}>{built.body}</Text>
              <TouchableOpacity
                style={styles.miniCopyBtn}
                onPress={() => handleCopy('body', built.body)}
                activeOpacity={0.7}
              >
                {copiedSection === 'body' ? (
                  <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                ) : (
                  <Copy size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Hashtags section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>해시태그</Text>
            <Text style={styles.sectionHint}>{hashtagStrategy}</Text>
            <View style={styles.copyableRow}>
              <Text style={styles.copyableHashtags} numberOfLines={2}>{built.hashtags}</Text>
              <TouchableOpacity
                style={styles.miniCopyBtn}
                onPress={() => handleCopy('hashtags', built.hashtags)}
                activeOpacity={0.7}
              >
                {copiedSection === 'hashtags' ? (
                  <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                ) : (
                  <Copy size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Link guidance */}
          {linkGuidance && (
            <View style={styles.guidanceRow}>
              <Link2 size={12} color={theme.colors.accent[400]} strokeWidth={2} />
              <Text style={styles.guidanceText}>{linkGuidance}</Text>
            </View>
          )}

          {/* Comment disclosure section — only when placement is 'comment' */}
          {built.commentText && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <MessageSquare size={11} color={theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={styles.sectionLabel}>댓글용 공정위 문구</Text>
              </View>
              <View style={styles.copyableRow}>
                <Text style={styles.copyableText} numberOfLines={3}>{built.commentText}</Text>
                <TouchableOpacity
                  style={styles.miniCopyBtn}
                  onPress={() => handleCopy('comment', built.commentText)}
                  activeOpacity={0.7}
                >
                  {copiedSection === 'comment' ? (
                    <Check size={12} color={theme.colors.success[400]} strokeWidth={2.5} />
                  ) : (
                    <Copy size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Full text — one-tap copy */}
          <TouchableOpacity
            style={[styles.fullCopyBtn, { borderColor: platformColor + '60' }]}
            onPress={() => handleCopy('full', built.fullText)}
            activeOpacity={0.7}
          >
            {copiedSection === 'full' ? (
              <Check size={13} color={platformColor} strokeWidth={2.5} />
            ) : (
              <Copy size={13} color={platformColor} strokeWidth={2} />
            )}
            <Text style={[styles.fullCopyText, { color: platformColor }]}>
              {copiedSection === 'full' ? '복사 완료!' : '전체 캡션 복사'}
            </Text>
          </TouchableOpacity>


        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm + 2,
    gap: 10,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  headerDesc: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  body: {
    padding: theme.spacing.sm + 2,
    paddingTop: 0,
    gap: 10,
  },
  sectionBlock: {
    gap: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  charCounter: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  charOverLimit: {
    color: theme.colors.error[400],
    fontFamily: theme.typography.fontFamily.bold,
  },
  sectionHint: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    lineHeight: 13,
  },
  copyableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.sm,
    padding: 8,
    gap: 6,
    marginTop: 2,
  },
  copyableText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 16,
  },
  copyableHashtags: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.accent[300],
    lineHeight: 16,
  },
  miniCopyBtn: {
    padding: 4,
    borderRadius: 6,
  },
  warnText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
    marginTop: 2,
  },
  guidanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: theme.colors.accent[500] + '10',
    borderRadius: theme.radius.sm,
    padding: 8,
  },
  guidanceText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.accent[300],
    lineHeight: 14,
  },
  fullCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: 9,
    borderWidth: 1.5,
  },
  fullCopyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
});
