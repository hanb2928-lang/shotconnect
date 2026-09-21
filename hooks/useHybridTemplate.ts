import { useEffect, useState } from 'react';
import {
  resolveHybridTemplate,
  getTemplateBadgeLabel,
  type HybridTemplateParams,
  type HybridTemplateResult,
} from '@/lib/hybridTemplate';

const MOOD_MAP: Record<string, string> = {
  energetic: 'upbeat',
  trendy: 'upbeat',
  chill: 'calm',
  calm: 'calm',
};

export interface UseHybridTemplateResult {
  result: HybridTemplateResult | null;
  badgeLabel: string | null;
  effectiveAccentColor: string;
  effectiveCardStyle: string;
  effectiveBgmMood: string;
  effectiveHookDurationSec: number;
  effectivePacingSeconds: number;
  effectiveSfxTriggers: string[];
  effectiveCaptionPreset: string;
  effectiveTransitionType: string;
  loading: boolean;
}

export function useHybridTemplate(
  params: HybridTemplateParams,
  fallbackAccentColor: string,
  fallbackCardStyle: string,
  fallbackBgmMood: string = 'upbeat',
): UseHybridTemplateResult {
  const [result, setResult] = useState<HybridTemplateResult | null>(null);
  const [loading, setLoading] = useState(true);

  const categoryKey = params.category || '';
  const platformKey = params.platform || '';

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    resolveHybridTemplate(params)
      .then((r) => {
        if (!mounted) return;
        setResult(r);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setResult(null);
        setLoading(false);
      });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKey, platformKey]);

  const badgeLabel = getTemplateBadgeLabel(result);
  const tpl = result?.template;

  return {
    result,
    badgeLabel,
    effectiveAccentColor: tpl?.accent_color || fallbackAccentColor,
    effectiveCardStyle: tpl?.card_style || fallbackCardStyle,
    effectiveBgmMood: tpl ? (MOOD_MAP[tpl.bgm_mood] || fallbackBgmMood) : fallbackBgmMood,
    effectiveHookDurationSec: tpl?.hook_duration_sec ?? 3,
    effectivePacingSeconds: tpl?.pacing_seconds ?? 1.2,
    effectiveSfxTriggers: tpl?.sfx_triggers ?? [],
    effectiveCaptionPreset: tpl?.caption_preset ?? 'bold_neon_yellow',
    effectiveTransitionType: tpl?.transition_type ?? 'whoosh',
    loading,
  };
}
