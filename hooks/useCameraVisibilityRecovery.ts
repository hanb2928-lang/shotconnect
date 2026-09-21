import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

interface UseCameraVisibilityRecoveryOptions {
  getStream: () => MediaStream | null;
  isActive: boolean;
  restartStream: () => Promise<void>;
  stopStream: () => void;
}

export function useCameraVisibilityRecovery({
  getStream,
  isActive,
  restartStream,
  stopStream,
}: UseCameraVisibilityRecoveryOptions) {
  const restartStreamRef = useRef(restartStream);
  const stopStreamRef = useRef(stopStream);

  useEffect(() => {
    restartStreamRef.current = restartStream;
    stopStreamRef.current = stopStream;
  }, [restartStream, stopStream]);

  useEffect(() => {
    if (!isActive || Platform.OS !== 'web') return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      const videoTrack = getStream()?.getVideoTracks()[0];
      const isStreamDead = !videoTrack || videoTrack.readyState === 'ended';

      if (!isStreamDead) return;

      stopStreamRef.current();

      try {
        await restartStreamRef.current();
      } catch {
        // caller handles error display
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, getStream]);
}
