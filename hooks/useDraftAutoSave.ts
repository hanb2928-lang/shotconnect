/**
 * useDraftAutoSave — auto-saves in-progress work to draft storage.
 *
 * Call saveDraftState() whenever the user's images or options change.
 * On mount, call loadDraft() to check for a recoverable draft.
 */

import { useCallback, useRef } from 'react';
import {
  saveDraft,
  getDraft,
  createDraftId,
  makeDraftLabel,
  type DraftEntry,
  type DraftSource,
  type DraftStatus,
} from '@/lib/draftStorage';

export function useDraftAutoSave(source: DraftSource) {
  const draftIdRef = useRef<string | null>(null);

  const ensureDraftId = useCallback((): string => {
    if (!draftIdRef.current) {
      draftIdRef.current = createDraftId();
    }
    return draftIdRef.current;
  }, []);

  const saveDraftState = useCallback((params: {
    imageUris: string[];
    angleLabels?: string[];
    modelImageUri?: string;
    status?: DraftStatus;
    scanId?: string;
    jobId?: string;
    resultVideoUrl?: string;
    genMode?: string;
    mood?: string;
    platform?: string;
    uploaded?: boolean;
  }): void => {
    if (params.imageUris.length === 0 && !params.scanId) return;

    const id = ensureDraftId();
    const angleLabels = params.angleLabels ?? [];
    const now = Date.now();

    const entry: DraftEntry = {
      id,
      source,
      status: params.status ?? 'editing',
      imageUris: params.imageUris,
      angleLabels,
      modelImageUri: params.modelImageUri,
      scanId: params.scanId,
      jobId: params.jobId,
      resultVideoUrl: params.resultVideoUrl,
      genMode: params.genMode,
      mood: params.mood,
      platform: params.platform,
      uploaded: params.uploaded ?? false,
      createdAt: now,
      updatedAt: now,
      label: makeDraftLabel(angleLabels, source),
      thumbnailUri: params.imageUris[0],
    };

    saveDraft(entry).catch(() => {});
  }, [ensureDraftId, source]);

  const loadDraft = useCallback(async (draftId: string): Promise<DraftEntry | null> => {
    const entry = await getDraft(draftId);
    if (entry) {
      draftIdRef.current = draftId;
    }
    return entry;
  }, []);

  const clearDraftId = useCallback(() => {
    draftIdRef.current = null;
  }, []);

  return { saveDraftState, loadDraft, clearDraftId, draftIdRef };
}
