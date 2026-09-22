import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { safeFetch } from '@/lib/apiClient';
import { aiCachedCall } from '@/lib/aiCache';

export interface CutSegment {
  startSec: number;
  endSec: number;
  label: string;
  purpose: string;
}

export interface CopyVariant {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  disclosure: string;
}

export interface EditPlan {
  duration: 15 | 30;
  totalSegments: number;
  segments: CutSegment[];
  hookTiming: { firstHookSec: number; reason: string };
  psychology: {
    principle: string;
    application: string;
    triggerPoint: string;
  };
  antiAlgorithm: {
    copyVariation: string;
    pacingStrategy: string;
    visualChangeStrategy: string;
    audioChangeStrategy: string;
  };
  copyVariants: CopyVariant[];
  musicMood: string;
  motionPreset: string;
  reason: string;
}

interface EditPlanResponse {
  plan: EditPlan;
}

const EDIT_PLAN_URL = `${supabaseUrl}/functions/v1/generate-video-edit-plan`;

export type PsychologyPreset = 'auto' | 'loss_aversion' | 'curiosity_gap' | 'fomo' | 'social_proof';

export async function fetchVideoEditPlan(params: {
  productName?: string;
  productCategory?: string;
  videoDuration: 15 | 30;
  platform?: string;
  accentColor?: string;
  hook?: string;
  oneLiner?: string;
  psychologyPreset?: PsychologyPreset;
}): Promise<EditPlan> {
  const cacheInput: Record<string, unknown> = {
    task: 'video-edit-plan',
    productName: params.productName || '',
    productCategory: params.productCategory || '',
    videoDuration: params.videoDuration,
    platform: params.platform || '',
    accentColor: params.accentColor || '',
    hook: params.hook || '',
    oneLiner: params.oneLiner || '',
    psychologyPreset: params.psychologyPreset || 'auto',
  };

  const { data } = await aiCachedCall<EditPlan>(
    'video-edit-plan',
    cacheInput,
    async () => {
      const resp = await safeFetch(EDIT_PLAN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(params),
        timeoutMs: 30000,
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: '편집 계획 생성에 실패했습니다.' }));
        throw new Error(errData.error || `요청 실패 (${resp.status})`);
      }
      const respData = (await resp.json()) as EditPlanResponse;
      if (!respData.plan || typeof respData.plan !== 'object') {
        throw new Error('편집 계획을 불러오지 못했습니다.');
      }
      const p = respData.plan;
      if (!Array.isArray(p.segments) || !Array.isArray(p.copyVariants)) {
        throw new Error('편집 계획 데이터가 올바르지 않습니다.');
      }
      return {
        ...p,
        segments: p.segments,
        copyVariants: p.copyVariants.map((v) => ({
          hook: v.hook ?? '',
          body: v.body ?? '',
          cta: v.cta ?? '',
          hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
          disclosure: v.disclosure ?? '',
        })),
        hookTiming: p.hookTiming ?? { firstHookSec: 0, reason: '' },
        psychology: p.psychology ?? { principle: '', application: '', triggerPoint: '' },
        antiAlgorithm: p.antiAlgorithm ?? { copyVariation: '', pacingStrategy: '', visualChangeStrategy: '', audioChangeStrategy: '' },
        musicMood: p.musicMood ?? '하이텐션',
        motionPreset: p.motionPreset ?? 'zoom_in',
        reason: p.reason ?? '',
        duration: p.duration ?? params.videoDuration,
        totalSegments: p.totalSegments ?? p.segments.length,
      };
    },
    'gpt-4o',
  );
  return data;
}
