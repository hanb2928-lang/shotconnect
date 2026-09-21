import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Star, Save, RotateCcw, MessageSquare, Check, Sparkles, Loader as Loader2 } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { REVIEW_FUNCTION_URL, supabaseAnonKey } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { CustomReview } from '@/types/database';

interface ReviewInputProps {
  review: CustomReview | null;
  onSave: (review: CustomReview) => Promise<void>;
  onClear: () => Promise<void>;
  productData: {
    productName: string;
    productCategory: string;
    priceEstimate: string;
    oneLiner: string;
    hook: string;
    productAdvantages: string[];
  } | null;
  brandPersona?: string | null;
}

export function ReviewInput({ review, onSave, onClear, productData, brandPersona }: ReviewInputProps) {
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(false);
  const [reviewIsFallback, setReviewIsFallback] = useState(false);

  useEffect(() => {
    if (review && review.text) {
      setText(review.text);
      setRating(review.rating ?? 5);
    } else {
      setText('');
      setRating(5);
    }
  }, [review]);

  const handleSave = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave({
        text: text.trim(),
        rating,
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // error handled by parent
    }
    setSaving(false);
  }, [text, rating, onSave]);

  const handleClear = useCallback(async () => {
    setText('');
    setRating(5);
    try {
      await onClear();
    } catch {
      // silent
    }
  }, [onClear]);

  const handleAIGenerate = useCallback(async () => {
    if (!productData || !productData.productName) return;
    setGenerating(true);
    setGenError(false);
    setReviewIsFallback(false);
    try {
      const response = await fetch(REVIEW_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ ...productData, brandPersona: brandPersona || undefined }),
      });
      if (!response.ok) throw new Error('generation failed');
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setText(String(data.text || '').slice(0, 300));
      setRating(Math.min(Math.max(Math.round(Number(data.rating) || 5), 1), 5));
      setReviewIsFallback(!!data.isFallback);
    } catch {
      setGenError(true);
    }
    setGenerating(false);
  }, [productData, brandPersona]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MessageSquare size={16} color="#C13584" strokeWidth={2} />
        <Text style={styles.headerTitle}>사용 후기</Text>
        {review && (
          <View style={styles.savedBadge}>
            <Check size={10} color={theme.colors.success[400]} strokeWidth={2.5} />
            <Text style={styles.savedBadgeText}>저장됨</Text>
          </View>
        )}
      </View>

      <Text style={styles.description}>
        인스타그램 템플릿에 표시될 사용 후기를 직접 작성해보세요. 별점과 함께 카드에 반영됩니다.
      </Text>

      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
            <Star
              size={28}
              color={star <= rating ? '#FFD600' : theme.colors.dark.border}
              strokeWidth={2}
              fill={star <= rating ? '#FFD600' : 'transparent'}
            />
          </TouchableOpacity>
        ))}
        <Text style={styles.ratingLabel}>{rating}점</Text>
      </View>

      <TextInput
        style={styles.textInput}
        value={text}
        onChangeText={setText}
        placeholder="이 제품을 사용해본 솔직한 후기를 적어주세요. 예: 생각보다 가벼워서 데일리로 들기 좋아요. 색감도 사진이랑 똑같고 마감도 깔끔해요!"
        placeholderTextColor={theme.colors.dark.textFaint}
        multiline
        textAlignVertical="top"
        maxLength={300}
      />
      <View style={styles.charRow}>
        <Text style={styles.charText}>{text.length} / 300자</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.saveButton, !text.trim() && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!text.trim() || saving}
          activeOpacity={0.8}
        >
          {saved ? (
            <Check size={16} color="#fff" strokeWidth={2.5} />
          ) : (
            <Save size={16} color="#fff" strokeWidth={2} />
          )}
          <Text style={styles.saveButtonText}>
            {saving ? '저장 중...' : saved ? '저장됨' : '후기 저장'}
          </Text>
        </TouchableOpacity>
        {review && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClear} activeOpacity={0.7}>
            <RotateCcw size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.clearButtonText}>초기화</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.aiButton, generating && styles.aiButtonDisabled]}
        onPress={handleAIGenerate}
        disabled={generating || !productData?.productName}
        activeOpacity={0.8}
      >
        {generating ? (
          <Loader2 size={16} color={theme.colors.warning[400]} strokeWidth={2} />
        ) : (
          <Sparkles size={16} color={theme.colors.warning[400]} strokeWidth={2} />
        )}
        <Text style={styles.aiButtonText}>
          {generating ? '후기 생성 중...' : 'AI로 후기 자동 작성'}
        </Text>
      </TouchableOpacity>
      {reviewIsFallback && !genError && (
        <Text style={styles.fallbackHint}>스마트 템플릿으로 생성되었습니다. AI 키 연결 시 더 다양한 후기를 만들 수 있어요.</Text>
      )}
      {genError && (
        <Text style={styles.genErrorText}>인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.success[500] + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  savedBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  description: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  ratingLabel: {
    marginLeft: 8,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  textInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 100,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  charRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  charText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: '#C13584',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  clearButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500] + '15',
    borderWidth: 1,
    borderColor: theme.colors.warning[400] + '30',
  },
  aiButtonDisabled: {
    opacity: 0.5,
  },
  aiButtonText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.warning[400],
  },
  genErrorText: {
    marginTop: 6,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
  },
  fallbackHint: {
    marginTop: 6,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.primary[300],
    textAlign: 'center',
  },
});
