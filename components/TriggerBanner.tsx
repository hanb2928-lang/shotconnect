import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import {
  CloudSun,
  Zap,
  X,
  TriangleAlert as AlertTriangle,
  Package,
  Timer,
  Clock,
  CloudRain,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getWeatherAlertSettings,
  fetchLiveWeather,
  fetchWeatherAlerts,
  determineWeatherAlert,
  createWeatherAlert,
  type WeatherAlert,
} from '@/lib/weatherAutomation';
import {
  fetchUnreadAlerts,
  type PushAlert,
} from '@/lib/reviewAutomation';
import { setItem } from '@/lib/storage';

type AlertSource = 'weather' | 'inventory';
type AlertKind = 'rain' | 'snow' | 'cold_snap' | 'heat_wave' | 'low_stock' | 'breaktime' | 'closing_soon';

interface UnifiedAlert {
  source: AlertSource;
  kind: AlertKind;
  title: string;
  body: string;
  promptText: string;
  temperature?: number;
  alertId?: string;
}

const PRIORITY: Record<AlertKind, number> = {
  low_stock: 1,
  rain: 2,
  snow: 2,
  cold_snap: 3,
  heat_wave: 3,
  closing_soon: 4,
  breaktime: 5,
};

const ALERT_ICONS: Record<AlertKind, typeof AlertTriangle> = {
  rain: CloudRain,
  snow: AlertTriangle,
  cold_snap: AlertTriangle,
  heat_wave: AlertTriangle,
  low_stock: Package,
  breaktime: Timer,
  closing_soon: Clock,
};

const ALERT_GRADIENTS: Record<AlertKind, [string, string]> = {
  rain: ['#dc2626', '#f59e0b'],
  snow: ['#0ea5e9', '#06b6d4'],
  cold_snap: ['#3b82f6', '#06b6d4'],
  heat_wave: ['#dc2626', '#f97316'],
  low_stock: ['#dc2626', '#f97316'],
  breaktime: ['#f59e0b', '#f97316'],
  closing_soon: ['#f97316', '#dc2626'],
};

const ALERT_PREFIX: Record<AlertKind, string> = {
  rain: '비상! ',
  snow: '눈! ',
  cold_snap: '한파! ',
  heat_wave: '폭염! ',
  low_stock: '마감 떨이! ',
  breaktime: '브레이크타임! ',
  closing_soon: '마감 임박! ',
};

const ALERT_INTENT: Record<AlertKind, string> = {
  rain: 'closing',
  snow: 'closing',
  cold_snap: 'closing',
  heat_wave: 'closing',
  low_stock: 'closing',
  breaktime: 'discount',
  closing_soon: 'closing',
};

const ALERT_BODY_SUFFIX: Record<AlertKind, string> = {
  rain: ' 비 오는 날 따뜻한 국물 수요 폭중',
  snow: ' 눈 오는 날 따뜻한 메뉴 추천 타이밍',
  cold_snap: ' 기온 급강하, 따뜻한 메뉴 특가 발송',
  heat_wave: ' 폭염에 시원한 메뉴 수요 급증',
  low_stock: '',
  breaktime: ' 한가한 시간 틈새 고객 모집 타이밍',
  closing_soon: ' 마감 전 마지막 모객 기회',
};

export function TriggerBanner() {
  const router = useRouter();
  const [activeAlert, setActiveAlert] = useState<UnifiedAlert | null>(null);
  const [calmTemp, setCalmTemp] = useState<number | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const slideAnim = useRef(new Animated.Value(-200)).current;
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAll = useCallback(async () => {
    try {
      const [weatherResult, inventoryAlerts] = await Promise.all([
        checkWeatherAlerts(),
        fetchUnreadAlerts(),
      ]);

      const candidates: UnifiedAlert[] = [];

      if (weatherResult?.alert) {
        candidates.push(weatherResult.alert);
      }

      for (const inv of inventoryAlerts) {
        const mapped = mapInventoryAlert(inv);
        if (mapped && !dismissedRef.current.has(mapped.kind)) {
          candidates.push(mapped);
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => (PRIORITY[a.kind] || 99) - (PRIORITY[b.kind] || 99));
        const top = candidates[0];
        setActiveAlert(top);
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
        return;
      }

      // No active alerts — show calm indicator
      setActiveAlert(null);
      if (weatherResult?.temperature !== undefined) {
        setCalmTemp(weatherResult.temperature);
      }
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } catch {
      // Silently fail — don't disrupt camera UX
    }
  }, []);

  useEffect(() => {
    checkAll();
    checkIntervalRef.current = setInterval(checkAll, 60000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [checkAll]);

  const handleDismiss = () => {
    if (activeAlert) {
      dismissedRef.current.add(activeAlert.kind);
    }
    Animated.timing(slideAnim, {
      toValue: -200,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setActiveAlert(null);
      // Re-check for other alerts
      setTimeout(checkAll, 100);
    });
  };

  const handleAction = async () => {
    if (!activeAlert?.promptText) return;
    await setItem('marketing_voice_command_prompt', activeAlert.promptText);
    await setItem('marketing_voice_command_intent', ALERT_INTENT[activeAlert.kind] || 'closing');
    await setItem('marketing_voice_command_active', 'true');
    router.push('/(tabs)/marketing' as never);
  };

  if (!activeAlert && calmTemp === null) return null;

  if (activeAlert) {
    const gradient = ALERT_GRADIENTS[activeAlert.kind] || ['#dc2626', '#f59e0b'];
    const Icon = ALERT_ICONS[activeAlert.kind] || AlertTriangle;
    return (
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY: slideAnim }],
            borderBottomWidth: 0,
          },
        ]}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emergencyGradient}
        >
          <View style={styles.left}>
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
              <Icon size={20} color="#fff" strokeWidth={2.5} />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.emergencyTitle} numberOfLines={1}>
                {ALERT_PREFIX[activeAlert.kind]}
                홀이 한적한 시간입니다
              </Text>
              <Text style={styles.emergencySubtitle} numberOfLines={2}>
                {activeAlert.temperature !== undefined ? `${activeAlert.temperature}°C · ` : ''}
                {activeAlert.body.slice(0, 60)}
                {ALERT_BODY_SUFFIX[activeAlert.kind]}
              </Text>
            </View>
          </View>

          <View style={styles.rightActions}>
            <TouchableOpacity
              style={styles.emergencyActionBtn}
              onPress={handleAction}
              activeOpacity={0.85}
            >
              <Zap size={14} color="#dc2626" strokeWidth={2.5} />
              <Text style={styles.emergencyActionText}>숏폼 발송</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} activeOpacity={0.7}>
              <X size={14} color="rgba(255,255,255,0.8)" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          backgroundColor: 'rgba(10, 15, 30, 0.55)',
          borderColor: 'transparent',
        },
      ]}
    >
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <CloudSun size={14} color={theme.colors.dark.textDim} strokeWidth={2.5} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.calmTitle, { color: theme.colors.dark.textDim }]}>
            현재 동네 날씨 {calmTemp !== null ? `· ${calmTemp}°C` : '맑음'}
          </Text>
          <Text style={styles.calmSub}>재고·시간·날씨 자동 경보 대기 중</Text>
        </View>
      </View>
    </Animated.View>
  );
}

async function checkWeatherAlerts(): Promise<{ alert: UnifiedAlert | null; temperature: number | undefined } | null> {
  try {
    const settings = await getWeatherAlertSettings();
    if (!settings?.store_latitude || !settings.store_longitude) return null;

    const weather = await fetchLiveWeather(
      settings.store_latitude,
      settings.store_longitude,
      settings.cold_snap_threshold,
      settings.heat_wave_threshold,
    );

    const temp = Math.round(weather.temperature);

    if (!settings.enabled) return { alert: null, temperature: temp };

    const alertData = determineWeatherAlert(weather, settings);
    if (!alertData) return { alert: null, temperature: temp };

    const alerts = await fetchWeatherAlerts(5);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const existing = alerts.find(
      (a: WeatherAlert) => a.alert_type === alertData.type && !a.is_read && new Date(a.triggered_at) > twoHoursAgo,
    );
    if (!existing) {
      await createWeatherAlert({
        alert_type: alertData.type,
        title: alertData.title,
        body: alertData.body,
        hook_phrase: alertData.hook_phrase,
        prompt_text: alertData.prompt_text,
        temperature: weather.temperature,
        precipitation: weather.precipitation,
        weather_code: weather.weather_code,
      });
    }

    return {
      alert: {
        source: 'weather',
        kind: alertData.type as AlertKind,
        title: alertData.title,
        body: alertData.body,
        promptText: alertData.prompt_text,
        temperature: temp,
      },
      temperature: temp,
    };
  } catch {
    return null;
  }
}

function mapInventoryAlert(alert: PushAlert): UnifiedAlert | null {
  const kindMap: Record<string, AlertKind> = {
    low_stock: 'low_stock',
    breaktime: 'breaktime',
    closing_soon: 'closing_soon',
  };
  const kind = kindMap[alert.alert_type];
  if (!kind) return null;

  return {
    source: 'inventory',
    kind,
    title: alert.title,
    body: alert.body,
    promptText: alert.prompt_text || alert.body,
    alertId: alert.id,
  };
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    zIndex: 25,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  calmTitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textDim,
  },
  calmSub: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textFaint,
  },
  emergencyGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emergencyTitle: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
    letterSpacing: -0.3,
  },
  emergencySubtitle: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 14,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emergencyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#fff',
    ...theme.shadows.card,
  },
  emergencyActionText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#dc2626',
  },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
