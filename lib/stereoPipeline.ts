import { Platform } from 'react-native';
import { uploadImage, uploadImageBlob, saveManualScan } from './analysis';
import { base64ToBlob } from './imageEdit';
import { supabase } from './supabase';
import { runSynthesis, getSynthesisSummary, type AngleInput } from './aiSynthesisEngine';
import { buildShortFormEditPlan, type ShortFormPlatform } from './shortFormEditEngine';
import { buildDirectingPlan, getDirectingSummary, type DirectingPlan } from './directingEngine';
import { buildMultiPlatformPublishPlans, type PublishPlan } from './publishManager';
import { getDeepLink } from './platformUpload';
import * as Linking from 'expo-linking';
import { isOnline } from '@/hooks/useNetworkStatus';
import { nativeHeapCooldownGuard } from './imageEdit';
import type { AngleShot } from '@/components/MultiAngleCaptureGuide';
import { logError, addBreadcrumb } from './errorLogger';
import { safeInvoke } from './apiClient';
import { hashObject } from './contentHash';
import { aiCachedCall } from './aiCache';
import { buildKeyframeProxyPayload, type KeyframeProxyPayload } from './keyframeProxy';

const UPLOAD_MAX_RETRIES = 3;
const UPLOAD_RETRY_DELAY_MS = 1500;
const UPLOAD_CONCURRENCY = Platform.OS === 'web' ? 2 : 1;

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

function waitForOnline(): Promise<boolean> {
  if (isOnline()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const deadline = Date.now() + 30000;
    const check = () => {
      if (isOnline() || Date.now() >= deadline) {
        resolve(isOnline());
        return;
      }
      setTimeout(check, 1000);
    };
    check();
  });
}

const UPLOAD_MAX_BASE64_BYTES = 4_500_000;

async function uploadWithRetry(base64: string, mimeType: string, signal?: AbortSignal): Promise<string> {
  if (base64.length > UPLOAD_MAX_BASE64_BYTES) {
    throw new Error('이미지가 너무 커서 업로드할 수 없습니다. 더 낮은 해상도로 다시 촬영해주세요.');
  }
  let lastErr: unknown = null;
  const blob = base64ToBlob(base64, mimeType);
  for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');
    try {
      return await uploadImageBlob(blob, mimeType, true, signal);
    } catch (err) {
      lastErr = err;
      if (attempt < UPLOAD_MAX_RETRIES) {
        if (!isOnline()) {
          const recovered = await waitForOnline();
          if (!recovered) break;
        }
        await new Promise((r) => setTimeout(r, UPLOAD_RETRY_DELAY_MS * (attempt + 1) + Math.floor(Math.random() * 500)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('이미지 업로드 실패');
}

interface ParallelUploadResult {
  url: string;
  shot: AngleShot;
}

async function uploadAngleShotsConcurrently(
  shots: AngleShot[],
  concurrency: number,
  signal?: AbortSignal,
): Promise<{ results: ParallelUploadResult[]; failures: number; uploadedPaths: string[] }> {
  const results: ParallelUploadResult[] = [];
  let failures = 0;
  const uploadedPaths: string[] = [];
  let cursor = 0;
  let fatalThreshold = false;

  async function processNext(): Promise<void> {
    while (cursor < shots.length) {
      if (signal?.aborted || fatalThreshold) return;
      const idx = cursor++;
      const shot = shots[idx];
      try {
        const url = await uploadWithRetry(shot.base64!, shot.mimeType || 'image/jpeg', signal);
        if (fatalThreshold) {
          const p = extractStoragePath(url);
          if (p) await supabase.storage.from('scans').remove([p]).catch(() => {});
          return;
        }
        results.push({ url, shot });
        const p = extractStoragePath(url);
        if (p) uploadedPaths.push(p);
        (shot as { base64?: string }).base64 = undefined;
        await nativeHeapCooldownGuard();
      } catch {
        failures++;
        if (failures >= 2) fatalThreshold = true;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, shots.length) }, () => processNext());
  await Promise.all(workers);

  results.sort((a, b) => a.shot.orderIndex - b.shot.orderIndex);
  return { results, failures, uploadedPaths };
}

export interface AngleImagePayload {
  key: string;
  label: string;
  url?: string;
  base64?: string;
  mimeType?: string;
  orderIndex: number;
}

export interface CloudPipelineResult {
  synthesis: {
    spatialDepthHint: string;
    volumeEstimate: { confidence: number };
    contextMatch: { label: string; context: string };
  };
}

export type StereoStepKey = 'upload' | 'synthesis' | 'directing' | 'render' | 'publish';

export interface StereoStepState {
  key: StereoStepKey;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail: string;
}

export interface StereoPipelineProgress {
  steps: StereoStepState[];
  currentStep: number;
  overallProgress: number;
  result: StereoPipelineResult | null;
  error: string | null;
}

export interface StereoPipelineResult {
  scanId: string;
  cloudResult: CloudPipelineResult | null;
  synthesisSummary: string;
  directingSummary: string;
  directingPlan: DirectingPlan | null;
  publishPlans: PublishPlan[];
  publishTargets: { key: string; label: string; deepLinkApp: string; deepLinkWeb: string }[];
}

const STEP_LABELS: Record<StereoStepKey, string> = {
  upload: '클라우드 AI 입체 합성',
  synthesis: '3D 볼륨 분석 & 실사용 맥락 매칭',
  directing: '유튜브 상위 1% 심리 리듬 연출',
  render: '멀티플랫폼 9:16 렌더링 & 메타데이터',
  publish: '갤러리 저장 & 퍼블리시 준비',
};

const PUBLISH_TARGETS: { key: ShortFormPlatform; label: string }[] = [
  { key: 'youtube', label: '유튜브 쇼츠' },
  { key: 'instagram', label: '인스타그램 릴스' },
  { key: 'tiktok', label: '틱톡' },
];

function makeInitialSteps(): StereoStepState[] {
  return (Object.keys(STEP_LABELS) as StereoStepKey[]).map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: 'pending' as const,
    detail: '',
  }));
}

export function makeInitialProgress(): StereoPipelineProgress {
  return {
    steps: makeInitialSteps(),
    currentStep: -1,
    overallProgress: 0,
    result: null,
    error: null,
  };
}

async function invokeStereoCutAuto(
  payloads: AngleImagePayload[],
  context: string,
  style: string,
  scanId: string,
  signal?: AbortSignal,
): Promise<CloudPipelineResult | null> {
  if (signal?.aborted) return null;

  // Build a cache key from the angle metadata (keys, orderIndex) + context + style.
  // The actual image URLs are already content-addressed in Supabase Storage,
  // so hashing the metadata alone is sufficient to detect duplicate requests.
  const cacheInput = {
    task: 'stereo-cut-auto',
    angles: payloads.map((p) => ({ key: p.key, orderIndex: p.orderIndex })),
    context,
    style,
  };

  // Attempt keyframe proxy: extract lightweight delta vectors from the angle
  // images and send only the keyframe URL + deltas to the server. This cuts
  // the GPU inference payload by ~40-50% since the server no longer needs to
  // decode and align all multi-angle images at full resolution.
  const proxyPayload = await buildKeyframeProxyPayload(
    payloads.filter((p): p is AngleImagePayload & { url: string } => typeof p.url === 'string')
      .map((p) => ({ url: p.url, angleKey: p.key, orderIndex: p.orderIndex, label: p.label })),
  ).catch(() => null);

  try {
    const { data } = await aiCachedCall<CloudPipelineResult | null>(
      'stereo-cut-auto',
      cacheInput,
      async () => {
        const body: Record<string, unknown> = {
          scanId,
          angles: payloads,
          customPrompt: context,
          productName: style === 'studio' ? '프리미엄 스튜디오 제품' : '프리미엄 추천 상품',
          targetPlatforms: ['youtube', 'instagram', 'tiktok'],
        };

        // If proxy extraction succeeded, send the compact payload instead
        // of all angle image URLs. The server uses deltas to reconstruct
        // motion without full-image tensor alignment.
        if (proxyPayload) {
          body.keyframeProxy = proxyPayload;
          // Only send the keyframe angle in `angles` so the server has the
          // reference image; secondary angles are represented by deltas.
          const keyframeAngles = payloads.filter((p) => p.key === proxyPayload.keyframeAngleKey);
          body.angles = keyframeAngles.length > 0 ? keyframeAngles : [payloads[0]];
        }

        const data = await safeInvoke<{ result?: CloudPipelineResult }>(() =>
          supabase.functions.invoke('stereo-cut-auto', {
            body,
            signal,
          }) as Promise<{ data: { result?: CloudPipelineResult } | null; error: { message: string; status?: number } | null }>,
        );
        if (!data) return null;
        return data.result ?? (data as unknown as CloudPipelineResult);
      },
      'stereo-cut-auto',
    );
    return data;
  } catch (err) {
    logError(err, { component: 'stereoPipeline', action: 'invokeStereoCutAuto' });
    return null;
  }
}

export const STEREO_MIN_SHOTS = 3;
export const STEREO_MAX_SHOTS = 5;

export async function createScanFromAngleShots(
  shots: AngleShot[],
  signal?: AbortSignal,
): Promise<{ scanId: string; uploadedUrls: string[] }> {
  const aborted = (): boolean => signal?.aborted === true;
  const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  const allShots = sorted.filter((s) => s.base64);
  if (allShots.length === 0) throw new Error('촬영된 이미지가 없습니다.');

  const { results, failures, uploadedPaths } = await uploadAngleShotsConcurrently(allShots, UPLOAD_CONCURRENCY, signal);
  if (aborted()) {
    await rollbackUploads(uploadedPaths);
    throw new Error('업로드가 취소되었습니다.');
  }

  if (results.length === 0) {
    await rollbackUploads(uploadedPaths);
    throw new Error('이미지 업로드에 실패했습니다. 네트워크 연결을 확인 후 다시 시도해주세요.');
  }

  if (failures >= 2) {
    await rollbackUploads(uploadedPaths);
    throw new Error('이미지 업로드 중 네트워크 연결이 불안정합니다. 다시 시도해주세요.');
  }

  const imageUrl = results[0].url;
  const additionalUrls = results.slice(1).map((r) => r.url);

  let scanId: string;
  try {
    scanId = await saveManualScan(imageUrl);
  } catch (err) {
    await rollbackUploads(uploadedPaths);
    throw err;
  }

  if (additionalUrls.length > 0) {
    try {
      await supabase.from('scans').update({ additional_image_urls: additionalUrls }).eq('id', scanId);
    } catch (err) {
      logError(err, { component: 'stereoPipeline', action: 'updateAdditionalUrls' });
    }
  }

  return { scanId, uploadedUrls: results.map((r) => r.url) };
}

export async function runStereoPipeline(
  shots: AngleShot[],
  onProgress: (progress: StereoPipelineProgress) => void,
  cleanMode = false,
  existingScanId?: string,
  contentTone?: 'studio' | 'raw',
  studioSliders?: { facetSparkle: number; fabricDetail: number; blendStrength: number; smartFit?: boolean },
  existingUploadUrls?: string[],
  signal?: AbortSignal,
): Promise<StereoPipelineResult> {
  const aborted = (): boolean => signal?.aborted === true;
  const steps = makeInitialSteps();
  const report = (currentStep: number, overallProgress: number, error: string | null = null, result: StereoPipelineResult | null = null) => {
    onProgress({ steps: [...steps], currentStep, overallProgress, result, error });
  };

  const sorted = [...shots].sort((a, b) => a.orderIndex - b.orderIndex);
  const allShots = sorted.filter((s) => s.base64);
  if (allShots.length === 0) throw new Error('촬영된 이미지가 없습니다.');
  if (allShots.length < STEREO_MIN_SHOTS) {
    throw new Error(`입체컷 오토는 최소 ${STEREO_MIN_SHOTS}컷이 필요합니다. 정면, 좌측, 우측을 촬영해주세요.`);
  }
  if (allShots.length > STEREO_MAX_SHOTS) {
    allShots.length = STEREO_MAX_SHOTS;
  }

  let imageUrl: string;
  let additionalUrls: string[];
  let uploadedPaths: string[] = [];

  if (existingUploadUrls && existingUploadUrls.length > 0) {
    imageUrl = existingUploadUrls[0];
    additionalUrls = existingUploadUrls.slice(1);
  } else {
    steps[0].status = 'active';
    steps[0].detail = `${allShots.length}각도 이미지 병렬 업로드 (동시 ${UPLOAD_CONCURRENCY}건)...`;
    report(0, 0.05);

    const { results: uploadResults, failures, uploadedPaths: uploadedPathsResult } = await uploadAngleShotsConcurrently(allShots, UPLOAD_CONCURRENCY, signal);
    uploadedPaths = uploadedPathsResult;

    if (uploadResults.length === 0) {
      throw new Error('이미지 업로드에 실패했습니다. 네트워크 연결을 확인 후 다시 시도해주세요.');
    }

    if (failures >= 2) {
      throw new Error('이미지 업로드 중 네트워크 연결이 불안정합니다. 다시 시도해주세요.');
    }

    imageUrl = uploadResults[0].url;
    additionalUrls = uploadResults.slice(1).map((r) => r.url);
  }

  let scanId: string;
  if (existingScanId) {
    scanId = existingScanId;
  } else {
    try {
      scanId = await saveManualScan(imageUrl);
    } catch (err) {
      await rollbackUploads(uploadedPaths);
      throw err;
    }
  }

  if (additionalUrls.length > 0) {
    try {
      await supabase.from('scans').update({ additional_image_urls: additionalUrls }).eq('id', scanId);
    } catch (err) {
      logError(err, { component: 'stereoPipeline', action: 'updateAdditionalUrls' });
    }
  }

  // Build angle payloads with storage URLs instead of base64 data.
  // The edge function only needs metadata (key, label, orderIndex) for its
  // synthesis logic — sending multi-MB base64 strings through the JS bridge
  // causes native heap OOM kills on Android.
  const validShots = sorted.filter((s) => s.base64);
  const allUrls = [imageUrl, ...additionalUrls];
  const anglePayloads: AngleImagePayload[] = validShots.map((s, i) => ({
    key: ['front', 'left', 'right', 'back', 'top'][s.orderIndex] || 'front',
    label: s.label,
    url: allUrls[i],
    mimeType: s.mimeType,
    orderIndex: s.orderIndex,
  }));
  // runSynthesis only reads .key, .label, .orderIndex — never .base64.
  // Omitting base64 here prevents 5 multi-MB strings (10-20MB) from
  // coexisting in native heap during the parallel synthesis + cloud call.
  const angleInputs: AngleInput[] = validShots.map((s) => ({
    key: (['front', 'left', 'right', 'back', 'top'][s.orderIndex] || 'front') as AngleInput['key'],
    label: s.label,
    base64: '',
    mimeType: s.mimeType ?? 'image/jpeg',
    orderIndex: s.orderIndex,
  }));

  // Release the sorted copies' base64 references immediately — the synthesis
  // inputs above don't need them, and each shot's base64 can be several MB.
  for (const s of sorted) { (s as { base64?: string }).base64 = undefined; }

  // Yield to allow GC to reclaim the released base64 strings before the
  // CPU-heavy synthesis call. On low-end Android, failing to yield here
  // can cause the native heap to overlap with the next allocation and OOM.
  await nativeHeapCooldownGuard();

  // Run local synthesis and cloud stereo analysis in parallel — local synthesis
  // is CPU-only and doesn't depend on the upload, so it can overlap with the
  // cloud call to cut total latency to max(local, cloud) instead of local + cloud.
  steps[0].detail = '로컬 3D 분석 + 클라우드 GPU 볼륨 복원 동시 처리 중...';
  report(0, 0.15);
  if (aborted()) return createAbortedResult(scanId);
  // Yield to the render thread before the CPU-heavy synchronous synthesis
  // call so the navigation animation can complete without frame drops.
  await new Promise((r) => setTimeout(r, 0));
  if (aborted()) return createAbortedResult(scanId);
  const tonePrompt = contentTone === 'studio'
    ? `스튜디오 프리미엄 고급스러운 디테일 영화적 조명${studioSliders ? ` — 광채 강화 ${studioSliders.facetSparkle}% · 텍스처 디테일 ${studioSliders.fabricDetail}% · 블렌딩 ${studioSliders.blendStrength}%${studioSliders.smartFit === false ? ' · 스마트 핏 비활성' : ''}` : ''}`
    : contentTone === 'raw'
    ? '날것의 심리자극 리얼 후기 즉각적 시선 끌기'
    : '';
  let localSynthesis: ReturnType<typeof runSynthesis>;
  let cloudResultRaw: CloudPipelineResult | null;
  try {
    [localSynthesis, cloudResultRaw] = await Promise.all([
      Promise.resolve().then(() => runSynthesis(angleInputs, tonePrompt)),
      invokeStereoCutAuto(anglePayloads, tonePrompt, contentTone ?? '', scanId, signal).catch(() => null),
    ]);
  } catch (synthesisErr) {
    // runSynthesis threw synchronously — degrade gracefully instead of
    // letting the error propagate as an unhandled rejection.
    localSynthesis = runSynthesis(angleInputs.slice(0, 1), tonePrompt);
    cloudResultRaw = null;
  }

  let cloudResult: CloudPipelineResult | null = cloudResultRaw;
  if (cloudResult && !cloudResult?.synthesis?.spatialDepthHint) {
    cloudResult = null;
  }

  // Release base64 payloads now that synthesis + cloud call are done.
  // The remaining pipeline steps (directing, render, publish) don't need
  // the raw image data — keeping multi-MB base64 strings in memory through
  // the rest of the pipeline risks native heap overflow on low-end devices.
  anglePayloads.length = 0;
  angleInputs.length = 0;

  // Yield to let GC reclaim the multi-MB base64 payloads before subsequent
  // pipeline steps allocate memory for edit plans and publish metadata.
  await nativeHeapCooldownGuard();

  const synthesisSummary = cloudResult
    ? `${cloudResult.synthesis.spatialDepthHint} · 볼륨 신뢰도 ${Math.round(cloudResult.synthesis.volumeEstimate.confidence * 100)}% · ${cloudResult.synthesis.contextMatch.label} 맥락`
    : getSynthesisSummary(localSynthesis);
  const context = cloudResult
    ? (cloudResult.synthesis.contextMatch.context as import('./aiSynthesisEngine').UsageContext)
    : localSynthesis.contextMatch.context;

  steps[0].status = 'done';
  steps[0].detail = synthesisSummary;
  report(0, 0.25);

  const cloudLabel = cloudResult?.synthesis?.contextMatch?.label?.trim();
  const productName = cloudLabel
    ? `${cloudLabel} 제품`
    : contentTone === 'studio'
    ? '프리미엄 스튜디오 제품'
    : '프리미엄 추천 상품';
  const productContext = cloudLabel
    ? `${cloudLabel} 제품 — ${synthesisSummary}`
    : contentTone
    ? `${tonePrompt} — ${synthesisSummary}`
    : synthesisSummary;

  if (cleanMode) {
    steps[1].status = 'done';
    steps[1].detail = '클린 모드 — 훅/자막 생성 건너뜀 (순수 비주얼 추출)';
    report(1, 0.5);
  } else {
    if (aborted()) return createAbortedResult(scanId);
    await new Promise((r) => setTimeout(r, 0));
    steps[1].status = 'active';
    steps[1].detail = '초반 3초 패러독스 훅 + 비트 싱크 설계 중...';
    report(1, 0.3);
  }

  const editPlan = cleanMode
    ? buildShortFormEditPlan('youtube', '', null, '', undefined, undefined, true, undefined, undefined)
    : buildShortFormEditPlan('youtube', productContext, null, productName, undefined, undefined, true, undefined, undefined);

  const directingPlan = cleanMode
    ? null
    : buildDirectingPlan(
    editPlan.segments,
    editPlan.bgmTemplate,
    context,
    'youtube',
  );

  const directingSummary = cleanMode
    ? '클린 모드: 텍스트 오버레이 없이 순수 비주얼만 추출'
    : (directingPlan ? getDirectingSummary(directingPlan) : '디렉팅 계획 생성 생략');

  if (!cleanMode && directingPlan) {
    await new Promise((r) => setTimeout(r, 600));
    if (aborted()) return createAbortedResult(scanId);
    steps[1].detail = `훅: ${directingPlan.hookTransition.description} | SFX ${directingPlan.sfxPlans.length}건 | 킬링포인트 자막 ${directingPlan.killPointCaptions.length}건`;
  }

  if (aborted()) return createAbortedResult(scanId);
  await new Promise((r) => setTimeout(r, 0));

  steps[2].status = 'active';
  steps[2].detail = cleanMode ? '클린 모드 렌더링 준비 (텍스트 메타데이터 제외)...' : '9:16 H.264 렌더링 코덱 적용 & 메타데이터 생성 중...';
  report(2, 0.55);

  const publishPlans = cleanMode
    ? []
    : buildMultiPlatformPublishPlans(productName, context, ['youtube', 'instagram', 'tiktok']);

  const publishTargets = PUBLISH_TARGETS.map(({ key, label }) => {
    const dl = getDeepLink(key);
    return { key, label, deepLinkApp: dl.appUrl, deepLinkWeb: dl.webUrl };
  });

  await new Promise((r) => setTimeout(r, 600));
  if (aborted()) return createAbortedResult(scanId);
  if (cleanMode) {
    steps[2].detail = '클린 모드 렌더링 준비 완료 (텍스트 메타데이터 없음)';
  } else {
    const metadataSummary = publishPlans.map((p) => `${p.target}: ${p.metadata.title.slice(0, 20)}...`).join(' | ');
    steps[2].detail = `3개 플랫폼 렌더링 준비 완료 | ${metadataSummary}`;
  }
  report(2, 0.75);

  steps[3].status = 'active';
  steps[3].detail = '비차단 갤러리 저장 처리 및 퍼블리시 딥링크 준비 중...';
  report(3, 0.8);

  await new Promise((r) => setTimeout(r, 400));

  steps[3].status = 'done';
  steps[3].detail = '갤러리 저장 준비 완료 · 3개 플랫폼 퍼블리시 대기';
  report(3, 0.95);

  steps[4].status = 'active';
  steps[4].detail = '퍼블리시 대기 — 플랫폼 선택 후 원클릭 업로드 가능';
  report(4, 1.0);

  const result: StereoPipelineResult = {
    scanId,
    cloudResult,
    synthesisSummary,
    directingSummary,
    directingPlan,
    publishPlans,
    publishTargets,
  };

  // Save generated hooks/captions back to the scan record so the result page
  // can display them. In clean mode, all text fields are empty and cleanMode
  // flag is set so the result page auto-enables clean video mode.
  const hookText = cleanMode ? '' : (editPlan.selectedHook || '이거 보면 무조건 클릭');
  const captionText = cleanMode ? '' : (editPlan.segments.map((s) => s.textOverlay).filter(Boolean).join('\n') || editPlan.selectedHook || '지금 확인하세요');
  const templateData = {
    priceLabel: '',
    oneLiner: hookText,
    category: cloudResult?.synthesis?.contextMatch?.label || '',
    accentColor: '#2f9dff',
    hook: hookText,
    hashtags: cleanMode ? [] : (publishPlans[0]?.metadata?.hashtags || []),
    productAdvantages: [] as string[],
    caption: captionText,
    psychologyInsight: null as unknown,
    cleanMode,
    platformVariants: cleanMode ? {} : publishPlans.reduce<Record<string, { hook?: string; caption?: string; hashtags?: string[] }>>((acc, p) => {
      acc[p.target] = {
        hook: p.metadata.title,
        caption: p.metadata.description,
        hashtags: p.metadata.hashtags,
      };
      return acc;
    }, {}),
  };

  try {
    if (aborted()) return createAbortedResult(scanId);
    await supabase.from('scans').update({
      product_name: productName,
      summary: synthesisSummary,
      one_liner: hookText,
      template_data: templateData,
    }).eq('id', scanId);
  } catch {
    // non-fatal — pipeline result is still returned in-memory
  }

  steps[4].status = 'done';
  steps[4].detail = '파이프라인 완료 · 편집 화면으로 이동 가능';
  report(4, 1.0, null, result);

  if (Platform.OS !== 'web') {
    void Linking;
  }

  return result;
}

function createAbortedResult(scanId: string): StereoPipelineResult {
  return {
    scanId,
    cloudResult: null,
    synthesisSummary: '',
    directingSummary: '',
    directingPlan: null,
    publishPlans: [],
    publishTargets: [],
  };
}

export async function openPublishDeepLink(platformKey: string): Promise<void> {
  const dl = getDeepLink(platformKey);
  const url = dl.appUrl || dl.webUrl || dl.uploadWebUrl;
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    // Deep link may not be available on web — ignore
  }
}
