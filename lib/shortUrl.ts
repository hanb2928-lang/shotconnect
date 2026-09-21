import { supabase, supabaseUrl } from './supabase';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SLUG_LENGTH = 6;

function generateSlug(): string {
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += BASE62[Math.floor(Math.random() * BASE62.length)];
  }
  return slug;
}

const FUNCTION_BASE = `${supabaseUrl}/functions/v1/r`;

export async function createShortLink(destinationUrl: string, scanId?: string): Promise<string | null> {
  if (!destinationUrl) return null;

  try {
    const existingQuery = supabase
      .from('short_links')
      .select('slug')
      .eq('destination_url', destinationUrl);

    if (scanId) {
      existingQuery.eq('scan_id', scanId);
    } else {
      existingQuery.is('scan_id', null);
    }

    const existing = await existingQuery.limit(1).maybeSingle();

    if (existing.data) {
      return `${FUNCTION_BASE}/${existing.data.slug}`;
    }

    // If error (e.g. duplicate rows), fall through to insert

    let attempts = 0;
    while (attempts < 5) {
      const slug = generateSlug();
      const { data, error } = await supabase
        .from('short_links')
        .insert({
          slug,
          destination_url: destinationUrl,
          scan_id: scanId || null,
        })
        .select('slug')
        .maybeSingle();

      if (!error && data) {
        return `${FUNCTION_BASE}/${data.slug}`;
      }
      if (error && error.code !== '23505') {
        return null;
      }
      attempts++;
    }
    return null;
  } catch {
    return null;
  }
}
