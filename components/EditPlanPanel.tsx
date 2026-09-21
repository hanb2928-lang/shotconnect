import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  Flame,
  Sparkles,
  Wand2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';

export interface EditPlanPanelProps {
  hookText: string;
  onHookChange: (val: string) => void;
  captions: string[];
  onCaptionChange: (index: number, val: string) => void;
  onAiAutoGenerate: () => void;
  isGeneratingAi: boolean;
}

const CAPTION_LABELS = ['오프닝', '문제 제시', '해결 제안', '행동 유도', '마무리'];

export function EditPlanPanel({
  hookText,
  onHookChange,
  captions,
  onCaptionChange,
  onAiAutoGenerate,
  isGeneratingAi,
}: EditPlanPanelProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Sparkles size={15} color={theme.colors.accent[400]} strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.headerTitle}>입체컷 스토리보드 편집</Text>
            <Text style={styles.headerSubtitle}>후킹 멘트와 캡션 문장을 직접 수정하세요</Text>
          </View>
        </View>
        {expanded ? (
          <ChevronUp size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
        ) : (
          <ChevronDown size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* Hook input */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldHeader}>
              <Flame size={14} color={theme.colors.warning[400]} strokeWidth={2} />
              <Text style={styles.fieldLabel}>후킹 멘트</Text>
            </View>
            <TextInput
              style={styles.hookInput}
              value={hookText}
              onChangeText={onHookChange}
              placeholder="후킹 멘트를 입력하세요"
              placeholderTextColor={theme.colors.dark.textFaint}
              multiline
            />
          </View>

          {/* Caption sentence inputs */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldHeader}>
              <Sparkles size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.fieldLabel}>캡션 문장</Text>
            </View>
            {captions.map((text, idx) => (
              <View key={idx} style={styles.captionRow}>
                <View style={styles.captionLabelWrap}>
                  <Text style={styles.captionLabel}>
                    {CAPTION_LABELS[idx] ?? `문장 ${idx + 1}`}
                  </Text>
                </View>
                <TextInput
                  style={styles.captionInput}
                  value={text}
                  onChangeText={(val) => onCaptionChange(idx, val)}
                  placeholder={`${CAPTION_LABELS[idx] ?? `문장 ${idx + 1}`} 내용을 입력하세요`}
                  placeholderTextColor={theme.colors.dark.textFaint}
                  multiline
                />
              </View>
            ))}
          </View>

          {/* AI auto-generate button */}
          <TouchableOpacity
            style={[styles.aiGenBtn, isGeneratingAi && styles.aiGenBtnDisabled]}
            onPress={onAiAutoGenerate}
            disabled={isGeneratingAi}
            activeOpacity={0.7}
          >
            {isGeneratingAi ? (
              <Loader2 size={16} color="#fff" strokeWidth={2} />
            ) : (
              <Wand2 size={16} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.aiGenBtnText} numberOfLines={1}>
              {isGeneratingAi ? 'AI 생성 중...' : 'AI 자동 생성'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    ...theme.shadows.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  hookInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 48,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  captionLabelWrap: {
    width: 60,
    paddingTop: 10,
  },
  captionLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.accent[300],
  },
  captionInput: {
    flex: 1,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 44,
  },
  aiGenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    ...theme.shadows.card,
  },
  aiGenBtnDisabled: {
    opacity: 0.6,
  },
  aiGenBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
