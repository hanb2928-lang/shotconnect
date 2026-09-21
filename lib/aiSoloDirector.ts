import { buildShortFormEditPlan, EditSegment, BgmTemplate, ShortFormEditPlan } from './shortFormEditEngine';
import { buildDirectingPlan, DirectingPlan, getDirectingSummary } from './directingEngine';
import { generateNanoFusedAnalysis, NanoAnalysisResult, PsychScene } from './psychologyEngine';
import { generateHook, HookResult } from './hyperHumanEngine';
import {
  buildViralAudioSyncProfile,
  ViralAudioSyncProfile,
  PlatformKey,
  ContentPurpose,
  buildRegenerationPayload,
  getSyncAccuracyLabel,
} from './viralAudioSyncEngine';
import { mapVoiceKeyToProsody } from './prosodyProfile';
import { DEFAULT_DURATION } from './durationPresets';
import { autoSelectHook, type AutoHookResult } from './autoHookEngine';
import { autoStyleSubtitle, type DynamicSubtitleResult } from './dynamicSubtitleEngine';

export interface SoloDirectorInput {
  productName: string;
  productCategory?: string;
  priceEstimate?: string;
  oneLiner?: string;
  productAdvantages?: string[];
  platform: string;
  board?: string;
  strategy?: string;
  customPrompt?: string;
  totalDurationMs?: number;
  hookType?: 'reversal' | 'empathy' | 'selfDeprecating';
  affiliatePlatforms?: string[];
  scanId?: string | null;
}

export interface SoloDirectorScript {
  hook: string;
  fullScript: string;
  segments: { label: string; startSec: number; endSec: number; text: string; emotion: string }[];
  ctaText: string;
}

export interface SoloDirectorCaptionPlan {
  captions: {
    startSec: number;
    endSec: number;
    text: string;
    position: 'top' | 'center' | 'bottom';
    emphasis: boolean;
    fontSize: number;
  }[];
  hookKeywordTypography: string;
  captionStyle: string;
}

export interface SoloDirectorResult {
  status: 'ok';
  productName: string;
  platform: string;
  editPlan: ShortFormEditPlan;
  directingPlan: DirectingPlan;
  nanoAnalysis: NanoAnalysisResult;
  hookResult: HookResult;
  script: SoloDirectorScript;
  captionPlan: SoloDirectorCaptionPlan;
  syncProfile: ViralAudioSyncProfile;
  regenerationPayload: string;
  directingSummary: string;
  syncAccuracyLabel: string;
  estimatedConversionBoost: number;
  fusionScenes: PsychScene[];
  autoHook: AutoHookResult;
  dynamicSubtitle: DynamicSubtitleResult;
  message: string;
}

function mapPlatformToSyncKey(platform: string): PlatformKey {
  const map: Record<string, PlatformKey> = {
    tiktok: 'tiktok',
    youtube: 'shorts',
    shorts: 'shorts',
    instagram: 'reels',
    reels: 'reels',
    naver_clip: 'naverclip',
    naverclip: 'naverclip',
  };
  return map[platform] ?? 'shorts';
}

function buildScript(
  hookResult: HookResult,
  editPlan: ShortFormEditPlan,
  nanoScenes: PsychScene[],
  productName: string,
): SoloDirectorScript {
  const segments = editPlan.segments.map((seg, i) => {
    const scene = nanoScenes[i % nanoScenes.length];
    return {
      label: seg.label,
      startSec: seg.startSec,
      endSec: seg.endSec,
      text: seg.textOverlay || scene?.textOverlay || '',
      emotion: scene?.emotion ?? 'curiosity',
    };
  });

  const fullScript = [
    `[0-3초] ${hookResult.hook}`,
    ...segments.slice(1).map((s) => `[${s.startSec}-${s.endSec}초] ${s.text}`),
  ].join('\n');

  const ctaSegment = segments[segments.length - 1];
  const ctaText = ctaSegment?.text ?? '지금 바로 확인하세요';

  return { hook: hookResult.hook, fullScript, segments, ctaText };
}

function buildCaptionPlan(
  editPlan: ShortFormEditPlan,
  directingPlan: DirectingPlan,
  nanoScenes: PsychScene[],
): SoloDirectorCaptionPlan {
  const captions = directingPlan.killPointCaptions.map((cap, i) => {
    const scene = nanoScenes[i % nanoScenes.length];
    return {
      startSec: cap.startSec,
      endSec: cap.endSec,
      text: cap.text,
      position: cap.position,
      emphasis: cap.emphasis,
      fontSize: scene?.fontSize ?? 44,
    };
  });

  const hookKeywordTypography = editPlan.platform === 'tiktok'
    ? '대담한 산세리프, 화면 중앙 대형, 2줄 이내, 키워드마다 색상 반전'
    : editPlan.platform === 'instagram'
    ? '우아한 산세리프, 하단 그라데이션 오버레이, 핵심 키워드만 강조'
    : '굵은 산세리프, 상단 고대비, 검색 키워드 중심 배치';

  return {
    captions,
    hookKeywordTypography,
    captionStyle: editPlan.captionStyle,
  };
}

export async function runSoloDirector(input: SoloDirectorInput): Promise<SoloDirectorResult> {
  const {
    productName,
    productCategory = '',
    priceEstimate = '',
    oneLiner = '',
    productAdvantages = [],
    platform,
    board = 'video',
    strategy = 'nano_analysis',
    customPrompt = '',
    totalDurationMs = DEFAULT_DURATION,
    hookType = 'reversal',
    affiliatePlatforms = [],
    scanId = null,
  } = input;

  const autoHook = autoSelectHook({
    productName,
    productCategory,
    priceEstimate,
    customPrompt,
  });

  const editPlan = buildShortFormEditPlan(
    platform,
    customPrompt,
    autoHook.selected.text,
    productName,
    affiliatePlatforms,
    true,
    false,
  );

  const directingPlan = buildDirectingPlan(
    editPlan.segments,
    editPlan.bgmTemplate,
    'general',
    platform,
  );

  const nanoAnalysis = await generateNanoFusedAnalysis(
    platform,
    board,
    strategy,
    { productName, price: priceEstimate, description: oneLiner },
    { ratio: '9:16', resolution: '1080×1920', maxDuration: `${Math.round(totalDurationMs / 1000)}초`, format: 'MP4' },
  );

  const hookResult = generateHook(
    hookType,
    productName,
    autoHook.selected.text,
    [],
  );

  const script = buildScript(hookResult, editPlan, nanoAnalysis.fusedScenes, productName);
  const captionPlan = buildCaptionPlan(editPlan, directingPlan, nanoAnalysis.fusedScenes);

  const dynamicSubtitle = autoStyleSubtitle(
    script.fullScript,
    editPlan.segments.map((s) => ({ text: s.textOverlay, position: s.position })),
  );

  const syncKey = mapPlatformToSyncKey(platform);
  const purpose: ContentPurpose = 'monetization';
  const prosodyProfile = mapVoiceKeyToProsody('m2_trendy_hype');
  const scriptText = script.fullScript;
  const syncProfile = buildViralAudioSyncProfile(
    syncKey,
    purpose,
    totalDurationMs,
    prosodyProfile,
    scriptText,
  );

  const regenerationPayload = buildRegenerationPayload(syncProfile, customPrompt);

  return {
    status: 'ok',
    productName,
    platform,
    editPlan,
    directingPlan,
    nanoAnalysis,
    hookResult,
    script,
    captionPlan,
    syncProfile,
    regenerationPayload,
    directingSummary: getDirectingSummary(directingPlan),
    syncAccuracyLabel: getSyncAccuracyLabel(syncProfile),
    estimatedConversionBoost: nanoAnalysis.analysisReport.estimatedConversionBoost,
    fusionScenes: nanoAnalysis.fusedScenes,
    autoHook,
    dynamicSubtitle,
    message: `AI 1인 연출가 완료: ${productName} · ${platform} · ${getDirectingSummary(directingPlan)}`,
  };
}
