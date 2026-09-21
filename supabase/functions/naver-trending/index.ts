import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TrendingProduct {
  rank: number;
  name: string;
  price: string;
  originalPrice?: string;
  discountRate?: string;
  imageUrl: string;
  link: string;
  category: string;
  shopName?: string;
  marketplace?: "coupang" | "naver" | "toss";
  rating?: number;
  reviewCount?: number;
}

interface TrendingCategory {
  id: string;
  label: string;
  products: TrendingProduct[];
  hashtags: string[];
}

const TRENDING_HASHTAGS: Record<string, string[]> = {
  fashion: ["오늘뭐입지", "데일리룩", "가성비옷", "옷장필수템", "착붙템", "코디", "스타일링", "패션템", "트렌드룩", "미니멀룩"],
  beauty: ["글로시메이크업", "수분광", "데일리메이크업", "스킨케어", "뷰티템", "선크림", "립틴트", "쿠션", "클렌징", "탱글탱글"],
  electronics: ["가성비가전", "데스크셋업", "오디오", "이어버드", "스마트워치", "노이즈캔슬링", "블루투스", "디지털템", "홈가전", "충전기"],
  home: ["자취방꾸미기", "인테리어", "감성템", "주방템", "청소기", "공기청정기", "텀블러", "도마", "에어프라이어", "홈스타일링"],
  sports: ["홈트", "요가", "런닝", "캠핑", "등산", "헬스", "요가매트", "러닝화", "아웃도어", "스포츠용품"],
};

const FALLBACK_CATEGORIES: TrendingCategory[] = [
  {
    id: "fashion",
    label: "패션의류",
    hashtags: TRENDING_HASHTAGS.fashion,
    products: [
      { rank: 1, name: "오버핏 밴딩 슬랙스", price: "29,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=오버핏+밴딩+슬랙스", link: "https://search.shopping.naver.com/search/all?query=오버핏+밴딩+슬랙스", category: "패션의류", shopName: "트렌드샵" },
      { rank: 2, name: "베이직 니트 가디건", price: "39,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=베이직+니트+가디건", link: "https://search.shopping.naver.com/search/all?query=베이직+니트+가디건", category: "패션의류", shopName: "니트플러스" },
      { rank: 3, name: "와이드 카고 팬츠", price: "45,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=와이드+카고+팬츠", link: "https://search.shopping.naver.com/search/all?query=와이드+카고+팬츠", category: "패션의류", shopName: "스트릿스타일" },
      { rank: 4, name: "슬림핏 블레이저", price: "89,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=슬림핏+블레이저", link: "https://search.shopping.naver.com/search/all?query=슬림핏+블레이저", category: "패션의류", shopName: "오피스룩" },
      { rank: 5, name: "코튼 체크 셔츠", price: "32,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=코튼+체크+셔츠", link: "https://search.shopping.naver.com/search/all?query=코튼+체크+셔츠", category: "패션의류", shopName: "셔츠전문점" },
    ],
  },
  {
    id: "beauty",
    label: "뷰티",
    hashtags: TRENDING_HASHTAGS.beauty,
    products: [
      { rank: 1, name: "수분광 쿠션 파운데이션", price: "28,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=수분광+쿠션+파운데이션", link: "https://search.shopping.naver.com/search/all?query=수분광+쿠션+파운데이션", category: "뷰티", shopName: "뷰티플러스" },
      { rank: 2, name: "저자극 클렌징 오일", price: "18,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=저자극+클렌징+오일", link: "https://search.shopping.naver.com/search/all?query=저자극+클렌징+오일", category: "뷰티", shopName: "클린뷰티" },
      { rank: 3, name: "비타C 세럼 앰플", price: "24,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=비타민C+세럼+앰플", link: "https://search.shopping.naver.com/search/all?query=비타민C+세럼+앰플", category: "뷰티", shopName: "글로우업" },
      { rank: 4, name: "무기자차 선스틱", price: "15,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=무기자차+선스틱", link: "https://search.shopping.naver.com/search/all?query=무기자차+선스틱", category: "뷰티", shopName: "선케어" },
      { rank: 5, name: "데일리 립 틴트", price: "12,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=데일리+립+틴트", link: "https://search.shopping.naver.com/search/all?query=데일리+립+틴트", category: "뷰티", shopName: "립랩" },
    ],
  },
  {
    id: "electronics",
    label: "디지털/가전",
    hashtags: TRENDING_HASHTAGS.electronics,
    products: [
      { rank: 1, name: "무선 블루투스 이어버드", price: "79,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=무선+블루투스+이어버드", link: "https://search.shopping.naver.com/search/all?query=무선+블루투스+이어버드", category: "디지털/가전", shopName: "디지털플러스" },
      { rank: 2, name: "스마트 워치 최신형", price: "299,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=스마트+워치+최신형", link: "https://search.shopping.naver.com/search/all?query=스마트+워치+최신형", category: "디지털/가전", shopName: "웨어러블" },
      { rank: 3, name: "미니 가습기 USB", price: "19,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=미니+가습기+USB", link: "https://search.shopping.naver.com/search/all?query=미니+가습기+USB", category: "디지털/가전", shopName: "홈가전" },
      { rank: 4, name: "고속 충전기 거치대", price: "24,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=고속+충전기+거치대", link: "https://search.shopping.naver.com/search/all?query=고속+충전기+거치대", category: "디지털/가전", shopName: "차저샵" },
      { rank: 5, name: "노이즈 캔슬링 헤드폰", price: "199,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=노이즈+캔슬링+헤드폰", link: "https://search.shopping.naver.com/search/all?query=노이즈+캔슬링+헤드폰", category: "디지털/가전", shopName: "사운드랩" },
    ],
  },
  {
    id: "home",
    label: "생활/주방",
    hashtags: TRENDING_HASHTAGS.home,
    products: [
      { rank: 1, name: "공기청정기 미니", price: "89,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=공기청정기+미니", link: "https://search.shopping.naver.com/search/all?query=공기청정기+미니", category: "생활/주방", shopName: "홈케어" },
      { rank: 2, name: "스테인리스 텀블러", price: "15,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=스테인리스+텀블러", link: "https://search.shopping.naver.com/search/all?query=스테인리스+텀블러", category: "생활/주방", shopName: "텀블러굿" },
      { rank: 3, name: "실란톱 도마 세트", price: "22,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=실란톱+도마+세트", link: "https://search.shopping.naver.com/search/all?query=실란톱+도마+세트", category: "생활/주방", shopName: "키친만족" },
      { rank: 4, name: "무선 청소기 스틱", price: "159,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=무선+청소기+스틱", link: "https://search.shopping.naver.com/search/all?query=무선+청소기+스틱", category: "생활/주방", shopName: "클린홈" },
      { rank: 5, name: "에어 프라이어 대용량", price: "69,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=에어+프라이어+대용량", link: "https://search.shopping.naver.com/search/all?query=에어+프라이어+대용량", category: "생활/주방", shopName: "주방가전" },
    ],
  },
  {
    id: "sports",
    label: "스포츠/레저",
    hashtags: TRENDING_HASHTAGS.sports,
    products: [
      { rank: 1, name: "런닝화 경량 초경량", price: "99,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=런닝화+경량+초경량", link: "https://search.shopping.naver.com/search/all?query=런닝화+경량+초경량", category: "스포츠/레저", shopName: "러닝플러스" },
      { rank: 2, name: "요가 매트 슬립방지", price: "29,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=요가+매트+슬립방지", link: "https://search.shopping.naver.com/search/all?query=요가+매트+슬립방지", category: "스포츠/레저", shopName: "요가라이프" },
      { rank: 3, name: "헬스 도어 풀업바", price: "19,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=헬스+도어+풀업바", link: "https://search.shopping.naver.com/search/all?query=헬스+도어+풀업바", category: "스포츠/레저", shopName: "홈헬스" },
      { rank: 4, name: "캠핑 접이식 의자", price: "25,000원", imageUrl: "https://search.shopping.naver.com/search/all?query=캠핑+접이식+의자", link: "https://search.shopping.naver.com/search/all?query=캠핑+접이식+의자", category: "스포츠/레저", shopName: "아웃도어굿" },
      { rank: 5, name: "자전거 미니 펌프", price: "12,900원", imageUrl: "https://search.shopping.naver.com/search/all?query=자전거+미니+펌프", link: "https://search.shopping.naver.com/search/all?query=자전거+미니+펌프", category: "스포츠/레저", shopName: "바이크샵" },
    ],
  },
];

const COUPANG_BEST_CATEGORIES: TrendingCategory[] = [
  {
    id: "fashion",
    label: "패션의류",
    hashtags: TRENDING_HASHTAGS.fashion,
    products: [
      { rank: 1, name: "여름 릴렉스핏 반팔 티셔츠", price: "12,900원", originalPrice: "19,900원", discountRate: "35%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%B0%98%ED%8C%94+%ED%8B%B0%EC%85%94%EC%B8%A0", category: "패션의류", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.8, reviewCount: 12530 },
      { rank: 2, name: "오버핏 밴딩 슬랙스", price: "29,900원", originalPrice: "45,000원", discountRate: "33%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%B0%B4%EB%94%A9+%EC%8A%AC%EB%9E%99%EC%8A%A4", category: "패션의류", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.7, reviewCount: 8210 },
      { rank: 3, name: "베이직 니트 가디건", price: "39,900원", originalPrice: "59,000원", discountRate: "32%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%8B%88%ED%8A%B8+%EA%B0%80%EB%94%94%EA%B1%B4", category: "패션의류", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.6, reviewCount: 5430 },
      { rank: 4, name: "와이드 카고 팬츠", price: "45,000원", originalPrice: "69,000원", discountRate: "35%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EC%B9%B4%EA%B3%A0+%ED%8C%AC%EC%B8%A0", category: "패션의류", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.5, reviewCount: 3920 },
      { rank: 5, name: "슬림핏 블레이저", price: "89,000원", originalPrice: "129,000원", discountRate: "31%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%B8%94%EB%A0%88%EC%9D%B4%EC%A0%80", category: "패션의류", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.4, reviewCount: 2100 },
    ],
  },
  {
    id: "beauty",
    label: "뷰티",
    hashtags: TRENDING_HASHTAGS.beauty,
    products: [
      { rank: 1, name: "수분광 쿠션 파운데이션", price: "28,000원", originalPrice: "40,000원", discountRate: "30%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EC%88%98%EB%B6%84%EA%B4%91+%EC%BF%A0%EC%85%98", category: "뷰티", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.9, reviewCount: 18200 },
      { rank: 2, name: "저자극 클렌징 오일", price: "18,900원", originalPrice: "28,000원", discountRate: "32%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%ED%81%B4%EB%A0%8C%EC%A7%95+%EC%98%A4%EC%9D%BC", category: "뷰티", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.8, reviewCount: 9450 },
      { rank: 3, name: "비타C 세럼 앰플", price: "24,000원", originalPrice: "36,000원", discountRate: "33%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%B9%84%ED%83%80%EC%9D%B4C+%EC%84%B8%EB%9F%BC", category: "뷰티", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.7, reviewCount: 7230 },
      { rank: 4, name: "무기자차 선스틱", price: "15,900원", originalPrice: "24,000원", discountRate: "34%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EC%84%A0%EC%8A%A4%ED%8B%B1", category: "뷰티", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.6, reviewCount: 5610 },
      { rank: 5, name: "데일리 립 틴트", price: "12,000원", originalPrice: "18,000원", discountRate: "33%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%A6%BD+%ED%8B%B4%ED%8A%B8", category: "뷰티", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.5, reviewCount: 4300 },
    ],
  },
  {
    id: "electronics",
    label: "디지털/가전",
    hashtags: TRENDING_HASHTAGS.electronics,
    products: [
      { rank: 1, name: "무선 블루투스 이어버드", price: "79,900원", originalPrice: "149,000원", discountRate: "46%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%B8%94%EB%A3%A8%ED%88%AC%EC%8A%A4+%EC%9D%B4%EC%96%B4%EB%B2%84%EB%93%9C", category: "디지털/가전", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.7, reviewCount: 22100 },
      { rank: 2, name: "스마트 워치 최신형", price: "299,000원", originalPrice: "449,000원", discountRate: "33%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EC%8A%A4%EB%A7%88%ED%8A%B8+%EC%9B%8C%EC%B9%98", category: "디지털/가전", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.6, reviewCount: 13400 },
      { rank: 3, name: "미니 가습기 USB", price: "19,900원", originalPrice: "34,000원", discountRate: "41%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%AF%B8%EB%8B%88+%EA%B0%80%EC%8A%B5%EA%B8%B0", category: "디지털/가전", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.5, reviewCount: 6800 },
      { rank: 4, name: "고속 충전기 거치대", price: "24,900원", originalPrice: "39,000원", discountRate: "36%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EA%B3%A0%EC%86%8D+%EC%B6%A9%EC%A0%84%EA%B8%B0", category: "디지털/가전", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.4, reviewCount: 5200 },
      { rank: 5, name: "노이즈 캔슬링 헤드폰", price: "199,000원", originalPrice: "299,000원", discountRate: "33%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%85%B8%EC%9D%B4%EC%A6%88+%EC%BA%94%EC%8A%AC%EB%A7%81", category: "디지털/가전", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.8, reviewCount: 8900 },
    ],
  },
  {
    id: "home",
    label: "생활/주방",
    hashtags: TRENDING_HASHTAGS.home,
    products: [
      { rank: 1, name: "공기청정기 미니", price: "89,000원", originalPrice: "149,000원", discountRate: "40%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EA%B3%B5%EA%B8%B0%EC%B2%AD%EC%A0%95%EA%B8%B0", category: "생활/주방", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.6, reviewCount: 11200 },
      { rank: 2, name: "스테인리스 텀블러", price: "15,900원", originalPrice: "25,000원", discountRate: "36%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%ED%85%80%EB%B8%94%EB%9F%AC", category: "생활/주방", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.7, reviewCount: 9300 },
      { rank: 3, name: "실란톱 도마 세트", price: "22,000원", originalPrice: "35,000원", discountRate: "37%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%8F%84%EB%A7%88+%EC%84%B8%ED%8A%B8", category: "생활/주방", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.5, reviewCount: 4100 },
      { rank: 4, name: "무선 청소기 스틱", price: "159,000원", originalPrice: "259,000원", discountRate: "39%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%AC%B4%EC%84%A0+%EC%B2%AD%EC%86%8C%EA%B8%B0", category: "생활/주방", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.4, reviewCount: 7600 },
      { rank: 5, name: "에어 프라이어 대용량", price: "69,000원", originalPrice: "119,000원", discountRate: "42%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EC%97%90%EC%96%B4+%ED%94%84%EB%9D%BC%EC%9D%B4%EC%96%B4", category: "생활/주방", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.8, reviewCount: 14500 },
    ],
  },
  {
    id: "sports",
    label: "스포츠/레저",
    hashtags: TRENDING_HASHTAGS.sports,
    products: [
      { rank: 1, name: "런닝화 경량 초경량", price: "99,000원", originalPrice: "169,000원", discountRate: "41%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%9F%B0%EB%8B%9D%ED%99%94", category: "스포츠/레저", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.6, reviewCount: 8700 },
      { rank: 2, name: "요가 매트 슬립방지", price: "29,900원", originalPrice: "49,000원", discountRate: "39%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EC%9A%94%EA%B0%80+%EB%A7%A4%ED%8A%B8", category: "스포츠/레저", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.5, reviewCount: 5400 },
      { rank: 3, name: "헬스 도어 풀업바", price: "19,900원", originalPrice: "32,000원", discountRate: "38%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%ED%92%80%EC%97%85%EB%B0%94", category: "스포츠/레저", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.4, reviewCount: 3200 },
      { rank: 4, name: "캠핑 접이식 의자", price: "25,000원", originalPrice: "42,000원", discountRate: "40%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EC%BA%A0%ED%95%91+%EC%9D%98%EC%9E%90", category: "스포츠/레저", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.7, reviewCount: 6100 },
      { rank: 5, name: "자전거 미니 펌프", price: "12,900원", originalPrice: "22,000원", discountRate: "41%", imageUrl: "", link: "https://www.coupang.com/np/search?q=%EB%AF%B8%EB%8B%88+%ED%8E%8C%ED%94%84", category: "스포츠/레저", shopName: "쿠팡베스트", marketplace: "coupang", rating: 4.3, reviewCount: 2800 },
    ],
  },
];

const NAVER_BEST_CATEGORIES: TrendingCategory[] = FALLBACK_CATEGORIES.map((c) => ({
  ...c,
  products: c.products.map((p) => ({ ...p, marketplace: "naver" as const })),
}));

const TOSS_BEST_CATEGORIES: TrendingCategory[] = [
  {
    id: "fashion",
    label: "패션의류",
    hashtags: TRENDING_HASHTAGS.fashion,
    products: [
      { rank: 1, name: "토스페이 머니 한정 반팔 티", price: "14,900원", originalPrice: "22,000원", discountRate: "32%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%B0%98%ED%8C%94+%ED%8B%B0", category: "패션의류", shopName: "토스샵", marketplace: "toss", rating: 4.7, reviewCount: 3200 },
      { rank: 2, name: "오버핏 밴딩 슬랙스", price: "26,900원", originalPrice: "39,000원", discountRate: "31%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%B0%B4%EB%94%A9+%EC%8A%AC%EB%9E%99%EC%8A%A4", category: "패션의류", shopName: "토스샵", marketplace: "toss", rating: 4.6, reviewCount: 2100 },
      { rank: 3, name: "베이직 니트 가디건", price: "35,900원", originalPrice: "52,000원", discountRate: "31%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%8B%88%ED%8A%B8+%EA%B0%80%EB%94%94%EA%B1%B4", category: "패션의류", shopName: "토스샵", marketplace: "toss", rating: 4.5, reviewCount: 1800 },
      { rank: 4, name: "와이드 카고 팬츠", price: "41,000원", originalPrice: "59,000원", discountRate: "31%", imageUrl: "", link: "https://toss.cc/shopping?q=%EC%B9%B4%EA%B3%A0+%ED%8C%AC%EC%B8%A0", category: "패션의류", shopName: "토스샵", marketplace: "toss", rating: 4.4, reviewCount: 1200 },
      { rank: 5, name: "슬림핏 블레이저", price: "79,000원", originalPrice: "115,000원", discountRate: "31%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%B8%94%EB%A0%88%EC%9D%B4%EC%A0%80", category: "패션의류", shopName: "토스샵", marketplace: "toss", rating: 4.3, reviewCount: 890 },
    ],
  },
  {
    id: "beauty",
    label: "뷰티",
    hashtags: TRENDING_HASHTAGS.beauty,
    products: [
      { rank: 1, name: "수분광 쿠션 파운데이션", price: "25,200원", originalPrice: "36,000원", discountRate: "30%", imageUrl: "", link: "https://toss.cc/shopping?q=%EC%88%98%EB%B6%84%EA%B4%91+%EC%BF%A0%EC%85%98", category: "뷰티", shopName: "토스샵", marketplace: "toss", rating: 4.8, reviewCount: 5400 },
      { rank: 2, name: "저자극 클렌징 오일", price: "17,000원", originalPrice: "25,000원", discountRate: "32%", imageUrl: "", link: "https://toss.cc/shopping?q=%ED%81%B4%EB%A0%8C%EC%A7%95+%EC%98%A4%EC%9D%BC", category: "뷰티", shopName: "토스샵", marketplace: "toss", rating: 4.7, reviewCount: 3100 },
      { rank: 3, name: "비타C 세럼 앰플", price: "21,600원", originalPrice: "32,000원", discountRate: "33%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%B9%84%ED%83%80%EC%9D%B4C+%EC%84%B8%EB%9F%BC", category: "뷰티", shopName: "토스샵", marketplace: "toss", rating: 4.6, reviewCount: 2400 },
      { rank: 4, name: "무기자차 선스틱", price: "14,300원", originalPrice: "21,000원", discountRate: "32%", imageUrl: "", link: "https://toss.cc/shopping?q=%EC%84%A0%EC%8A%A4%ED%8B%B1", category: "뷰티", shopName: "토스샵", marketplace: "toss", rating: 4.5, reviewCount: 1900 },
      { rank: 5, name: "데일리 립 틴트", price: "10,800원", originalPrice: "16,000원", discountRate: "33%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%A6%BD+%ED%8B%B4%ED%8A%B8", category: "뷰티", shopName: "토스샵", marketplace: "toss", rating: 4.4, reviewCount: 1500 },
    ],
  },
  {
    id: "electronics",
    label: "디지털/가전",
    hashtags: TRENDING_HASHTAGS.electronics,
    products: [
      { rank: 1, name: "무선 블루투스 이어버드", price: "71,900원", originalPrice: "129,000원", discountRate: "44%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%B8%94%EB%A3%A8%ED%88%AC%EC%8A%A4+%EC%9D%B4%EC%96%B4%EB%B2%84%EB%93%9C", category: "디지털/가전", shopName: "토스샵", marketplace: "toss", rating: 4.7, reviewCount: 8900 },
      { rank: 2, name: "스마트 워치 최신형", price: "269,000원", originalPrice: "399,000원", discountRate: "33%", imageUrl: "", link: "https://toss.cc/shopping?q=%EC%8A%A4%EB%A7%88%ED%8A%B8+%EC%9B%8C%EC%B9%98", category: "디지털/가전", shopName: "토스샵", marketplace: "toss", rating: 4.6, reviewCount: 5200 },
      { rank: 3, name: "미니 가습기 USB", price: "17,900원", originalPrice: "30,000원", discountRate: "40%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%AF%B8%EB%8B%88+%EA%B0%80%EC%8A%B5%EA%B8%B0", category: "디지털/가전", shopName: "토스샵", marketplace: "toss", rating: 4.5, reviewCount: 2800 },
      { rank: 4, name: "고속 충전기 거치대", price: "22,400원", originalPrice: "35,000원", discountRate: "36%", imageUrl: "", link: "https://toss.cc/shopping?q=%EA%B3%A0%EC%86%8D+%EC%B6%A9%EC%A0%84%EA%B8%B0", category: "디지털/가전", shopName: "토스샵", marketplace: "toss", rating: 4.4, reviewCount: 2100 },
      { rank: 5, name: "노이즈 캔슬링 헤드폰", price: "179,000원", originalPrice: "269,000원", discountRate: "33%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%85%B8%EC%9D%B4%EC%A6%88+%EC%BA%94%EC%8A%AC%EB%A7%81", category: "디지털/가전", shopName: "토스샵", marketplace: "toss", rating: 4.8, reviewCount: 3600 },
    ],
  },
  {
    id: "home",
    label: "생활/주방",
    hashtags: TRENDING_HASHTAGS.home,
    products: [
      { rank: 1, name: "공기청정기 미니", price: "80,100원", originalPrice: "135,000원", discountRate: "41%", imageUrl: "", link: "https://toss.cc/shopping?q=%EA%B3%B5%EA%B8%B0%EC%B2%AD%EC%A0%95%EA%B8%B0", category: "생활/주방", shopName: "토스샵", marketplace: "toss", rating: 4.6, reviewCount: 4500 },
      { rank: 2, name: "스테인리스 텀블러", price: "14,300원", originalPrice: "22,000원", discountRate: "35%", imageUrl: "", link: "https://toss.cc/shopping?q=%ED%85%80%EB%B8%94%EB%9F%AC", category: "생활/주방", shopName: "토스샵", marketplace: "toss", rating: 4.7, reviewCount: 3700 },
      { rank: 3, name: "실란톱 도마 세트", price: "19,800원", originalPrice: "31,000원", discountRate: "36%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%8F%84%EB%A7%88+%EC%84%B8%ED%8A%B8", category: "생활/주방", shopName: "토스샵", marketplace: "toss", rating: 4.5, reviewCount: 1600 },
      { rank: 4, name: "무선 청소기 스틱", price: "143,000원", originalPrice: "230,000원", discountRate: "38%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%AC%B4%EC%84%A0+%EC%B2%AD%EC%86%8C%EA%B8%B0", category: "생활/주방", shopName: "토스샵", marketplace: "toss", rating: 4.4, reviewCount: 3000 },
      { rank: 5, name: "에어 프라이어 대용량", price: "62,100원", originalPrice: "105,000원", discountRate: "41%", imageUrl: "", link: "https://toss.cc/shopping?q=%EC%97%90%EC%96%B4+%ED%94%84%EB%9D%BC%EC%9D%B4%EC%96%B4", category: "생활/주방", shopName: "토스샵", marketplace: "toss", rating: 4.8, reviewCount: 5800 },
    ],
  },
  {
    id: "sports",
    label: "스포츠/레저",
    hashtags: TRENDING_HASHTAGS.sports,
    products: [
      { rank: 1, name: "런닝화 경량 초경량", price: "89,100원", originalPrice: "149,000원", discountRate: "40%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%9F%B0%EB%8B%9D%ED%99%94", category: "스포츠/레저", shopName: "토스샵", marketplace: "toss", rating: 4.6, reviewCount: 3500 },
      { rank: 2, name: "요가 매트 슬립방지", price: "26,900원", originalPrice: "44,000원", discountRate: "39%", imageUrl: "", link: "https://toss.cc/shopping?q=%EC%9A%94%EA%B0%80+%EB%A7%A4%ED%8A%B8", category: "스포츠/레저", shopName: "토스샵", marketplace: "toss", rating: 4.5, reviewCount: 2200 },
      { rank: 3, name: "헬스 도어 풀업바", price: "17,900원", originalPrice: "28,000원", discountRate: "36%", imageUrl: "", link: "https://toss.cc/shopping?q=%ED%92%80%EC%97%85%EB%B0%94", category: "스포츠/레저", shopName: "토스샵", marketplace: "toss", rating: 4.4, reviewCount: 1300 },
      { rank: 4, name: "캠핑 접이식 의자", price: "22,500원", originalPrice: "37,000원", discountRate: "39%", imageUrl: "", link: "https://toss.cc/shopping?q=%EC%BA%A0%ED%95%91+%EC%9D%98%EC%9E%90", category: "스포츠/레저", shopName: "토스샵", marketplace: "toss", rating: 4.7, reviewCount: 2400 },
      { rank: 5, name: "자전거 미니 펌프", price: "11,600원", originalPrice: "19,000원", discountRate: "39%", imageUrl: "", link: "https://toss.cc/shopping?q=%EB%AF%B8%EB%8B%88+%ED%8E%8C%ED%94%84", category: "스포츠/레저", shopName: "토스샵", marketplace: "toss", rating: 4.3, reviewCount: 1100 },
    ],
  },
];

function getCategories(marketplace: string): TrendingCategory[] {
  if (marketplace === "coupang") return COUPANG_BEST_CATEGORIES;
  if (marketplace === "toss") return TOSS_BEST_CATEGORIES;
  return NAVER_BEST_CATEGORIES;
}

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
    const categoryId = url.searchParams.get("category");
    const productHint = url.searchParams.get("hint");
    const productCategory = url.searchParams.get("productCategory");
    const productTags = url.searchParams.get("tags");
    const productName = url.searchParams.get("productName");
    const marketplace = url.searchParams.get("marketplace") || "naver";

    const categories = getCategories(marketplace);

    if (categoryId) {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        return new Response(
          JSON.stringify({ category, products: category.products, hashtags: category.hashtags, source: "curated" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (productHint || productCategory || productName) {
      const tags = productTags ? productTags.split(",").map((t) => t.trim()).filter(Boolean) : [];
      const matchedCat = matchCategory(productCategory || "", tags, productName || "");
      if (matchedCat) {
        const category = categories.find((c) => c.id === matchedCat);
        if (category) {
          return new Response(
            JSON.stringify({
              matchedCategory: matchedCat,
              hashtags: category.hashtags,
              category: category.label,
              source: "curated",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    const allHashtags = categories.flatMap((c) => c.hashtags);
    const uniqueHashtags = [...new Set(allHashtags)];

    return new Response(
      JSON.stringify({ categories, products: categories[0]?.products ?? [], allHashtags: uniqueHashtags, source: "curated" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
