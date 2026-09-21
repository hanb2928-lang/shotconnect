import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { User, Mic, Type, Palette, Save, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  getOrCreatePersona,
  updatePersona,
  TONE_PRESETS,
  type CreatorPersona,
  type TonePreset,
} from '@/lib/creatorPersona';

export function CreatorPersonaCard() {
  const [persona, setPersona] = useState<CreatorPersona | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [opening, setOpening] = useState('');
  const [ending, setEnding] = useState('');
  const [tone, setTone] = useState<TonePreset>('casual');
  const [color, setColor] = useState('');

  useEffect(() => {
    (async () => {
      const p = await getOrCreatePersona();
      if (p) {
        setPersona(p);
        setOpening(p.signature_opening ?? '');
        setEnding(p.signature_ending ?? '');
        setTone(p.tone_preset as TonePreset);
        setColor(p.signature_color ?? '');
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    if (!persona) return;
    setSaving(true);
    const updated = await updatePersona(persona.id, {
      signature_opening: opening.trim() || null,
      signature_ending: ending.trim() || null,
      tone_preset: tone,
      signature_color: color.trim() || null,
    });
    if (updated) setPersona(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [persona, opening, ending, tone, color]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <User size={18} color={theme.colors.accent[400]} strokeWidth={2} />
          <Text style={styles.headerTitle}>마이 페르소나</Text>
        </View>
        <ActivityIndicator size="small" color={theme.colors.accent[400]} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <User size={18} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.headerTitle}>마이 페르소나</Text>
      </View>

      <Text style={styles.description}>
        1회만 등록하면 모든 AI 생성 콘텐츠에 크리에이터 개성이 자동 합성됩니다.
      </Text>

      {/* Tone preset chips */}
      <Text style={styles.fieldLabel}>톤앤매너</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toneScroll}>
        {(Object.entries(TONE_PRESETS) as [TonePreset, typeof TONE_PRESETS[TonePreset]][]).map(([key, val]) => (
          <TouchableOpacity
            key={key}
            style={[styles.toneChip, tone === key && styles.toneChipActive]}
            onPress={() => setTone(key)}
            activeOpacity={0.7}
          >
            <Text style={styles.toneEmoji}>{val.emoji}</Text>
            <Text style={[styles.toneLabel, tone === key && styles.toneLabelActive]}>{val.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Signature opening */}
      <Text style={styles.fieldLabel}>시그니처 오프닝</Text>
      <TextInput
        style={styles.input}
        value={opening}
        onChangeText={setOpening}
        placeholder="예: 안녕하세요 자취 5년차 OO입니다!"
        placeholderTextColor={theme.colors.dark.textFaint}
        maxLength={60}
      />

      {/* Signature ending */}
      <Text style={styles.fieldLabel}>시그니처 엔딩</Text>
      <TextInput
        style={styles.input}
        value={ending}
        onChangeText={setEnding}
        placeholder="예: 오늘도 꿀템 하나 건졌습니다"
        placeholderTextColor={theme.colors.dark.textFaint}
        maxLength={60}
      />

      {/* Signature color */}
      <Text style={styles.fieldLabel}>대표 컬러</Text>
      <View style={styles.colorRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={color}
          onChangeText={setColor}
          placeholder="#2f9dff"
          placeholderTextColor={theme.colors.dark.textFaint}
          maxLength={7}
        />
        {color ? (
          <View style={[styles.colorPreview, { backgroundColor: color }]} />
        ) : null}
      </View>

      {/* Voice clone (placeholder) */}
      <View style={styles.voiceBox}>
        <Mic size={14} color={theme.colors.dark.textDim} strokeWidth={2} />
        <Text style={styles.voiceText}>보이스 클론: 10초 녹음으로 내 목소리 AI 보이스 생성 (출시 예정)</Text>
      </View>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveBtn, saved && styles.saveBtnDone]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.7}
      >
        {saved ? (
          <Check size={16} color="#fff" strokeWidth={2.5} />
        ) : saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Save size={16} color="#fff" strokeWidth={2} />
        )}
        <Text style={styles.saveBtnText}>{saved ? '저장됨' : '페르소나 저장'}</Text>
      </TouchableOpacity>
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
  fieldLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 6,
    marginTop: theme.spacing.sm,
  },
  toneScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  toneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  toneChipActive: {
    borderColor: theme.colors.accent[400],
    backgroundColor: theme.colors.accent[500] + '15',
  },
  toneEmoji: {
    fontSize: 14,
  },
  toneLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  toneLabelActive: {
    color: theme.colors.accent[300],
  },
  input: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorPreview: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
  },
  voiceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    marginTop: theme.spacing.md,
  },
  voiceText: {
    flex: 1,
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: theme.spacing.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent[500],
  },
  saveBtnDone: {
    backgroundColor: theme.colors.success[500],
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  loader: {
    marginTop: theme.spacing.md,
  },
});
