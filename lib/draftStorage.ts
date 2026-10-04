/**
 * Draft storage layer — auto-saves in-progress work (captured images,
 * selected options, generation state) to AsyncStorage/localStorage so
 * users can recover after app kill or navigation away.
 *
 * Drafts are stored under `draft:<id>` keys with a 7-day TTL. A sweep
 * function cleans up expired entries on boot and periodically.
 *
 * Images are referenced by URI (blob: on web, file:// on native, or
 * https:// after upload). On resume, blob: URLs are gone (page reload)
 * so the draft stores enough metadata to re-fetch from Supabase Storage
 * if the images were already uploaded.
 */

import { getItem, setItem, removeItem } from './storage';

const DRAFT_PREFIX = 'draft:';
const DRAFT_INDEX_KEY = 'draft:index';
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DRAFTS = 20;

export type DraftSource = 'camera' | 'synthesis' | 'fitting';
export type DraftStatus = 'capturing' | 'editing' | 'generating' | 'completed' | 'failed';

export interface DraftEntry {
  id: string;
  source: DraftSource;
  status: DraftStatus;
  /** Image URIs — blob:/file:// before upload, https:// after upload */
  imageUris: string[];
  /** Angle labels parallel to imageUris */
  angleLabels: string[];
  /** Model image URI for fitting mode */
  modelImageUri?: string;
  /** Supabase scan ID if scan was created */
  scanId?: string;
  /** Video job ID if generation was started */
  jobId?: string;
  /** Result video URL if completed */
  resultVideoUrl?: string;
  /** Selected generation mode */
  genMode?: string;
  /** Selected product mood/tone */
  mood?: string;
  /** Platform target */
  platform?: string;
  /** Whether images have been uploaded to Supabase Storage */
  uploaded: boolean;
  /** Timestamps */
  createdAt: number;
  updatedAt: number;
  /** Human-readable label for the draft list */
  label: string;
  /** Thumbnail URI (first image) for the draft list */
  thumbnailUri?: string;
}

interface DraftIndex {
  ids: string[];
}

async function loadDraftIndex(): Promise<DraftIndex> {
  const raw = await getItem(DRAFT_INDEX_KEY);
  if (!raw) return { ids: [] };
  try {
    return JSON.parse(raw) as DraftIndex;
  } catch {
    return { ids: [] };
  }
}

async function saveDraftIndex(index: DraftIndex): Promise<void> {
  await setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
}

function draftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

/**
 * Saves or updates a draft. Automatically manages the draft index
 * and prunes entries beyond MAX_DRAFTS.
 */
export async function saveDraft(entry: DraftEntry): Promise<void> {
  const now = Date.now();
  const updated: DraftEntry = {
    ...entry,
    updatedAt: now,
  };

  await setItem(draftKey(entry.id), JSON.stringify(updated));

  const index = await loadDraftIndex();
  if (!index.ids.includes(entry.id)) {
    index.ids.unshift(entry.id);
    if (index.ids.length > MAX_DRAFTS) {
      const removed = index.ids.splice(MAX_DRAFTS);
      for (const id of removed) {
        await removeItem(draftKey(id));
      }
    }
    await saveDraftIndex(index);
  }
}

/**
 * Retrieves a single draft by ID. Returns null if not found or expired.
 */
export async function getDraft(id: string): Promise<DraftEntry | null> {
  const raw = await getItem(draftKey(id));
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as DraftEntry;
    if (Date.now() - entry.updatedAt > DRAFT_TTL_MS) {
      await removeItem(draftKey(id));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Lists all non-expired drafts, most-recently-updated first.
 * Expired entries are cleaned up as a side effect.
 */
export async function listDrafts(): Promise<DraftEntry[]> {
  const index = await loadDraftIndex();
  const now = Date.now();
  const valid: DraftEntry[] = [];
  const expiredIds: string[] = [];

  for (const id of index.ids) {
    const raw = await getItem(draftKey(id));
    if (!raw) {
      expiredIds.push(id);
      continue;
    }
    try {
      const entry = JSON.parse(raw) as DraftEntry;
      if (now - entry.updatedAt > DRAFT_TTL_MS) {
        expiredIds.push(id);
        await removeItem(draftKey(id));
      } else {
        valid.push(entry);
      }
    } catch {
      expiredIds.push(id);
      await removeItem(draftKey(id));
    }
  }

  if (expiredIds.length > 0) {
    const remaining = index.ids.filter((id) => !expiredIds.includes(id));
    await saveDraftIndex({ ids: remaining });
  }

  valid.sort((a, b) => b.updatedAt - a.updatedAt);
  return valid;
}

/**
 * Deletes a draft and removes it from the index.
 */
export async function deleteDraft(id: string): Promise<void> {
  await removeItem(draftKey(id));
  const index = await loadDraftIndex();
  const remaining = index.ids.filter((existingId) => existingId !== id);
  if (remaining.length !== index.ids.length) {
    await saveDraftIndex({ ids: remaining });
  }
}

/**
 * Sweeps all expired drafts. Called on boot and periodically.
 * Returns the number of drafts removed.
 */
export async function sweepExpiredDrafts(): Promise<number> {
  const index = await loadDraftIndex();
  const now = Date.now();
  let removed = 0;
  const remaining: string[] = [];

  for (const id of index.ids) {
    const raw = await getItem(draftKey(id));
    if (!raw) {
      removed++;
      continue;
    }
    try {
      const entry = JSON.parse(raw) as DraftEntry;
      if (now - entry.updatedAt > DRAFT_TTL_MS) {
        await removeItem(draftKey(id));
        removed++;
      } else {
        remaining.push(id);
      }
    } catch {
      await removeItem(draftKey(id));
      removed++;
    }
  }

  if (removed > 0) {
    await saveDraftIndex({ ids: remaining });
  }

  return removed;
}

/**
 * Generates a unique draft ID.
 */
export function createDraftId(): string {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a draft label from angle labels and source.
 */
export function makeDraftLabel(angleLabels: string[], source: DraftSource): string {
  const sourceLabel = source === 'camera' ? '촬영' : source === 'fitting' ? '가상 피팅' : '합성';
  const angleCount = angleLabels.length;
  if (angleCount === 0) return `${sourceLabel} 작업`;
  return `${sourceLabel} · ${angleCount}컷 (${angleLabels.slice(0, 3).join(', ')}${angleCount > 3 ? '…' : ''})`;
}

export { DRAFT_TTL_MS, MAX_DRAFTS };
