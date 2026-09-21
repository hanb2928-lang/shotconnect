/**
 * Shared top-1% conversion optimization framework for all generative AI pipelines.
 * Distilled from highest-converting affiliate posts across 5 platforms.
 * Injects psychological triggers, hook patterns, and platform-specific visual+copy directives.
 */

export type ConversionPlatform = "tiktok" | "instagram" | "threads" | "pinterest" | "facebook" | "shortform";

interface PlatformConversionProfile {
  label: string;
  visualStyle: string;
  hookArchitecture: string;
  copyTone: string;
  ctaStyle: string;
  scrollStopStrategy: string;
  visualTriggers: string[];
}

export const PLATFORM_CONVERSION_PROFILES: Record<ConversionPlatform, PlatformConversionProfile> = {
  tiktok: {
    label: "틱톡",
    visualStyle: "빠른 컷 전환, 대담한 자막, 세로 풀스크린, 높은 채도/대비, 140 BPM 템포",
    hookArchitecture: "첫 1초 내 시각 충격 → 2.7초 간격 도파민 루프 → before/after 비교 → 무한 루프 구조",
    copyTone: "직관적이고 빠른 반말 템포, ㅋㅋ/ㅠㅠ/실화? 등 인터넷 말투, 2줄 이내 대형 텍스트",
    ctaStyle: "내부자 꿀팁형: '고민하는 사이 품절됨 ㅋㅋ', '링크 남겨둠 — 알아서들'",
    scrollStopStrategy: "0.8초 내 F-pattern 시각 스캔 차단, 금지어/역설로 시선 강제 정지",
    visualTriggers: [
      "미러 뉴런 활성화: 제품 사용 장면을 시청자 자신의 경험으로 착각하게 만드는 클로즈업",
      "도파민 루프: 2.7초 간격 새로운 시각 자극으로 도파민 분비 주기와 동기화",
      "before/after 시각 충격: 극단적 비교로 뇌의 변화 감지 회로 직접 활성화",
    ],
  },
  instagram: {
    label: "인스타그램",
    visualStyle: "감각적 라이프스타일 비주얼 스토리텔링, 그라데이션 오버레이, 100 BPM 템포, 하단 배치 자막",
    hookArchitecture: "동경심 자극 라이프스타일 → 개인적 경험담으로 광고 거부감 제거 → 번들링(제품=라이프스타일) → 사회적 승인",
    copyTone: "감성적 1인칭 스토리, '쓰고 나서 생각이 바뀌었어요' 식 진정성 경험담, 친근한 존댓말",
    ctaStyle: "자연스러운 추천형: '이거 아직 모르면 손해인데', '링크 프로필에 남겨둠'",
    scrollStopStrategy: "1.2초 내 Z-pattern 미학적 평가 통과, 완벽한 라이프스타일 이미지로 동경심 유발",
    visualTriggers: [
      "동경심 자극: 완벽한 라이프스타일 이미지로 '나도 저렇게 살고 싶다'는 동경심 자극",
      "색상 심리학: 난색(주황/빨강)은 긴박감, 한색(파랑)은 신뢰감, 제품 카테고리에 맞춰 선택",
      "번들링 효과: 제품을 라이프스타일과 번들링하여 제품이 아닌 '그 라이프스타일'을 구매하게 만듦",
    ],
  },
  threads: {
    label: "스레드",
    visualStyle: "미니멀 인테리어/일상 캡처, 진정성 있는 대화형, 120 BPM 템포",
    hookArchitecture: "진정성 반말 대화 → 정보 갭 연속 스레드 → 혼자 중얼거리듯 툭 던지는 내밀함",
    copyTone: "반말투 진정성, '한다', '임', '드라고', '거든' 같은 반말, 혼자 중얼거리거나 친구한테 툭 던지듯",
    ctaStyle: "대화형 내부자: '이거 진짜임? 링크 확인해봐', '나도 이거 쓰는데 꿀템 맞음'",
    scrollStopStrategy: "0.5초 내 관심사 판단, 광고 거부감 제로의 진정성 있는 첫 문장",
    visualTriggers: [
      "진정성 대화형: 광고 느낌이 전혀 없는 일상 캡처, 실제 사용자가 올린 것 같은 자연스러움",
      "정보 갭 연속: 스레드 구조로 다음 글을 보고 싶게 만드는 정보 갭의 연속",
    ],
  },
  pinterest: {
    label: "핀터레스트",
    visualStyle: "시각적 영감 우선, 세리프/얇은 산세리프 중앙 배치, 여백이 많은 우아한 디자인, 70 BPM 템포",
    hookArchitecture: "미래 자아 투사 → 명사형 검색 키워드 후킹 → 영감-실행 갭 좁히기 → 보드 큐레이션 심리",
    copyTone: "정보성+영감, 'OO 아이디어', 'OO 가이드' 명사형 키워드, 실용적이고 간결한 설명",
    ctaStyle: "저장 유도형: '이 핀 저장해두고 나중에 참고하세요', '링크에서 더 많은 아이디어 확인'",
    scrollStopStrategy: "0.3초 내 시각 판단, 텍스트보다 이미지가 10배 더 강력, 첫 0.3초에 시각적 임팩트 완료",
    visualTriggers: [
      "미래 자아 투사: '미래의 나'를 위해 저장하는 심리, 제품이 그 미래의 일부가 되어야 함",
      "시각적 임팩트 우선: 텍스트 오버레이로 핵심 가치를 한 줄로, 0.3초 내 시각 판단 최적화",
      "영감-실행 갭: 영감을 주되 실행의 갭을 좁혀주면 구매 전환율이 3배 상승",
    ],
  },
  facebook: {
    label: "페이스북",
    visualStyle: "커뮤니티 친화적, 친근하면서도 신뢰감 있는 톤, 질문으로 참여 유도, 100 BPM 템포",
    hookArchitecture: "커뮤니티 질문 후킹 → 개인 스토리로 신뢰 구축 → 사회적 증거 자연스럽게 → 참여 유도 CTA",
    copyTone: "커뮤니티 대화형, '여러분은 어떠세요?', '경험 공유해주세요' 참여 유도, 친근하면서도 신뢰감",
    ctaStyle: "참여 유도형: '댓글로 경험 공유해주세요 — 링크도 남겨둘게요', '좋은 거 먼저 아는 사람이 임자'",
    scrollStopStrategy: "질문으로 댓글 참여 유도, 개인 스토리로 신뢰 구축 후 자연스럽게 제품 소개",
    visualTriggers: [
      "커뮤니티 질문 후킹: 질문으로 시작하여 댓글 참여를 유도, 참여=알고리즘 가시성 상승",
      "사회적 증거 스토리: 개인 스토리로 신뢰를 구축하고 사회적 증거를 자연스럽게 주입",
    ],
  },
  shortform: {
    label: "쇼츠/릴스/틱톡",
    visualStyle: "세로 풀스크린, 빠른 컷 전환, 대형 자막, 높은 채도, 140 BPM 템포",
    hookArchitecture: "미러 뉴런 후킹 → before/after 시각 충격 → 도파민 루프 → 무한 루프 구조",
    copyTone: "직관적이고 빠른 템포, 인터넷 말투 자연스럽게 섞어 사용, 2줄 이내 대형 텍스트",
    ctaStyle: "내부자 꿀팁형: '고민하는 사이 품절됨 ㅋㅋ', '링크 남겨둠 — 알아서들'",
    scrollStopStrategy: "첫 1~3초 내 시선 강탈, 시각 충격+역설로 스와이프 차단",
    visualTriggers: [
      "미러 뉴런 활성화: 제품 사용 장면 자기 투사로 광고 거부감 제거",
      "before/after 시각 충격: 극단적 비교로 변화 욕구 활성화",
      "도파민 루프: 2.7초 간격 시각 자극으로 무한 스크롤과 같은 원리",
    ],
  },
};

export const PSYCHOLOGICAL_TRIGGERS = [
  { name: "손실 회피 역전", desc: "구매 안 하면 더 비싸게 사게 됨을 암시", example: "지금 안 사면 나중에 2배로 줍게 됩니다" },
  { name: "사회적 증거", desc: "구체적 숫자로 뇌의 판단을 대체", example: "재구매율 89%, 리뷰 12,847개, 별점 4.8" },
  { name: "긴급성/희소성", desc: "한정 수량, 시간 제한으로 행동 촉발", example: "재고 3개 남았을 때가 마지막 기회" },
  { name: "호기심 갭", desc: "정보를 일부 숨겨 끝까지 보게 만듦", example: "이 제품 진짜 살 만한가? 결론은 마지막에" },
  { name: "커밋먼트 일관성", desc: "작은 행동 먼저 유도 후 구매로 연결", example: "댓글에 O 적어주시면 추가 할인 코드 드려요" },
  { name: "권위 프레이밍", desc: "전문가 포즈, 데이터 인용으로 신뢰 상승", example: "소비자 보호원 추천 유일한 제품" },
];

export const TOP1_CTA_TEMPLATES = [
  "고민하는 사이 품절됨 ㅋㅋ — 링크 남겨둠",
  "이거 아직 모르면 손해인데, 링크 남김",
  "알아서들 챙겨요 — 링크는 댓글에",
  "지금 이 가격 유지되는 동안만 — 링크 확인",
  "좋은 거 먼저 아는 사람이 임자 — 여기 링크",
];

export function normalizePlatform(platform: string): ConversionPlatform {
  const p = platform.toLowerCase();
  if (p.includes("tiktok") || p.includes("틱톡")) return "tiktok";
  if (p.includes("instagram") || p.includes("인스타") || p.includes("reels") || p.includes("릴스")) return "instagram";
  if (p.includes("threads") || p.includes("스레드")) return "threads";
  if (p.includes("pinterest") || p.includes("핀터레스트") || p.includes("pin")) return "pinterest";
  if (p.includes("facebook") || p.includes("페이스북") || p.includes("fb")) return "facebook";
  return "shortform";
}

/**
 * Builds a conversion optimization prompt section for AI generation.
 * Used by generate-image, generate-variants, and generate-video-edit-plan.
 */
export function buildConversionPrompt(
  platform: string,
  context: "image" | "video" | "variant",
  customLinks?: string[],
): string {
  const p = normalizePlatform(platform);
  const profile = PLATFORM_CONVERSION_PROFILES[p];

  const triggerSection = PSYCHOLOGICAL_TRIGGERS
    .map((t) => `  - ${t.name}: ${t.desc}\n    예: "${t.example}"`)
    .join("\n");

  const ctaSection = TOP1_CTA_TEMPLATES.map((c) => `  - "${c}"`).join("\n");

  const linkIntegration = customLinks && customLinks.length > 0
    ? `\n### 링크 연동 최적화\n사용자가 입력한 제휴 링크(${customLinks.length}개)를 고려하여, 링크 클릭(CTR)을 최적화하는 방향으로 생성할 것.\n링크는 자연스러운 문맥에서 "내부자 꿀팁"처럼 소개할 것.\n`
    : "";

  let contextDirective = "";
  if (context === "image") {
    contextDirective = `### 이미지 생성 지시사항
- 단순히 예쁜 이미지가 아닌, 구매 전환과 링크 클릭을 유도하는 설득력 있는 시각적 콘텐츠를 생성할 것
- 시각적 트리거를 이미지 구도와 스타일에 반영할 것
  ${profile.visualTriggers.map((t) => `- ${t}`).join("\n  ")}
- ${profile.scrollStopStrategy}
- 플랫폼 스타일: ${profile.visualStyle}`;
  } else if (context === "video") {
    contextDirective = `### 영상 편집 계획 지시사항
- 후킹 구조: ${profile.hookArchitecture}
- 시각적 트리거를 편집 계획에 반영할 것
  ${profile.visualTriggers.map((t) => `- ${t}`).join("\n  ")}
- 플랫폼 스타일: ${profile.visualStyle}
- ${profile.scrollStopStrategy}
- 카피 톤: ${profile.copyTone}
- CTA 스타일: ${profile.ctaStyle}`;
  } else {
    contextDirective = `### 변형 생성 지시사항
- 후킹 구조: ${profile.hookArchitecture}
- 카피 톤: ${profile.copyTone}
- CTA 스타일: ${profile.ctaStyle}
- 시각적 트리거를 변형 패널에 반영할 것
  ${profile.visualTriggers.map((t) => `- ${t}`).join("\n  ")}
- ${profile.scrollStopStrategy}`;
  }

  return `
## 수익화 전환율 상위 1% 최적화 — ${profile.label}

너는 ${profile.label}에서 제휴 마케팅 및 쇼핑 커넥터 수익화 전환율이 가장 높은 상위 1% 게시물의 성공 패턴을 철저히 분석·학습한 전문가야.
단순 정보 전달이 아닌, 실제 구매 전환 및 링크 클릭(CTR)을 유도하는 설득력 있는 콘텐츠를 생성해.

${contextDirective}

### 인간 심리 기반 설득 트리거 (생성 로직에 반영)
${triggerSection}

### 전환 최적화 CTA (기업 명령 금지, 내부자 꿀팁 스타일)
${ctaSection}
${linkIntegration}
`;
}
