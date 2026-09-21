import { PLATFORM_SPECS, getPlatformSpec, type PlatformSpec } from './platformSpecs';
import type { ShortFormPlatform } from './shortFormEditEngine';
import type { UsageContext } from './aiSynthesisEngine';

export type PublishTarget = 'youtube' | 'instagram' | 'tiktok';

export interface RenderConfig {
  target: PublishTarget;
  width: number;
  height: number;
  aspectRatio: string;
  codec: string;
  bitrateMbps: number;
  fps: number;
  maxDurationSec: number;
  label: string;
}

export interface AiMetadata {
  title: string;
  description: string;
  hashtags: string[];
  category: string;
}

export interface PublishPlan {
  target: PublishTarget;
  render: RenderConfig;
  metadata: AiMetadata;
  scheduledAt: string | null;
  directPublishAvailable: boolean;
}

const RENDER_CONFIGS: Record<PublishTarget, RenderConfig> = {
  youtube: {
    target: 'youtube',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    codec: 'H.264',
    bitrateMbps: 12,
    fps: 30,
    maxDurationSec: 60,
    label: '유튜브 쇼츠',
  },
  instagram: {
    target: 'instagram',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    codec: 'H.264',
    bitrateMbps: 8,
    fps: 30,
    maxDurationSec: 90,
    label: '인스타그램 릴스',
  },
  tiktok: {
    target: 'tiktok',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    codec: 'H.264',
    bitrateMbps: 10,
    fps: 30,
    maxDurationSec: 600,
    label: '틱톡',
  },
};

const PLATFORM_HASHTAG_POOL: Record<PublishTarget, string[]> = {
  youtube: ['#쇼츠', '#shorts', '#숏폼', '#제품리뷰', '#꿀템'],
  instagram: ['#릴스', '#reels', '#제품추천', '#꿀템', '#인기'],
  tiktok: ['#틱톡', '#tiktok', '#제품', '#꿀템', '#viral'],
};

const CONTEXT_HASHTAGS: Record<UsageContext, string[]> = {
  unboxing: ['#언박싱', '#개봉', '#새제품'],
  desk_setup: ['#데스크셋업', '#작업환경', '#꿀템'],
  outdoor: ['#아웃도어', '#야외', '#여행꿀템'],
  kitchen: ['#주방템', '#요리', '#키친'],
  beauty: ['#뷰티', '#스킨케어', '#화장품'],
  fashion: ['#패션', '#코디', '#착장'],
  general: ['#추천', '#리뷰', '#인기'],
};

const CONTEXT_CATEGORIES: Record<UsageContext, string> = {
  unboxing: '리뷰',
  desk_setup: 'IT/디지털',
  outdoor: '아웃도어',
  kitchen: '주방/생활',
  beauty: '뷰티/케어',
  fashion: '패션/의류',
  general: '제품 소개',
};

function generateTitle(productName: string, context: UsageContext, target: PublishTarget): string {
  const ctxLabel: Record<UsageContext, string> = {
    unboxing: '언박싱',
    desk_setup: '데스크 셋업',
    outdoor: '야외 활용',
    kitchen: '주방 사용',
    beauty: '뷰티/케어',
    fashion: '패션 착장',
    general: '제품 소개',
  };

  const pName = productName.trim() || '이 제품';
  const prefix = target === 'youtube' ? '[쇼츠] ' : target === 'tiktok' ? '' : '';

  if (pName.length <= 15) {
    return `${prefix}${pName} ${ctxLabel[context]} | 이거 모르면 손해`;
  }
  return `${prefix}${pName.slice(0, 12)}... ${ctxLabel[context]}`;
}

function generateDescription(productName: string, context: UsageContext, target: PublishTarget): string {
  const pName = productName.trim() || '이 제품';
  const ctxDesc: Record<UsageContext, string> = {
    unboxing: '개봉 순간부터 설치까지, 생생한 언박싱 리뷰',
    desk_setup: '데스크 환경에서의 실제 사용감과 꿀팁',
    outdoor: '야외에서 진짜 빛나는 사용 시나리오',
    kitchen: '주방에서 바로 써보는 실용성 리뷰',
    beauty: '사용 전후 변화가 궁금하다면 끝까지',
    fashion: '착장 무드와 핏을 한눈에 확인',
    general: '제품의 핵심 매력을 15초 만에 확인',
  };

  const targetLabel = target === 'youtube' ? '유튜브 쇼츠' : target === 'instagram' ? '인스타그램 릴스' : '틱톡';
  return `${pName} ${ctxDesc[context]}\n\n${targetLabel}에서 만나는 15초 숏폼 리뷰.\n더 자세한 정보는 프로필 링크에서 확인하세요.\n\n본 영상은 광고/협찬이 포함될 수 있습니다.`;
}

function generateHashtags(context: UsageContext, target: PublishTarget): string[] {
  const pool = PLATFORM_HASHTAG_POOL[target];
  const ctxTags = CONTEXT_HASHTAGS[context];
  return [...ctxTags.slice(0, 3), ...pool.slice(0, 4)];
}

export function buildPublishPlan(
  target: PublishTarget,
  productName: string,
  context: UsageContext,
  scheduledAt: Date | null = null,
): PublishPlan {
  const render = RENDER_CONFIGS[target];
  const metadata: AiMetadata = {
    title: generateTitle(productName, context, target),
    description: generateDescription(productName, context, target),
    hashtags: generateHashtags(context, target),
    category: CONTEXT_CATEGORIES[context],
  };

  return {
    target,
    render,
    metadata,
    scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    directPublishAvailable: false,
  };
}

export function buildMultiPlatformPublishPlans(
  productName: string,
  context: UsageContext,
  targets: PublishTarget[] = ['youtube', 'instagram', 'tiktok'],
  scheduledAt: Date | null = null,
): PublishPlan[] {
  return targets.map((t) => buildPublishPlan(t, productName, context, scheduledAt));
}

export function getAllRenderConfigs(): RenderConfig[] {
  return Object.values(RENDER_CONFIGS);
}

export function getRenderConfig(target: PublishTarget): RenderConfig {
  return RENDER_CONFIGS[target];
}
