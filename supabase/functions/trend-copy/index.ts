import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TrendCopy {
  phrase: string;
  context: string;
  platforms: string[];
}

const TREND_COPIES_BY_CATEGORY: Record<string, TrendCopy[]> = {
  fashion: [
    { phrase: "이거 입고 나갔더니 칭찬 빈도 200%", context: "착붙 인증 · OOTD 후킹", platforms: ["instagram", "shortform"] },
    { phrase: "옷장에 하나씩은 무조건 있어야 하는", context: "필수템 강조 · 트렌드템", platforms: ["instagram", "naverBlog"] },
    { phrase: "이 가격에 이 퀄리티가 되나 싶은", context: "가성비 강조 · 공구형", platforms: ["shortform", "threads"] },
    { phrase: "스태프들이 다 물어본 아이템", context: "호기심 유발 · 릴스", platforms: ["shortform", "instagram"] },
    { phrase: "이번 시즌 제일 잘한 짓", context: "만족감 표현 · 후기형", platforms: ["instagram", "threads"] },
  ],
  beauty: [
    { phrase: "바르고 나서 거울을 3번은 봤어요", context: "셀프 만족 · 꿀템", platforms: ["instagram", "shortform"] },
    { phrase: "피부가 맑아진다는 게 이런 거구나", context: "글로시 효과 강조", platforms: ["shortform", "instagram"] },
    { phrase: "화장품은 이거 하나로 끝", context: "올인원 강조 · 단순화", platforms: ["instagram", "naverBlog"] },
    { phrase: "써보고 진짜 놀란 첫 인상", context: "첫인상 후킹 · 틱톡", platforms: ["shortform", "threads"] },
    { phrase: "이거 모르면 손해인 꿀템", context: "정보형 후킹", platforms: ["threads", "naverBlog"] },
  ],
  electronics: [
    { phrase: "이거 산 날이 제일 생산성 올라간 날", context: "효율 강조 · 데스크셋업", platforms: ["instagram", "threads"] },
    { phrase: "전 이거 없이 어떻게 살았나 싶어요", context: "필수성 강조 · 후기", platforms: ["shortform", "instagram"] },
    { phrase: "가성비 끝판왕이라 바로 결제", context: "가성비 · 공구형", platforms: ["shortform", "threads"] },
    { phrase: "언박싱부터 벌써 설레는", context: "언박싱 후킹 · 릴스", platforms: ["shortform", "instagram"] },
    { phrase: "이거 추천해준 친구한테 밥 사야 됨", context: "입소문 강조 · 후기형", platforms: ["threads", "naverBlog"] },
  ],
  home: [
    { phrase: "집에 이거 하나 추가했더니 분위기가", context: "인테리어 변화 · 감성템", platforms: ["instagram", "naverBlog"] },
    { phrase: "자취생 필수템으로 낙인 찍음", context: "자취방 꿀템 · 공구형", platforms: ["shortform", "threads"] },
    { phrase: "이거 쓰고 나서 집안일이 즐거워진", context: "생활 편의성 강조", platforms: ["instagram", "naverBlog"] },
    { phrase: "새집에 무조건 들여야 할 아이템", context: "새집 꿀템 · 이사", platforms: ["threads", "naverBlog"] },
    { phrase: "이거 사고 후회한 적 단 한 번도 없음", context: "무조건 추천 · 후기형", platforms: ["shortform", "instagram"] },
  ],
  sports: [
    { phrase: "이거 있어야 홈트가 완성되는", context: "홈트 필수템 · 운동", platforms: ["instagram", "shortform"] },
    { phrase: "운동 시작하고 제일 먼저 산 거", context: "운동 입문 · 필수템", platforms: ["threads", "naverBlog"] },
    { phrase: "이거 하나로 홈짐 완성", context: "올인원 · 공간 절약", platforms: ["shortform", "instagram"] },
    { phrase: "캠핑 가서 이거 꺼냈더니 다 부러운", context: "캠핑 꿀템 · 아웃도어", platforms: ["instagram", "threads"] },
    { phrase: "이거 추천하는 순간 운동 친구됨", context: "입소문 · 추천형", platforms: ["threads", "shortform"] },
  ],
};

const DEFAULT_TRENDS: TrendCopy[] = [
  { phrase: "이거 모르면 손해인 꿀템", context: "정보형 후킹 · 트렌드", platforms: ["shortform", "instagram"] },
  { phrase: "이 가격에 이 퀄리티가 되나 싶은", context: "가성비 강조 · 공구형", platforms: ["shortform", "threads"] },
  { phrase: "써보고 진짜 놀란 첫 인상", context: "첫인상 후킹", platforms: ["shortform", "instagram"] },
  { phrase: "이거 추천해준 친구한테 밥 사야 됨", context: "입소문 강조 · 후기형", platforms: ["threads", "naverBlog"] },
  { phrase: "이거 없이 어떻게 살았나 싶어요", context: "필수성 강조 · 후기", platforms: ["shortform", "instagram"] },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  fashion: ["패션", "의류", "옷", "cloth", "jacket", "shirt", "sneakers", "신발", "스니커즈", "슬랙스", "가디건", "블레이저", "셔츠"],
  beauty: ["뷰티", "화장", "cosmetic", "makeup", "쿠션", "클렌징", "세럼", "선스틱", "립", "틴트", "스킨케어"],
  electronics: ["디지털", "가전", "전자", "electronic", "이어버드", "워치", "가습기", "충전기", "헤드폰", "블루투스"],
  home: ["생활", "주방", "home", "공기청정기", "텀블러", "도마", "청소기", "에어프라이어", "인테리어", "조명"],
  sports: ["스포츠", "레저", "sport", "런닝", "요가", "헬스", "캠핑", "등산", "풀업바", "자전거"],
};

function matchCategory(productCategory: string, tags: string[], productName: string): string | null {
  const haystack = `${productCategory} ${tags.join(" ")} ${productName}`.toLowerCase();
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return catId;
    }
  }
  return null;
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
    const productCategory = url.searchParams.get("productCategory") || "";
    const productName = url.searchParams.get("productName") || "";
    const productTags = url.searchParams.get("tags") || "";
    const platform = url.searchParams.get("platform") || "";

    const tags = productTags ? productTags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const matchedCat = matchCategory(productCategory, tags, productName);

    let trends = matchedCat && TREND_COPIES_BY_CATEGORY[matchedCat]
      ? TREND_COPIES_BY_CATEGORY[matchedCat]
      : DEFAULT_TRENDS;

    if (platform) {
      const platformFiltered = trends.filter((t) => t.platforms.includes(platform));
      if (platformFiltered.length > 0) trends = platformFiltered;
    }

    return new Response(
      JSON.stringify({ trends, category: matchedCat || "general", source: "curated" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
