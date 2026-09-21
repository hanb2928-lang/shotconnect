import type { AnalysisResult } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { enqueueJob } from '@/lib/jobQueue';
import { uploadImage } from '@/lib/analysis';
import { generateAffiliateLinks } from '@/lib/affiliate';
import { getUserSettings } from '@/lib/settings';
import { buildDataUrl, base64ToUint8Array } from '@/lib/base64';
import { hashImage, hashMultiAngle } from '@/lib/contentHash';
import { TTS_FUNCTION_URL, supabaseAnonKey } from '@/lib/supabase';
import { getOpenAiVoiceParams } from '@/lib/ttsVoices';

const SUPABASE_TIMEOUT_MS = 30000;

function extractStoragePath(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/scans/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

async function rollbackUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from('scans').remove(paths).catch(() => {});
}

function withSupabaseTimeout<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
  label: string,
): Promise<{ data: T | null; error: { message: string } | null }> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ data: null; error: { message: string } }>(
    (resolve) => {
      timer = setTimeout(
        () => resolve({ data: null, error: { message: `${label} 시간이 초과되었습니다.` } }),
        SUPABASE_TIMEOUT_MS,
      );
    },
  );
  return Promise.race([Promise.resolve(operation()), timeout]).finally(() => clearTimeout(timer));
}

export interface AsyncAnalysisResult {
  scanId: string;
  jobId: string;
  cached: boolean;
}

/**
 * Non-blocking analysis flow:
 * 1. Upload image to storage
 * 2. Check analysis_cache by image hash — if hit, create scan with cached results immediately
 * 3. If cache miss, enqueue an analyze-photo job and create a pending scan row
 * 4. Return immediately with scanId + jobId — the result page subscribes to job realtime
 */
export async function startAsyncAnalysis(
  base64: string,
  mimeType: string,
  mode: 'single' | 'multi' = 'multi',
  additionalBase64Images: string[] = [],
  preferredStyle?: string,
): Promise<AsyncAnalysisResult> {
  const fileName = `scan-${Date.now()}`;
  const imageHash = additionalBase64Images.length > 0
    ? hashMultiAngle([base64, ...additionalBase64Images], preferredStyle)
    : hashImage(base64);

  // Check cache BEFORE uploading to skip storage entirely on a hit
  const cacheResult = await withSupabaseTimeout(
    () => Promise.resolve(supabase
      .from('analysis_cache')
      .select('analysis_result')
      .eq('image_hash', imageHash)
      .maybeSingle()),
    '캐시 조회',
  );
  const cached = cacheResult.data as { analysis_result: unknown } | null;

  if (cached?.analysis_result) {
    // Cache hit — upload image for the scan record, then create scan with full data
    const imageUrl = await uploadImage(base64, mimeType);
    const cacheUploadedPath = extractStoragePath(imageUrl);
    const analysis = cached.analysis_result as unknown as AnalysisResult;
    let scanId: string;
    try {
      scanId = await createScanWithAnalysis(imageUrl, analysis, [], mode, imageHash);
    } catch (err) {
      if (cacheUploadedPath) await rollbackUploads([cacheUploadedPath]);
      throw err;
    }

    // Bump hit count (fire-and-forget)
    supabase.rpc('increment_analysis_cache_hit', { p_hash: imageHash }).then(() => {}, () => {});

    return { scanId, jobId: '', cached: true };
  }

  // Cache miss — upload image and additional angles
  const uploadedPaths: string[] = [];
  let imageUrl: string;
  try {
    imageUrl = await uploadImage(base64, mimeType);
    const p = extractStoragePath(imageUrl);
    if (p) uploadedPaths.push(p);
  } catch (err) {
    throw err;
  }

  const additionalUrls: string[] = [];
  let uploadFailures = 0;
  for (const b64 of additionalBase64Images) {
    try {
      const url = await uploadImage(b64, 'image/jpeg');
      additionalUrls.push(url);
      const ap = extractStoragePath(url);
      if (ap) uploadedPaths.push(ap);
      uploadFailures = 0;
    } catch {
      uploadFailures++;
      if (uploadFailures >= 2) {
        await rollbackUploads(uploadedPaths);
        throw new Error('추가 이미지 업로드 중 네트워크 연결이 불안정합니다. 다시 시도해주세요.');
      }
    }
  }

  // Cache miss — enqueue job and create pending scan
  const payload =
    additionalBase64Images.length > 0
      ? {
          images: [buildDataUrl(base64, mimeType), ...additionalBase64Images.map((b) => buildDataUrl(b, 'image/jpeg'))],
          fileName,
          mode: 'multi-shot',
          ...(preferredStyle ? { preferredStyle } : {}),
        }
      : {
          imageDataUrl: buildDataUrl(base64, mimeType),
          fileName,
          mimeType,
          mode,
          ...(preferredStyle ? { preferredStyle } : {}),
        };

  let jobId: string;
  try {
    jobId = await enqueueJob('analyze-photo', payload, {
      priority: 3,
    });
  } catch (err) {
    await rollbackUploads(uploadedPaths);
    throw err;
  }

  let scanId: string;
  try {
    scanId = await createPendingScan(imageUrl, jobId, additionalUrls, mode, imageHash);
  } catch (err) {
    await rollbackUploads(uploadedPaths);
    throw err;
  }

  return { scanId, jobId, cached: false };
}

async function createPendingScan(
  imageUrl: string,
  jobId: string,
  additionalUrls: string[],
  scanSource: 'single' | 'multi',
  imageHash: string,
): Promise<string> {
  const scanPayload: Record<string, unknown> = {
    image_url: imageUrl,
    scan_source: scanSource,
    title: 'AI 분석 중...',
    summary: '',
    contacts: [],
    tags: [],
    product_name: '',
    product_category: '',
    price_estimate: '',
    one_liner: '',
    shopping_matches: [],
    affiliate_links: [],
    template_data: {
      priceLabel: '',
      oneLiner: '',
      category: '',
      accentColor: '#2f9dff',
      hook: '',
      hashtags: [],
      productAdvantages: [],
      caption: '',
    },
    detected_products: [],
    analysis_job_id: jobId,
    image_hash: imageHash,
  };

  if (additionalUrls.length > 0) {
    scanPayload.additional_image_urls = additionalUrls;
  }

  const insertResult = await withSupabaseTimeout<{ id: string }>(
    () => Promise.resolve(supabase
      .from('scans')
      .insert(scanPayload)
      .select('id')
      .single()),
    '스캔 생성',
  );
  const { data, error } = insertResult;

  if (error || !data) throw new Error(`스캔 생성 실패: ${error?.message || '알 수 없는 오류'}`);
  return data.id;
}

async function createScanWithAnalysis(
  imageUrl: string,
  analysis: AnalysisResult,
  additionalUrls: string[],
  scanSource: 'single' | 'multi',
  imageHash: string,
): Promise<string> {
  const settings = await getUserSettings();
  const affiliateLinks = generateAffiliateLinks(analysis, settings);

  const scanPayload: Record<string, unknown> = {
    image_url: imageUrl,
    scan_source: scanSource,
    title: analysis.title,
    summary: analysis.summary,
    contacts: analysis.contacts,
    tags: analysis.tags,
    product_name: analysis.productName,
    product_category: analysis.productCategory,
    price_estimate: analysis.priceEstimate,
    one_liner: analysis.oneLiner,
    shopping_matches: analysis.shoppingMatches,
    affiliate_links: affiliateLinks,
    template_data: analysis.templateData,
    detected_products: analysis.detectedProducts,
    image_hash: imageHash,
    hybrid_mapping: analysis.hybridMapping ?? null,
  };

  if (additionalUrls.length > 0) {
    scanPayload.additional_image_urls = additionalUrls;
  }

  const insertResult = await withSupabaseTimeout<{ id: string }>(
    () => Promise.resolve(supabase
      .from('scans')
      .insert(scanPayload)
      .select('id')
      .single()),
    '스캔 생성',
  );
  const { data, error } = insertResult;

  if (error || !data) throw new Error(`스캔 생성 실패: ${error?.message || '알 수 없는 오류'}`);

  // Kick off TTS in background (same as saveScan does)
  const dp0 = analysis.detectedProducts?.[0];
  const hookText = analysis.templateData?.hook || analysis.oneLiner || analysis.summary || dp0?.templateData?.hook || dp0?.oneLiner || dp0?.productName || '';
  if (hookText) {
    // Fire-and-forget TTS via direct fetch
    triggerTTS(data.id, hookText).catch(() => {});
  }

  return data.id;
}

export async function triggerTTS(scanId: string, text: string): Promise<void> {
  let voice = 'alloy';
  let speed = 1.0;
  let pitch = 0;
  let ttsApiKey: string | null = null;
  try {
    const settings = await getUserSettings();
    if (settings?.default_tts_voice) {
      const params = getOpenAiVoiceParams(settings.default_tts_voice, settings.tts_speed);
      voice = params.voice;
      speed = params.speed;
    }
    if (settings?.tts_pitch != null) pitch = settings.tts_pitch;
    ttsApiKey = settings?.tts_api_key ?? null;
  } catch {
    // use defaults
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 115000);
  const response = await fetch(TTS_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ text, voice, speed, pitch, ttsApiKey }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`TTS 생성 실패 (${response.status}): ${errorBody || response.statusText}`);
  }
  let data: { audioBase64?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error('TTS 응답을 파싱하지 못했습니다');
  }
  if (!data?.audioBase64) {
    throw new Error('TTS 응답에 오디오 데이터가 없습니다');
  }

  const audioBytes = base64ToUint8Array(data.audioBase64);
  const audioFileName = `tts-${scanId}-${Date.now()}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from('scans')
    .upload(audioFileName, audioBytes, { contentType: 'audio/mpeg', cacheControl: '360000' });
  if (uploadError) throw new Error(`TTS 오디오 업로드 실패: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from('scans').getPublicUrl(audioFileName);
  if (!urlData.publicUrl) throw new Error('TTS 공개 URL 생성 실패');

  await supabase.from('scans').update({ tts_url: urlData.publicUrl }).eq('id', scanId);
}

/**
 * Called by the result page when a job completes via realtime.
 * Normalizes the job result, updates the scan row, and caches the analysis.
 */
export async function finalizeAnalysisFromJob(
  scanId: string,
  jobId: string,
  jobResult: Record<string, unknown>,
): Promise<void> {
  const analysis = normalizeJobResult(jobResult);
  const settings = await getUserSettings();
  const affiliateLinks = generateAffiliateLinks(analysis, settings);

  const { error } = await supabase.from('scans').update({
    title: analysis.title,
    summary: analysis.summary,
    contacts: analysis.contacts,
    tags: analysis.tags,
    product_name: analysis.productName,
    product_category: analysis.productCategory,
    price_estimate: analysis.priceEstimate,
    one_liner: analysis.oneLiner,
    shopping_matches: analysis.shoppingMatches,
    affiliate_links: affiliateLinks,
    template_data: analysis.templateData,
    detected_products: analysis.detectedProducts,
    analysis_job_id: null,
    hybrid_mapping: analysis.hybridMapping ?? null,
  }).eq('id', scanId);

  if (error) throw new Error(`스캔 업데이트 실패: ${error.message}`);

  // Cache the analysis for future hits (fire-and-forget)
  const { data: scan } = await supabase.from('scans').select('image_hash').eq('id', scanId).maybeSingle();
  if (scan?.image_hash) {
    supabase.from('analysis_cache').upsert({
      image_hash: scan.image_hash,
      analysis_result: analysis as unknown as Record<string, unknown>,
    }, { onConflict: 'image_hash' }).then(() => {}, () => {});
  }

  // Kick off TTS in background — fall back to detectedProducts if top-level hook is empty
  const dp0 = analysis.detectedProducts?.[0];
  const hookText =
    analysis.templateData?.hook ||
    analysis.oneLiner ||
    analysis.summary ||
    dp0?.templateData?.hook ||
    dp0?.oneLiner ||
    dp0?.productName ||
    '';
  if (hookText) {
    triggerTTS(scanId, hookText).catch(() => {});
  }
}

function normalizeJobResult(data: Record<string, unknown>): AnalysisResult {
  return {
    title: (data.title as string) || 'Product Captured',
    summary: (data.summary as string) || '',
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    productName: (data.productName as string) || '',
    productCategory: (data.productCategory as string) || 'product',
    priceEstimate: (data.priceEstimate as string) || '',
    oneLiner: (data.oneLiner as string) || '',
    shoppingMatches: Array.isArray(data.shoppingMatches) ? data.shoppingMatches : [],
    templateData: (data.templateData as AnalysisResult['templateData']) || {
      priceLabel: (data.priceEstimate as string) || '',
      oneLiner: (data.oneLiner as string) || '',
      category: (data.productCategory as string) || '',
      accentColor: '#2f9dff',
      hook: (data.hook as string) || '',
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
      productAdvantages: Array.isArray(data.productAdvantages) ? data.productAdvantages : [],
      caption: (data.caption as string) || '',
    },
    detectedProducts: Array.isArray(data.detectedProducts) ? data.detectedProducts : [],
    localStoreContext: (data.localStoreContext as AnalysisResult['localStoreContext']) ?? null,
    hybridMapping: (data.hybridMapping as AnalysisResult['hybridMapping']) ?? null,
  };
}
