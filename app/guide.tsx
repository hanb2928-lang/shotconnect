import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import {
  Camera, Sparkles, Info, ExternalLink, Link2, ChevronDown, ChevronRight,
  ChartBar as BarChart3, Flame, FolderOpen, ClipboardList, CalendarDays,
  MessageSquare, Bug, Send, Film, LayoutTemplate, BookOpen, PenLine,
  Image as ImageIcon, Scissors, Type, Stamp, Share2, Lightbulb, Smartphone,
  Clapperboard, Music2, Instagram, Youtube, Globe, ShoppingBag,
  Wand as Wand2, Target, Users, Layers, Store, Video, Shuffle, TrendingUp,
  History, BookMarked, CalendarClock, CloudRain, Package, QrCode, Link,
  CreditCard, Trophy, ShieldCheck, FileCheck, Megaphone, ImagePlus,
  ScanLine, Grid3x3, Wallet,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useI18n } from '@/hooks/useI18n';
import { getGuideContent, type GuideItem } from '@/lib/guideContent';

const ICON_MAP: Record<string, LucideIcon> = {
  Camera, Sparkles, Info, Link2, BarChart3, Flame, FolderOpen, Send, Film,
  LayoutTemplate, BookOpen, PenLine, ImageIcon, Scissors, Type, Share2,
  Lightbulb, Clapperboard, Music2, Instagram, Youtube, Globe, Layers,
  Wand2, Target, Users, Store, Video, Shuffle, TrendingUp,
  MessageSquare, Bug, CalendarClock, CloudRain, Package, QrCode, Link,
  CreditCard, Trophy, ShieldCheck, FileCheck, Megaphone, ImagePlus,
  ScanLine, Grid3x3, Wallet, Stamp,
};

function getIcon(key: string): LucideIcon {
  return ICON_MAP[key] ?? Info;
}

export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useI18n();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const c = getGuideContent(language);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24, paddingTop: 16 }]}
      showsVerticalScrollIndicator={false}
    >

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.naverSection.title}</Text>
        <Text style={styles.sectionDesc}>
          {c.naverSection.desc}
        </Text>
        <View style={styles.guideCard}>
          <Text style={styles.guideStepTitle} numberOfLines={2}>{c.naverSection.guideTitle}</Text>
          <Text style={styles.guideStepText}>
            {c.naverSection.guideSteps}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.guideLinkButton}
          onPress={() => Linking.openURL('https://brandconnect.naver.com/about/creator/').catch(() => {})}
          activeOpacity={0.8}
        >
          <ExternalLink size={18} color={theme.colors.primary[400]} strokeWidth={2} />
          <Text style={styles.guideLinkText}>{c.naverSection.linkText}</Text>
        </TouchableOpacity>
        <View style={styles.noticeCard}>
          <Info size={16} color={theme.colors.warning[400]} strokeWidth={2} />
          <Text style={styles.noticeText}>
            {c.naverSection.notice}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.flowTitle}</Text>
        <Text style={styles.sectionDesc}>
          {c.flowDesc}
        </Text>
        <View style={styles.flowContainer}>
          {c.flowSteps.map((step, i) => {
            const Icon = getIcon(['Camera','Link2','LayoutTemplate','Film','BookOpen','Send','Layers','Target'][i] || 'Camera');
            const colors = [
              theme.colors.primary[500],
              theme.colors.accent[500],
              theme.colors.warning[400],
              theme.colors.error[400],
              theme.colors.success[500],
              theme.colors.primary[400],
              theme.colors.accent[500],
              theme.colors.success[500],
            ];
            return (
              <View key={i}>
                <View style={styles.flowStep}>
                  <View style={[styles.flowStepIcon, { backgroundColor: colors[i] }]}>
                    <Icon size={22} color="#fff" strokeWidth={2} />
                  </View>
                  <View style={styles.flowStepBody}>
                    <Text style={styles.flowStepNum}>{step.num}</Text>
                    <Text style={styles.flowStepTitle}>{step.title}</Text>
                    <Text style={styles.flowStepDesc}>
                      {step.desc}
                    </Text>
                  </View>
                </View>
                {i < c.flowSteps.length - 1 && <View style={styles.flowConnector} />}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.tabsTitle}</Text>
        <Text style={styles.sectionDesc}>{c.tabsDesc}</Text>
        <View style={styles.card}>
          {c.tabsItems.map((item, i) => (
            <View key={`t-${i}`}>
              {i > 0 && <Divider />}
              <FeatureRow item={item} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.usageTitle}</Text>
        <Text style={styles.sectionDesc}>
          {c.usageDesc}
        </Text>
        <View style={styles.card}>
          {c.usageSections.flatMap((s, si) =>
            s.items.map((item, ii) => (
              <View key={`u-${si}-${ii}`}>
                {ii > 0 && <Divider />}
                <UsageGuide item={item} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.featuresTitle}</Text>
        <View style={styles.card}>
          {c.featureSections.flatMap((s, si) =>
            s.items.map((item, ii) => (
              <View key={`f-${si}-${ii}`}>
                {ii > 0 && <Divider />}
                <FeatureRow item={item} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.automationTitle}</Text>
        <Text style={styles.sectionDesc}>{c.automationDesc}</Text>
        <View style={styles.card}>
          {c.automationSections.flatMap((s, si) =>
            s.items.map((item, ii) => (
              <View key={`a-${si}-${ii}`}>
                {ii > 0 && <Divider />}
                <UsageGuide item={item} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.monetizationTitle}</Text>
        <Text style={styles.sectionDesc}>{c.monetizationDesc}</Text>
        <View style={styles.card}>
          {c.monetizationSections.flatMap((s, si) =>
            s.items.map((item, ii) => (
              <View key={`m-${si}-${ii}`}>
                {ii > 0 && <Divider />}
                <UsageGuide item={item} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.growthTitle}</Text>
        <Text style={styles.sectionDesc}>{c.growthDesc}</Text>
        <View style={styles.card}>
          {c.growthSections.flatMap((s, si) =>
            s.items.map((item, ii) => (
              <View key={`g-${si}-${ii}`}>
                {ii > 0 && <Divider />}
                <UsageGuide item={item} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.platformTitle}</Text>
        <Text style={styles.sectionDesc}>
          {c.platformDesc}
        </Text>
        <View style={styles.card}>
          {c.platformSections.flatMap((s, si) =>
            s.items.map((item, ii) => (
              <View key={`p-${si}-${ii}`}>
                {ii > 0 && <Divider />}
                <UsageGuide item={item} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.soundTitle}</Text>
        <Text style={styles.sectionDesc}>
          {c.soundDesc}
        </Text>
        <View style={styles.card}>
          {c.soundSections.flatMap((s, si) =>
            s.items.map((item, ii) => (
              <View key={`s-${si}-${ii}`}>
                {ii > 0 && <Divider />}
                <UsageGuide item={item} />
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.helpTitle}</Text>
        <View style={styles.card}>
          {c.helpItems.map((item, i) => (
            <View key={`h-${i}`}>
              {i > 0 && <Divider />}
              <FeatureRow item={item} />
            </View>
          ))}
          <Divider />
          <TouchableOpacity
            style={styles.feedbackRow}
            onPress={() => setShowOnboarding(true)}
            activeOpacity={0.7}
          >
            <View style={styles.featureIconWrap}>
              <Sparkles size={20} color={theme.colors.primary[400]} strokeWidth={2} />
            </View>
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>{c.onboardingTitle}</Text>
              <Text style={styles.featureDesc}>{c.onboardingDesc}</Text>
            </View>
            <ChevronRight size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{c.feedbackTitle}</Text>
        <Text style={styles.sectionDesc}>
          {c.feedbackDesc}
        </Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.feedbackRow}
            onPress={() => Linking.openURL('https://forms.gle/shortconnect-feedback').catch(() => {})}
            activeOpacity={0.7}
          >
            <View style={styles.featureIconWrap}>
              {(() => { const Icon = getIcon(c.feedbackItems[0]?.iconKey || 'MessageSquare'); return <Icon size={20} color={theme.colors.accent[400]} strokeWidth={2} />; })()}
            </View>
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>{c.feedbackItems[0]?.title}</Text>
              <Text style={styles.featureDesc}>{c.feedbackItems[0]?.desc}</Text>
            </View>
            <ExternalLink size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
          <Divider />
          <TouchableOpacity
            style={styles.feedbackRow}
            onPress={() => Linking.openURL('https://open.kakao.com/o/shortconnect').catch(() => {})}
            activeOpacity={0.7}
          >
            <View style={styles.featureIconWrap}>
              {(() => { const Icon = getIcon(c.feedbackItems[1]?.iconKey || 'Bug'); return <Icon size={20} color={theme.colors.error[400]} strokeWidth={2} />; })()}
            </View>
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>{c.feedbackItems[1]?.title}</Text>
              <Text style={styles.featureDesc}>{c.feedbackItems[1]?.desc}</Text>
            </View>
            <ExternalLink size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.footer}>{c.footer}</Text>

      <OnboardingModal
        visible={showOnboarding}
        onComplete={() => setShowOnboarding(false)}
      />
    </ScrollView>
  );
}

function FeatureRow({ item }: { item: GuideItem }) {
  const Icon = getIcon(item.iconKey);
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIconWrap}>
        <Icon size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
      </View>
      <View style={styles.featureBody}>
        <Text style={styles.featureTitle} numberOfLines={2}>{item.title}</Text>
        {item.desc && <Text style={styles.featureDesc}>{item.desc}</Text>}
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function UsageGuide({ item }: { item: GuideItem }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getIcon(item.iconKey);
  return (
    <View>
      <TouchableOpacity
        style={styles.usageHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.featureIconWrap}>
          <Icon size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
        </View>
        <Text style={styles.featureTitle} numberOfLines={2}>{item.title}</Text>
        <ChevronDown
          size={18}
          color={theme.colors.dark.textDim}
          strokeWidth={2}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {expanded && item.steps && (
        <View style={styles.usageSteps}>
          {item.steps.map((step, i) => (
            <View key={i} style={styles.usageStepRow}>
              <View style={styles.usageStepBadge}>
                <Text style={styles.usageStepNum}>{i + 1}</Text>
              </View>
              <Text style={styles.usageStepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  content: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 19,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureBody: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.dark.border,
    marginVertical: 4,
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  usageSteps: {
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  usageStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  usageStepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary[500] + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  usageStepNum: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.primary[400],
  },
  usageStepText: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 19,
  },
  guideCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
    marginBottom: theme.spacing.md,
  },
  guideStepTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginBottom: 8,
  },
  guideStepText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 20,
  },
  guideLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary[500] + '15',
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    marginBottom: theme.spacing.md,
  },
  guideLinkText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.primary[400],
  },
  noticeCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.colors.warning[400] + '10',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  flowContainer: {
    gap: 0,
  },
  flowStep: {
    flexDirection: 'row',
    gap: 12,
  },
  flowStepIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flowStepBody: {
    flex: 1,
    paddingBottom: 16,
  },
  flowStepNum: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.textFaint,
  },
  flowStepTitle: {
    fontSize: 15,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
    marginTop: 2,
    marginBottom: 4,
  },
  flowStepDesc: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    lineHeight: 17,
  },
  flowConnector: {
    width: 2,
    height: 16,
    backgroundColor: theme.colors.dark.border,
    marginLeft: 21,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
});
