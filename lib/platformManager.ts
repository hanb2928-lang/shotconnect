import { supabase } from '@/lib/supabase';
import type { CustomPlatform } from '@/types/database';
import type { PlatformSpec } from '@/lib/platformSpecs';

export type { CustomPlatform } from '@/types/database';

export interface ManagedPlatform extends PlatformSpec {
  id: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  sortOrder: number;
}

function toManagedPlatform(cp: CustomPlatform): ManagedPlatform {
  return {
    id: cp.id,
    key: cp.key as any,
    label: cp.label,
    ratio: cp.ratio,
    width: cp.width,
    height: cp.height,
    color: cp.color,
    safeZoneTop: cp.safe_zone_top,
    safeZoneBottom: cp.safe_zone_bottom,
    safeZoneSides: cp.safe_zone_sides,
    desc: cp.is_builtin ? `${cp.ratio} · ${cp.label}` : `커스텀 · ${cp.ratio}`,
    isBuiltin: cp.is_builtin,
    isEnabled: cp.is_enabled,
    sortOrder: cp.sort_order,
  };
}

export async function fetchManagedPlatforms(): Promise<ManagedPlatform[]> {
  const { data, error } = await supabase
    .from('custom_platforms')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data as CustomPlatform[]).map(toManagedPlatform);
}

export async function fetchEnabledPlatforms(): Promise<ManagedPlatform[]> {
  const { data, error } = await supabase
    .from('custom_platforms')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data as CustomPlatform[]).map(toManagedPlatform);
}

export async function togglePlatformEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('custom_platforms')
    .update({ is_enabled: enabled })
    .eq('id', id);

  if (error) throw error;
}

const RATIO_DIMS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
  '2:3': { width: 1000, height: 1500 },
};

export async function addCustomPlatform(params: {
  label: string;
  ratio: string;
  color?: string;
}): Promise<ManagedPlatform> {
  const dims = RATIO_DIMS[params.ratio] ?? { width: 1080, height: 1920 };
  const key = `custom_${Date.now()}`;
  const maxOrder = await supabase
    .from('custom_platforms')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (maxOrder.data?.[0]?.sort_order ?? 6) + 1;

  const { data, error } = await supabase
    .from('custom_platforms')
    .insert({
      key,
      label: params.label,
      ratio: params.ratio,
      width: dims.width,
      height: dims.height,
      color: params.color ?? '#6366F1',
      safe_zone_top: 160,
      safe_zone_bottom: 200,
      safe_zone_sides: 48,
      is_enabled: true,
      is_builtin: false,
      sort_order: nextOrder,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toManagedPlatform(data as CustomPlatform);
}

export async function deleteCustomPlatform(id: string): Promise<void> {
  const { error } = await supabase
    .from('custom_platforms')
    .delete()
    .eq('id', id)
    .eq('is_builtin', false);

  if (error) throw error;
}

export const AVAILABLE_RATIOS = ['9:16', '1:1', '4:5', '16:9', '2:3'] as const;
export type AvailableRatio = (typeof AVAILABLE_RATIOS)[number];
