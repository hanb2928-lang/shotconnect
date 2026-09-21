import { getDisclosureForPlatforms } from '@/lib/disclosure';

export type UploadPlatformKey = 'instagram' | 'blog' | 'tiktok' | 'youtube' | 'twitter' | 'pinterest' | 'naver_clip';

export type DisclosurePlacement = 'body' | 'comment';

export interface PlatformDeepLink {
  appUrl: string;
  webUrl: string;
  uploadAppUrl: string;
  uploadWebUrl: string;
  label: string;
}

const DEEP_LINKS: Record<UploadPlatformKey, PlatformDeepLink> = {
  instagram: {
    appUrl: 'instagram://story-camera',
    webUrl: 'https://www.instagram.com/reel/',
    uploadAppUrl: 'instagram://library?mediaType=video',
    uploadWebUrl: 'https://www.instagram.com/reel/',
    label: '인스타그램 릴스',
  },
  blog: {
    appUrl: 'com.naver.blog://open',
    webUrl: 'https://blog.naver.com/',
    uploadAppUrl: 'com.naver.blog://write',
    uploadWebUrl: 'https://blog.editor.naver.com/',
    label: '네이버 블로그',
  },
  tiktok: {
    appUrl: 'snssdk1128://',
    webUrl: 'https://www.tiktok.com/trending',
    uploadAppUrl: 'snssdk1128://upload',
    uploadWebUrl: 'https://www.tiktok.com/trending',
    label: '틱톡',
  },
  youtube: {
    appUrl: 'youtube://',
    webUrl: 'https://youtube.com/shorts/',
    uploadAppUrl: 'youtube://upload',
    uploadWebUrl: 'https://youtube.com/shorts/',
    label: '유튜브 숏츠',
  },
  twitter: {
    appUrl: 'twitter://post',
    webUrl: 'https://x.com/compose/post',
    uploadAppUrl: 'twitter://post',
    uploadWebUrl: 'https://x.com/compose/post',
    label: 'X(트위터)',
  },
  pinterest: {
    appUrl: 'pinterest://',
    webUrl: 'https://www.pinterest.com/pin/create/button/',
    uploadAppUrl: 'pinterest://pin/create/button/',
    uploadWebUrl: 'https://www.pinterest.com/pin/create/button/',
    label: '핀터레스트',
  },
  naver_clip: {
    appUrl: 'com.naverapp://open',
    webUrl: 'https://naver.me/',
    uploadAppUrl: 'com.naverapp://clip/upload',
    uploadWebUrl: 'https://naver.me/',
    label: '네이버 클립',
  },
};

export function getDeepLink(key: UploadPlatformKey | string): PlatformDeepLink {
  return DEEP_LINKS[key as UploadPlatformKey] ?? {
    appUrl: '',
    webUrl: '',
    uploadAppUrl: '',
    uploadWebUrl: '',
    label: key,
  };
}

export interface AlgorithmTip {
  label: string;
  desc: string;
}

export interface PlatformCaptionTemplate {
  hashtagSet: string[];
  captionStyle: string;
  titleMaxLen: number;
  bodyHint: string;
  titleHint: string;
  algorithmTips: AlgorithmTip[];
  hashtagStrategy: string;
  linkGuidance: string;
  disclosureDefault: DisclosurePlacement;
}

const CAPTION_TEMPLATES: Record<UploadPlatformKey, PlatformCaptionTemplate> = {
  instagram: {
    hashtagSet: ['#협찬', '#제휴마케팅', '#쿠팡파트너스', '#광고', '#제품협찬', '#리뷰'],
    captionStyle: '본문 감성 문구 + 하단 최적화 해시태그 + 프로필 링크 안내',
    titleMaxLen: 125,
    titleHint: '첫 줄 후킹 문장 (피드에서 보임, 125자 이내)',
    bodyHint: '감성 캡션 본문',
    hashtagStrategy: '본문 최하단에 배치 — IG 알고리즘은 해시태그를 본문 말미에서 인식',
    linkGuidance: '본문 링크는 클릭 불가 — "프로필 링크에서 확인하세요" 안내 필수',
    disclosureDefault: 'body',
    algorithmTips: [
      { label: '첫 줄 후킹', desc: '피드에서 첫 1-2줄만 보이므로 후킹 문장을 최상단에 배치' },
      { label: '해시태그 위치', desc: '본문 하단에 "." 줄을 넣어 가독성을 높이고 해시태그를 분리' },
      { label: '프로필 링크', desc: '인스타그램은 본문 링크가 클릭되지 않으므로 프로필 링크로 유도' },
      { label: '공정위 문구', desc: '본문 최상단에 표시 — 댓글에만 넣으면 노출 위반 가능' },
    ],
  },
  blog: {
    hashtagSet: ['#제휴마케팅', '#광고', '#블로그리뷰'],
    captionStyle: '제목 중심의 간결한 문구 + 댓글용 단축 링크 별도 제공',
    titleMaxLen: 100,
    titleHint: '블로그 제목 (100자 이내)',
    bodyHint: '본문 내용',
    hashtagStrategy: '본문 말미에 배치 — 검색 SEO에 도움',
    linkGuidance: '본문에 단축 링크 직접 삽입 가능',
    disclosureDefault: 'body',
    algorithmTips: [
      { label: '제목 최적화', desc: '검색 노출을 위해 제목에 핵심 키워드 포함' },
      { label: '본문 링크', desc: '블로그는 본문 내 링크 클릭 가능 — 직접 삽입' },
    ],
  },
  tiktok: {
    hashtagSet: ['#제휴', '#광고', '#tiktokmademebuyit', '#오늘의장바구니', '#추천', '#광고포함'],
    captionStyle: '트렌드 맞춤 원라이너 캡션 + 추천 알고리즘 타겟팅 태그',
    titleMaxLen: 100,
    titleHint: '원라이너 캡션 (100자 이내)',
    bodyHint: '추가 설명 (선택)',
    hashtagStrategy: '트렌드 태그(#tiktokmademebuyit) + 제휴 태그 조합 — For You 알고리즘 타겟팅',
    linkGuidance: '바이오 링크로 유도 — TikTok은 본문 링크 클릭 불가',
    disclosureDefault: 'body',
    algorithmTips: [
      { label: '짧은 캡션', desc: 'TikTok 알고리즘은 짧고 임팩트 있는 캡션을 선호 — 100자 이내 권장' },
      { label: '트렌드 태그', desc: '#tiktokmademebuyit 등 트렌드 태그가 For You 페이지 노출을 높임' },
      { label: '바이오 링크', desc: '본문 링크는 클릭 불가 — "바이오 링크 확인" 안내 필요' },
      { label: '공정위 문구', desc: '본문에 포함 — TikTok은 텍스트 오버레이에도 표시 권장' },
    ],
  },
  youtube: {
    hashtagSet: ['#쇼츠', '#제휴마케팅', '#광고', '#Shorts', '#숏츠'],
    captionStyle: '제목(100자 이내) + 본문 단축링크 + 댓글용 공정위 문구 양식',
    titleMaxLen: 100,
    titleHint: '숏츠 제목 (100자 이내)',
    bodyHint: '본문 설명 (단축 링크 포함)',
    hashtagStrategy: '#Shorts 태그 필수 — Shorts 피드 진입 조건, 그 외 태그는 본문 말미',
    linkGuidance: '본문 설명란에 단축 링크 삽입 + 댓글에 고정 링크 권장',
    disclosureDefault: 'comment',
    algorithmTips: [
      { label: '제목 최적화', desc: '제목은 100자 이내 — 검색과 추천 모두 제목에 의존하므로 키워드 필수' },
      { label: '#Shorts 태그', desc: '#Shorts 또는 #쇼츠 태그가 없으면 Shorts 피드에 진입하지 못함' },
      { label: '댓글 고정', desc: '제휴 링크와 공정위 문구를 댓글에 작성 후 고정하면 노출 효과 극대화' },
      { label: '공정위 문구', desc: '댓글에 별도 작성 + 고정 — 본문 설명이 접혀있는 UX를 고려' },
    ],
  },
  twitter: {
    hashtagSet: ['#광고', '#제휴', '#제휴마케팅'],
    captionStyle: '간결한 한 줄 요약 + 단축 링크 + 공정위 문구',
    titleMaxLen: 280,
    titleHint: '트윗 본문 (280자 이내)',
    bodyHint: '추가 내용 (선택)',
    hashtagStrategy: '본문 말미에 2-3개만 — 너무 많으면 스팸으로 분류될 수 있음',
    linkGuidance: '본문에 단축 링크 직접 삽입',
    disclosureDefault: 'body',
    algorithmTips: [
      { label: '280자 제한', desc: '전체 트윗이 280자 이내 — 링크가 23자를 차지하므로 문구를 간결하게' },
      { label: '해시태그 최소화', desc: '2-3개만 사용 — 과도한 태그는 알고리즘 노출을 낮춤' },
    ],
  },
  pinterest: {
    hashtagSet: ['#제휴마케팅', '#광고', '#핀터레스트', '#인테리어', '#레시피', '#라이프스타일', '#추천', '#광고포함'],
    captionStyle: '감성 디스크립션 + 키워드 중심 핀 제목 + 링크 클릭 유도',
    titleMaxLen: 100,
    titleHint: '핀 제목 (100자 이내, 키워드 포함)',
    bodyHint: '핀 설명 (감성 문구 + 키워드)',
    hashtagStrategy: '핀 설명에 키워드를 자연스럽게 배치 — 핀터레스트 검색 SEO 최적화',
    linkGuidance: '핀에 직접 링크 연결 가능 — "링크에서 확인" CTA 권장',
    disclosureDefault: 'body',
    algorithmTips: [
      { label: '키워드 최적화', desc: '핀 제목과 설명에 검색 키워드를 자연스럽게 포함 — 핀터레스트는 시각적 검색 엔진' },
      { label: '세로 이미지', desc: '2:3 비율(예: 1000x1500px) 세로 이미지가 스마트필드에서 가장 잘 보임' },
      { label: '링크 직접 연결', desc: '핀에 단축 링크를 직접 연결 — 클릭 시 랜딩페이지로 이동 가능' },
      { label: '공정위 문구', desc: '핀 설명에 포함 — 광고 핀임을 명시' },
    ],
  },
  naver_clip: {
    hashtagSet: ['#제휴마케팅', '#광고', '#네이버클립', '#숏클립', '#광고포함'],
    captionStyle: '검색 최적화 제목 + 본문 단축링크 + 공정위 문구',
    titleMaxLen: 100,
    titleHint: '클립 제목 (100자 이내, 검색 키워드 포함)',
    bodyHint: '클립 설명 (단축 링크 포함)',
    hashtagStrategy: '네이버 검색 키워드 중심 — 본문 말미에 배치',
    linkGuidance: '본문에 단축 링크 직접 삽입 가능',
    disclosureDefault: 'body',
    algorithmTips: [
      { label: '검색 최적화', desc: '네이버 클립은 검색 유입이 강함 — 제목에 핵심 키워드 필수' },
      { label: '세로 영상', desc: '9:16 비율 세로 영상이 권장 — 60초 이내' },
      { label: '본문 링크', desc: '클립 설명에 단축 링크 직접 삽입 가능' },
      { label: '공정위 문구', desc: '본문에 포함 — 광고 클립임을 명시' },
    ],
  },
};

export function getCaptionTemplate(key: UploadPlatformKey): PlatformCaptionTemplate {
  return CAPTION_TEMPLATES[key];
}

export interface BuiltCaption {
  title: string;
  body: string;
  hashtags: string;
  fullText: string;
  commentDisclosure: string;
  commentText: string;
  linkGuidance: string;
}

export function buildPlatformCaption(
  key: UploadPlatformKey,
  contentText: string,
  affiliateUrl: string,
  disclosurePlatforms: string[],
  autoDisclosure: boolean,
  disclosurePlacement: DisclosurePlacement = 'body',
): BuiltCaption {
  const tmpl = getCaptionTemplate(key);
  const disclosure = getDisclosureForPlatforms(disclosurePlatforms, autoDisclosure);
  const baseCaption = contentText.trim() || '마케팅 문구를 입력하면 여기에 표시됩니다.';
  const hashtags = tmpl.hashtagSet.join(' ');
  const trimmedUrl = affiliateUrl.trim();
  const effectivePlacement = disclosurePlacement || tmpl.disclosureDefault;
  const disclosureInBody = effectivePlacement === 'body';

  let title: string;
  let body: string;
  let fullText: string;

  switch (key) {
    case 'instagram': {
      title = baseCaption.slice(0, tmpl.titleMaxLen);
      const linkHint = trimmedUrl ? `\n\n프로필 링크에서 확인하세요 👆` : '';
      body = `${disclosureInBody && disclosure ? disclosure + '\n\n' : ''}${baseCaption}${linkHint}`;
      fullText = `${body}\n\n.\n.\n.\n${hashtags}`;
      break;
    }
    case 'blog': {
      title = baseCaption.slice(0, tmpl.titleMaxLen);
      body = `${disclosureInBody && disclosure ? disclosure + '\n\n' : ''}${baseCaption}${trimmedUrl ? '\n\n단축 링크: ' + trimmedUrl : ''}`;
      fullText = `${title}\n\n${body}${hashtags ? '\n\n' + hashtags : ''}`;
      break;
    }
    case 'tiktok': {
      title = baseCaption.slice(0, tmpl.titleMaxLen);
      const linkHint = trimmedUrl ? '\n바이오 링크에서 확인!' : '';
      body = `${baseCaption}${linkHint}`;
      fullText = `${disclosureInBody && disclosure ? disclosure + '\n' : ''}${body}\n${hashtags}`;
      break;
    }
    case 'youtube': {
      title = baseCaption.slice(0, tmpl.titleMaxLen);
      body = `${baseCaption}${trimmedUrl ? '\n\n단축 링크: ' + trimmedUrl : ''}`;
      fullText = `${disclosureInBody && disclosure ? disclosure + '\n\n' : ''}${body}${hashtags ? '\n\n' + hashtags : ''}`;
      break;
    }
    case 'twitter': {
      title = baseCaption.slice(0, tmpl.titleMaxLen);
      body = `${baseCaption}${trimmedUrl ? ' ' + trimmedUrl : ''}`;
      fullText = `${disclosureInBody && disclosure ? disclosure + '\n' : ''}${body} ${hashtags}`;
      break;
    }
    case 'pinterest': {
      title = baseCaption.slice(0, tmpl.titleMaxLen);
      const linkHint = trimmedUrl ? `\n\n링크에서 확인하세요 👉 ${trimmedUrl}` : '';
      body = `${disclosureInBody && disclosure ? disclosure + '\n\n' : ''}${baseCaption}${linkHint}`;
      fullText = `${body}\n\n${hashtags}`;
      break;
    }
    case 'naver_clip': {
      title = baseCaption.slice(0, tmpl.titleMaxLen);
      body = `${disclosureInBody && disclosure ? disclosure + '\n\n' : ''}${baseCaption}${trimmedUrl ? '\n\n단축 링크: ' + trimmedUrl : ''}`;
      fullText = `${body}${hashtags ? '\n\n' + hashtags : ''}`;
      break;
    }
    default:
      title = baseCaption;
      body = baseCaption;
      fullText = `${disclosureInBody && disclosure ? disclosure + '\n\n' : ''}${baseCaption}`;
  }

  const commentDisclosure = !disclosureInBody ? disclosure : '';
  const commentText = commentDisclosure
    ? `${commentDisclosure}${trimmedUrl ? '\n\n단축 링크: ' + trimmedUrl : ''}`
    : '';

  return { title, body, hashtags, fullText, commentDisclosure, commentText, linkGuidance: tmpl.linkGuidance };
}

export function getCaptionStyleDescription(key: UploadPlatformKey): string {
  return getCaptionTemplate(key).captionStyle;
}

export function getAlgorithmTips(key: UploadPlatformKey): AlgorithmTip[] {
  return getCaptionTemplate(key).algorithmTips;
}

export function getHashtagStrategy(key: UploadPlatformKey): string {
  return getCaptionTemplate(key).hashtagStrategy;
}

export function getLinkGuidance(key: UploadPlatformKey): string {
  return getCaptionTemplate(key).linkGuidance;
}
