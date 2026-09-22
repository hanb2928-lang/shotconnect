import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { isMobileWebView } from '@/lib/devicePerformance';

type RecordingState = 'idle' | 'recording' | 'stopped' | 'error';

interface MediaRecorderLike {
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  state: RecordingState;
  duration: number;
  error: string | null;
}

const MAX_DURATION_SEC = 30;

export function useVoiceRecording(): MediaRecorderLike {
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const stoppingRef = useRef(false);
  const pendingStopsRef = useRef<Array<(v: string | null) => void>>([]);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stoppingRef.current = false;
    pendingStopsRef.current = [];
    durationRef.current = 0;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setDuration(0);
    durationRef.current = 0;

    if (Platform.OS !== 'web' || isMobileWebView()) {
      setError('모바일에서는 음성 녹음을 지원하지 않습니다.');
      setState('error');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('마이크 접근 권한이 필요합니다.');
      setState('error');
      return;
    }

    // Stop any existing recording before starting a new one
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
      cleanup();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      stoppingRef.current = false;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          cleanup();
          setState('stopped');
        };
        reader.onerror = () => {
          cleanup();
          setState('error');
          setError('녹음 파일을 읽지 못했습니다.');
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState('recording');

      timerRef.current = setInterval(() => {
        if (durationRef.current >= MAX_DURATION_SEC) {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          try { recorder.stop(); } catch {}
          return;
        }
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error && err.name === 'NotReadableError'
        ? '마이크가 다른 앱에서 사용 중입니다.'
        : '마이크 권한을 허용해주세요.');
      setState('error');
    }
  }, [cleanup]);

  const stop = useCallback(async (): Promise<string | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      setState('idle');
      return null;
    }

    // If a stop is already in progress, queue the resolver
    if (stoppingRef.current) {
      return new Promise<string | null>((resolve) => {
        pendingStopsRef.current.push(resolve);
      });
    }

    stoppingRef.current = true;

    return new Promise<string | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          cleanup();
          setState('stopped');
          resolve(dataUrl);
          for (const r of pendingStopsRef.current) r(dataUrl);
          pendingStopsRef.current = [];
        };
        reader.onerror = () => {
          cleanup();
          setState('error');
          setError('녹음 파일을 읽지 못했습니다.');
          resolve(null);
          for (const r of pendingStopsRef.current) r(null);
          pendingStopsRef.current = [];
        };
        reader.readAsDataURL(blob);
      };

      try {
        recorder.stop();
      } catch {
        cleanup();
        setState('idle');
        resolve(null);
        for (const r of pendingStopsRef.current) r(null);
        pendingStopsRef.current = [];
      }
    });
  }, [cleanup]);

  return { start, stop, state, duration, error };
}
