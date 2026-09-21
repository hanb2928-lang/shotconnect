import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image } from 'react-native';
import { Pencil, Plus, X, Camera } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface MicroEditSlotProps {
  onReviewLineChange?: (line: string) => void;
  onFootageSelect?: (uri: string | null) => void;
}

export function MicroEditSlot({ onReviewLineChange, onFootageSelect }: MicroEditSlotProps) {
  const [reviewLine, setReviewLine] = useState('');
  const [editing, setEditing] = useState(false);
  const [footageUri, setFootageUri] = useState<string | null>(null);

  const handleSaveLine = useCallback(() => {
    setEditing(false);
    onReviewLineChange?.(reviewLine.trim());
  }, [reviewLine, onReviewLineChange]);

  const handlePickFootage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setFootageUri(uri);
        onFootageSelect?.(uri);
      }
    } catch {
      // picker failed
    }
  }, [onFootageSelect]);

  const handleRemoveFootage = useCallback(() => {
    setFootageUri(null);
    onFootageSelect?.(null);
  }, [onFootageSelect]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pencil size={16} color={theme.colors.warning[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>인간의 손길 10% 마이크로 에디팅</Text>
      </View>

      <Text style={styles.description}>
        AI가 만든 완성형 콘텐츠에 딱 한 부분만 직접 개입할 수 있습니다.
      </Text>

      {/* 1-line review insertion */}
      <View style={styles.sectionBox}>
        <Text style={styles.sectionLabel}>나만의 사용 후기 1줄</Text>
        <Text style={styles.sectionHint}>
          AI 시나리오 중 "실제 사용평" 파트에 직접 적은 한 줄이 자연스럽게 통합됩니다.
        </Text>
        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              style={styles.input}
              value={reviewLine}
              onChangeText={setReviewLine}
              placeholder="예: 한 달 써보니까 배터리가 진짜 오래감"
              placeholderTextColor={theme.colors.dark.textFaint}
              maxLength={80}
              autoFocus
            />
            <TouchableOpacity style={styles.saveLineBtn} onPress={handleSaveLine} activeOpacity={0.7}>
              <Text style={styles.saveLineText}>완료</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.reviewDisplay}
            onPress={() => setEditing(true)}
            activeOpacity={0.7}
          >
            {reviewLine.trim() ? (
              <Text style={styles.reviewText}>"{reviewLine.trim()}"</Text>
            ) : (
              <Text style={styles.reviewPlaceholder}>탭하여 한 줄 후기 적기</Text>
            )}
            <Pencil size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {/* Real footage slot */}
      <View style={styles.sectionBox}>
        <Text style={styles.sectionLabel}>실사용 단편 컷 믹스</Text>
        <Text style={styles.sectionHints}>
          AI 생성 영상 중간에 직접 찍은 2초짜리 실물 촬영 컷을 끼워 넣을 수 있습니다.
        </Text>
        {footageUri ? (
          <View style={styles.footagePreview}>
            <Image source={{ uri: footageUri }} style={styles.footageImage} resizeMode="cover" />
            <TouchableOpacity style={styles.footageRemove} onPress={handleRemoveFootage} activeOpacity={0.7}>
              <X size={12} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.footageAddBtn} onPress={handlePickFootage} activeOpacity={0.7}>
            <Camera size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
            <Text style={styles.footageAddText}>실물 촬영 컷 추가</Text>
          </TouchableOpacity>
        )}
      </View>
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
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  description: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  sectionBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 4,
  },
  sectionHints: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 16,
    marginBottom: 8,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  saveLineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning[500],
  },
  saveLineText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  reviewDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  reviewText: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.warning[400],
    fontStyle: 'italic',
  },
  reviewPlaceholder: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  footageAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.bg,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    borderStyle: 'dashed',
  },
  footageAddText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  footagePreview: {
    position: 'relative',
    width: '100%',
    aspectRatio: 2,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  footageImage: {
    width: '100%',
    height: '100%',
  },
  footageRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
