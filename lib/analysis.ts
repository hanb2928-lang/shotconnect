import { Platform } from 'react-native';
import type { AnalysisResult } from '@/types/database';
import { supabase, ANALYSIS_FUNCTION_URL, TTS_FUNCTION_URL, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { safeFetch } from '@/lib/apiClient';
import { generateAffiliateLinks } from '@/lib/affiliate';
import { getUserSettings } from '@/lib/settings';
import { base64ToUint8Array, buildDataUrl, uint8ArrayToBase64 } from '@/lib/base64';
import { enqueueAndWait } from '@/lib/jobQueue';
import { deductCredits } from '@/lib/credits';
import { compressBase64ForUpload, prepareImageForApi, base64ToBlob, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY } from '@/lib/imageEdit';
import { compressForEdgeFunction, compressBase64ArrayForEdgeFunction } from '@/lib/parallelImageCompress';
import { aiCachedCall } from '@/lib/aiCache';
import { hashObject } from '@/lib/contentHash';
import { cleanBase64 } from '@/lib/base64';
import { getOpenAiVoiceParams } from '@/lib/ttsVoices';

export async function uploadImage(
  base64: string,
  mimeType: string,
): Promise<string> {
  // Compress before upload: resize to max 1280px, convert to WebP at quality 0.75
  const { base64: compressedBase64, mimeType: compressedMime } = await compressBase64ForUpload(base64, mimeType);

  const uploadMime = compressedMime || 'image/jpeg';
  const ext = uploadMime === 'image/png' ? 'png' : uploadMime === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from('scans')
    .upload(fileName, base64ToUint8Array(compressedBase64), { contentType: uploadMime, cacheControl: '360000' });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from('scans').getPublicUrl(fileName);
  return urlData.publicUrl;
}

export async function uploadImageBlob(
  blob: Blob | Uint8Array,
  mimeType: string,
): Promise<string> {
  // If the blob is already small enough, upload as-is to avoid double-compression
  const MAX_RAW_BLOB_BYTES = 800_000; // ~800KB threshold
  let uploadBlob: Blob | Uint8Array = blob;
  let uploadMime = mimeType;

  if (blob instanceof Blob && blob.size > MAX_RAW_BLOB_BYTES && mimeType.startsWith('image/')) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      const compressed = await prepareImageForApi(dataUrl, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY);
      const compressedBase64 = cleanBase64(compressed);
      const compressedMime = compressed.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
      uploadBlob = base64ToBlob(compressedBase64, compressedMime);
      uploadMime = compressedMime;
    } catch {
      // If re-compression fails, proceed with the original blob
    }
  }

  const ext = uploadMime === 'image/png' ? 'png' : uploadMime === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from('scans')
    .upload(fileName, uploadBlob, { contentType: uploadMime, cacheControl: '360000' });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from('scans').getPublicUrl(fileName);
  return urlData.publicUrl;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Blob 변환 실패'));
      reader.readAsDataURL(blob);
    });
  }
  // Native: FileReader doesn't exist on Hermes/JSC
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = uint8ArrayToBase64(bytes);
  const mimeType = blob.type || 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

export async function analyzeImage(
  imageDataUrl: string,
  fileName: string,
  mimeType: string,
  mode: 'single' | 'multi' = 'multi',
): Promise<AnalysisResult> {
  await deductCredits('photo_analysis');

  const compressed = await compressForEdgeFunction(imageDataUrl);
  const b64 = cleanBase64(compressed.dataUrl);
  const cacheInput = { task: 'analyze-photo', mode, imageHash: hashObject({ b64 }).slice(0, 16) };

  const { data } = await aiCachedCall<AnalysisResult>(
    'analyze-photo',
    cacheInput,
    async () => {
      const response = await safeFetch(ANALYSIS_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
      body: JSON.stringify({ imageDataUrl: compressed.dataUrl, fileName, mimeType: compressed.mimeType, mode }),
      timeoutMs: 115000,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'AI 분석 서버 오류가 발생했습니다.' }));
      throw new Error(errData.error || `AI 분석 실패 (${response.status})`);
    }

    const respData = await response.json().catch(() => ({} as Record<string, unknown>));
    if (respData?.error) throw new Error(respData.error);

    return normalizeAnalysis(respData);
  },
    'gpt-4o',
  );
  return data;
}

export async function analyzeMultiShot(
  base64Images: string[],
  fileName: string,
): Promise<AnalysisResult> {
  await deductCredits('multi_shot_analysis');

  const dataUrls = await compressBase64ArrayForEdgeFunction(base64Images, 'image/jpeg');
  const cacheInput = {
    task: 'multi-shot',
    imageHashes: dataUrls.map((url) => hashObject({ b64: cleanBase64(url) }).slice(0, 16)),
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'multi-shot',
    cacheInput,
    async () => {
      const response = await safeFetch(ANALYSIS_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ images: dataUrls, fileName, mode: 'multi-shot' }),
        timeoutMs: 115000,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'AI 다각도 분석 서버 오류가 발생했습니다.' }));
        throw new Error(errData.error || `AI 다각도 분석 실패 (${response.status})`);
      }

      const respData = await response.json().catch(() => ({} as Record<string, unknown>));
      if (respData?.error) throw new Error(respData.error);

      return normalizeAnalysis(respData);
    },
    'gpt-4o',
  );
  return data;
}

const UNKNOWN_PRODUCT_NAMES = new Set([
  '',
  '알 수 없음',
  '알수없음',
  'unknown',
  'unknown product',
  'identified product',
  'product captured',
]);
const FALLBACK_PRODUCT_NAME = '지금 가장 핫한 추천 아이템';
const FALLBACK_COMMERCE_PHRASE = '시선 집중! 지금 바로 확인하세요';

const UNKNOWN_PATTERNS = [
  /알\s*수\s*없/gi,
  /알수없/gi,
  /unknown/gi,
  /미확인/gi,
  /미상/gi,
  /unidentified/gi,
  /not\s*identified/gi,
];

function sanitizeText(value: string): string {
  if (!value) return value;
  let result = value;
  for (const pattern of UNKNOWN_PATTERNS) {
    result = result.replace(pattern, FALLBACK_COMMERCE_PHRASE);
  }
  return result;
}

function normalizeProductName(name: string | undefined): string {
  const trimmed = (name || '').trim();
  if (UNKNOWN_PRODUCT_NAMES.has(trimmed.toLowerCase())) {
    return FALLBACK_PRODUCT_NAME;
  }
  for (const pattern of UNKNOWN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return FALLBACK_PRODUCT_NAME;
    }
  }
  return trimmed;
}

function normalizeAnalysis(data: Record<string, unknown>): AnalysisResult {
  const productName = normalizeProductName(data.productName as string);
  const rawOneLiner = sanitizeText((data.oneLiner as string) || '');
  const rawSummary = sanitizeText((data.summary as string) || '');
  const rawTitle = sanitizeText((data.title as string) || 'Product Captured');
  const rawHook = sanitizeText((data.hook as string) || '');
  const rawCaption = sanitizeText((data.caption as string) || '');
  return {
    title: rawTitle,
    summary: rawSummary,
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    productName,
    productCategory: (data.productCategory as string) || 'product',
    priceEstimate: (data.priceEstimate as string) || '',
    oneLiner: rawOneLiner,
    shoppingMatches: Array.isArray(data.shoppingMatches) ? data.shoppingMatches : [],
    templateData: (data.templateData as AnalysisResult['templateData']) || {
      priceLabel: (data.priceEstimate as string) || '',
      oneLiner: rawOneLiner,
      category: (data.productCategory as string) || '',
      accentColor: '#2f9dff',
      hook: rawHook,
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
      productAdvantages: Array.isArray(data.productAdvantages) ? data.productAdvantages : [],
      caption: rawCaption,
      psychologyInsight: null,
    },
    detectedProducts: Array.isArray(data.detectedProducts) ? data.detectedProducts : [],
  };
}

export async function saveScan(
  imageUrl: string,
  analysis: AnalysisResult,
  additionalImageUrls: string[] = [],
  scanSource: 'single' | 'multi' | 'template' = 'single',
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
  };

  if (additionalImageUrls.length > 0) {
    scanPayload.additional_image_urls = additionalImageUrls;
  }

  const { data, error } = await supabase
    .from('scans')
    .insert(scanPayload)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to save scan: ${error.message}`);

  const hookText = analysis.templateData?.hook || analysis.oneLiner || '';
  if (hookText) {
    generateAndUploadTTS(data.id, hookText).catch(() => {});
  }

  return data.id;
}

async function generateAndUploadTTS(scanId: string, text: string): Promise<void> {
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
  if (!response.ok) return;
  let data: { audioBase64?: string };
  try {
    data = await response.json();
  } catch {
    return;
  }
  if (!data?.audioBase64) return;

  const audioBytes = base64ToUint8Array(data.audioBase64);
  const fileName = `tts-${scanId}-${Date.now()}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from('scans')
    .upload(fileName, audioBytes, { contentType: 'audio/mpeg', cacheControl: '360000' });
  if (uploadError) return;

  const { data: urlData } = supabase.storage.from('scans').getPublicUrl(fileName);
  if (!urlData.publicUrl) return;

  await supabase.from('scans').update({ tts_url: urlData.publicUrl }).eq('id', scanId);
}

export async function saveManualScan(
  imageUrl: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('scans')
    .insert({
      image_url: imageUrl,
      scan_source: 'template',
      title: '직접 만든 템플릿',
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
        psychologyInsight: null,
      },
      detected_products: [],
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to save scan: ${error.message}`);
  return data.id;
}

export async function deleteScan(id: string): Promise<void> {
  const { error } = await supabase.from('scans').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete: ${error.message}`);
}

function trimText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

export async function updateScanWithAnalysis(
  scanId: string,
  analysis: AnalysisResult,
): Promise<void> {
  const settings = await getUserSettings();
  const affiliateLinks = generateAffiliateLinks(analysis, settings);

  const td = analysis.templateData;
  const cleanTemplateData = td ? {
    priceLabel: td.priceLabel,
    oneLiner: trimText(td.oneLiner, 80),
    category: td.category,
    accentColor: td.accentColor,
    hook: trimText(td.hook, 60),
    hashtags: (td.hashtags || []).slice(0, 8),
    productAdvantages: (td.productAdvantages || []).slice(0, 3).map((a) => trimText(a, 60)),
    caption: trimText(td.caption, 120),
    ...(td.platformVariants ? { platformVariants: td.platformVariants } : {}),
  } : undefined;

  const { error } = await supabase.from('scans').update({
    title: trimText(analysis.title, 40),
    summary: trimText(analysis.summary, 200),
    contacts: analysis.contacts,
    tags: (analysis.tags || []).slice(0, 8),
    product_name: analysis.productName,
    product_category: analysis.productCategory,
    price_estimate: analysis.priceEstimate,
    one_liner: trimText(analysis.oneLiner, 80),
    shopping_matches: analysis.shoppingMatches,
    affiliate_links: affiliateLinks,
    ...(cleanTemplateData ? { template_data: cleanTemplateData } : {}),
    detected_products: analysis.detectedProducts,
    scan_source: 'single',
  }).eq('id', scanId);

  if (error) throw new Error(`Failed to update scan: ${error.message}`);

  const hookText = td?.hook || analysis.oneLiner || '';
  if (hookText) {
    generateAndUploadTTS(scanId, hookText).catch(() => {});
  }
}

export async function analyzeImageWithProductContext(
  imageDataUrl: string,
  fileName: string,
  mimeType: string,
  mode: 'single' | 'multi' = 'multi',
  productContext?: { productName?: string; description?: string; price?: string; brand?: string; platform?: string },
): Promise<AnalysisResult> {
  await deductCredits('photo_analysis');

  const compressed = await compressForEdgeFunction(imageDataUrl);
  const b64 = cleanBase64(compressed.dataUrl);
  const cacheInput = {
    task: 'analyze-photo-context',
    mode,
    imageHash: hashObject({ b64 }).slice(0, 16),
    productContext: productContext || {},
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'analyze-photo-context',
    cacheInput,
    async () => {
      const response = await safeFetch(ANALYSIS_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ imageDataUrl: compressed.dataUrl, fileName, mimeType: compressed.mimeType, mode, productContext }),
        timeoutMs: 115000,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'AI 분석 서버 오류가 발생했습니다.' }));
        throw new Error(errData.error || `AI 분석 실패 (${response.status})`);
      }

      const respData = await response.json().catch(() => ({} as Record<string, unknown>));
      if (respData?.error) throw new Error(respData.error);

      return normalizeAnalysis(respData);
    },
    'gpt-4o',
  );
  return data;
}

export async function extractProductMeta(
  url: string,
): Promise<{
  productName: string;
  description: string;
  price: string;
  originPrice: string;
  discountRate: string;
  currency: string;
  image: string;
  imageBase64: string;
  imageMimeType: string;
  platform: string;
  brand: string;
  availability: string;
  searchUrl: string;
  productId: string;
  extractionMethod: string;
}> {
  const extractUrl = `${supabaseUrl}/functions/v1/extract-product-meta`;
  const response = await safeFetch(extractUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ url }),
    timeoutMs: 115000,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: '상품 정보 추출 서버 오류가 발생했습니다.' }));
    throw new Error(errData.error || `상품 정보 추출 실패 (${response.status})`);
  }

  const data = await response.json().catch(() => ({}));
  if (data?.error) throw new Error(data.error);
  if (!data?.productMeta) throw new Error('상품 정보를 불러오지 못했습니다.');
  return data.productMeta;
}

export async function analyzeImageQueued(
  imageDataUrl: string,
  fileName: string,
  mimeType: string,
  mode: 'single' | 'multi' = 'multi',
  preferredStyle?: string,
): Promise<AnalysisResult> {
  await deductCredits('photo_analysis');

  const compressed = await compressForEdgeFunction(imageDataUrl);
  const b64 = cleanBase64(compressed.dataUrl);
  const cacheInput = {
    task: 'analyze-photo-queued',
    mode,
    imageHash: hashObject({ b64 }).slice(0, 16),
    preferredStyle: preferredStyle || '',
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'analyze-photo-queued',
    cacheInput,
    async () => {
      const result = await enqueueAndWait<Record<string, unknown>>(
        'analyze-photo',
        { imageDataUrl: compressed.dataUrl, fileName, mimeType: compressed.mimeType, mode, ...(preferredStyle ? { preferredStyle } : {}) },
        { timeoutMs: 115000 },
      );

      if (!result.success || !result.result) {
        throw new Error(result.error ?? 'AI 분석 작업이 실패했습니다.');
      }
      return normalizeAnalysis(result.result);
    },
    'gpt-4o',
  );
  return data;
}

export async function analyzeMultiShotQueued(
  base64Images: string[],
  fileName: string,
): Promise<AnalysisResult> {
  await deductCredits('multi_shot_analysis');

  const dataUrls = await compressBase64ArrayForEdgeFunction(base64Images, 'image/jpeg');
  const cacheInput = {
    task: 'multi-shot-queued',
    imageHashes: dataUrls.map((url) => hashObject({ b64: cleanBase64(url) }).slice(0, 16)),
  };

  const { data } = await aiCachedCall<AnalysisResult>(
    'multi-shot-queued',
    cacheInput,
    async () => {
      const result = await enqueueAndWait<Record<string, unknown>>(
        'analyze-photo',
        { images: dataUrls, fileName, mode: 'multi-shot' },
        { timeoutMs: 115000 },
      );

      if (!result.success || !result.result) {
        throw new Error(result.error ?? 'AI 다각도 분석 작업이 실패했습니다.');
      }
      return normalizeAnalysis(result.result);
    },
    'gpt-4o',
  );
  return data;
}
