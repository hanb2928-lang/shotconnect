import { useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { theme } from '@/lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function SectionCard({
  title,
  subtitle,
  icon,
  badge,
  defaultExpanded = false,
  children,
}: SectionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.7}
      >
        {icon && <View style={styles.iconWrap}>{icon}</View>}
        <View style={styles.headerBody}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
          </View>
          {subtitle && <Text style={styles.subtitle} numberOfLines={expanded ? undefined : 1}>{subtitle}</Text>}
        </View>
        <ChevronDown
          size={22}
          color={theme.colors.dark.textDim}
          strokeWidth={2}
          style={[styles.chevron, expanded && styles.chevronExpanded]}
        />
      </TouchableOpacity>
      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    marginVertical: theme.spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(76, 125, 255, 0.15)',
    ...theme.shadows.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(76, 125, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  badge: {
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  subtitle: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: '#A6B0CF',
    marginTop: 3,
  },
  chevron: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(76, 125, 255, 0.12)',
  },
});
