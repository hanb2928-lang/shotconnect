import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface KeywordItem {
  rank: number;
  keyword: string;
  trend: "up" | "down" | "new" | "steady";
  changeRate?: string;
  category: string;
  platform: string;
}

interface KeywordGroup {
  platform: string;
  label: string;
  keywords: KeywordItem[];
}

interface ContentIdea {
  title: string;
  angle: string;
  hook: string;
  format: string;
}

const NAVER_KEYWORDS: KeywordItem[] = [
  { rank: 11, keyword: "무선 청소기 스틱", trend: "up", changeRate: "+18%", category: "생활가전", platform: "naver" },
  { rank: 12, keyword: "수분광 쿠션", trend: "up", changeRate: "+12%", category: "뷰티", platform: "naver" },
  { rank: 13, keyword: "오버핏 니트 가디건", trend: "new", category: "패션", platform: "naver" },
  { rank: 14, keyword: "미니 가습기 USB", trend: "up", changeRate: "+25%", category: "생활가전", platform: "naver" },
  { rank: 15, keyword: "비타민C 세럼", trend: "steady", category: "뷰티", platform: "naver" },
  { rank: 16, keyword: "접이식 캠핑의자", trend: "up", changeRate: "+8%", category: "스포츠/레저", platform: "naver" },
  { rank: 17, keyword: "블루투스 이어버드", trend: "down", changeRate: "-3%", category: "디지털", platform: "naver" },
  { rank: 18, keyword: "선스틱 무기자차", trend: "up", changeRate: "+15%", category: "뷰티", platform: "naver" },
  { rank: 19, keyword: "에어프라이어 대용량", trend: "new", category: "생활가전", platform: "naver" },
  { rank: 20, keyword: "요가매트 슬립방지", trend: "steady", category: "스포츠/레저", platform: "naver" },
];

const YOUTUBE_KEYWORDS: KeywordItem[] = [
  { rank: 11, keyword: "가성비 가전 추천", trend: "up", changeRate: "+22%", category: "리뷰", platform: "youtube" },
  { rank: 12, keyword: "자취방 인테리어", trend: "up", changeRate: "+10%", category: "홈스타일링", platform: "youtube" },
  { rank: 13, keyword: "데일리 룩 코디", trend: "steady", category: "패션", platform: "youtube" },
  { rank: 14, keyword: "홈트 기구 추천", trend: "new", category: "운동", platform: "youtube" },
  { rank: 15, keyword: "스킨케어 루틴", trend: "up", changeRate: "+7%", category: "뷰티", platform: "youtube" },
  { rank: 16, keyword: "캠핑 장비 가이드", trend: "up", changeRate: "+14%", category: "아웃도어", platform: "youtube" },
  { rank: 17, keyword: "오피스룩 스타일링", trend: "down", changeRate: "-5%", category: "패션", platform: "youtube" },
  { rank: 18, keyword: "수납 정리 아이템", trend: "new", category: "홈스타일링", platform: "youtube" },
  { rank: 19, keyword: "노이즈캔슬링 헤드폰", trend: "steady", category: "디지털", platform: "youtube" },
  { rank: 20, keyword: "가성비 옷 브랜드", trend: "up", changeRate: "+19%", category: "패션", platform: "youtube" },
];

const COUPANG_KEYWORDS: KeywordItem[] = [
  { rank: 11, keyword: "여름 반팔 티셔츠", trend: "up", changeRate: "+30%", category: "패션", platform: "coupang" },
  { rank: 12, keyword: "무선 청소기", trend: "up", changeRate: "+12%", category: "생활가전", platform: "coupang" },
  { rank: 13, keyword: "수분광 파운데이션", trend: "steady", category: "뷰티", platform: "coupang" },
  { rank: 14, keyword: "런닝화 경량", trend: "new", category: "스포츠", platform: "coupang" },
  { rank: 15, keyword: "에어프라이어", trend: "up", changeRate: "+8%", category: "생활가전", platform: "coupang" },
  { rank: 16, keyword: "블루투스 이어버드", trend: "down", changeRate: "-2%", category: "디지털", platform: "coupang" },
  { rank: 17, keyword: "스테인리스 텀블러", trend: "up", changeRate: "+16%", category: "생활", platform: "coupang" },
  { rank: 18, keyword: "니트 가디건", trend: "new", category: "패션", platform: "coupang" },
  { rank: 19, keyword: "요가 매트", trend: "steady", category: "스포츠", platform: "coupang" },
  { rank: 20, keyword: "미니 가습기", trend: "up", changeRate: "+21%", category: "생활가전", platform: "coupang" },
];

const PLATFORM_GROUPS: KeywordGroup[] = [
  { platform: "naver", label: "네이버 쇼핑 급상승 (11~20위)", keywords: NAVER_KEYWORDS },
  { platform: "youtube", label: "유튜브 인기 검색 (11~20위)", keywords: YOUTUBE_KEYWORDS },
  { platform: "coupang", label: "쿠팡 급상승 (11~20위)", keywords: COUPANG_KEYWORDS },
];

const IDEA_TEMPLATES: Record<string, ContentIdea[]> = {
  default: [
    { title: "이거 사면 3배 시드는 법", angle: "비교/가성비", hook: "{keyword} 구매 전 이 영상부터", format: "숏폼 리뷰" },
    { title: "한 달 사용 후기 (솔직)", angle: "리뷰/신뢰", hook: "{keyword} 한 달 써봤습니다", format: "브이로그" },
    { title: "이렇게 쓰면 효과 200%", angle: "꿀팁/활용", hook: "{keyword} 99%가 모르는 활용법", format: "정보성 콘텐츠" },
    { title: "초보자도 실패 안 하는 선택 가이드", angle: "가이드/선택", hook: "{keyword} 고르는 법 초간단 정리", format: "가이드 영상" },
    { title: "SNS에서 난리난 이유", angle: "바이럴/호기심", hook: "{keyword} 지금 소문 난 이유", format: "트렌드 분석" },
  ],
};

function generateIdeas(keyword: string): ContentIdea[] {
  const templates = IDEA_TEMPLATES.default;
  return templates.map((t) => ({
    title: t.title.replace("{keyword}", keyword),
    angle: t.angle,
    hook: t.hook.replace("{keyword}", keyword),
    format: t.format,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform");
    const ideasFor = url.searchParams.get("ideas");

    if (ideasFor) {
      const ideas = generateIdeas(ideasFor);
      return new Response(
        JSON.stringify({ keyword: ideasFor, ideas, source: "curated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (platform) {
      const group = PLATFORM_GROUPS.find((g) => g.platform === platform);
      if (group) {
        return new Response(
          JSON.stringify({ platform: group.platform, label: group.label, keywords: group.keywords, source: "curated" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ groups: PLATFORM_GROUPS, source: "curated" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
