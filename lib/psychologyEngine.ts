export type EmotionPhase = 'curiosity' | 'shock' | 'empathy' | 'desire' | 'action';

export interface PsychScene {
  time: string;
  hook: string;
  desc: string;
  emotion: EmotionPhase;
  textOverlay: string;
  subtext: string;
  colorTheme: { primary: string; accent: string; overlay: string };
  motionType: 'zoom-in' | 'zoom-out' | 'pan-right' | 'pan-left' | 'tilt-up' | 'shake' | 'pulse';
  textPosition: 'top' | 'center' | 'bottom';
  fontSize: number;
  subFontSize: number;
  transitionMs: number;
}

export interface PsychAnalysis {
  scenes: PsychScene[];
  specs: { ratio: string; resolution: string; maxDuration: string; format: string };
  topReference: { title: string; views: string; revenue: string };
  mediaMode: 'video' | 'image';
  colorGrading: { warm: number; contrast: number; saturation: number; vignette: number };
  pacingBpm: number;
  emotionCurve: EmotionPhase[];
  psychologicalTriggers: { name: string; description: string; appliedAt: number }[];
  platformPsychology: {
    attentionPattern: string;
    primaryDrive: string;
    avgWatchTime: string;
    optimalHookSec: number;
    textStyle: string;
  };
}

function detectMediaMode(format: string): 'video' | 'image' {
  const upper = format.toUpperCase();
  if (upper.includes('JPG') || upper.includes('PNG') || upper.includes('GIF') || upper.includes('정지형')) {
    return 'image';
  }
  return 'video';
}

const EMOTION_COLORS: Record<EmotionPhase, { primary: string; accent: string; overlay: string }> = {
  curiosity: { primary: '#FFD700', accent: '#FFA500', overlay: 'rgba(20,15,5,0.35)' },
  shock: { primary: '#FF4444', accent: '#FF1744', overlay: 'rgba(30,0,0,0.5)' },
  empathy: { primary: '#4FC3F7', accent: '#29B6F6', overlay: 'rgba(0,10,30,0.4)' },
  desire: { primary: '#FF6B35', accent: '#FF8E53', overlay: 'rgba(25,10,0,0.45)' },
  action: { primary: '#00E676', accent: '#00C853', overlay: 'rgba(0,20,10,0.5)' },
};

interface PlatformPsychProfile {
  attentionPattern: string;
  primaryDrive: string;
  avgWatchTime: string;
  optimalHookSec: number;
  textStyle: string;
  pacingBpm: number;
  colorGrading: { warm: number; contrast: number; saturation: number; vignette: number };
  motionStyle: PsychScene['motionType'][];
  triggers: { name: string; description: string }[];
  boardTriggers?: Record<string, { name: string; description: string }[]>;
}

const PLATFORM_PROFILES: Record<string, PlatformPsychProfile> = {
  tiktok: {
    attentionPattern: 'F-pattern (상단 좌측 → 우측 → 하단 스캔 0.8초 내)',
    primaryDrive: 'FOMO + 즉각적 도파민',
    avgWatchTime: '1.5~3쳔',
    optimalHookSec: 1,
    textStyle: '대담한 산세리프, 화면 중앙 대형 텍스트, 2줄 이내',
    pacingBpm: 140,
    colorGrading: { warm: 15, contrast: 30, saturation: 25, vignette: 40 },
    motionStyle: ['zoom-in', 'shake', 'pulse', 'pan-right', 'zoom-in', 'tilt-up'],
    triggers: [
      { name: '미러 뉴런 활성화', description: '사용자가 제품 사용 장면을 보면 자신도 사용하는 상상을 무의식적으로 함' },
      { name: '도파민 루프', description: '3초마다 새로운 시각 자극으로 도파민 분석 유발, 무한 스크롤과 같은 원리' },
      { name: '손실 회피 역전', description: '"이 가격이 마지막"이라는 메시지가 손실 회피 심리를 구매 행동으로 전환' },
      { name: '사회적 증거 폭발', description: '댓글 수 좋아요 수가 시청자의 판단을 대체함, "다들 사니까 나도"' },
      { name: '무한 루프 구조', description: '영상 끝이 시작과 연결되어 재생 수를 기하급수적으로 늘림' },
      { name: '비교 심리 자극', description: 'before/after 구조로 자신의 현 상태와 개선 후를 비교하게 만듦' },
    ],
    boardTriggers: {
      carousel: [
        { name: '비교 분석 심리', description: '캐러셀에서 여러 제품을 나란히 배치하면 뇌가 자동 비교 분석을 수행함' },
      ],
      story: [
        { name: '24시간 희소성', description: '스토리의 소멸 특성이 긴박감을 극대화, "지금 보지 않으면 사라짐"' },
      ],
    },
  },
  instagram: {
    attentionPattern: 'Z-pattern (좌상단 → 우상단 → 좌하단 스캔, 미학적 평가 1.2초)',
    primaryDrive: '동경심 + 사회적 승인',
    avgWatchTime: '3~7초',
    optimalHookSec: 2,
    textStyle: '우아한 산세리프, 하단 배치, 그라데이션 오버레이와 함께',
    pacingBpm: 100,
    colorGrading: { warm: 10, contrast: 20, saturation: 15, vignette: 25 },
    motionStyle: ['zoom-in', 'pan-right', 'tilt-up', 'pulse', 'zoom-out', 'pan-left'],
    triggers: [
      { name: '동경심 자극', description: '완벽한 라이프스타일 이미지가 "나도 저렇게 살고 싶다"는 동경심을 자극' },
      { name: '색상 심리학 적용', description: '난색(주황/빨강)은 긴박감, 한색(파랑)은 신뢰감, 인플루언서는 난색을 선호' },
      { name: '스토리 몰입 효과', description: '개인적 경험담으로 시작하면 광고 거부감이 70% 감소, 뇌가 스토리를 현실로 착각' },
      { name: '번들링 효과', description: '제품을 라이프스타일과 번들링하면 제품 자체가 아닌 "그 라이프스타일"을 구매하게 됨' },
      { name: '사회적 승인 욕구', description: '"이렇게 하면 좋아요를 받을 수 있다"는 무의식적 계산이 참여를 유도' },
    ],
    boardTriggers: {
      reels: [
        { name: '릴스 알고리즘 최적화', description: '첫 2초 시청률이 전체 노출량을 결정, 시각적 충격이 필수' },
      ],
      feed: [
        { name: '카드뉴스 정보 밀집', description: '피드에서는 정보 밀도가 높을수록 저장률이 증가, 저장 = 알고리즘 가시성 상승' },
      ],
      story: [
        { name: '24시간 희소성', description: '스토리의 소멸 특성이 긴박감을 극대화' },
      ],
    },
  },
  youtube: {
    attentionPattern: 'F-pattern + 썸네일 평가 (썸네일 0.5초, 영상 후크 3초)',
    primaryDrive: '정보 탐욕 + 권위 신뢰',
    avgWatchTime: '5~15초',
    optimalHookSec: 3,
    textStyle: '굵은 산세리프, 상단 배치, 높은 대비',
    pacingBpm: 90,
    colorGrading: { warm: 5, contrast: 25, saturation: 10, vignette: 20 },
    motionStyle: ['zoom-in', 'pan-right', 'zoom-in', 'tilt-up', 'pulse', 'zoom-out'],
    triggers: [
      { name: '정보 갭 자극', description: '"이것만 알면" 구조가 인간의 정보 갭에 대한 불편함을 자극, 해소하려고 시청 지속' },
      { name: '권위 신뢰 효과', description: '전문가 포즈, 데이터 인용, 비교 표가 신뢰도를 급격히 상승시킴' },
      { name: '시청 시간 보상', description: '알고리즘이 시청 시간에 비례해 노출을 늘림, 후크가 길수록 더 많은 노출' },
      { name: '무한 루프 구조', description: '쇼츠에서 끝이 시작과 연결되면 재생 수가 3배 이상 증가' },
      { name: '호기심 루프', description: '질문으로 시작해서 답을 마지막에 배치하면 끝까지 시청하게 됨' },
    ],
    boardTriggers: {
      shorts: [
        { name: '쇼츠 폭발적 확산', description: '쇼츠는 구독자 수와 무관하게 노출, 품질이 전부' },
      ],
      video: [
        { name: '긴 호흡 정보 전달', description: '일반 영상은 구조적 정보 전달이 핵심, 3막 구조(문제-해결-결과)' },
      ],
    },
  },
  pinterest: {
    attentionPattern: '전체 시각 스캔 (0.3초 내 미학 판단, 핀 저장 여부 결정)',
    primaryDrive: '영감 + 미래 자아 투사',
    avgWatchTime: '2~5초',
    optimalHookSec: 1,
    textStyle: '세리프 또는 얇은 산세리프, 중앙 배치, 여백이 많은 우아한 디자인',
    pacingBpm: 70,
    colorGrading: { warm: 5, contrast: 15, saturation: 20, vignette: 10 },
    motionStyle: ['zoom-out', 'pan-right', 'tilt-up', 'zoom-in', 'pan-left', 'pulse'],
    triggers: [
      { name: '미래 자아 투사', description: '핀터레스트 사용자는 "미래의 나"를 위해 저장, 제품이 그 미래의 일부가 되어야 함' },
      { name: '시각적 임팩트 우선', description: '텍스트보다 이미지가 10배 더 강력, 첫 0.3초에 시각적 판단 완료' },
      { name: '보드 큐레이션 심리', description: '사용자가 보드에 저장하는 행위 자체가 일종의 "소유" 심리를 충족' },
      { name: '영감-실행 갭', description: '영감을 주되 실행의 갭을 좁혀주면 구매 전환율이 3배 상승' },
    ],
    boardTriggers: {
      pin: [
        { name: '정지형 임팩트', description: '핀은 정지 이미지가 핵심, 텍스트 오버레이로 핵심 가치를 한 줄로' },
      ],
      idea_pin: [
        { name: '아이디어 핀 스토리보드', description: '여러 장면이 슬라이드처럼 전환, 각 장면마다 하나의 핵심 메시지' },
      ],
    },
  },
  blog: {
    attentionPattern: 'F-pattern 텍스트 스캔 (제목 → 소제목 → 본문)',
    primaryDrive: '신뢰 + 상세 정보',
    avgWatchTime: '30초~2분',
    optimalHookSec: 3,
    textStyle: '명확한 산세리프, 상단 배치, 정보 전달 중심',
    pacingBpm: 60,
    colorGrading: { warm: 0, contrast: 20, saturation: 5, vignette: 15 },
    motionStyle: ['zoom-in', 'pan-right', 'tilt-up', 'zoom-in', 'pan-left', 'zoom-out'],
    triggers: [
      { name: '신뢰 구축 단계', description: '블로그는 상세 정보로 신뢰를 구축, 구매 결정까지의 시간이 가장 김' },
      { name: 'SEO + 정보 갭', description: '검색으로 들어온 사용자는 정보 갭이 큼, 품질 좋은 정보가 전환율 결정' },
      { name: '비교 분석 심리', description: '블로그 리뷰는 비교 분석을 제공, 뇌가 합리적 결정을 내린다고 착각하게 함' },
    ],
  },
  twitter: {
    attentionPattern: '빠른 스캔 (0.5초 내 관심사 판단)',
    primaryDrive: '트렌드 + 즉각적 반응',
    avgWatchTime: '3~8초',
    optimalHookSec: 1,
    textStyle: '굵은 산세리프, 중앙 배치, 짧고 강렬한 한 줄',
    pacingBpm: 120,
    colorGrading: { warm: 10, contrast: 25, saturation: 15, vignette: 30 },
    motionStyle: ['zoom-in', 'shake', 'pan-right', 'pulse', 'zoom-in', 'tilt-up'],
    triggers: [
      { name: '트렌드 편승', description: '유행하는 트렌드에 편승하면 노출이 5배 이상 증가, 타이밍이 전부' },
      { name: '스레드 몰입', description: '스레드 구조가 다음 트윗을 보고 싶게 만듦, 정보 갭의 연속' },
      { name: '즉각적 반응 심리', description: '좋아요/리트윗이 즉각적이라 도파민 루프가 더 짧고 강렬' },
    ],
  },
  naver_clip: {
    attentionPattern: 'F-pattern + 검색 연동 (검색 키워드 → 클립 시청 1.5초)',
    primaryDrive: '검색 신뢰 + 국내 로컬 밀착',
    avgWatchTime: '3~10초',
    optimalHookSec: 2,
    textStyle: '굵은 산세리프, 하단 배치, 한국어 가독성 우선',
    pacingBpm: 110,
    colorGrading: { warm: 8, contrast: 22, saturation: 18, vignette: 25 },
    motionStyle: ['zoom-in', 'pan-right', 'tilt-up', 'pulse', 'zoom-out', 'pan-left'],
    triggers: [
      { name: '검색 생태계 연동', description: '네이버 블로그·검색·NOW와 연동되어 검색 유입이 자연스럽게 클립으로 이어짐' },
      { name: '국내 로컬 밀착', description: '한국 사용자의 검색 습관에 최적화, 지역 기반 제품 추천에 효과적' },
      { name: '신뢰 기반 전환', description: '네이버 브랜드 신뢰도가 구매 결정으로 직결, 블로그 리뷰와 시너지' },
      { name: '정보 갭 + 검색 연결', description: '검색에서 들어온 사용자는 정보 갭이 큼, 품질 좋은 숏폼이 전환율 결정' },
    ],
  },
};

const REFERENCE_MAP: Record<string, { title: string; views: string; revenue: string }> = {
  ig_reels: { title: '인플루언서 릴스 제품 리뷰', views: '2.4M', revenue: '월 480만원' },
  ig_feed: { title: '카드뉴스 스타일 제품 소개', views: '890K', revenue: '월 120만원' },
  ig_story: { title: '데일리 스토리 제품 태그', views: '350K', revenue: '월 80만원' },
  yt_shorts: { title: '쇼츠 제품 언박싱', views: '5.1M', revenue: '월 650만원' },
  yt_community: { title: '커뮤니티 탭 제품 투표', views: '420K', revenue: '월 90만원' },
  yt_video: { title: '상세 리뷰 영상', views: '1.2M', revenue: '월 340만원' },
  blog_category_post: { title: '블로그 상품 리뷰 포스트', views: '450K', revenue: '월 210만원' },
  blog_review: { title: '블로그 상세 리뷰', views: '320K', revenue: '월 180만원' },
  blog_promotion: { title: '블로그 프로모션 글', views: '280K', revenue: '월 150만원' },
  tt_video: { title: '틱톡 바이럴 제품 영상', views: '8.7M', revenue: '월 920만원' },
  tt_carousel: { title: '틱톡 캐러셀 제품 비교', views: '1.8M', revenue: '월 280만원' },
  tt_story: { title: '틱톡 스토리 제품', views: '1.1M', revenue: '월 160만원' },
  pin_pin: { title: '핀터레스트 제품 핀', views: '1.5M', revenue: '월 190만원' },
  pin_idea_pin: { title: '아이디어 핀 제품 데모', views: '2.2M', revenue: '월 310만원' },
  pin_board: { title: '핀터레스트 보드 컬렉션', views: '980K', revenue: '월 140만원' },
  tw_thread: { title: '트위터 제품 스레드', views: '670K', revenue: '월 95만원' },
  tw_tweet: { title: '트위터 제품 트윗', views: '420K', revenue: '월 65만원' },
  tw_reply: { title: '트위터 제품 답글', views: '310K', revenue: '월 48만원' },
  nc_clip: { title: '네이버 클립 제품 영상', views: '1.3M', revenue: '월 220만원' },
};

const PLATFORM_PREFIX: Record<string, string> = {
  instagram: 'ig', youtube: 'yt', blog: 'blog', tiktok: 'tt', pinterest: 'pin', twitter: 'tw', naver_clip: 'nc',
};

export function generatePsychAnalysis(
  platform: string,
  board: string,
  _productUrl: string,
  specsIn?: { ratio: string; resolution: string; maxDuration: string; format: string },
  productMeta?: { productName?: string; price?: string; brand?: string; description?: string },
  customPrompt?: string,
): PsychAnalysis {
  const specs = specsIn ?? { ratio: '16:9', resolution: '1920×1080', maxDuration: '60초', format: 'MP4' };
  const profile = PLATFORM_PROFILES[platform] ?? PLATFORM_PROFILES.tiktok;

  const maxDurStr = specs.maxDuration;
  const totalSec = parseInt(maxDurStr, 10) || 60;

  const emotionCurve: EmotionPhase[] = ['curiosity', 'shock', 'empathy', 'desire', 'action'];

  const triggers = [...profile.triggers];
  if (profile.boardTriggers?.[board]) {
    triggers.push(...profile.boardTriggers[board]);
  }

  const sceneCount = Math.min(triggers.length, Math.max(5, Math.floor(totalSec / 8)));

  const pName = productMeta?.productName?.trim() || '이 제품';
  const pPrice = productMeta?.price?.trim() || '';
  const pBrand = productMeta?.brand?.trim() || '';
  const pDesc = productMeta?.description?.trim() || '';
  const nameShort = pName.length > 12 ? pName.slice(0, 12) + '...' : pName;
  const brandPrefix = pBrand ? `${pBrand} ` : '';

  const cpLower = customPrompt?.toLowerCase() ?? '';
  const isHumorous = cpLower.includes('유머') || cpLower.includes('humor') || cpLower.includes('웃긴');
  const isCasual = cpLower.includes('반말') || cpLower.includes('casual') || cpLower.includes('힙');
  const isNeon = cpLower.includes('네온') || cpLower.includes('neon');
  const isInsta = cpLower.includes('인스타') || cpLower.includes('instagram') || cpLower.includes('감성');

  const styleSuffix = customPrompt?.trim() ? ` (${customPrompt.trim()})` : '';

  const hookTexts: Record<EmotionPhase, string[]> = {
    curiosity: [
      isCasual ? `${nameShort} 알아?` : `${nameShort} 알아?`,
      isHumorous ? `잠깐, ${nameShort} 봤어? 진짜임?` : `잠깐, ${nameShort} 봤어?`,
      `이게 왜 1등인지 알아?`,
      `${nameShort} 진짜야?`,
      `${pBrand ? pBrand + ' ' : ''}${nameShort}이 그냥 넘기지 마`,
    ],
    shock: [
      pPrice ? `${nameShort} ${pPrice} 실화?` : `${nameShort} 이 가격 실화?`,
      `${nameShort} 진짜 미쳤는데`,
      `${nameShort} 보고 충격받음`,
      pPrice ? `${pPrice}이라고? 진짜임?` : '이거 실화임?',
      `${nameShort} 진짜 충격이야`,
    ],
    empathy: [
      isInsta ? `${nameShort} 인스타 감성으로 일상이 달라짐` : `${nameShort} 쓰면 진짜 편해요`,
      `${nameShort} 쓰는 분들 공감 100%`,
      `${nameShort} 쓰면 왜 몰랐지 싶음`,
      `${nameShort} 쓰면 삶이 바뀜`,
      `${nameShort} 진짜 추천`,
    ],
    desire: [
      `${nameShort} 무조건 사야 됨`,
      `${nameShort} 지금 안 사면 손해`,
      `${nameShort} 재고 떨어지면 끝`,
      `${nameShort} 지금이 기회`,
      pPrice ? `${nameShort} ${pPrice} 진짜 사고 싶음` : `${nameShort} 진짜 사고 싶음`,
    ],
    action: [
      `${nameShort} 지금 바로 확인`,
      `${nameShort} 링크 바로가기`,
      `${nameShort} 지금 구매`,
      `${nameShort} 댓글로 문의`,
      `${nameShort} 지금 안 사면 후회`,
    ],
  };

  const subTexts: Record<EmotionPhase, string[]> = {
    curiosity: [
      `${brandPrefix}${nameShort}으로 시선이 멈추는 첫 1초`,
      `${nameShort} 정보 갭을 열어 끝까지 보게 만드는 후크`,
      `시각적 반전으로 스와이프를 차단하는 ${nameShort} 기법`,
    ],
    shock: [
      pPrice ? `${nameShort} ${pPrice} 예상을 깨는 시각 충격` : `${nameShort} 예상을 깨는 시각 충격`,
      `${nameShort} 도파민 분비를 촉진하는 강렬한 전환`,
      `${nameShort} 손실 회피 심리를 자극하는 긴박감 연출`,
    ],
    empathy: [
      `${nameShort} 개인적 경험으로 광고 거부감 제거`,
      `${nameShort} 사용 전후 비교로 공감과 욕구를 동시 자극`,
      `${nameShort} 실사용 스토리로 뇌가 이야기로 인식`,
    ],
    desire: [
      `${nameShort} 사회적 증거와 희소성으로 구매 욕구 극대화`,
      pPrice ? `${nameShort} ${pPrice} 한정 판매로 손실 회피를 행동으로` : `${nameShort} 한정 판매로 손실 회피를 행동으로`,
      `${nameShort} 번들링 효과로 라이프스타일을 판매`,
    ],
    action: [
      `${nameShort} 명확한 CTA로 전환율 극대화`,
      `${nameShort} 댓글 유도로 참여율 상승`,
      `${nameShort} 제휴 링크로 클릭률 3배 향상`,
    ],
  };

  const textPositions: PsychScene['textPosition'][] = ['top', 'center', 'bottom'];

  const scenes: PsychScene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const emotion = emotionCurve[Math.min(i, emotionCurve.length - 1)];
    const colors = EMOTION_COLORS[emotion];
    const motionType = profile.motionStyle[i % profile.motionStyle.length];
    const timeSec = Math.floor((totalSec / sceneCount) * i);
    const hookIdx = i % hookTexts[emotion].length;
    const subIdx = i % subTexts[emotion].length;

    scenes.push({
      time: `${timeSec}s`,
      hook: triggers[i].name,
      desc: customPrompt?.trim() ? `${triggers[i].description}${styleSuffix}` : triggers[i].description,
      emotion,
      textOverlay: hookTexts[emotion][hookIdx],
      subtext: subTexts[emotion][subIdx],
      colorTheme: colors,
      motionType,
      textPosition: textPositions[i % textPositions.length],
      fontSize: platform === 'tiktok' ? 52 : platform === 'pinterest' ? 38 : 44,
      subFontSize: platform === 'tiktok' ? 28 : platform === 'pinterest' ? 22 : 26,
      transitionMs: Math.round(60000 / profile.pacingBpm),
    });
  }

  const refKey = `${PLATFORM_PREFIX[platform] ?? platform}_${board}`;
  const topReference = REFERENCE_MAP[refKey] ?? { title: '상위 1% 제휴 영상', views: '1M+', revenue: '월 300만원+' };

  return {
    scenes,
    specs,
    topReference,
    mediaMode: detectMediaMode(specs.format),
    colorGrading: profile.colorGrading,
    pacingBpm: profile.pacingBpm,
    emotionCurve,
    psychologicalTriggers: triggers.map((t, i) => ({
      name: t.name,
      description: t.description,
      appliedAt: Math.floor((totalSec / sceneCount) * i),
    })),
    platformPsychology: {
      attentionPattern: profile.attentionPattern,
      primaryDrive: profile.primaryDrive,
      avgWatchTime: profile.avgWatchTime,
      optimalHookSec: profile.optimalHookSec,
      textStyle: profile.textStyle,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Nano-Analysis: Top 1% Copywriting Pattern Extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface NanoPattern {
  id: string;
  category: 'hook' | 'shock' | 'desire' | 'action' | 'retention';
  patternName: string;
  template: string;
  microTactics: string[];
  effectivenessScore: number;
  useCount: number;
  lastUsed: number;
}

const SEED_PATTERNS: NanoPattern[] = [
  {
    id: 'nano_hook_001',
    category: 'hook',
    patternName: '역설적 금지 후킹',
    template: '이 제품 {절대} 사지 마세요. {이유} 때문에 통장이 거덜납니다',
    microTactics: ['금지어로 시선 강제 정지', '역설로 호기심 폭발', '손실 암시로 도파민 분비'],
    effectivenessScore: 94,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_hook_002',
    category: 'hook',
    patternName: '정보 갭 미공개 후킹',
    template: '아무도 안 알려주는 {제품명} {비밀}. 알면 무조건 사게 되는 이유',
    microTactics: ['미공개 정보 암시', '정보 갭 심리 자극', '행동 유도 전환'],
    effectivenessScore: 91,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_hook_003',
    category: 'hook',
    patternName: '3초 카운트다운 후킹',
    template: '3초 안에 {제품명} 알아보는 분만 남아주세요',
    microTactics: ['시간 제한으로 긴박감', '선택적 잔류로 몰입 유도', '스와이프 차단'],
    effectivenessScore: 88,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_shock_001',
    category: 'shock',
    patternName: '가격 충격 나노 분석',
    template: '{제품명} {가격}이라고? {비교 대상}보다 {차이} 더 싼 거 실화?',
    microTactics: ['가격 비교로 충격 극대화', '실화 의문문으로 참여 유도', '비교 심리 자극'],
    effectivenessScore: 92,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_shock_002',
    category: 'shock',
    patternName: 'before/after 시각 충격',
    template: '{사용 전} → {사용 후}. {제품명} 쓰고 이렇게 달라졌습니다',
    microTactics: ['시각적 비교로 뇌 자극', '변화 욕구 활성화', '자기 투사 심리'],
    effectivenessScore: 90,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_desire_001',
    category: 'desire',
    patternName: '라이프스타일 번들링',
    template: '{제품명} 하나면 {라이프스타일}이 완성됩니다. 그 가치를 계산해보세요',
    microTactics: ['제품=라이프스타일 등식', '가치 계산으로 합리화 지원', '동경심 자극'],
    effectivenessScore: 87,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_desire_002',
    category: 'desire',
    patternName: '희소성 손실 회피 역전',
    template: '지금 {제품명} 안 사면 {손실}. 재고 {N}개 남았을 때가 마지막 기회',
    microTactics: ['손실 회피 심리 역전', '숫자로 희소성 구체화', '행동 긴박감 주입'],
    effectivenessScore: 89,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_action_001',
    category: 'action',
    patternName: '마이크로 커밋먼트 CTA',
    template: '댓글에 {키워드} 적어주시면 {혜택} 드려요. 지금 바로',
    microTactics: ['마이크로 행동으로 시작', '보상으로 참여 극대화', '알고리즘 댓글 가산'],
    effectivenessScore: 86,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_action_002',
    category: 'action',
    patternName: '사회적 증거 폭발 CTA',
    template: '{N}명이 이미 선택한 {제품명}. 지금 이 영상을 보는 당신이 {N+1}번째',
    microTactics: ['숫자로 사회적 증거 구체화', '당신 지칭으로 개인화', '소속감 형성'],
    effectivenessScore: 85,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_retention_001',
    category: 'retention',
    patternName: '루프 후킹 구조',
    template: '처음에 궁금했던 {질문}의 답은 마지막에. 끝까지 보면 다시 시작한 이유를 압니다',
    microTactics: ['질문-답 구조로 끝까지 유인', '무한 루프 재생 유도', '정보 갭 지속'],
    effectivenessScore: 93,
    useCount: 0,
    lastUsed: 0,
  },
  {
    id: 'nano_retention_002',
    category: 'retention',
    patternName: '중간 반전 배틀',
    template: '{제품명} 좋다고 했는데 사실 단점이 하나 있습니다. 그런데 그게 오히려...',
    microTactics: ['단점 인정으로 신뢰 확보', '반전으로 재시청 유도', '이중 후킹 구조'],
    effectivenessScore: 88,
    useCount: 0,
    lastUsed: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Psychology Sniping: Precision Purchase Inducement
// ─────────────────────────────────────────────────────────────────────────────

export interface SniperTrigger {
  id: string;
  triggerName: string;
  targetEmotion: EmotionPhase;
  technique: string;
  applicationTiming: number;
  precisionTarget: string;
  copyTemplate: string;
  conversionBoostPercent: number;
}

const SNIPER_TRIGGERS: SniperTrigger[] = [
  {
    id: 'sniper_001',
    triggerName: '미러 뉴런 스나이핑',
    targetEmotion: 'empathy',
    technique: '제품 사용 장면을 자신의 경험으로 착각하게 만드는 뇌 영역 직접 자극',
    applicationTiming: 3,
    precisionTarget: '시청자의 무의식적 자기 투사',
    copyTemplate: '이거 쓰는 순간 진짜 내 이야기인 줄 알았어요',
    conversionBoostPercent: 34,
  },
  {
    id: 'sniper_002',
    triggerName: '도파민 타이밍 스나이핑',
    targetEmotion: 'shock',
    technique: '2.7초 간격으로 새로운 시각 자극을 투여하여 도파민 분비 주기와 동기화',
    applicationTiming: 0,
    precisionTarget: '도파민 수용체 활성화 주기',
    copyTemplate: '잠깐, 이거 봤어? → 어 어떻게? → 진짜 미쳤는데 → 이 가격?',
    conversionBoostPercent: 41,
  },
  {
    id: 'sniper_003',
    triggerName: '손실 회피 역전 스나이핑',
    targetEmotion: 'desire',
    technique: '구매하지 않았을 때의 손실을 구매 금액보다 크게 지각하게 만드는 인지 왜곡',
    applicationTiming: 8,
    precisionTarget: '손실 회피 본능 (인지 행동 경제학)',
    copyTemplate: '지금 안 사면 나중에 2배로 줍게 됩니다. 이게 손해인지 투자인지는 본인 선택',
    conversionBoostPercent: 38,
  },
  {
    id: 'sniper_004',
    triggerName: '사회적 증거 숫자 스나이핑',
    targetEmotion: 'action',
    technique: '추상적 칭찬 대신 구체적 숫자로 뇌의 판단을 대체하는 사회적 증거 주입',
    applicationTiming: 10,
    precisionTarget: '군집 심리 본능',
    copyTemplate: '재구매율 89%. 리뷰 12,847개. 별점 4.8. 이 숫자가 대신 말해줍니다',
    conversionBoostPercent: 45,
  },
  {
    id: 'sniper_005',
    triggerName: '커밋먼트 일관성 스나이핑',
    targetEmotion: 'action',
    technique: '작은 행동(댓글, 좋아요)을 먼저 유도하여 일관성 원리로 구매까지 이끄는 단계적 몰입',
    applicationTiming: 12,
    precisionTarget: '인지 부조화 회피 본능',
    copyTemplate: '댓글에 O 적어주신 분들께 추가 할인 코드 보내드립니다. 이미 적으셨죠?',
    conversionBoostPercent: 29,
  },
  {
    id: 'sniper_006',
    triggerName: '권위 프레이밍 스나이핑',
    targetEmotion: 'curiosity',
    technique: '전문가 포즈, 데이터 인용, 비교 표로 권위를 암시하여 비판적 사고 우회',
    applicationTiming: 2,
    precisionTarget: '권위에 대한 본능적 복종',
    copyTemplate: '소비자 보호원에서 추천한 유일한 제품이라는 거, 알고 계셨어요?',
    conversionBoostPercent: 33,
  },
  {
    id: 'sniper_007',
    triggerName: '시각적 대조 스나이핑',
    targetEmotion: 'shock',
    technique: '극단적인 before/after 시각 차이로 뇌의 변화 감지 회로를 직접 활성화',
    applicationTiming: 5,
    precisionTarget: '시각 피질 변화 감지 회로',
    copyTemplate: '이거 안 믿겨서 직접 찍어봤습니다. 화면 앞에서 직접 확인하세요',
    conversionBoostPercent: 36,
  },
  {
    id: 'sniper_008',
    triggerName: '호구 심리 역이용 스나이핑',
    targetEmotion: 'desire',
    technique: '솔직한 단점 인정으로 방어벽을 허문 뒤 핵심 장점을 침투시키는 이중 전략',
    applicationTiming: 7,
    precisionTarget: '광고 거부감 방어 기제',
    copyTemplate: '단점 하나 말하자면 배송이 좀 느려요. 근데 그걸 감수하고도 재구매하는 이유가 있습니다',
    conversionBoostPercent: 31,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Self-Learning Layer: Pattern Accumulation & Effectiveness Tracking
// ─────────────────────────────────────────────────────────────────────────────

import { getItem, setItem } from '@/lib/storage';

const LEARNING_KEY = 'psych_nano_learning_v1';
const MAX_HISTORY = 200;

export interface LearningRecord {
  patternId: string;
  strategy: string;
  platform: string;
  board: string;
  productCategory: string;
  generatedAt: number;
  effectivenessScore: number;
  appliedSnipers: string[];
}

interface LearningState {
  records: LearningRecord[];
  patternWeights: Record<string, number>;
  sniperWeights: Record<string, number>;
  totalGenerations: number;
}

const DEFAULT_LEARNING_STATE: LearningState = {
  records: [],
  patternWeights: {},
  sniperWeights: {},
  totalGenerations: 0,
};

let cachedLearningState: LearningState | null = null;

async function loadLearningState(): Promise<LearningState> {
  if (cachedLearningState) return cachedLearningState;
  const raw = await getItem(LEARNING_KEY);
  if (raw) {
    try {
      cachedLearningState = { ...DEFAULT_LEARNING_STATE, ...JSON.parse(raw) };
    } catch {
      cachedLearningState = { ...DEFAULT_LEARNING_STATE };
    }
  } else {
    cachedLearningState = { ...DEFAULT_LEARNING_STATE };
  }
  return cachedLearningState as LearningState;
}

async function saveLearningState(state: LearningState): Promise<void> {
  cachedLearningState = state;
  await setItem(LEARNING_KEY, JSON.stringify(state));
}

export async function recordLearningEntry(entry: Omit<LearningRecord, 'generatedAt'>): Promise<void> {
  const state = await loadLearningState();
  const record: LearningRecord = { ...entry, generatedAt: Date.now() };

  state.records = [...state.records, record].slice(-MAX_HISTORY);
  state.totalGenerations += 1;

  for (const pid of [record.patternId, ...record.appliedSnipers]) {
    if (pid.startsWith('nano_')) {
      state.patternWeights[pid] = (state.patternWeights[pid] ?? 0) + record.effectivenessScore;
    } else if (pid.startsWith('sniper_')) {
      state.sniperWeights[pid] = (state.sniperWeights[pid] ?? 0) + record.effectivenessScore;
    }
  }

  await saveLearningState(state);
}

export async function getLearningStats(): Promise<{
  totalGenerations: number;
  topPatterns: { id: string; weight: number }[];
  topSnipers: { id: string; weight: number }[];
}> {
  const state = await loadLearningState();
  const topPatterns = Object.entries(state.patternWeights)
    .map(([id, weight]) => ({ id, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  const topSnipers = Object.entries(state.sniperWeights)
    .map(([id, weight]) => ({ id, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  return { totalGenerations: state.totalGenerations, topPatterns, topSnipers };
}

function selectWeightedPattern(
  patterns: NanoPattern[],
  weights: Record<string, number>,
  category?: NanoPattern['category'],
): NanoPattern {
  const pool = category ? patterns.filter((p) => p.category === category) : patterns;
  if (pool.length === 0) return patterns[0];

  const scored = pool.map((p) => {
    const learnedWeight = weights[p.id] ?? 0;
    const recencyBoost = p.lastUsed > 0 ? Math.max(0, 10 - Math.floor((Date.now() - p.lastUsed) / 3600000)) : 10;
    return { pattern: p, score: p.effectivenessScore + learnedWeight * 0.01 + recencyBoost };
  });

  const maxScore = Math.max(...scored.map((s) => s.score));
  const weighted = scored.map((s) => ({ ...s, normalized: s.score / maxScore }));
  const total = weighted.reduce((sum, s) => sum + s.normalized, 0);
  let r = Math.random() * total;
  for (const s of weighted) {
    r -= s.normalized;
    if (r <= 0) return s.pattern;
  }
  return weighted[0].pattern;
}

function selectWeightedSnipers(
  snipers: SniperTrigger[],
  weights: Record<string, number>,
  count: number,
  strategy: string,
): SniperTrigger[] {
  const strategyFilter: Record<string, (s: SniperTrigger) => boolean> = {
    fomo: (s) => s.targetEmotion === 'desire' || s.targetEmotion === 'action',
    curiosity: (s) => s.targetEmotion === 'curiosity' || s.targetEmotion === 'shock',
    social_proof: (s) => s.targetEmotion === 'action' || s.targetEmotion === 'empathy',
    desire: (s) => s.targetEmotion === 'desire' || s.targetEmotion === 'shock',
    nano_analysis: () => true,
    psychology_sniping: () => true,
  };

  const filter = strategyFilter[strategy] ?? (() => true);
  const pool = snipers.filter(filter);

  const scored = pool.map((s) => {
    const learnedWeight = weights[s.id] ?? 0;
    return { sniper: s, score: s.conversionBoostPercent + learnedWeight * 0.01 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(count, scored.length)).map((s) => s.sniper);
}

function fillTemplate(template: string, meta: { productName?: string; price?: string; brand?: string; description?: string }): string {
  const name = meta.productName?.trim() || '이 제품';
  const nameShort = name.length > 12 ? name.slice(0, 12) + '...' : name;
  return template
    .replace(/\{제품명\}/g, nameShort)
    .replace(/\{가격\}/g, meta.price?.trim() || '이 가격')
    .replace(/\{비교 대상\}/g, '백화점')
    .replace(/\{차이\}/g, '3배')
    .replace(/\{사용 전\}/g, '이렇게 힘들었고')
    .replace(/\{사용 후\}/g, '이렇게 편해졌어요')
    .replace(/\{라이프스타일\}/g, '완벽한 하루')
    .replace(/\{손실\}/g, '더 비싸게 사게 됩니다')
    .replace(/\{N\}/g, String(Math.floor(Math.random() * 8000) + 1000))
    .replace(/\{N\+1\}/g, String(Math.floor(Math.random() * 8000) + 1002))
    .replace(/\{이유\}/g, '너무 잘 써서')
    .replace(/\{절대\}/g, '절대')
    .replace(/\{비밀\}/g, '하나')
    .replace(/\{손해\}/g, '완전 손해')
    .replace(/\{키워드\}/g, '꿀템')
    .replace(/\{혜택\}/g, '추가 할인')
    .replace(/\{질문\}/g, '이 제품 진짜 살 만한가?');
}

export interface NanoAnalysisResult {
  patterns: NanoPattern[];
  snipers: SniperTrigger[];
  fusedScenes: PsychScene[];
  analysisReport: {
    topPatternNames: string[];
    appliedSniperNames: string[];
    estimatedConversionBoost: number;
    learningIterations: number;
    fusionStrategy: string;
  };
  generatedCopy: { category: string; text: string }[];
}

export async function generateNanoFusedAnalysis(
  platform: string,
  board: string,
  strategy: string,
  productMeta: { productName?: string; price?: string; brand?: string; description?: string },
  specsIn?: { ratio: string; resolution: string; maxDuration: string; format: string },
): Promise<NanoAnalysisResult> {
  const specs = specsIn ?? { ratio: '9:16', resolution: '1080×1920', maxDuration: '15s', format: 'MP4' };
  const totalSec = parseInt(specs.maxDuration, 10) || 15;
  const learningState = await loadLearningState();

  const categories: NanoPattern['category'][] = ['hook', 'shock', 'desire', 'action', 'retention'];
  const selectedPatterns: NanoPattern[] = categories.map((cat) =>
    selectWeightedPattern(SEED_PATTERNS, learningState.patternWeights, cat),
  );

  const sniperCount = strategy === 'nano_analysis' || strategy === 'psychology_sniping' ? 5 : 3;
  const selectedSnipers = selectWeightedSnipers(SNIPER_TRIGGERS, learningState.sniperWeights, sniperCount, strategy);

  const baseAnalysis = generatePsychAnalysis(platform, board, '', specs, productMeta);

  const emotionByCat: Record<NanoPattern['category'], EmotionPhase> = {
    hook: 'curiosity',
    shock: 'shock',
    desire: 'desire',
    action: 'action',
    retention: 'empathy',
  };

  const fusedScenes: PsychScene[] = selectedPatterns.map((pattern, i) => {
    const emotion = emotionByCat[pattern.category];
    const colors = EMOTION_COLORS[emotion];
    const sniper = selectedSnipers[i % selectedSnipers.length];
    const timeSec = Math.floor((totalSec / selectedPatterns.length) * i);

    return {
      time: `${timeSec}s`,
      hook: pattern.patternName,
      desc: `${pattern.microTactics.join(' · ')} | 스나이퍼: ${sniper.triggerName}`,
      emotion,
      textOverlay: fillTemplate(pattern.template, productMeta),
      subtext: sniper.copyTemplate,
      colorTheme: colors,
      motionType: baseAnalysis.scenes[i % baseAnalysis.scenes.length]?.motionType ?? 'zoom-in',
      textPosition: (['top', 'center', 'bottom'] as const)[i % 3],
      fontSize: platform === 'tiktok' ? 52 : 44,
      subFontSize: platform === 'tiktok' ? 28 : 26,
      transitionMs: Math.round(60000 / baseAnalysis.pacingBpm),
    };
  });

  const generatedCopy = selectedPatterns.map((p) => ({
    category: p.category,
    text: fillTemplate(p.template, productMeta),
  }));

  const estimatedBoost = Math.min(
    95,
    Math.round(selectedSnipers.reduce((sum, s) => sum + s.conversionBoostPercent, 0) / selectedSnipers.length * 1.5),
  );

  const appliedPatternIds = selectedPatterns.map((p) => p.id);
  const appliedSniperIds = selectedSnipers.map((s) => s.id);

  await recordLearningEntry({
    patternId: appliedPatternIds[0],
    strategy,
    platform,
    board,
    productCategory: productMeta.productName?.slice(0, 20) || 'general',
    effectivenessScore: estimatedBoost,
    appliedSnipers: appliedSniperIds,
  });

  return {
    patterns: selectedPatterns,
    snipers: selectedSnipers,
    fusedScenes,
    analysisReport: {
      topPatternNames: selectedPatterns.map((p) => p.patternName),
      appliedSniperNames: selectedSnipers.map((s) => s.triggerName),
      estimatedConversionBoost: estimatedBoost,
      learningIterations: learningState.totalGenerations + 1,
      fusionStrategy: strategy === 'nano_analysis'
        ? '상위 1% 문구 나노 분석 + 심리 저격 융합'
        : strategy === 'psychology_sniping'
          ? '인간 심리 저격 구매 유도 정밀 타격'
          : `기본 전략(${strategy}) + 나노 분석 융합`,
    },
    generatedCopy,
  };
}
