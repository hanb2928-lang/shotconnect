import { supabase } from '@/lib/supabase';
import { sanitizeForDatabaseAndExport } from '@/lib/textSanitizer';
import type { MarketingSnippet } from '@/types/database';

export async function fetchSnippets(): Promise<MarketingSnippet[]> {
  const { data, error } = await supabase
    .from('marketing_snippets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as MarketingSnippet[];
}

export async function addSnippet(
  title: string,
  content: string,
  snippetType: MarketingSnippet['snippet_type'],
  platform?: string,
): Promise<MarketingSnippet | null> {
  const { data, error } = await supabase
    .from('marketing_snippets')
    .insert({
      title: sanitizeForDatabaseAndExport(title, 200),
      content: sanitizeForDatabaseAndExport(content, 2000),
      snippet_type: snippetType,
      platform: platform ? sanitizeForDatabaseAndExport(platform, 50) : null,
    })
    .select()
    .single();
  if (error) return null;
  return data as MarketingSnippet;
}

export async function deleteSnippet(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_snippets').delete().eq('id', id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
}
