import { Platform } from 'react-native';
import { isLowEndDevice } from '@/lib/devicePerformance';

const _isWeb = Platform.OS === 'web';
const _isLowEnd = isLowEndDevice();
const _noGlow = { shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 };

export type ThemePreset = 'cinematic-dark' | 'studio-light' | 'trendy-viral';

export interface ColorRamp {
  50: string; 100: string; 200: string; 300: string;
  400: string; 500: string; 600: string; 700: string;
  800: string; 900: string; 950?: string;
}

export interface ThemePresetColors {
  primary: ColorRamp;
  accent: ColorRamp;
  gold: ColorRamp;
  dark: ColorPalette;
  light: ColorPalette;
  glass: typeof theme.glass;
  glassLight: typeof theme.glassLight;
  glowPrimary: typeof theme.shadows.glowPrimary;
  glowAccent: typeof theme.shadows.glowAccent;
}

export const theme = {
  colors: {
    primary: {
      50: '#eef3ff',
      100: '#d9e6ff',
      200: '#bcd0ff',
      300: '#8eb0ff',
      400: '#6a97ff',
      500: '#4C7DFF',
      600: '#3a66e8',
      700: '#2f52cc',
      800: '#2845a8',
      900: '#233a82',
      950: '#1a2a5c',
    },
    accent: {
      50: '#e6fbf7',
      100: '#ccf6ee',
      200: '#a4ecdd',
      300: '#6dddc8',
      400: '#2DD4BF',
      500: '#2DD4BF',
      600: '#1ab5a3',
      700: '#149083',
      800: '#127268',
      900: '#0f5b53',
    },
    gold: {
      50: '#fdf9ec',
      100: '#faf0cf',
      200: '#f3dfa0',
      300: '#ecca6e',
      400: '#D4AF37',
      500: '#D4AF37',
      600: '#b8932b',
      700: '#967923',
      800: '#7a6120',
      900: '#5f4d1e',
    },
    success: {
      50: '#ecfdf5',
      100: '#d1fae5',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
    },
    neutral: {
      0: '#ffffff',
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
    dark: {
      bg: '#040B1B',
      surface: '#121C38',
      surfaceLight: '#1A2848',
      border: '#1E2D4F',
      text: '#FFFFFF',
      textDim: '#A6B0CF',
      textFaint: '#6B7BA0',
    },
    light: {
      bg: '#f0f4fa',
      surface: '#ffffff',
      surfaceLight: '#eef3fb',
      border: '#d6e0ee',
      text: '#0f172a',
      textDim: '#475569',
      textFaint: '#94a3b8',
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
    full: 9999,
  },
  typography: {
    fontFamily: {
      regular: 'PlusJakartaSans-Regular',
      medium: 'PlusJakartaSans-Medium',
      semiBold: 'PlusJakartaSans-SemiBold',
      bold: 'PlusJakartaSans-Bold',
    },
    title: 28,
    heading: 22,
    body: 16,
    caption: 14,
    micro: 12,
  },
  shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 12,
      elevation: 4,
    },
    elevated: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 8,
    },
    glowPrimary: _isLowEnd ? _noGlow : {
      shadowColor: '#4C7DFF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 0,
    },
    glowAccent: _isLowEnd ? _noGlow : {
      shadowColor: '#2DD4BF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 0,
    },
    glowSuccess: _isLowEnd ? _noGlow : {
      shadowColor: '#34d399',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 0,
    },
    glowWarning: _isLowEnd ? _noGlow : {
      shadowColor: '#fbbf24',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 0,
    },
  },
  glass: _isLowEnd
    ? {
        surface: '#121C38',
        surfaceLight: '#1A2848',
        border: '#1E2D4F',
        borderActive: '#2a4a6b',
        highlight: '#1A2848',
      }
    : _isWeb
      ? {
          surface: 'rgba(18, 28, 56, 0.72)',
          surfaceLight: 'rgba(26, 40, 72, 0.6)',
          border: 'rgba(255, 255, 255, 0.08)',
          borderActive: 'rgba(76, 125, 255, 0.25)',
          highlight: 'rgba(255, 255, 255, 0.04)',
        }
      : {
          surface: '#121C38',
          surfaceLight: '#1A2848',
          border: '#1E2D4F',
          borderActive: '#2a4a6b',
          highlight: '#1A2848',
        },
  glassLight: _isLowEnd
    ? {
        surface: '#ffffff',
        surfaceLight: '#eef3fb',
        border: '#d6e0ee',
        borderActive: '#a8c8e8',
        highlight: '#eef3fb',
      }
    : _isWeb
      ? {
          surface: 'rgba(255, 255, 255, 0.82)',
          surfaceLight: 'rgba(238, 243, 251, 0.7)',
          border: 'rgba(15, 23, 42, 0.08)',
          borderActive: 'rgba(47, 157, 255, 0.25)',
          highlight: 'rgba(15, 23, 42, 0.03)',
        }
      : {
          surface: '#ffffff',
          surfaceLight: '#eef3fb',
          border: '#d6e0ee',
          borderActive: '#a8c8e8',
          highlight: '#eef3fb',
        },
} as const;

// ─── Theme Presets ─────────────────────────────────────────────
// Each preset overrides primary/accent ramps, dark/light palettes,
// glass colors, and glow shadows. Everything else (spacing, radius,
// typography, success/warning/error ramps) is shared across presets.

const presetCinematicDark: ThemePresetColors = {
  primary: theme.colors.primary,
  accent: theme.colors.accent,
  gold: theme.colors.gold,
  dark: theme.colors.dark,
  light: theme.colors.light,
  glass: theme.glass,
  glassLight: theme.glassLight,
  glowPrimary: theme.shadows.glowPrimary,
  glowAccent: theme.shadows.glowAccent,
};

const presetStudioLight: ThemePresetColors = {
  primary: {
    50: '#eef6ff', 100: '#d9ebff', 200: '#bcdcff', 300: '#8ec5ff',
    400: '#5aa3ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
    800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
  },
  accent: {
    50: '#ecfeff', 100: '#cff7fe', 200: '#a4eefc', 300: '#6de1f8',
    400: '#22ccec', 500: '#06b3d4', 600: '#0892b2', 700: '#0d748f',
    800: '#155e75', 900: '#164e63',
  },
  gold: theme.colors.gold,
  dark: {
    bg: '#1a1a1a', surface: '#242424', surfaceLight: '#2e2e2e',
    border: '#3a3a3a', text: '#f5f5f5', textDim: '#a0a0a0', textFaint: '#6b6b6b',
  },
  light: {
    bg: '#fafafa', surface: '#ffffff', surfaceLight: '#f5f5f5',
    border: '#e0e0e0', text: '#1a1a1a', textDim: '#555555', textFaint: '#999999',
  },
  glass: _isLowEnd
    ? { surface: '#242424', surfaceLight: '#2e2e2e', border: '#3a3a3a', borderActive: '#3a5a7a', highlight: '#2e2e2e' }
    : _isWeb
      ? { surface: 'rgba(36,36,36,0.72)', surfaceLight: 'rgba(46,46,46,0.6)', border: 'rgba(255,255,255,0.08)', borderActive: 'rgba(90,163,255,0.25)', highlight: 'rgba(255,255,255,0.04)' }
      : { surface: '#242424', surfaceLight: '#2e2e2e', border: '#3a3a3a', borderActive: '#3a5a7a', highlight: '#2e2e2e' },
  glassLight: _isLowEnd
    ? { surface: '#ffffff', surfaceLight: '#f5f5f5', border: '#e0e0e0', borderActive: '#a8c8e8', highlight: '#f5f5f5' }
    : _isWeb
      ? { surface: 'rgba(255,255,255,0.82)', surfaceLight: 'rgba(245,245,245,0.7)', border: 'rgba(26,26,26,0.08)', borderActive: 'rgba(59,130,246,0.25)', highlight: 'rgba(26,26,26,0.03)' }
      : { surface: '#ffffff', surfaceLight: '#f5f5f5', border: '#e0e0e0', borderActive: '#a8c8e8', highlight: '#f5f5f5' },
  glowPrimary: _isLowEnd ? _noGlow : { shadowColor: '#5aa3ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 0 },
  glowAccent: _isLowEnd ? _noGlow : { shadowColor: '#22ccec', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 0 },
};

const presetTrendyViral: ThemePresetColors = {
  primary: {
    50: '#fdf2ff', 100: '#fce7ff', 200: '#fbcfff', 300: '#f8a8ff',
    400: '#f472ff', 500: '#e02eff', 600: '#c01de0', 700: '#9d14b8',
    800: '#7c1296', 900: '#5e0f74', 950: '#3e0a52',
  },
  accent: {
    50: '#ecfaff', 100: '#cff5fe', 200: '#a4ebfd', 300: '#6dd9fa',
    400: '#22c5f5', 500: '#06a8e0', 600: '#0888b8', 700: '#0d6e96',
    800: '#155a7a', 900: '#164a66',
  },
  gold: theme.colors.gold,
  dark: {
    bg: '#0d0a1a', surface: '#181225', surfaceLight: '#221a35',
    border: '#2e2545', text: '#f0e6ff', textDim: '#9888b8', textFaint: '#6a5a8a',
  },
  light: {
    bg: '#f8f5ff', surface: '#ffffff', surfaceLight: '#f3edff',
    border: '#e0d6f0', text: '#1a0f2e', textDim: '#5a4a7a', textFaint: '#9a8aba',
  },
  glass: _isLowEnd
    ? { surface: '#181225', surfaceLight: '#221a35', border: '#2e2545', borderActive: '#4a2a6b', highlight: '#221a35' }
    : _isWeb
      ? { surface: 'rgba(24,18,37,0.72)', surfaceLight: 'rgba(34,26,53,0.6)', border: 'rgba(255,255,255,0.08)', borderActive: 'rgba(244,114,255,0.25)', highlight: 'rgba(255,255,255,0.04)' }
      : { surface: '#181225', surfaceLight: '#221a35', border: '#2e2545', borderActive: '#4a2a6b', highlight: '#221a35' },
  glassLight: _isLowEnd
    ? { surface: '#ffffff', surfaceLight: '#f3edff', border: '#e0d6f0', borderActive: '#c8a8e8', highlight: '#f3edff' }
    : _isWeb
      ? { surface: 'rgba(255,255,255,0.82)', surfaceLight: 'rgba(243,237,255,0.7)', border: 'rgba(26,15,46,0.08)', borderActive: 'rgba(224,46,255,0.25)', highlight: 'rgba(26,15,46,0.03)' }
      : { surface: '#ffffff', surfaceLight: '#f3edff', border: '#e0d6f0', borderActive: '#c8a8e8', highlight: '#f3edff' },
  glowPrimary: _isLowEnd ? _noGlow : { shadowColor: '#f472ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 0 },
  glowAccent: _isLowEnd ? _noGlow : { shadowColor: '#22c5f5', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 0 },
};

export const themePresets: Record<ThemePreset, ThemePresetColors> = {
  'cinematic-dark': presetCinematicDark,
  'studio-light': presetStudioLight,
  'trendy-viral': presetTrendyViral,
};

export function resolveThemePreset(preset: ThemePreset): ThemePresetColors {
  return themePresets[preset] ?? presetCinematicDark;
}

export type ColorPalette = {
  bg: string; surface: string; surfaceLight: string; border: string;
  text: string; textDim: string; textFaint: string;
};
export type GlassColors = typeof theme.glass;
export type Spacing = { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
export type Typography = {
  fontFamily: { regular: string; medium: string; semiBold: string; bold: string };
  title: number; heading: number; body: number; caption: number; micro: number;
};
