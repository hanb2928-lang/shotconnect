import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { MapPin, Store, Phone, Tag, ChevronDown, ChevronUp, Sparkles, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { LocalStoreInfo } from '@/types/database';

interface LocalStoreCardProps {
  value: LocalStoreInfo | null;
  onChange: (info: LocalStoreInfo) => void;
}

const DEFAULT_INFO: LocalStoreInfo = {
  enabled: false,
  storeName: '',
  address: '',
  region: '',
  phone: '',
  todayOffer: '',
};

function extractRegion(address: string): string {
  if (!address) return '';
  const parts = address.split(/\s+/);
  for (const part of parts) {
    if (part.endsWith('시') || part.endsWith('군') || part.endsWith('구')) {
      return part.replace(/시$|군$|구$/, '');
    }
  }
  return parts[0] || '';
}

export function LocalStoreCard({ value, onChange }: LocalStoreCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState<LocalStoreInfo>(value ?? DEFAULT_INFO);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setInfo(value ?? DEFAULT_INFO);
  }, [value]);

  const update = useCallback(
    (patch: Partial<LocalStoreInfo>) => {
      const next = { ...info, ...patch };
      if (patch.address !== undefined) {
        next.region = extractRegion(patch.address);
      }
      setInfo(next);
      onChange(next);
      setSaved(false);
    },
    [info, onChange],
  );

  const handleSave = () => {
    onChange(info);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasStoreData = info.storeName || info.address || info.phone || info.todayOffer;

  return (
    <View style={[styles.container, info.enabled && styles.containerActive]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, info.enabled && styles.iconWrapActive]}>
            <MapPin size={18} color={info.enabled ? '#fff' : theme.colors.success[400]} strokeWidth={2} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>우리 동네 홍보 모드</Text>
            <Text style={styles.subtitle}>
              {info.enabled
                ? '오프라인 매장 정보가 만화 숏폼과 카피에 자동 반영돼요'
                : '오프라인 매장이 있다면 켜보세요'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Switch
            value={info.enabled}
            onValueChange={(v) => update({ enabled: v })}
            trackColor={{ false: theme.colors.dark.surfaceLight, true: theme.colors.success[500] + '80' }}
            thumbColor={info.enabled ? theme.colors.success[400] : theme.colors.dark.textDim}
          />
          {expanded ? (
            <ChevronUp size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          ) : (
            <ChevronDown size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          )}
        </View>
      </TouchableOpacity>

      {info.enabled && expanded && (
        <View style={styles.body}>
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Store size={13} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.inputLabel}>매장명</Text>
            </View>
            <TextInput
              style={styles.input}
              value={info.storeName}
              onChangeText={(v) => update({ storeName: v })}
              placeholder="예: 카페 햇살"
              placeholderTextColor={theme.colors.dark.textDim + '80'}
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <MapPin size={13} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.inputLabel}>매장 주소</Text>
            </View>
            <TextInput
              style={styles.input}
              value={info.address}
              onChangeText={(v) => update({ address: v })}
              placeholder="예: 경기 평택시 중앙로 12"
              placeholderTextColor={theme.colors.dark.textDim + '80'}
            />
            {info.region ? (
              <View style={styles.regionBadge}>
                <Text style={styles.regionBadgeText}>지역: {info.region}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Phone size={13} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.inputLabel}>전화번호</Text>
            </View>
            <TextInput
              style={styles.input}
              value={info.phone}
              onChangeText={(v) => update({ phone: v })}
              placeholder="예: 031-123-4567"
              placeholderTextColor={theme.colors.dark.textDim + '80'}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputLabelRow}>
              <Tag size={13} color={theme.colors.success[400]} strokeWidth={2} />
              <Text style={styles.inputLabel}>오늘의 혜택 / 메뉴</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={info.todayOffer}
              onChangeText={(v) => update({ todayOffer: v })}
              placeholder="예: 오늘 방문 시 음료 서비스, 선착순 10명 할인"
              placeholderTextColor={theme.colors.dark.textDim + '80'}
              multiline
              numberOfLines={2}
            />
          </View>

          {hasStoreData && (
            <View style={styles.previewBox}>
              <View style={styles.previewHeader}>
                <Sparkles size={12} color={theme.colors.success[400]} strokeWidth={2} />
                <Text style={styles.previewTitle}>만화 숏폼 엔딩에 표시될 미리보기</Text>
              </View>
              <Text style={styles.previewText}>
                {info.storeName || '매장명'}{'\n'}
                {info.address || '주소'}{info.phone ? ` · ${info.phone}` : ''}{'\n'}
                {info.todayOffer || '오늘의 혜택'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            activeOpacity={0.7}
          >
            {saved ? (
              <Check size={15} color="#fff" strokeWidth={2.5} />
            ) : null}
            <Text style={styles.saveBtnText}>
              {saved ? '저장됨' : '매장 정보 저장'}
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
    borderWidth: 1.5,
    borderColor: theme.colors.dark.surfaceLight,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  containerActive: {
    borderColor: theme.colors.success[500] + '40',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500] + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: {
    backgroundColor: theme.colors.success[500],
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  body: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  input: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  textArea: {
    minHeight: 44,
  },
  regionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.success[500] + '15',
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  regionBadgeText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.success[400],
  },
  previewBox: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 6,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewTitle: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  previewText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    lineHeight: 18,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success[500],
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
