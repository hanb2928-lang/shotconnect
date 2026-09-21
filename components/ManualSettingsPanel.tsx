import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';

export interface ManualSettingsPanelProps {
  hdUpscale: boolean;
  onHdToggleChange: (val: boolean) => void;
  cameraMovement: string;
  onMovementChange: (val: string) => void;
  transitionEffect: string;
  onTransitionChange: (val: string) => void;
  disabled?: boolean;
}

const CAMERA_MOVEMENTS = [
  'AI 자동',
  '돌리 인',
  '돌리 아웃',
  '오비탈',
  '카운터 줌',
  '고정 샷',
  '핸드헬드',
];

const TRANSITION_EFFECTS = [
  '컷 전환',
  '크로스페이드',
  '와이프',
  '줌 전환',
  '플래시',
  '슬로우 모션',
];

export function ManualSettingsPanel({
  hdUpscale,
  onHdToggleChange,
  cameraMovement,
  onMovementChange,
  transitionEffect,
  onTransitionChange,
  disabled = false,
}: ManualSettingsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.header, disabled && styles.headerDisabled]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <SlidersHorizontal size={15} color={theme.colors.accent[300]} strokeWidth={2} />
          </View>
          <Text style={styles.headerTitle}>고급 설정</Text>
        </View>
        {expanded ? (
          <ChevronUp size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
        ) : (
          <ChevronDown size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* HD Upscale toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Text style={styles.label}>고해상도 업스케일링 (HD)</Text>
              <Text style={styles.hint}>최종 결과물 선명도·해상도 향상</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleSwitch, hdUpscale && styles.toggleSwitchActive, disabled && styles.controlDisabled]}
              onPress={() => onHdToggleChange(!hdUpscale)}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <View style={[styles.toggleKnob, hdUpscale && styles.toggleKnobActive]} />
            </TouchableOpacity>
          </View>

          {/* Camera movement chips */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Sparkles size={12} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.label}>카메라 무빙</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {CAMERA_MOVEMENTS.map((motion) => (
                <TouchableOpacity
                  key={motion}
                  style={[styles.chipPill, cameraMovement === motion && styles.chipPillActive, disabled && styles.controlDisabled]}
                  onPress={() => onMovementChange(motion)}
                  activeOpacity={0.7}
                  disabled={disabled}
                >
                  <Text style={[styles.chipPillText, cameraMovement === motion && styles.chipPillTextActive]}>
                    {motion}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Transition effect chips */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Sparkles size={12} color={theme.colors.accent[300]} strokeWidth={2} />
              <Text style={styles.label}>전환 효과</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {TRANSITION_EFFECTS.map((eff) => (
                <TouchableOpacity
                  key={eff}
                  style={[styles.chipPill, transitionEffect === eff && styles.chipPillActive, disabled && styles.controlDisabled]}
                  onPress={() => onTransitionChange(eff)}
                  activeOpacity={0.7}
                  disabled={disabled}
                >
                  <Text style={[styles.chipPillText, transitionEffect === eff && styles.chipPillTextActive]}>
                    {eff}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
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
  body: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  toggleLeft: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  hint: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  toggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: theme.colors.accent[400],
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.full,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleKnobActive: {
    transform: [{ translateX: 18 }],
  },
  inputGroup: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipPill: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  chipPillActive: {
    backgroundColor: theme.colors.primary[500],
    borderColor: theme.colors.primary[400],
  },
  chipPillText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  chipPillTextActive: {
    color: '#fff',
    fontFamily: theme.typography.fontFamily.semiBold,
  },
  headerDisabled: {
    opacity: 0.5,
  },
  controlDisabled: {
    opacity: 0.5,
  },
});
