import { useRef, useCallback, useEffect } from 'react';

/**
 * Manages an AbortController that is automatically aborted on unmount.
 * Provides a signal to pass into upload functions so that in-flight
 * network requests are cancelled when the component is destroyed,
 * preventing RN bridge memory reference leaks.
 */
export function useCancellableUpload() {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const getSignal = useCallback((): AbortSignal | undefined => {
    if (!controllerRef.current || controllerRef.current.signal.aborted) {
      controllerRef.current = new AbortController();
    }
    return controllerRef.current.signal;
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { getSignal, cancel };
}
