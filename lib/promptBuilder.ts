/**
 * Vision AI 기반 사물 분석 + 마케팅 카피 자동 생성
 * 5장 입체컷 이미지를 분석하여 사물 카테고리, 소재/질감, 색상, 디자인 포인트를 추출하고
 * 15초 광고에 맞는 후킹성 카피(타이틀, 특징 카피, CTA)를 자동 생성한다.
 */

import type { ProductVisionResult } from './productVision';

export interface MarketingCopySet {
  title: string;
  hookCopy: string;
  featureCopy: string;
  ctaCopy: string;
  subtitleCopy: string;
}

export interface AnalyzedProductInfo {
  category: string;
  material: string;
  texture: string;
  colors: string[];
  designPoints: string[];
  shape: string;
  marketingPoints: string[];
  copySet: MarketingCopySet;
}

const CATEGORY_COPY_TEMPLATES: Record<string, { title: string; hook: string; feature: string; cta: string; subtitle: string }> = {
  bag: {
    title: '이 가방 쓰면 다른 거 못 씀',
    hook: '이거 모르면 호구 되는 거임',
    feature: '소재 진짜 · 수납 미쳤음 · 디자인 갑',
    cta: '여기서 샀더니 편하더라 — 링크 남겨둠',
    subtitle: '왜 다들 이 가방 쓰는지 알겠음',
  },
  shoes: {
    title: '신어보면 다른 거 못 신음',
    hook: '발이 먼저 아는 차이 진짜임',
    feature: '초경량 · 숨 쉬는 메쉬 · 그립 갑',
    cta: '오늘 신고 내일부터 다를 거 — 링크',
    subtitle: '움직임의 자유 실화',
  },
  electronics: {
    title: '작은데 성능 미쳤음',
    hook: '이 성능에 이 가격 실화?',
    feature: '최신 칩 · 초고속 충전 · 올데이 배터리',
    cta: '지금 주문하면 내일 옴 — 링크 남김',
    subtitle: '일상 효율 200% 올라감',
  },
  fashion: {
    title: '입는 순간 달라짐 진짜',
    hook: '이 옷 입고 거울 본 사람 반응 ㅋㅋ',
    feature: '원단 진짜 · 핏 갑 · 계절감 딱',
    cta: '나만의 핏 찾으셈 — 여기 링크',
    subtitle: '무드 완성하는 거 실화',
  },
  beauty: {
    title: '피부가 먼저 반응함',
    hook: '바르고 3일, 다들 뭐 쓰냐고 물어봄',
    feature: '처방 성분 · 무자극 · 글로우 진짜',
    cta: '지금 시작하면 변화 확인됨 — 링크',
    subtitle: '피부 가능성 깨우는 거 맞음',
  },
  food: {
    title: '한 입에 기분 좋아지는 맛',
    hook: '이 맛 모르면 손해인 거 맞음',
    feature: '신선 원재료 · 직접 생산 · 풍미 갑',
    cta: '오늘 저녁에 바로 즐겨보셈 — 링크',
    subtitle: '일상 미식 한 단계 올라감',
  },
  home: {
    title: '이거 하나로 집이 호텔됨',
    hook: '이거 안 쓰면 매달 돈 날리는 거',
    feature: '내추럴 소재 · 공간 활용 · 감각 디자인',
    cta: '지금 구매하면 공간 업그레이드 — 링크',
    subtitle: '살고 싶은 공간 만드는 거 진짜',
  },
  default: {
    title: '이거 쓰면 다른 거 못 씀',
    hook: '왜 이제야 알았지 진짜',
    feature: '퀄리티 갑 · 실용적 · 가성비 진짜',
    cta: '여기서 샀더니 편하더라 — 링크 남겨둠',
    subtitle: '일상 기준 높아지는 거 실화',
  },
};

function categorizeProduct(vision: ProductVisionResult): string {
  const text = `${vision.productName} ${vision.productCategory} ${vision.materialGuess} ${vision.shapeDescription}`.toLowerCase();
  if (/bag|가방|백|핸드백|숄더|토트|크로스|backpack/.test(text)) return 'bag';
  if (/shoe|신발|운동화|스니커|부츠|sneaker|boot/.test(text)) return 'shoes';
  if (/electronic|전자|폰|노트북|이어폰|충전|스피커|phone|laptop|earphone|speaker|gadget/.test(text)) return 'electronics';
  if (/fashion|의류|옷|셔츠|드레스|자켓|팬츠|shirt|dress|jacket|pants|clothing/.test(text)) return 'fashion';
  if (/beauty|화장|스킨|크림|샴푸|코스메틱|cosmetic|skincare|makeup/.test(text)) return 'beauty';
  if (/food|식품|간식|커피|차|snack|coffee|tea|gourmet/.test(text)) return 'food';
  if (/home|가전|홈|인테리어|가구|조명|furniture|lighting|decor|kitchen/.test(text)) return 'home';
  return 'default';
}

export function buildMarketingCopy(vision: ProductVisionResult): MarketingCopySet {
  const cat = categorizeProduct(vision);
  const template = CATEGORY_COPY_TEMPLATES[cat] ?? CATEGORY_COPY_TEMPLATES.default;

  const topFeature = vision.visualFeatures[0] ?? template.feature;
  const topMarketing = vision.marketingPoints[0] ?? '';
  const colorStr = vision.colorPalette.length > 0 ? vision.colorPalette.slice(0, 2).join(' · ') : '';

  const title = topMarketing || template.title;
  const hookCopy = template.hook;
  const featureCopy = [topFeature, colorStr, vision.materialGuess].filter(Boolean).join(' · ') || template.feature;
  const ctaCopy = template.cta;
  const subtitleCopy = template.subtitle;

  return { title, hookCopy, featureCopy, ctaCopy, subtitleCopy };
}

export function buildAnalyzedProductInfo(vision: ProductVisionResult): AnalyzedProductInfo {
  const cat = categorizeProduct(vision);
  return {
    category: cat,
    material: vision.materialGuess,
    texture: vision.textureDescription,
    colors: vision.colorPalette,
    designPoints: vision.visualFeatures.slice(0, 5),
    shape: vision.shapeDescription,
    marketingPoints: vision.marketingPoints.slice(0, 3),
    copySet: buildMarketingCopy(vision),
  };
}

export interface CopyOverlayTimeline {
  startSec: number;
  endSec: number;
  text: string;
  position: 'top' | 'bottom' | 'center';
  style: 'title' | 'feature' | 'cta';
}

export function buildCopyOverlayTimeline(copySet: MarketingCopySet): CopyOverlayTimeline[] {
  return [
    { startSec: 0, endSec: 3.5, text: copySet.hookCopy, position: 'top', style: 'title' },
    { startSec: 3.5, endSec: 7.5, text: copySet.title, position: 'center', style: 'title' },
    { startSec: 7.5, endSec: 11.5, text: copySet.featureCopy, position: 'bottom', style: 'feature' },
    { startSec: 11.5, endSec: 15, text: copySet.ctaCopy, position: 'bottom', style: 'cta' },
  ];
}

export function getActiveCopyOverlay(timeline: CopyOverlayTimeline[], currentSec: number): CopyOverlayTimeline | null {
  return timeline.find((t) => currentSec >= t.startSec && currentSec < t.endSec) ?? null;
}
