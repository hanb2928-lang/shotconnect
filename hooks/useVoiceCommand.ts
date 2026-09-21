import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

type ListeningState = 'idle' | 'listening' | 'error';

export interface ParsedVoiceCommand {
  rawText: string;
  wakeWord: string;
  intent: string | null;
  promptText: string;
}

interface IntentKeyword {
  intent: string;
  keywords: string[];
}

const WAKE_WORDS = ['숏커넥트', '뚝딱', '숏커넥', '똑딱'];

const INTENT_KEYWORDS: IntentKeyword[] = [
  { intent: 'closing', keywords: ['마감', '남은', '떨이', '소진', '한정'] },
  { intent: 'new_menu', keywords: ['신메뉴', '새로운', '신상', '오늘'] },
  { intent: 'discount', keywords: ['할인', '특가', '세일', '이벤트', '천원'] },
  { intent: 'service', keywords: ['서비스', '공짜', '증정', '사은품'] },
  { intent: 'best_seller', keywords: ['베스트', '인기', '1위', '주문'] },
];

function parseIntent(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { intent, keywords } of INTENT_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return intent;
    }
  }
  return null;
}

function findWakeWord(text: string): string | null {
  const lower = text.toLowerCase();
  for (const ww of WAKE_WORDS) {
    if (lower.includes(ww.toLowerCase())) return ww;
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripWakeWord(text: string, wakeWord: string): string {
  return text.replace(new RegExp(escapeRegExp(wakeWord), 'gi'), '').trim();
}

interface SpeechRecognitionResult {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResult>>;
  resultIndex: number;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getSpeechRecognition(): { new (): SpeechRecognitionLike } | null {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useVoiceCommand(onCommand: (cmd: ParsedVoiceCommand) => void) {
  const [state, setState] = useState<ListeningState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const lastCommandTimeRef = useRef(0);
  const restartAttemptsRef = useRef(0);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const handleResult = useCallback((event: SpeechRecognitionEventLike) => {
    let fullText = '';
    for (let i = 0; i < event.results.length; i++) {
      fullText += event.results[i][0].transcript;
    }
    const trimmed = fullText.trim();
    if (!trimmed) return;

    setPartialTranscript(trimmed);

    const wakeWord = findWakeWord(trimmed);
    if (!wakeWord) return;

    const now = Date.now();
    if (now - lastCommandTimeRef.current < 3000) return;
    lastCommandTimeRef.current = now;

    const promptText = stripWakeWord(trimmed, wakeWord);
    const intent = parseIntent(trimmed);

    onCommandRef.current({
      rawText: trimmed,
      wakeWord,
      intent,
      promptText: promptText || trimmed,
    });

    setPartialTranscript('');
  }, []);

  const handleError = useCallback((event: SpeechRecognitionErrorEventLike) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setError('마이크 권한을 허용해주세요.');
      setState('error');
      shouldListenRef.current = false;
    }
  }, []);

  const createRecognition = useCallback((): SpeechRecognitionLike | null => {
    const SR = getSpeechRecognition();
    if (!SR) return null;

    const recognition = new SR();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = handleResult;
    recognition.onerror = handleError;

    recognition.onend = () => {
      if (!shouldListenRef.current) return;
      restartAttemptsRef.current += 1;
      if (restartAttemptsRef.current > 10) {
        shouldListenRef.current = false;
        setState('error');
        setError('음성 인식이 계속 중단됩니다. 마이크 버튼을 다시 눌러주세요.');
        return;
      }
      const delay = Math.min(1000 * Math.pow(1.5, restartAttemptsRef.current - 1), 8000);
      setTimeout(() => {
        if (!shouldListenRef.current) return;
        try {
          recognition.start();
        } catch {
          // start() throws if already starting — ignore
        }
      }, delay);
    };

    return recognition;
  }, [handleResult, handleError]);

  const start = useCallback(() => {
    if (Platform.OS !== 'web') {
      setError('이 기기에서는 음성 인식을 지원하지 않습니다.');
      setState('error');
      return;
    }

    const SR = getSpeechRecognition();
    if (!SR) {
      setError('이 브라우저에서는 음성 인식을 지원하지 않습니다.');
      setState('error');
      return;
    }

    setError(null);
    setPartialTranscript('');
    shouldListenRef.current = true;
    restartAttemptsRef.current = 0;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
    }

    recognitionRef.current = createRecognition();
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.start();
      setState('listening');
    } catch {
      try {
        const rec = recognitionRef.current;
        if (rec) {
          rec.onend = null;
          rec.abort();
        }
        const newRec = createRecognition();
        if (!newRec) throw new Error('no recognition');
        recognitionRef.current = newRec;
        newRec.start();
        setState('listening');
      } catch {
        setError('음성 인식을 시작하지 못했습니다.');
        setState('error');
      }
    }
  }, [createRecognition]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setState('idle');
    setPartialTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  return { state, error, partialTranscript, start, stop };
}
