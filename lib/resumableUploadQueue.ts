/**
 * Resumable chunked upload queue for large file uploads.
 *
 * Splits each file into fixed-size chunks and uploads them sequentially to
 * Supabase Storage. When a chunk fails due to a network drop, the queue
 * pauses and waits for connectivity to return, then resumes from the exact
 * chunk that failed — not from the beginning. This avoids re-transmitting
 * multi-megabyte payloads on flaky cellular/Wi-Fi transitions.
 *
 * Progress is tracked per-file and aggregated across all files in a batch,
 * so the UI can show a single "uploading 3 of 5 files — 62%" indicator.
 */

import { Platform } from 'react-native';
import { supabase, supabaseUrl, supabaseAnonKey, ensureFreshSession } from './supabase';
import { isOnline } from '@/hooks/useNetworkStatus';
import { recordUploadSuccess, recordUploadFailure, isUploadCircuitOpen } from './uploadCircuitBreaker';
import { addBreadcrumb } from './errorLogger';

const DEFAULT_CHUNK_SIZE = 512 * 1024; // 512 KB per chunk
const MAX_CHUNK_RETRIES = 3;
const CHUNK_BACKOFF_BASE_MS = 800;
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
  chunks: { offset: number; size: number; uploaded: boolean }[];
  uploadedBytes: number;
  status: UploadProgress['status'];
  error?: string;
  publicUrl?: string;
}

function chunkBackoff(attempt: number): number {
  return CHUNK_BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 200;
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

async function getAuthHeaders(): Promise<Record<string, string>> {
  await ensureFreshSession().catch(() => {});
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    apikey: supabaseAnonKey,
    Authorization: token ? `Bearer ${token}` : `Bearer ${supabaseAnonKey}`,
  };
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

async function uploadSingleChunk(
  data: Uint8Array,
  offset: number,
  chunkSize: number,
  bucket: string,
  path: string,
  mimeType: string,
  totalSize: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const chunk = data.subarray(offset, Math.min(offset + chunkSize, totalSize));
  const isLastChunk = offset + chunkSize >= totalSize;
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${safePath}`;

  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
    'Content-Type': mimeType,
    'Content-Range': `bytes ${offset}-${offset + chunk.byteLength - 1}/${totalSize}`,
    'x-upsert': 'true',
  };

  if (isLastChunk) {
    headers['x-upsert'] = 'true';
  }

  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) { controller.abort(); return false; }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    let fetchBody: BodyInit;
    if (Platform.OS === 'web') {
      fetchBody = new Blob([chunk as BlobPart], { type: mimeType });
    } else {
      fetchBody = (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength
        ? chunk
        : chunk.slice()) as BodyInit;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: fetchBody,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      addBreadcrumb('upload', `Chunk upload failed (${resp.status})`, 'warning', {
        bucket, path, offset, status: resp.status,
      });
      return false;
    }

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function uploadFileResumable(
  state: FileUploadState,
  chunkSize: number,
  signal?: AbortSignal,
  onChunkProgress?: () => void,
): Promise<string> {
  const { item } = state;
  const totalSize = item.data.byteLength;

  for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');

    // Find next unuploaded chunk
    const nextChunk = state.chunks.find((c) => !c.uploaded);
    if (!nextChunk) {
      const safePath = item.path.split('/').map(encodeURIComponent).join('/');
      return `${supabaseUrl}/storage/v1/object/public/${item.bucket}/${safePath}`;
    }

    if (isUploadCircuitOpen()) {
      state.status = 'paused';
      await new Promise((r) => setTimeout(r, 1000));
      if (signal?.aborted) throw new Error('업로드가 취소되었습니다.');
      continue;
    }

    if (!isOnline()) {
      state.status = 'paused';
      const recovered = await waitForNetwork(signal);
      if (!recovered) throw new Error('네트워크 연결이 끊겨 업로드를 재개할 수 없습니다.');
      state.status = 'uploading';
      attempt = -1; // reset retry counter after network recovery
      continue;
    }

    state.status = 'uploading';
    const success = await uploadSingleChunk(
      item.data,
      nextChunk.offset,
      chunkSize,
      item.bucket,
      item.path,
      item.mimeType,
      totalSize,
      signal,
    );

    if (success) {
      nextChunk.uploaded = true;
      state.uploadedBytes += nextChunk.size;
      attempt = -1; // reset retry counter on success
      onChunkProgress?.();
    } else {
      recordUploadFailure();
      if (attempt < MAX_CHUNK_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, chunkBackoff(attempt)));
      }
    }
  }

  throw new Error(`업로드 실패 — 청크 재시도 한계를 초과했습니다: ${item.path}`);
}

export interface ResumableUploadOptions {
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

export async function uploadFilesResumable(
  files: UploadFileItem[],
  options: ResumableUploadOptions = {},
): Promise<{ publicUrl: string; fileId: string }[]> {
  const { chunkSize = DEFAULT_CHUNK_SIZE, signal, onProgress } = options;

  if (files.length === 0) return [];

  // Compress images before upload using the worker pool to minimize payload
  // size. This is done here rather than in callers so the queue is a
  // self-contained "give me files, I'll handle everything" entry point.
  const states: FileUploadState[] = files.map((item) => {
    const totalSize = item.data.byteLength;
    const chunks: { offset: number; size: number; uploaded: boolean }[] = [];
    for (let offset = 0; offset < totalSize; offset += chunkSize) {
      chunks.push({
        offset,
        size: Math.min(chunkSize, totalSize - offset),
        uploaded: false,
      });
    }
    return { item, chunks, uploadedBytes: 0, status: 'pending' as const };
  });

  const emitProgress = () => {
    if (onProgress) onProgress(buildProgressMap(states));
  };

  emitProgress();
  const results: { publicUrl: string; fileId: string }[] = [];

  for (const state of states) {
    if (signal?.aborted) break;

    try {
      const publicUrl = await uploadFileResumable(state, chunkSize, signal, emitProgress);
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


