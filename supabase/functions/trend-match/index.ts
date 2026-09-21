import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function stripJsonFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return t;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface TrendTemplate {
  name: string;
  description: string;
  bgmMood: string;
  bgmTempo: string;
  subtitleStyle: string;
  transitionStyle: string;
  hashtagSuggestions: string[];
}

interface TrendMatchResponse {
  templates: TrendTemplate[];
  categoryInsight: string;
}

interface TrendMatchRequest {
  productCategory: string;
  productName?: string;
  platform?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST is supported" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body: TrendMatchRequest = await req.json();

    if (!body.productCategory) {
      return new Response(
        JSON.stringify({ error: "Product category is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = await resolveOpenAIKey();

    let result: TrendMatchResponse;

    if (openaiKey) {
      try {
        result = await generateWithOpenAI(body, openaiKey);
      } catch {
        result = generateLocalTrendMatch(body);
      }
    } else {
      result = generateLocalTrendMatch(body);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Trend match failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function resolveOpenAIKey(): Promise<string | null> {
  const serverKey = Deno.env.get("OPENAI_API_KEY");
  if (serverKey) return serverKey;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=openai_api_key&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
      if (resp.ok) {
        const rows = await resp.json() as Array<{ openai_api_key: string | null }>;
        const dbKey = rows[0]?.openai_api_key;
        if (dbKey) return dbKey;
      }
    } catch {
      // no fallback beyond env
    }
  }
  return null;
}

async function generateWithOpenAI(
  data: TrendMatchRequest,
  apiKey: string,
): Promise<TrendMatchResponse> {
  const systemPrompt =
    "너는 숏폼 트렌드 분석 전문가야. 상품 카테고리를 받으면 현재 숏폼 시장(틱톡·릴스·쇼츠)에서 가장 반응이 좋은 트렌디한 자막 스타일과 BGM 분위기를 추천해.\n" +
    "결과는 JSON만 반환: { \"categoryInsight\": \"이 카테고리의 숏폼 트렌드 한 줄 인사이트\", \"templates\": [{ \"name\": \"템플릿명(15자 이내)\", \"description\": \"어떤 분위기인지 한 줄(30-60자)\", \"bgmMood\": \"BGM 분위기(예: 업비트 신스팝, 잔잔한 로파이, 트렌디 힙합)\", \"bgmTempo\": \"템포(예: 120-140 BPM, 70-90 BPM)\", \"subtitleStyle\": \"자막 스타일(예: 큰 볼드 폰트 중앙, 타이핑 효과, 팝업 애니메이션)\", \"transitionStyle\": \"전환 효과(예: 줌 인, 와이프, 글리치)\", \"hashtagSuggestions\": [\"관련 트렌드 해시태그 3-5개\"] }] }\n" +
    "templates는 3개를 만들어. 각각 다른 분위기(예: 트렌디/힙, 감성/차분, 파격/자극)로.\n" +
    "한국어로 자연스럽게 작성하고, 실제 숏폼 크리에이터가 쓰는 트렌드 용어를 활용해.";

  const userPrompt =
    `카테고리: ${data.productCategory}\n` +
    `제품명: ${data.productName || ""}\n` +
    `플랫폼: ${data.platform || "종합"}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.85,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content returned from OpenAI");

    let parsed: any;
    try {
      parsed = JSON.parse(stripJsonFence(content));
    } catch {
      return generateLocalTrendMatch(data);
    }
    return normalizeResponse(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeResponse(raw: Record<string, unknown>): TrendMatchResponse {
  const templates: TrendTemplate[] = Array.isArray(raw.templates)
    ? (raw.templates as Record<string, unknown>[]).slice(0, 3).map((t) => ({
        name: String(t.name || "").slice(0, 30),
        description: String(t.description || "").slice(0, 100),
        bgmMood: String(t.bgmMood || "").slice(0, 50),
        bgmTempo: String(t.bgmTempo || "").slice(0, 30),
        subtitleStyle: String(t.subtitleStyle || "").slice(0, 60),
        transitionStyle: String(t.transitionStyle || "").slice(0, 40),
        hashtagSuggestions: Array.isArray(t.hashtagSuggestions)
          ? (t.hashtagSuggestions as unknown[]).slice(0, 5).map((h) => String(h).slice(0, 30))
          : [],
      }))
    : [];

  return {
    categoryInsight: String(raw.categoryInsight || "").slice(0, 100),
    templates,
  };
}

function generateLocalTrendMatch(data: TrendMatchRequest): TrendMatchResponse {
  const category = (data.productCategory || "").toLowerCase();
  const platform = (data.platform || "").toLowerCase();

  const templatePool: Record<string, TrendTemplate[]> = {
    fashion: [
      {
        name: "OOTD 힙합 스와이프",
        description: "착장 전후를 빠른 컷 전환으로 보여주는 트렌디 OOTD",
        bgmMood: "업비트 힙합 / UK Garage",
        bgmTempo: "130-145 BPM",
        subtitleStyle: "대형 볼드 폰트 중앙 + 글리치 효과",
        transitionStyle: "스와이프 + 줌 인",
        hashtagSuggestions: ["#ootd", "#fitcheck", "#fashionhack", "#스타일링"],
      },
      {
        name: "감성 룩북 무비",
        description: "슬로우 모션으로 옷의 질감과 핏을 감성적으로 담는 룩북",
        bgmMood: "잔잔한 R&B / Lo-fi",
        bgmTempo: "70-90 BPM",
        subtitleStyle: "미니멀 세리프 하단 + 페이드 인",
        transitionStyle: "크로스 디졸브",
        hashtagSuggestions: ["#lookbook", "#감성룩북", "#fashionfilm", "#코디"],
      },
      {
        name: "가격 충격 언박싱",
        description: "박스 오픈부터 착장까지 빠른 템포로 시선 강탈",
        bgmMood: "트렌디 신스팝 / EDM",
        bgmTempo: "120-140 BPM",
        subtitleStyle: "팝업 애니메이션 + 카운터 효과",
        transitionStyle: "와이프 + 플래시",
        hashtagSuggestions: ["#unboxing", "#가격충격", "#fashionfind", "#finds"],
      },
    ],
    beauty: [
      {
        name: "비포애프터 줌인",
        description: "사용 전후 피부 변화를 클로즈업으로 보여주는 뷰티 숏폼",
        bgmMood: "트렌디 K-pop 인스트루멘탈",
        bgmTempo: "110-130 BPM",
        subtitleStyle: "볼드 중앙 + 비포/애프터 라벨",
        transitionStyle: "스플릿 화면 + 줌 인",
        hashtagSuggestions: ["#beforeafter", "#skincare", "#뷰티팁", "#glowup"],
      },
      {
        name: "ASMR 제거 챌린지",
        description: "제품 질감과 도포 소리를 ASMR로 담는 힐링 뷰티",
        bgmMood: "ASMR / Ambience",
        bgmTempo: "60-80 BPM",
        subtitleStyle: "미니멀 하단 + 타이핑 효과",
        transitionStyle: "페이드",
        hashtagSuggestions: ["#asmr", "#skincareasmr", "#뷰티ASMR", "#힐링"],
      },
      {
        name: "메이크오버 쇼크",
        description: "화장 전후 극대화로 반응 유도하는 변신 콘텐츠",
        bgmMood: "업비트 팝 / Hyperpop",
        bgmTempo: "130-150 BPM",
        subtitleStyle: "큰 볼드 + 글리치 전환",
        transitionStyle: "플래시 컷",
        hashtagSuggestions: ["#makeover", "#변신", "#beautychallenge", "#메이크오버"],
      },
    ],
    electronics: [
      {
        name: "기능 데모 줌인",
        description: "핵심 기능을 3초마다 클로즈업으로 보여주는 테크 리뷰",
        bgmMood: "트렌디 신스 / Electronic",
        bgmTempo: "100-120 BPM",
        subtitleStyle: "템플릿형 상단 + 아이콘 팝업",
        transitionStyle: "줌 인 + 와이프",
        hashtagSuggestions: ["#techreview", "#gadget", "#전자기기", "#unboxing"],
      },
      {
        name: "무선 자유 ASMR",
        description: "제품 사용 소리를 ASMR로 담는 차분한 테크 숏폼",
        bgmMood: "Lo-fi / Chillhop",
        bgmTempo: "70-90 BPM",
        subtitleStyle: "미니멀 하단 + 페이드",
        transitionStyle: "슬로우 줌",
        hashtagSuggestions: ["#asmr", "#techasmr", "#차분한리뷰", "#gadgets"],
      },
      {
        name: "가격 파격 틱톡",
        description: "가격 대비 성능을 강조하는 빠른 템포 테크 핵",
        bgmMood: "업비트 EDM / Bass",
        bgmTempo: "130-145 BPM",
        subtitleStyle: "팝업 카운터 + 볼드",
        transitionStyle: "글리치 + 플래시",
        hashtagSuggestions: ["#techhack", "#가성비", "#전자기기추천", "#gadgetfinds"],
      },
    ],
    home: [
      {
        name: "비포애프터 인테리어",
        description: "배치 전후 공간 변화를 극대화하는 홈 숏폼",
        bgmMood: "잔잔한 Piano / Ambient",
        bgmTempo: "60-80 BPM",
        subtitleStyle: "미니멀 중앙 + 페이드",
        transitionStyle: "크로스 디졸브",
        hashtagSuggestions: ["#beforeafter", "#home", "#인테리어", "#홈스타일링"],
      },
      {
        name: "ASMR 홈 케어",
        description: "청소나 정리 소리를 ASMR로 담는 힐링 콘텐츠",
        bgmMood: "ASMR / Nature sounds",
        bgmTempo: "50-70 BPM",
        subtitleStyle: "하단 미니멀 + 타이핑",
        transitionStyle: "슬로운 줌",
        hashtagSuggestions: ["#asmr", "#homecare", "#청소asmr", "#힐링"],
      },
      {
        name: "공간 변신 타임랩스",
        description: "빠른 전환으로 공간 변화를 보여주는 트렌디 홈",
        bgmMood: "업비트 Indie / Pop",
        bgmTempo: "110-130 BPM",
        subtitleStyle: "볼드 중앙 + 팝업",
        transitionStyle: "와이프 + 타임랩스",
        hashtagSuggestions: ["#hometransform", "#공간변신", "#인테리어", "#homefinds"],
      },
    ],
    food: [
      {
        name: "먹방 반응 쇼크",
        description: "첫 입맛 반응을 클로즈업으로 시선 강탈",
        bgmMood: "업비트 K-pop / Pop",
        bgmTempo: "120-140 BPM",
        subtitleStyle: "큰 볼드 중앙 + 이모지 팝업",
        transitionStyle: "줌 인 + 플래시",
        hashtagSuggestions: ["#먹방", "#food", "#맛있는", "#foodie"],
      },
      {
        name: "ASMR 요리 무비",
        description: "조리 과정 소리를 ASMR로 담는 감성 푸드",
        bgmMood: "ASMR / Jazz",
        bgmTempo: "60-80 BPM",
        subtitleStyle: "미니멀 하단 + 페이드",
        transitionStyle: "슬로우 줌",
        hashtagSuggestions: ["#asmr", "#cooking", "#요리asmr", "#힐링먹방"],
      },
      {
        name: "레시피 15초 컷",
        description: "빠른 컷 전환으로 레시피를 15초에 담는 트렌디 푸드",
        bgmMood: "업비트 Electronic / Pop",
        bgmTempo: "130-145 BPM",
        subtitleStyle: "스텝 카운터 + 볼드",
        transitionStyle: "와이프 + 글리치",
        hashtagSuggestions: ["#recipe", "#15초레시피", "#요리", "#easyrecipe"],
      },
    ],
    toy: [
      {
        name: "장난감 언박싱 쇼크",
        description: "박스 오픈 순간의 반응을 클로즈업으로 보여주는 키즈 숏폼",
        bgmMood: "업비트 팝 / K-pop",
        bgmTempo: "120-140 BPM",
        subtitleStyle: "큰 볼드 + 이모지 팝업",
        transitionStyle: "줌 인 + 플래시",
        hashtagSuggestions: ["#unboxing", "#장난감", "#toys", "#키즈"],
      },
      {
        name: "만화 전환 매직",
        description: "실사에서 만화 스타일로 전환되는 재미 요소 숏폼",
        bgmMood: "트렌디 신스팝 / Pop",
        bgmTempo: "110-130 BPM",
        subtitleStyle: "팝업 애니메이션 + 볼드",
        transitionStyle: "글리치 + 만화 전환",
        hashtagSuggestions: ["#cartoon", "#만화", "#fun", "#키즈숏폼"],
      },
      {
        name: "ASMR 장난감 힐링",
        description: "장난감 소리를 ASMR로 담는 차분한 키즈 콘텐츠",
        bgmMood: "ASMR / Ambience",
        bgmTempo: "50-70 BPM",
        subtitleStyle: "미니멀 하단 + 페이드",
        transitionStyle: "슬로우 줌",
        hashtagSuggestions: ["#asmr", "#toysasmr", "#힐링", "#키즈"],
      },
    ],
    luxury: [
      {
        name: "럭셔리 무비 룩북",
        description: "슬로우 모션으로 제품의 고급스러움을 감성적으로 담는 숏폼",
        bgmMood: "잔잔한 클래식 / Ambient",
        bgmTempo: "60-80 BPM",
        subtitleStyle: "미니멀 세리프 하단 + 페이드",
        transitionStyle: "크로스 디졸브 + 슬로우 줌",
        hashtagSuggestions: ["#luxury", "#럭셔리", "#premium", "#명품"],
      },
      {
        name: "언박싱 시네마",
        description: "고급 패키지 오픈을 영화처럼 담는 감성 언박싱",
        bgmMood: "감성 R&B / Lo-fi",
        bgmTempo: "70-90 BPM",
        subtitleStyle: "미니멀 중앙 + 타이핑 효과",
        transitionStyle: "슬로우 줌 + 페이드",
        hashtagSuggestions: ["#unboxing", "#luxury", "#명품언박싱", "#premium"],
      },
      {
        name: "디테일 클로즈업",
        description: "제품의 디테일을 클로즈업으로 보여주는 미니멀 럭셔리",
        bgmMood: "잔잔한 Piano / Ambient",
        bgmTempo: "60-80 BPM",
        subtitleStyle: "미니멀 하단 + 페이드",
        transitionStyle: "슬로우 줌",
        hashtagSuggestions: ["#luxury", "#detail", "#명품", "#premium"],
      },
    ],
  };

  const defaultTemplates: TrendTemplate[] = [
    {
      name: "트렌디 줌인",
      description: "제품 핵심을 빠른 줌인으로 보여주는 트렌디 숏폼",
      bgmMood: "업비트 신스팝 / Pop",
      bgmTempo: "120-140 BPM",
      subtitleStyle: "대형 볼드 중앙 + 팝업",
      transitionStyle: "줌 인 + 와이프",
      hashtagSuggestions: ["#trending", "#shorts", "#릴스", "#fyp"],
    },
    {
      name: "감성 무비",
      description: "슬로우 모션으로 제품의 감성을 담는 차분한 숏폼",
      bgmMood: "잔잔한 R&B / Lo-fi",
      bgmTempo: "70-90 BPM",
      subtitleStyle: "미니멀 세리프 하단 + 페이드",
      transitionStyle: "크로스 디졸브",
      hashtagSuggestions: ["#aesthetic", "#감성", "#mood", "#cinematic"],
    },
    {
      name: "가격 충격 컷",
      description: "빠른 전환으로 가격 대비 가치를 강조하는 자극 숏폼",
      bgmMood: "업비트 EDM / Hyperpop",
      bgmTempo: "130-150 BPM",
      subtitleStyle: "팝업 카운터 + 글리치",
      transitionStyle: "플래시 + 와이프",
      hashtagSuggestions: ["#deal", "#가격충격", "#musthave", "#finds"],
    },
  ];

  const categoryMap: Record<string, string[]> = {
    fashion: ['fashion', '패션', '의류', '옷', '신발', 'sneakers', 'shoes', 'apparel', 'cloth', 'jacket', 'shirt', '자켓', '셔츠'],
    beauty: ['beauty', '뷰티', '화장품', 'skincare', 'cosmetics', '메이크업', '피부', 'makeup'],
    electronics: ['electronics', '디지털', '전자', '가전', 'tech', 'gadget', '기기', 'phone', '스마트폰', '휴대폰'],
    home: ['home', '홈', '인테리어', '가구', 'living', '주방', 'kitchen', '생활', 'furniture', 'lamp', 'light', '조명', '램프'],
    food: ['food', '식품', '음식', '먹방', '요리', 'snack', 'drink', 'beverage', '음료', '간식'],
    toy: ['toy', '장난감', '완구', 'kid', '유아', '키즈', 'fun'],
    luxury: ['luxury', '럭셔리', '명품', 'jewel', '주얼리', 'watch', '시계', 'premium', '프리미엄'],
  };

  const matchedKey = Object.keys(categoryMap).find((key) =>
    categoryMap[key].some((kw) => category.includes(kw))
  );
  const templates = matchedKey ? templatePool[matchedKey] : defaultTemplates;

  const insightMap: Record<string, string> = {
    fashion: "패션 숏폼은 착장 전후 비교와 OOTD 스와이프가 가장 조회수가 높아요",
    beauty: "뷰티는 비포애프터와 ASMR 도포 장면이 반응률이 가장 높아요",
    electronics: "테크는 3초 클로즈업 데모와 가성비 강조가 시선을 잡아요",
    home: "홈/인테리어는 비포애프터 공간 변화가 가장 바이럴이 잘 나요",
    food: "푸드는 첫 반응 클로즈업과 ASMR 조리 소리가 핵심이에요",
    toy: "키즈/장난감은 언박싱 반응과 만화 전환 효과가 시선을 잡아요",
    luxury: "럭셔리는 슬로우 모션과 디테일 클로즈업으로 고급스러움을 살려요",
  };

  const categoryInsight = matchedKey
    ? insightMap[matchedKey]
    : "트렌디한 BGM과 빠른 전환이 숏폼 조회수를 높여요";

  let finalTemplates = templates;
  if (platform === "shortform" || platform === "instagram") {
    finalTemplates = templates.map((t) => ({
      ...t,
      subtitleStyle: t.subtitleStyle + " (세로 9:16 최적화)",
    }));
  } else if (platform === "twitter" || platform === "threads") {
    finalTemplates = templates.map((t) => ({
      ...t,
      subtitleStyle: t.subtitleStyle + " (가로 16:9 최적화)",
    }));
  }

  return { templates: finalTemplates, categoryInsight };
}
