import { useState, useEffect, useCallback } from 'react';
import { getItem, setItem } from '@/lib/storage';
import { getUserSettings } from '@/lib/settings';

export type MascotStyle = 'cute-crawler' | 'minimal-dot' | 'none';

export interface MascotConfig {
  enabled: boolean;
  style: MascotStyle;
  loading: boolean;
}

const STORAGE_KEY = 'mascot_config';
const DEFAULT_CONFIG: MascotConfig = {
  enabled: true,
  style: 'cute-crawler',
  loading: true,
};

export function useMascotSettings(): MascotConfig & {
  updateEnabled: (enabled: boolean) => Promise<void>;
  updateStyle: (style: MascotStyle) => Promise<void>;
} {
  const [config, setConfig] = useState<MascotConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let enabled = true;
      let style: MascotStyle = 'cute-crawler';

      try {
        const settings = await getUserSettings();
        if (settings) {
          enabled = settings.mascot_enabled ?? true;
          style = (settings.mascot_style as MascotStyle) || 'cute-crawler';
        }
      } catch {
        const cached = await getItem(STORAGE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            enabled = parsed.enabled ?? true;
            style = parsed.style ?? 'cute-crawler';
          } catch {}
        }
      }

      if (mounted) {
        setConfig({ enabled, style, loading: false });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (enabled: boolean, style: MascotStyle) => {
    setConfig({ enabled, style, loading: false });
    await setItem(STORAGE_KEY, JSON.stringify({ enabled, style }));
  }, []);

  const updateEnabled = useCallback(
    async (enabled: boolean) => {
      await persist(enabled, config.style);
    },
    [config.style, persist],
  );

  const updateStyle = useCallback(
    async (style: MascotStyle) => {
      await persist(config.enabled, style);
    },
    [config.enabled, persist],
  );

  return { ...config, updateEnabled, updateStyle };
}

export function shouldShowMascot(config: MascotConfig): boolean {
  if (config.loading) return true;
  if (!config.enabled) return false;
  return config.style !== 'none';
}
