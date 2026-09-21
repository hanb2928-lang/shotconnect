import { useRef, useState, useCallback, useEffect } from 'react';
import { isMobileWebView } from '@/lib/devicePerformance';

export type PunchEffectType = 'cut' | 'zoom' | 'shake' | 'explosion';

export interface PunchMarker {
  id: string;
  time: number;
  effect: PunchEffectType;
  intensity: number;
}

interface SoundPunchState {
  isRecording: boolean;
  isReady: boolean;
  amplitude: number;
  markers: PunchMarker[];
  duration: number;
  audioBlob: Blob | null;
  error: string | null;
}

interface SoundPunchRefs {
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  mediaStream: MediaStream | null;
  mediaRecorder: MediaRecorder | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  rafId: number | null;
  startTime: number;
  chunks: Blob[];
  runningAvg: number;
  lastPunchTime: number;
  recognition: any;
  recognitionActive: boolean;
}

const PEAK_THRESHOLD = 2.8;
const MIN_PUNCH_INTERVAL = 400;
const AVG_DECAY = 0.96;
const AMPLITUDE_SMOOTHING = 0.7;

const EFFECT_CYCLE: PunchEffectType[] = ['cut', 'zoom', 'shake', 'explosion'];

export function useSoundPunch() {
  const [state, setState] = useState<SoundPunchState>({
    isRecording: false,
    isReady: false,
    amplitude: 0,
    markers: [],
    duration: 0,
    audioBlob: null,
    error: null,
  });

  const refs = useRef<SoundPunchRefs>({
    audioContext: null,
    analyser: null,
    mediaStream: null,
    mediaRecorder: null,
    sourceNode: null,
    rafId: null,
    startTime: 0,
    chunks: [],
    runningAvg: 0.01,
    lastPunchTime: 0,
    recognition: null,
    recognitionActive: false,
  });
  const isStartingRef = useRef(false);
  const lastStateUpdateRef = useRef(0);
  const mountedRef = useRef(true);

  const isWeb = typeof window !== 'undefined' &&
    (typeof window.AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined');

  const cleanup = useCallback(() => {
    const r = refs.current;
    if (r.rafId) {
      cancelAnimationFrame(r.rafId);
      r.rafId = null;
    }
    if (r.mediaRecorder && r.mediaRecorder.state !== 'inactive') {
      try { r.mediaRecorder.stop(); } catch { /* ignore */ }
    }
    if (r.mediaStream) {
      r.mediaStream.getTracks().forEach((t) => t.stop());
    }
    if (r.sourceNode) {
      try { r.sourceNode.disconnect(); } catch { /* ignore */ }
    }
    if (r.audioContext) {
      try { r.audioContext.close(); } catch { /* ignore */ }
    }
    if (r.recognition) {
      try { r.recognition.stop(); } catch { /* ignore */ }
    }
    r.audioContext = null;
    r.analyser = null;
    r.mediaStream = null;
    r.mediaRecorder = null;
    r.sourceNode = null;
    r.recognition = null;
    r.recognitionActive = false;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const detectVoiceCommand = useCallback((transcript: string): PunchEffectType | null => {
    const lower = transcript.toLowerCase().trim();
    if (lower.includes('펑') || lower.includes('폭발') || lower.includes('boom') || lower.includes('explosion')) {
      return 'explosion';
    }
    if (lower.includes('줌') || lower.includes('zoom') || lower.includes('클로즈')) {
      return 'zoom';
    }
    if (lower.includes('컷') || lower.includes('cut') || lower.includes('전환') || lower.includes('다음')) {
      return 'cut';
    }
    if (lower.includes('흔들') || lower.includes('shake') || lower.includes('shock') || lower.includes('충격')) {
      return 'shake';
    }
    return null;
  }, []);

  const addMarker = useCallback((time: number, effect: PunchEffectType, intensity: number) => {
    const id = `punch-${time.toFixed(0)}-${Math.random().toString(36).slice(2, 7)}`;
    setState((prev) => ({
      ...prev,
      markers: [...prev.markers, { id, time, effect, intensity }],
    }));
  }, []);

  const startRecording = useCallback(async () => {
    if (state.isRecording || isStartingRef.current) return;
    isStartingRef.current = true;
    if (!isWeb || isMobileWebView() || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState((prev) => ({ ...prev, error: '이 브라우저에서는 마이크 녹음을 지원하지 않아요' }));
      isStartingRef.current = false;
      return;
    }
    setState((prev) => ({ ...prev, error: null, markers: [], duration: 0, audioBlob: null }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        isStartingRef.current = false;
        return;
      }

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      sourceNode.connect(analyser);

      if (typeof MediaRecorder === 'undefined') {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('이 브라우저에서는 오디오 녹음을 지원하지 않아요');
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        setState((prev) => ({ ...prev, audioBlob: blob }));
      };
      mediaRecorder.start();

      const r = refs.current;
      r.audioContext = audioContext;
      r.analyser = analyser;
      r.mediaStream = stream;
      r.mediaRecorder = mediaRecorder;
      r.sourceNode = sourceNode;
      r.chunks = chunks;
      r.startTime = performance.now();
      r.runningAvg = 0.01;
      r.lastPunchTime = 0;

      // Voice command recognition (if available)
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ko-KR';
        recognition.onresult = (event: any) => {
          let lastTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            lastTranscript += event.results[i][0].transcript;
          }
          const command = detectVoiceCommand(lastTranscript);
          if (command) {
            const now = performance.now();
            const elapsed = now - r.startTime;
            if (elapsed - r.lastPunchTime > MIN_PUNCH_INTERVAL) {
              r.lastPunchTime = elapsed;
              addMarker(elapsed, command, 1.0);
            }
          }
        };
        recognition.onerror = () => { /* ignore recognition errors */ };
        try {
          recognition.start();
          r.recognition = recognition;
          r.recognitionActive = true;
        } catch { /* ignore */ }
      }

      setState((prev) => ({ ...prev, isRecording: true, isReady: true }));
      isStartingRef.current = false;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const analyze = () => {
        if (!refs.current.analyser) return;

        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const amplitude = Math.min(rms * 3, 1);

        const rr = refs.current;
        rr.runningAvg = rr.runningAvg * AVG_DECAY + rms * (1 - AVG_DECAY);
        const now = performance.now();
        const elapsed = now - rr.startTime;

        const ratio = rr.runningAvg > 0.005 ? rms / rr.runningAvg : 0;

        if (rms > 0.04 && ratio > PEAK_THRESHOLD && elapsed - rr.lastPunchTime > MIN_PUNCH_INTERVAL) {
          rr.lastPunchTime = elapsed;
          const intensity = Math.min(ratio / PEAK_THRESHOLD, 2.5);
          const effectIndex = Math.floor(Math.random() * EFFECT_CYCLE.length);
          addMarker(elapsed, EFFECT_CYCLE[effectIndex], intensity);
        }

        const nowMs = performance.now();
        if (nowMs - lastStateUpdateRef.current > 66) {
          lastStateUpdateRef.current = nowMs;
          setState((prev) => ({
            ...prev,
            amplitude: prev.amplitude * AMPLITUDE_SMOOTHING + amplitude * (1 - AMPLITUDE_SMOOTHING),
            duration: elapsed,
          }));
        }

        rr.rafId = requestAnimationFrame(analyze);
      };

      r.rafId = requestAnimationFrame(analyze);
    } catch (err) {
      cleanup();
      isStartingRef.current = false;
      const msg = err instanceof Error ? err.message : '마이크 접근에 실패했어요';
      setState((prev) => ({ ...prev, error: msg }));
    }
  }, [state.isRecording, addMarker, detectVoiceCommand, isWeb]);

  const stopRecording = useCallback(() => {
    const r = refs.current;
    if (r.rafId) {
      cancelAnimationFrame(r.rafId);
      r.rafId = null;
    }
    if (r.mediaRecorder && r.mediaRecorder.state !== 'inactive') {
      try { r.mediaRecorder.stop(); } catch { /* ignore */ }
    }
    if (r.mediaStream) {
      r.mediaStream.getTracks().forEach((t) => t.stop());
    }
    if (r.recognition) {
      try { r.recognition.stop(); } catch { /* ignore */ }
      r.recognitionActive = false;
    }
    if (r.sourceNode) {
      try { r.sourceNode.disconnect(); } catch { /* ignore */ }
    }
    if (r.audioContext) {
      try { r.audioContext.close(); } catch { /* ignore */ }
      r.audioContext = null;
    }
    r.analyser = null;
    r.mediaStream = null;
    r.mediaRecorder = null;
    r.sourceNode = null;
    r.recognition = null;

    setState((prev) => ({
      ...prev,
      isRecording: false,
      amplitude: 0,
      duration: prev.duration,
    }));
  }, []);

  const removeMarker = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      markers: prev.markers.filter((m) => m.id !== id),
    }));
  }, []);

  const updateMarkerEffect = useCallback((id: string, effect: PunchEffectType) => {
    setState((prev) => ({
      ...prev,
      markers: prev.markers.map((m) => (m.id === id ? { ...m, effect } : m)),
    }));
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setState({
      isRecording: false,
      isReady: false,
      amplitude: 0,
      markers: [],
      duration: 0,
      audioBlob: null,
      error: null,
    });
  }, [cleanup]);

  const getAudioDataUrl = useCallback(async (): Promise<string | null> => {
    const blob = state.audioBlob;
    if (!blob) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }, [state.audioBlob]);

  return {
    ...state,
    startRecording,
    stopRecording,
    removeMarker,
    updateMarkerEffect,
    reset,
    getAudioDataUrl,
  };
}
