/**
 * useDraftAutoSave — auto-saves in-progress work to draft storage.
 *
 * Call saveDraftState() whenever the user's images or options change.
 * On mount, call loadDraft() to check for a recoverable draft.
 */

import { useCallback, useEffect, useRef } from 'react';
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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestParamsRef = useRef<Parameters<typeof saveDraftState>[0] | null>(null);

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

    latestParamsRef.current = params;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const p = latestParamsRef.current;
      if (!p) return;
      const id = ensureDraftId();
      const angleLabels = p.angleLabels ?? [];
      const now = Date.now();

      const entry: DraftEntry = {
        id,
        source,
        status: p.status ?? 'editing',
        imageUris: p.imageUris,
        angleLabels,
        modelImageUri: p.modelImageUri,
        scanId: p.scanId,
        jobId: p.jobId,
        resultVideoUrl: p.resultVideoUrl,
        genMode: p.genMode,
        mood: p.mood,
        platform: p.platform,
        uploaded: p.uploaded ?? false,
        createdAt: now,
        updatedAt: now,
        label: makeDraftLabel(angleLabels, source),
        thumbnailUri: p.imageUris[0],
      };

      saveDraft(entry).catch(() => {}).finally(() => { /* release entry closure ref */ });
    }, 800);
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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { saveDraftState, loadDraft, clearDraftId, draftIdRef };
}
