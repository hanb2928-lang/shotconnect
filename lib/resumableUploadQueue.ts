/**
 * Resumable upload queue for large file uploads.
 *
 * Uploads each file to Supabase Storage in a single request using the
 * SDK's upload() method with upsert. Retries on network failure with
 * exponential backoff, waits for connectivity recovery, and respects
 * the upload circuit breaker.
 *
 * Note: Supabase's simple storage endpoint does NOT support Content-Range
 * / chunked uploads — each POST overwrites the entire object. The previous
 * chunked implementation silently corrupted stored files by overwriting
 * the object with each 512KB slice.
 */

import { supabase, supabaseUrl, ensureFreshSession } from './supabase';
import { isOnline } from '@/hooks/useNetworkStatus';
import { recordUploadSuccess, recordUploadFailure, isUploadCircuitOpen } from './uploadCircuitBreaker';
import { addBreadcrumb } from './errorLogger';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 800;
const NETWORK_POLL_INTERVAL_MS = 1000;
const NETWORK_WAIT_MAX_MS = 30_000;

export interface UploadFileItem {
  id: string;
  data: Uint8Array;
  bucket: string;
  path: string;
  mimeType: string;
  fileName?: string;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'failed';
  error?: string;
}

export interface BatchUploadProgress {
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
  overallPercent: number;
  files: UploadProgress[];
  isPaused: boolean;
}

type ProgressCallback = (progress: BatchUploadProgress) => void;

interface FileUploadState {
  item: UploadFileItem;
  uploadedBytes: number;
  status: UploadProgress['status'];
  error?: string;
  publicUrl?: string;
}

function backoff(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 200;
}

async function waitForNetwork(signal?: AbortSignal): Promise<boolean> {
  if (isOnline()) return true;
  const deadline = Date.now() + NETWORK_WAIT_MAX_MS;
  while (!isOnline() && Date.now() < deadline) {
    if (signal?.aborted) return false;
    await new Promise((r) => setTimeout(r, NETWORK_POLL_INTERVAL_MS));
  }
  return isOnline();
}

function buildProgressMap(states: FileUploadState[]): BatchUploadProgress {
  const files: UploadProgress[] = states.map((s) => ({
    fileId: s.item.id,
    fileName: s.item.fileName ?? s.item.path,
    uploadedBytes: s.uploadedBytes,
    totalBytes: s.item.data.byteLength,
    percent: s.item.data.byteLength > 0
      ? Math.round((s.uploadedBytes / s.item.data.byteLength) * 100)
      : 0,
    status: s.status,
    error: s.error,
  }));

  const totalBytes = states.reduce((sum, s) => sum + s.item.data.byteLength, 0);
  const uploadedBytes = states.reduce((sum, s) => sum + s.uploadedBytes, 0);
  const completedFiles = states.filter((s) => s.status === 'completed').length;
  const isPaused = states.some((s) => s.status === 'paused');

  return {
    totalFiles: states.length,
    completedFiles,
    totalBytes,
    uploadedBytes,
    overallPercent: totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0,
    files,
    isPaused,
  };
}

async function uploadSingleFile(
  state: FileUploadState,
  signal?: AbortSignal,
  onProgress?: () => void,
): Promise<string> {
  const { item } = state;
  const totalSize = item.data.byteLength;

  if (totalSize === 0) {
    throw new Error('빈 파일은 업로드할 수 없습니다.');
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');

    if (isUploadCircuitOpen()) {
      state.status = 'paused';
      onProgress?.();
      await new Promise((r) => setTimeout(r, 1000));
      if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');
      attempt = -1;
      continue;
    }

    if (!isOnline()) {
      state.status = 'paused';
      onProgress?.();
      const recovered = await waitForNetwork(signal);
      if (!recovered) throw new Error('네트워크 연결이 끊겨 업로드를 재개할 수 없습니다.');
      state.status = 'uploading';
      attempt = -1;
      continue;
    }

    state.status = 'uploading';
    onProgress?.();

    try {
      await ensureFreshSession().catch(() => {});
      const { error } = await supabase.storage
        .from(item.bucket)
        .upload(item.path, item.data, {
          contentType: item.mimeType,
          upsert: true,
        });

      if (error) throw error;

      state.uploadedBytes = totalSize;
      const { data: urlData } = supabase.storage
        .from(item.bucket)
        .getPublicUrl(item.path);

      return urlData.publicUrl;
    } catch (err) {
      recordUploadFailure();
      addBreadcrumb('upload', `Upload attempt ${attempt + 1} failed`, 'warning', {
        path: item.path,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, backoff(attempt)));
      }
    }
  }

  throw new Error(`업로드 실패 — 재시도 한계를 초과했습니다: ${item.path}`);
}

export interface ResumableUploadOptions {
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

export async function uploadFilesResumable(
  files: UploadFileItem[],
  options: ResumableUploadOptions = {},
): Promise<{ publicUrl: string; fileId: string }[]> {
  const { signal, onProgress } = options;

  if (files.length === 0) return [];

  const states: FileUploadState[] = files.map((item) => ({
    item,
    uploadedBytes: 0,
    status: 'pending' as const,
  }));

  const emitProgress = () => {
    if (onProgress) onProgress(buildProgressMap(states));
  };

  emitProgress();
  const results: { publicUrl: string; fileId: string }[] = [];

  for (const state of states) {
    if (signal?.aborted) break;

    try {
      const publicUrl = await uploadSingleFile(state, signal, emitProgress);
      state.status = 'completed';
      state.publicUrl = publicUrl;
      results.push({ publicUrl, fileId: state.item.id });
      recordUploadSuccess();
    } catch (err) {
      state.status = 'failed';
      state.error = err instanceof Error ? err.message : '업로드 실패';
      recordUploadFailure();
      emitProgress();
      throw err;
    }

    emitProgress();
  }

  return results;
}
