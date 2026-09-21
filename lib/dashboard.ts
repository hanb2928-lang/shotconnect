import { supabase } from '@/lib/supabase';
import type { RevenueRecord, SavedAsset, Scan } from '@/types/database';

export interface ContentPerformanceRow {
  scan_id: string;
  product_name: string;
  image_url: string;
  platform: string;
  clicks: number;
  revenue: number;
  asset_count: number;
  created_at: string;
  last_clicked_at: string | null;
  ctr: number;
}

export interface FunnelStage {
  label: string;
  value: number;
  pct: number;
}

export interface SharePlatformStat {
  platform: string;
  label: string;
  clicks: number;
  conversions: number;
  conversionRate: number;
  pct: number;
}

export interface StyleInsight {
  style: string;
  label: string;
  count: number;
  totalClicks: number;
  avgCtr: number;
  recommendation: string;
  isTopPerformer: boolean;
}

export interface DashboardSummary {
  totalScans: number;
  totalAssets: number;
  totalClicks: number;
  totalRevenue: number;
  avgCtr: number;
  conversionRate: number;
  topContent: ContentPerformanceRow[];
  recentContent: ContentPerformanceRow[];
  platformFunnel: FunnelStage[];
  revenueByPlatform: { platform: string; amount: number; clicks: number }[];
  dailyClicks: { date: string; clicks: number }[];
  dailyRevenue: { date: string; amount: number }[];
  sharePlatformPerformance: SharePlatformStat[];
  styleInsights: StyleInsight[];
}

function emptyDashboard(): DashboardSummary {
  return {
    totalScans: 0,
    totalAssets: 0,
    totalClicks: 0,
    totalRevenue: 0,
    avgCtr: 0,
    conversionRate: 0,
    topContent: [],
    recentContent: [],
    platformFunnel: [],
    revenueByPlatform: [],
    dailyClicks: [],
    dailyRevenue: [],
    sharePlatformPerformance: [],
    styleInsights: [],
  };
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  try {
    const [scansRes, assetsRes, clicksRes, linksRes, revenueRes] = await Promise.all([
      supabase.from('scans').select('id, title, product_name, image_url, created_at, template_data', { count: 'exact' }).order('created_at', { ascending: false }).limit(200),
      supabase.from('saved_assets').select('scan_id, platform, affiliate_platform, created_at'),
      supabase.from('click_events').select('platform, clicked_at, scan_id').order('clicked_at', { ascending: false }).limit(500),
      supabase.from('short_links').select('slug, scan_id, click_count, last_clicked_at, destination_url, share_platform'),
      supabase.from('revenue_records').select('*').order('period_month', { ascending: false }),
    ]);

    const scans = (scansRes.data ?? []) as Array<Scan & { created_at: string }>;
  const assets = (assetsRes.data ?? []) as Array<SavedAsset>;
  const clickEvents = (clicksRes.data ?? []) as Array<{ platform: string; clicked_at: string; scan_id: string | null }>;
  const links = (linksRes.data ?? []) as Array<{ slug: string; scan_id: string | null; click_count: number; last_clicked_at: string | null; destination_url: string; share_platform: string | null }>;
  const revenues = (revenueRes.data ?? []) as RevenueRecord[];

  const totalScans = scansRes.count ?? scans.length;
  const totalAssets = assets.length;
  const linkClicks = links.reduce((s, l) => s + (l.click_count || 0), 0);
  const totalClicks = linkClicks > 0 ? linkClicks : clickEvents.length;
  const totalRevenue = revenues.reduce((s, r) => s + Number(r.amount), 0);
  const avgCtr = totalScans > 0 ? (totalClicks / totalScans) * 100 : 0;

  // Platform funnel: scans -> assets -> clicks -> revenue
  const platformSet = new Set<string>();
  for (const a of assets) {
    if (a.affiliate_platform) platformSet.add(a.affiliate_platform);
    else if (a.platform) platformSet.add(a.platform);
  }
  for (const c of clickEvents) platformSet.add(c.platform);
  for (const r of revenues) platformSet.add(r.platform);

  const platformFunnel: FunnelStage[] = [
    { label: '제품 분석', value: totalScans, pct: 100 },
    { label: '콘텐츠 제작', value: totalAssets, pct: totalScans > 0 ? (totalAssets / totalScans) * 100 : 0 },
    { label: '링크 클릭', value: totalClicks, pct: totalScans > 0 ? (totalClicks / totalScans) * 100 : 0 },
    { label: '수익 발생', value: revenues.length, pct: totalScans > 0 ? (revenues.length / totalScans) * 100 : 0 },
  ];

  const conversionRate = totalClicks > 0 ? (revenues.length / totalClicks) * 100 : 0;

  // Revenue by platform
  const revPlatformMap = new Map<string, { amount: number; clicks: number }>();
  for (const r of revenues) {
    const existing = revPlatformMap.get(r.platform) || { amount: 0, clicks: 0 };
    existing.amount += Number(r.amount);
    revPlatformMap.set(r.platform, existing);
  }
  const clickPlatformMap = new Map<string, number>();
  for (const c of clickEvents) {
    clickPlatformMap.set(c.platform, (clickPlatformMap.get(c.platform) || 0) + 1);
  }
  for (const [platform, clicks] of clickPlatformMap) {
    const existing = revPlatformMap.get(platform) || { amount: 0, clicks: 0 };
    existing.clicks = clicks;
    revPlatformMap.set(platform, existing);
  }
  const revenueByPlatform = Array.from(revPlatformMap.entries())
    .map(([platform, v]) => ({ platform, amount: v.amount, clicks: v.clicks }))
    .sort((a, b) => b.amount - a.amount);

  // Per-scan content performance
  const scanClickMap = new Map<string, { clicks: number; lastClicked: string | null }>();
  for (const l of links) {
    if (l.scan_id) {
      const existing = scanClickMap.get(l.scan_id) || { clicks: 0, lastClicked: null };
      existing.clicks += l.click_count || 0;
      if (l.last_clicked_at && (!existing.lastClicked || new Date(l.last_clicked_at) > new Date(existing.lastClicked))) {
        existing.lastClicked = l.last_clicked_at;
      }
      scanClickMap.set(l.scan_id, existing);
    }
  }

  const scanAssetMap = new Map<string, number>();
  for (const a of assets) {
    if (a.scan_id) {
      scanAssetMap.set(a.scan_id, (scanAssetMap.get(a.scan_id) || 0) + 1);
    }
  }

  const scanRevenueMap = new Map<string, number>();
  for (const r of revenues) {
    if (r.scan_id) {
      scanRevenueMap.set(r.scan_id, (scanRevenueMap.get(r.scan_id) || 0) + Number(r.amount));
    }
  }

  const contentRows: ContentPerformanceRow[] = scans.map((s) => {
    const clickData = scanClickMap.get(s.id) || { clicks: 0, lastClicked: null };
    const assetCount = scanAssetMap.get(s.id) || 0;
    const revenue = scanRevenueMap.get(s.id) || 0;
    return {
      scan_id: s.id,
      product_name: s.product_name || s.title || '제품',
      image_url: s.image_url,
      platform: s.product_category || s.template_data?.category || '기타',
      clicks: clickData.clicks,
      revenue,
      asset_count: assetCount,
      created_at: s.created_at,
      last_clicked_at: clickData.lastClicked,
      ctr: assetCount > 0 ? (clickData.clicks / assetCount) * 100 : 0,
    };
  });

  const topContent = [...contentRows].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  const recentContent = [...contentRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  // Daily clicks (14 days, Korea timezone)
  const now = new Date();
  const koreaNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const baseDay = koreaNow.toISOString().split('T')[0];
  const [by, bm, bd] = baseDay.split('-').map(Number);
  const dailyClickMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(Date.UTC(by, bm - 1, bd - i));
    dailyClickMap.set(dt.toISOString().split('T')[0], 0);
  }
  for (const e of clickEvents) {
    if (!e.clicked_at) continue;
    const d = new Date(e.clicked_at);
    const korea = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const key = korea.toISOString().split('T')[0];
    if (dailyClickMap.has(key)) {
      dailyClickMap.set(key, (dailyClickMap.get(key) || 0) + 1);
    }
  }
  const dailyClicks = Array.from(dailyClickMap.entries()).map(([date, clicks]) => ({ date, clicks }));

  // Daily revenue (14 days, Korea timezone)
  const dailyRevMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(Date.UTC(by, bm - 1, bd - i));
    dailyRevMap.set(dt.toISOString().split('T')[0], 0);
  }
  for (const r of revenues) {
    if (!r.created_at) continue;
    const d = new Date(r.created_at);
    const korea = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const key = korea.toISOString().split('T')[0];
    if (dailyRevMap.has(key)) {
      dailyRevMap.set(key, (dailyRevMap.get(key) || 0) + Number(r.amount));
    }
  }
  const dailyRevenue = Array.from(dailyRevMap.entries()).map(([date, amount]) => ({ date, amount }));

  // Share platform performance (YouTube Shorts, Instagram Reels, TikTok)
  const SHARE_PLATFORM_LABELS: Record<string, string> = {
    youtube_shorts: '유튜브 숏츠',
    instagram_reels: '인스타그램 릴스',
    tiktok: '틱톡',
    youtube: '유튜브',
    instagram: '인스타그램',
  };
  const sharePlatformMap = new Map<string, { clicks: number; conversions: number }>();
  for (const l of links) {
    if (l.share_platform && l.click_count > 0) {
      const existing = sharePlatformMap.get(l.share_platform) || { clicks: 0, conversions: 0 };
      existing.clicks += l.click_count;
      sharePlatformMap.set(l.share_platform, existing);
    }
  }
  for (const r of revenues) {
    if (r.scan_id) {
      const matchingLinks = links.filter(l => l.scan_id === r.scan_id && l.share_platform);
      for (const ml of matchingLinks) {
        const existing = sharePlatformMap.get(ml.share_platform!) || { clicks: 0, conversions: 0 };
        existing.conversions += 1;
        sharePlatformMap.set(ml.share_platform!, existing);
      }
    }
  }
  const totalShareClicks = Array.from(sharePlatformMap.values()).reduce((s, v) => s + v.clicks, 0);
  const sharePlatformPerformance: SharePlatformStat[] = Array.from(sharePlatformMap.entries())
    .map(([platform, v]) => ({
      platform,
      label: SHARE_PLATFORM_LABELS[platform] || platform,
      clicks: v.clicks,
      conversions: v.conversions,
      conversionRate: v.clicks > 0 ? (v.conversions / v.clicks) * 100 : 0,
      pct: totalShareClicks > 0 ? (v.clicks / totalShareClicks) * 100 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  // Style insights from scans.template_data
  const STYLE_LABELS: Record<string, string> = {
    instatoon: '인스타툰',
    b_grade: 'B급 짤방',
    gourmet: '미식툰',
    daily: '일상툰',
    romance: '로맨스툰',
    action: '액션툰',
  };
  const styleMap = new Map<string, { count: number; totalClicks: number }>();
  for (const s of scans) {
    const td = s.template_data as unknown as Record<string, unknown>;
    const style = (td?.style as string) || (td?.comicStyle as string) || s.template_data?.category || '';
    if (!style) continue;
    const clickData = scanClickMap.get(s.id) || { clicks: 0, lastClicked: null };
    const existing = styleMap.get(style) || { count: 0, totalClicks: 0 };
    existing.count += 1;
    existing.totalClicks += clickData.clicks;
    styleMap.set(style, existing);
  }
  const styleEntries = Array.from(styleMap.entries());
  const maxStyleCtr = Math.max(...styleEntries.map(([, v]) => v.count > 0 ? v.totalClicks / v.count : 0), 0);
  const styleInsights: StyleInsight[] = styleEntries
    .map(([style, v]) => {
      const avgCtr = v.count > 0 ? (v.totalClicks / v.count) * 100 : 0;
      const isTop = maxStyleCtr > 0 && (v.totalClicks / v.count) === maxStyleCtr && v.totalClicks > 0;
      let recommendation = '';
      if (isTop) {
        recommendation = `이 스타일이 클릭률 ${avgCtr.toFixed(0)}%로 가장 높습니다. 이 스타일로 추가 콘텐츠를 제작하세요.`;
      } else if (avgCtr > 0) {
        const topStyle = styleEntries.find(([, sv]) => sv.count > 0 && (sv.totalClicks / sv.count) === maxStyleCtr && sv.totalClicks > 0);
        if (topStyle) {
          const topLabel = STYLE_LABELS[topStyle[0]] || topStyle[0];
          const diff = maxStyleCtr > 0 ? ((maxStyleCtr - avgCtr / 100) / (maxStyleCtr)) * 100 : 0;
          recommendation = `${topLabel} 스타일이 클릭률 ${diff.toFixed(0)}% 더 높습니다. ${topLabel} 스타일을 시도해보세요.`;
        }
      } else {
        recommendation = '아직 클릭 데이터가 부족합니다. 콘텐츠를 공유하고 데이터를 모아보세요.';
      }
      return {
        style,
        label: STYLE_LABELS[style] || style,
        count: v.count,
        totalClicks: v.totalClicks,
        avgCtr,
        recommendation,
        isTopPerformer: isTop,
      };
    })
    .sort((a, b) => b.avgCtr - a.avgCtr);

  if (totalScans === 0 && totalAssets === 0 && totalClicks === 0 && totalRevenue === 0) {
    return emptyDashboard();
  }

    return {
      totalScans,
      totalAssets,
      totalClicks,
      totalRevenue,
      avgCtr,
      conversionRate,
      topContent,
      recentContent,
      platformFunnel,
      revenueByPlatform,
      dailyClicks,
      dailyRevenue,
      sharePlatformPerformance,
      styleInsights,
    };
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : '성과 데이터를 불러오는 중 오류가 발생했어요');
  }
}

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatClickTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
