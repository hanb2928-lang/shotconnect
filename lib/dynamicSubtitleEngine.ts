/**
 * Dynamic Subtitle Auto-Styling Engine
 *
 * Automatically parses narration/caption text to identify high-impact
 * keywords (품절, 대란템, 3초, 특가, etc.) and applies the master
 * subtitle template with color-highlight + bounce/pop animation —
 * no manual style selection required.
 */

export type KeywordCategory = 'urgency' | 'social_proof' | 'benefit' | 'curiosity' | 'number' | 'cta';

export interface HighlightKeyword {
  text: string;
  category: KeywordCategory;
  startIndex: number;
  endIndex: number;
  color: string;
  animation: KeywordAnimation;
}

export type KeywordAnimation = 'pop' | 'bounce' | 'shake' | 'flash' | 'zoom';

export interface SubtitleTemplate {
  id: string;
  label: string;
  fontColor: string;
  fontSize: number;
  strokeWidth: number;
  strokeColor: string;
  shadowColor: string;
  highlightStyle: HighlightStyle;
  animationDefault: KeywordAnimation;
}

export interface HighlightStyle {
  bgColor: string;
  textColor: string;
  borderRadius: number;
  paddingH: number;
  paddingV: number;
}

export interface DynamicSubtitleResult {
  originalText: string;
  highlightedText: string;
  keywords: HighlightKeyword[];
  template: SubtitleTemplate;
  segmentStyles: SegmentSubtitleStyle[];
}

export interface SegmentSubtitleStyle {
  segmentIndex: number;
  text: string;
  keywordsInSegment: HighlightKeyword[];
  position: 'top' | 'center' | 'bottom';
  animationHints: AnimationHint[];
}

export interface AnimationHint {
  keyword: string;
  animation: KeywordAnimation;
  delaySec: number;
  durationSec: number;
}

const KEYWORD_PATTERNS: { category: KeywordCategory; patterns: string[]; color: string; animation: KeywordAnimation }[] = [
  {
    category: 'urgency',
    patterns: ['품절', '매진', '재입고', '마감', '한정', '선착순', '특가', '할인', '재고', '서둘러', '놓치면', '기회'],
    color: '#ef4444',
    animation: 'shake',
  },
  {
    category: 'social_proof',
    patterns: ['후기', '리뷰', '만 개', '4만', '10만', '폭발', '대란', '화제', '인기', '선택', '별점', '찜', '장바구니'],
    color: '#f59e0b',
    animation: 'bounce',
  },
  {
    category: 'benefit',
    patterns: ['꿀템', '꿀팁', '해결', '편리', '간편', '혁신', '변화', '바뀌', '차이', '효과', '달라', '깔끔'],
    color: '#10b981',
    animation: 'pop',
  },
  {
    category: 'curiosity',
    patterns: ['진짜', '실화', '비밀', '공개', '충격', '반전', '몰랐', '알아야', '필수', '주목'],
    color: '#3b82f6',
    animation: 'zoom',
  },
  {
    category: 'cta',
    patterns: ['프로필', '링크', '구매', '확인', '클릭', '지금', '바로', '저장', '공유', '팔로우'],
    color: '#8b5cf6',
    animation: 'flash',
  },
];

const NUMBER_REGEX = /\b\d+초\b|\b\d+분\b|\b\d+개\b|\b\d+만\b|\b\d+%\b|\b\d+원\b/g;

const MASTER_TEMPLATE: SubtitleTemplate = {
  id: 'top1_master',
  label: '상위 1% 마스터 자막',
  fontColor: '#ffffff',
  fontSize: 13,
  strokeWidth: 1.2,
  strokeColor: 'rgba(0,0,0,0.9)',
  shadowColor: 'rgba(0,0,0,0.8)',
  highlightStyle: {
    bgColor: 'rgba(0,0,0,0.7)',
    textColor: '#ffffff',
    borderRadius: 4,
    paddingH: 4,
    paddingV: 2,
  },
  animationDefault: 'pop',
};

export function findKeywordsInText(text: string): HighlightKeyword[] {
  const keywords: HighlightKeyword[] = [];
  const usedRanges: { start: number; end: number }[] = [];

  for (const group of KEYWORD_PATTERNS) {
    for (const pattern of group.patterns) {
      let searchFrom = 0;
      while (true) {
        const idx = text.indexOf(pattern, searchFrom);
        if (idx === -1) break;
        const endIndex = idx + pattern.length;

        const overlaps = usedRanges.some((r) => idx < r.end && endIndex > r.start);
        if (!overlaps) {
          keywords.push({
            text: pattern,
            category: group.category,
            startIndex: idx,
            endIndex,
            color: group.color,
            animation: group.animation,
          });
          usedRanges.push({ start: idx, end: endIndex });
        }
        searchFrom = endIndex;
      }
    }
  }

  let match: RegExpExecArray | null;
  NUMBER_REGEX.lastIndex = 0;
  while ((match = NUMBER_REGEX.exec(text)) !== null) {
    const idx = match.index;
    const endIndex = idx + match[0].length;
    const overlaps = usedRanges.some((r) => idx < r.end && endIndex > r.start);
    if (!overlaps) {
      keywords.push({
        text: match[0],
        category: 'number',
        startIndex: idx,
        endIndex,
        color: '#fbbf24',
        animation: 'pop',
      });
      usedRanges.push({ start: idx, end: endIndex });
    }
  }

  keywords.sort((a, b) => a.startIndex - b.startIndex);
  return keywords;
}

export function buildHighlightedText(text: string, keywords: HighlightKeyword[]): string {
  if (keywords.length === 0) return text;

  let result = '';
  let lastEnd = 0;
  for (const kw of keywords) {
    result += text.slice(lastEnd, kw.startIndex);
    result += `⟨${kw.text}⟩`;
    lastEnd = kw.endIndex;
  }
  result += text.slice(lastEnd);
  return result;
}

export function autoStyleSubtitle(
  text: string,
  segments?: { text: string; position: 'top' | 'center' | 'bottom' }[],
): DynamicSubtitleResult {
  const keywords = findKeywordsInText(text);
  const highlightedText = buildHighlightedText(text, keywords);
  const template = MASTER_TEMPLATE;

  const segmentStyles: SegmentSubtitleStyle[] = segments
    ? segments.map((seg, i) => {
        const segKeywords = keywords.filter((kw) => {
          const segStart = text.indexOf(seg.text);
          if (segStart === -1) return false;
          const segEnd = segStart + seg.text.length;
          return kw.startIndex >= segStart && kw.endIndex <= segEnd;
        });
        const animationHints: AnimationHint[] = segKeywords.map((kw, j) => ({
          keyword: kw.text,
          animation: kw.animation,
          delaySec: j * 0.15,
          durationSec: 0.4,
        }));
        return {
          segmentIndex: i,
          text: seg.text,
          keywordsInSegment: segKeywords,
          position: seg.position,
          animationHints,
        };
      })
    : [];

  return {
    originalText: text,
    highlightedText,
    keywords,
    template,
    segmentStyles,
  };
}

export function getKeywordCategoryLabel(category: KeywordCategory): string {
  const labels: Record<KeywordCategory, string> = {
    urgency: '긴급성',
    social_proof: '사회적 증거',
    benefit: '베네핏',
    curiosity: '호기심',
    number: '숫자 강조',
    cta: '행동 유도',
  };
  return labels[category];
}

export function getAnimationLabel(animation: KeywordAnimation): string {
  const labels: Record<KeywordAnimation, string> = {
    pop: '팝업',
    bounce: '바운스',
    shake: '쉐이크',
    flash: '플래시',
    zoom: '줌인',
  };
  return labels[animation];
}

export interface SubtitlePreviewSegment {
  plainText: string;
  highlightedParts: { text: string; color: string; animation: KeywordAnimation }[];
}

export function buildSubtitlePreview(text: string): SubtitlePreviewSegment[] {
  const keywords = findKeywordsInText(text);
  if (keywords.length === 0) return [{ plainText: text, highlightedParts: [] }];

  const parts: SubtitlePreviewSegment[] = [];
  let lastEnd = 0;
  for (const kw of keywords) {
    const before = text.slice(lastEnd, kw.startIndex);
    if (before) {
      parts.push({ plainText: before, highlightedParts: [] });
    }
    parts.push({
      plainText: '',
      highlightedParts: [{ text: kw.text, color: kw.color, animation: kw.animation }],
    });
    lastEnd = kw.endIndex;
  }
  const after = text.slice(lastEnd);
  if (after) {
    parts.push({ plainText: after, highlightedParts: [] });
  }
  return parts;
}
