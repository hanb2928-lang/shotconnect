import { supabase } from '@/lib/supabase';
import { fetchShortLinkClicks } from '@/lib/linkBookmarks';

export interface DashboardSummary {
  totalRevenue: number;
  totalClicks: number;
  totalLinks: number;
  totalBookmarks: number;
  platformRevenue: { platform: string; amount: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  topLinks: { slug: string; destination_url: string; click_count: number }[];
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const [revenueRes, bookmarkRes, shortLinkClicks] = await Promise.all([
    supabase.from('revenue_records').select('platform,amount,period_month,created_at'),
    supabase.from('link_bookmarks').select('id', { count: 'exact', head: true }),
    fetchShortLinkClicks(),
  ]);

  const revenueRows = (revenueRes.data ?? []) as {
    platform: string;
    amount: number;
    period_month: string;
    created_at: string;
  }[];

  const totalRevenue = revenueRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalClicks = shortLinkClicks.reduce((sum, l) => sum + (l.click_count || 0), 0);

  const platformMap = new Map<string, number>();
  for (const r of revenueRows) {
    platformMap.set(r.platform, (platformMap.get(r.platform) || 0) + Number(r.amount || 0));
  }
  const platformRevenue = Array.from(platformMap.entries())
    .map(([platform, amount]) => ({ platform, amount }))
    .sort((a, b) => b.amount - a.amount);

  const monthMap = new Map<string, number>();
  for (const r of revenueRows) {
    const month = r.period_month || r.created_at?.slice(0, 7) || 'Unknown';
    monthMap.set(month, (monthMap.get(month) || 0) + Number(r.amount || 0));
  }
  const monthlyRevenue = Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  return {
    totalRevenue,
    totalClicks,
    totalLinks: shortLinkClicks.length,
    totalBookmarks: bookmarkRes.count || 0,
    platformRevenue,
    monthlyRevenue,
    topLinks: shortLinkClicks.slice(0, 5),
  };
}
