import { useState, useCallback, useRef, useEffect } from 'react';
import {
  uploadFilesResumable,
  type UploadFileItem,
  type BatchUploadProgress,
} from '@/lib/resumableUploadQueue';

interface UseResumableUploadState {
  progress: BatchUploadProgress | null;
  isUploading: boolean;
  error: string | null;
  upload: (files: UploadFileItem[]) => Promise<{ publicUrl: string; fileId: string }[]>;
  cancel: () => void;
}

export function useResumableUpload(): UseResumableUploadState {
  const [progress, setProgress] = useState<BatchUploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const upload = useCallback(
    async (files: UploadFileItem[]) => {
      if (files.length === 0) return [];
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsUploading(true);
      setError(null);
      setProgress(null);

      try {
        const results = await uploadFilesResumable(files, {
          signal: controller.signal,
          onProgress: (p) => setProgress(p),
        });
        return results;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.';
        if (!controller.signal.aborted) {
          setError(msg);
        }
        throw err;
      } finally {
        if (controllerRef.current === controller) {
          setIsUploading(false);
        }
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setIsUploading(false);
  }, []);

  return { progress, isUploading, error, upload, cancel };
}
