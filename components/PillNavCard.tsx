import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '@/lib/theme';

interface PillNavCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accentColor: string;
  iconBg: string;
  expanded?: boolean;
  onToggle?: () => void;
  onPress?: () => void;
  stepNumber?: number;
  completed?: boolean;
  children?: React.ReactNode;
  style?: ViewStyle;
}

function PillNavCardInner({
  icon,
  title,
  subtitle,
  accentColor,
  iconBg,
  expanded,
  onToggle,
  onPress,
  stepNumber,
  completed,
  children,
  style,
}: PillNavCardProps) {
  const chevronAnim = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expanded ? 180 : 0}deg` }],
  }));

  const handlePress = useCallback(() => {
    if (onToggle) onToggle();
    else if (onPress) onPress();
  }, [onToggle, onPress]);

  return (
    <View style={[styles.pill, expanded && styles.pillExpanded, style]}>
      {accentColor && <View style={[styles.accentBar, { backgroundColor: accentColor }]} />}

      <TouchableOpacity
        style={styles.header}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          {icon}
          {typeof stepNumber === 'number' && (
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{stepNumber}</Text>
            </View>
          )}
          {completed && (
            <View style={styles.completedDot} />
          )}
        </View>

        <View style={styles.textWrap}>
          <Text style={[styles.title, completed && styles.titleCompleted]} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>

        <Animated.View style={[styles.chevronWrap, chevronAnim]}>
          <ChevronDown size={22} color={expanded ? accentColor : theme.colors.dark.textDim} strokeWidth={2.5} />
        </Animated.View>
      </TouchableOpacity>

      {expanded && children && <View style={styles.body}>{children}</View>}
    </View>
  );
}

export const PillNavCard = memo(PillNavCardInner);

const styles = StyleSheet.create({
  pill: {
    width: '100%',
    backgroundColor: theme.glass.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
    borderColor: theme.glass.border,
    marginBottom: theme.spacing.sm,
    overflow: 'visible',
    ...(Platform.OS === 'web')
      ? { backdropFilter: 'blur(12px)' as unknown as undefined }
      : {},
  },
  pillExpanded: {
    borderColor: theme.colors.primary[400] + '40',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 18,
    bottom: 18,
    width: 3.5,
    borderRadius: 3.5,
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + 2,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderWidth: 1.5,
    borderColor: theme.colors.dark.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  completedDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.success[500],
    borderWidth: 2,
    borderColor: theme.colors.dark.bg,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  titleCompleted: {
    color: theme.colors.success[400],
  },
  subtitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 3,
  },
  chevronWrap: {
    paddingLeft: 4,
  },
  body: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
