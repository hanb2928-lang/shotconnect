import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getItem, setItem } from '@/lib/storage';
import {
  theme as baseTheme,
  resolveThemePreset,
  type ThemePreset,
  type ThemePresetColors,
  type Spacing,
  type Typography,
  type ColorPalette,
  type GlassColors,
} from '@/lib/theme';
import { getUserSettings } from '@/lib/settings';

export type ThemeMode = 'dark' | 'light';
export type DisplayDensity = 'compact' | 'standard' | 'wide';

interface AppThemeContextValue {
  mode: ThemeMode;
  density: DisplayDensity;
  preset: ThemePreset;
  setMode: (m: ThemeMode) => void;
  setDensity: (d: DisplayDensity) => void;
  setPreset: (p: ThemePreset) => void;
  /** Active color palette — either the dark or light ramp from the active preset */
  colors: ColorPalette;
  /** Active glassmorphism colors — dark or light variant from the active preset */
  glass: GlassColors;
  /** Spacing scale adjusted for density */
  spacing: Spacing;
  /** Typography scale adjusted for density */
  typography: Typography;
  /** Full base theme for access to shared ramps (success/warning/error/etc) */
  baseTheme: typeof baseTheme;
  /** Active preset colors (primary/accent ramps, both palettes, glass, glow) */
  presetColors: ThemePresetColors;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function resolveDensity(d: DisplayDensity) {
  if (d === 'compact') {
    return {
      spacing: { ...baseTheme.spacing, xs: 3, sm: 6, md: 12, lg: 18, xl: 24, xxl: 36 },
      typography: { ...baseTheme.typography, title: 24, heading: 19, body: 14, caption: 12, micro: 11 },
    };
  }
  if (d === 'wide') {
    return {
      spacing: { ...baseTheme.spacing, xs: 5, sm: 10, md: 20, lg: 28, xl: 38, xxl: 56 },
      typography: { ...baseTheme.typography, title: 32, heading: 25, body: 18, caption: 16, micro: 13 },
    };
  }
  return { spacing: baseTheme.spacing, typography: baseTheme.typography };
}

const VALID_PRESETS: ThemePreset[] = ['cinematic-dark', 'studio-light', 'trendy-viral'];

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [density, setDensityState] = useState<DisplayDensity>('standard');
  const [preset, setPresetState] = useState<ThemePreset>('cinematic-dark');

  useEffect(() => {
    (async () => {
      try {
        const cachedMode = await getItem('theme_mode');
        if (cachedMode === 'dark' || cachedMode === 'light') setModeState(cachedMode);

        const cachedDensity = await getItem('display_density');
        if (cachedDensity === 'compact' || cachedDensity === 'standard' || cachedDensity === 'wide') {
          setDensityState(cachedDensity);
        }

        const cachedPreset = await getItem('theme_preset');
        if (cachedPreset && VALID_PRESETS.includes(cachedPreset as ThemePreset)) {
          setPresetState(cachedPreset as ThemePreset);
        }
      } catch {}

      try {
        const s = await getUserSettings();
        const tm = (s?.theme_mode as ThemeMode) || 'dark';
        const dn = (s?.display_density as DisplayDensity) || 'standard';
        const tp = (s?.theme_preset as ThemePreset) || 'cinematic-dark';
        setModeState(tm);
        setDensityState(dn);
        if (VALID_PRESETS.includes(tp)) setPresetState(tp);
        await setItem('theme_mode', tm);
        await setItem('display_density', dn);
        await setItem('theme_preset', tp);
      } catch {}
    })();
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    setItem('theme_mode', m);
  };

  const setDensity = (d: DisplayDensity) => {
    setDensityState(d);
    setItem('display_density', d);
  };

  const setPreset = (p: ThemePreset) => {
    setPresetState(p);
    setItem('theme_preset', p);
  };

  const { spacing, typography } = useMemo(() => resolveDensity(density), [density]);

  const presetColors = useMemo(() => resolveThemePreset(preset), [preset]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      mode,
      density,
      preset,
      setMode,
      setDensity,
      setPreset,
      colors: mode === 'light' ? presetColors.light : presetColors.dark,
      glass: mode === 'light' ? presetColors.glassLight : presetColors.glass,
      spacing,
      typography,
      baseTheme,
      presetColors,
    }),
    [mode, density, preset, spacing, typography, presetColors],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return ctx;
}
