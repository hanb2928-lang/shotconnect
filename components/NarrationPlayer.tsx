import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, ViewStyle } from 'react-native';
import { Volume2, Play, Pause, Loader2, AlertCircle, VolumeX } from 'lucide-react-native';
import { theme } from '@/lib/theme';

interface NarrationPlayerProps {
  ttsUrl: string | null;
  ttsLoading: boolean;
  narrationText: string;
  onRegenerate?: () => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export function NarrationPlayer({ ttsUrl, ttsLoading, narrationText, onRegenerate, onPlayStateChange }: NarrationPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [needsTouchRetry, setNeedsTouchRetry] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fallbackUtterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onEndedCallbackRef = useRef<(() => void) | null>(null);

  const notifyPlayState = useCallback((playing: boolean) => {
    setIsPlaying(playing);
    onPlayStateChange?.(playing);
  }, [onPlayStateChange]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch { /* ignore */ }
        sourceNodeRef.current = null;
      }
      if (masterGainRef.current && audioCtxRef.current) {
        try { masterGainRef.current.disconnect(); } catch { /* ignore */ }
        masterGainRef.current = null;
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* ignore */ }
        audioCtxRef.current = null;
      }
      if (fallbackUtterRef.current && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        fallbackUtterRef.current = null;
      }
    };
  }, []);

  const speakWithWebSpeech = useCallback((text: string): boolean => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.speechSynthesis) {
      return false;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    utter.onend = () => {
      notifyPlayState(false);
      onEndedCallbackRef.current?.();
    };
    utter.onerror = () => {
      notifyPlayState(false);
      setPlayError('폴백 음성 재생에 실패했습니다');
    };
    fallbackUtterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setUsingFallback(true);
    notifyPlayState(true);
    return true;
  }, [notifyPlayState]);

  const unlockAudioContext = useCallback((): AudioContext | null => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterGainRef.current = gain;
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    try {
      const pulse = ctx.createOscillator();
      const pulseGain = ctx.createGain();
      pulseGain.gain.value = 0.0001;
      pulse.connect(pulseGain);
      pulseGain.connect(ctx.destination);
      pulse.start();
      pulse.stop(ctx.currentTime + 0.01);
    } catch { /* ignore */ }
    return ctx;
  }, []);

  const playWhenReady = useCallback((audio: HTMLAudioElement): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('timeout')); }, 10000);
      const startPlayback = () => {
        clearTimeout(timeout);
        audio.removeEventListener('canplaythrough', startPlayback);
        audio.removeEventListener('loadeddata', startPlayback);
        audio.play().then(resolve).catch(reject);
      };
      if (audio.readyState >= 3) {
        clearTimeout(timeout);
        audio.play().then(resolve).catch(reject);
      } else {
        audio.addEventListener('canplaythrough', startPlayback);
        audio.addEventListener('loadeddata', startPlayback);
        audio.load();
      }
    });
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (!ttsUrl) return;
    setPlayError(null);
    setNeedsTouchRetry(false);
    if (Platform.OS !== 'web') { setIsLoading(false); return; }
    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      if (usingFallback && typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      notifyPlayState(false);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setUsingFallback(false);
    setIsLoading(true);
    try {
      if (!ttsUrl) throw new Error('No TTS URL provided');
      const ctx = unlockAudioContext();
      const audio = new Audio();
      if (!audio) throw new Error('Failed to create Audio element');
      audio.src = ttsUrl;
      audio.volume = 1.0;
      audio.muted = false;
      audio.loop = false;
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audioRef.current = audio;
      if (!audio.src) throw new Error('audio.src assignment failed');
      audio.onended = () => notifyPlayState(false);
      audio.onpause = () => {
        if (audioRef.current === audio && !audio.ended) notifyPlayState(false);
      };
      audio.onerror = () => { setIsLoading(false); notifyPlayState(false); setPlayError('오디오 재생에 실패했습니다'); };
      if (ctx && masterGainRef.current) {
        try {
          if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch { /* ignore */ } }
          const source = ctx.createMediaElementSource(audio);
          source.connect(masterGainRef.current);
          sourceNodeRef.current = source;
        } catch { /* fallback to plain playback */ }
      }
      await playWhenReady(audio);
      setIsLoading(false);
      notifyPlayState(true);
    } catch (err) {
      setIsLoading(false);
      notifyPlayState(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (narrationText && narrationText.trim().length > 0) {
        const fallbackOk = speakWithWebSpeech(narrationText);
        if (fallbackOk) { setPlayError(null); setNeedsTouchRetry(false); return; }
      }
      if (errMsg.includes('NotAllowed') || errMsg.includes('not allowed') || errMsg.includes('user gesture') || errMsg.includes('NotAllowedError')) {
        try {
          if (audioRef.current) {
            audioRef.current.muted = true;
            await audioRef.current.play();
            notifyPlayState(true);
            setNeedsTouchRetry(true);
            setPlayError('브라우저 정책으로 인해 일시적으로 무음 재생됩니다. 다시 한 번 재생 버튼을 눌러주세요.');
          }
        } catch { setPlayError('재생을 시작할 수 없습니다. 다시 한 번 재생 버튼을 눌러주세요.'); }
      } else if (errMsg.includes('timeout')) {
        setPlayError('오디오 로딩 시간이 초과되었습니다. 다시 시도해주세요.');
      } else {
        setPlayError('재생을 시작할 수 없습니다');
      }
    }
  }, [ttsUrl, isPlaying, usingFallback, narrationText, notifyPlayState, unlockAudioContext, playWhenReady, speakWithWebSpeech]);

  const handleTouchRetry = useCallback(async () => {
    if (!audioRef.current) return;
    setNeedsTouchRetry(false);
    setPlayError(null);
    const ctx = unlockAudioContext();
    if (ctx && ctx.state === 'suspended') await ctx.resume().catch(() => {});
    audioRef.current.muted = false;
    audioRef.current.volume = 1.0;
    if (audioRef.current.paused) {
      try { await audioRef.current.play(); notifyPlayState(true); }
      catch { setPlayError('재생을 시작할 수 없습니다'); }
    } else { notifyPlayState(true); }
  }, [unlockAudioContext, notifyPlayState]);

  const handlePlayPress = useCallback(() => {
    if (needsTouchRetry) handleTouchRetry();
    else handlePlayPause();
  }, [needsTouchRetry, handleTouchRetry, handlePlayPause]);

  const hasAudio = !!ttsUrl;

  // Slim toggle state — before TTS is ready
  if (!hasAudio) {
    return (
      <View style={styles.slimRow}>
        <View style={styles.slimLeft}>
          <View style={styles.slimIconWrap}>
            <Volume2 size={13} color={theme.colors.primary[400]} strokeWidth={2} />
          </View>
          <Text style={styles.slimLabel}>AI 나레이션</Text>
        </View>
        {ttsLoading ? (
          <View style={styles.slimStatusWrap}>
            <Loader2 size={12} color={theme.colors.primary[300]} strokeWidth={2.5} />
            <Text style={styles.slimStatusGenerating}>생성 중</Text>
          </View>
        ) : (
          <Text style={styles.slimStatusPending}>대기</Text>
        )}
      </View>
    );
  }

  // Compact player — TTS is ready
  return (
    <View style={styles.compactContainer}>
      <View style={styles.compactHeader}>
        <View style={styles.compactLeft}>
          <View style={styles.slimIconWrap}>
            <Volume2 size={13} color={theme.colors.primary[400]} strokeWidth={2} />
          </View>
          <Text style={styles.compactLabel}>AI 나레이션</Text>
          <View style={styles.readyDot} />
        </View>
        <TouchableOpacity
          style={[styles.compactPlayBtn, isLoading && styles.compactPlayBtnDisabled]}
          onPress={handlePlayPress}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator size={14} color="#fff" />
          ) : isPlaying && !needsTouchRetry ? (
            <Pause size={14} color="#fff" strokeWidth={2.5} />
          ) : needsTouchRetry ? (
            <VolumeX size={14} color={theme.colors.warning[400]} strokeWidth={2.5} />
          ) : (
            <Play size={14} color="#fff" strokeWidth={2.5} fill="#fff" />
          )}
          <Text style={styles.compactPlayText}>
            {isLoading ? '로딩' : isPlaying && !needsTouchRetry ? '정지' : needsTouchRetry ? '소리' : '재생'}
          </Text>
        </TouchableOpacity>
      </View>

      {playError && (
        <View style={styles.compactErrorRow}>
          <AlertCircle size={11} color={theme.colors.error[400]} strokeWidth={2} />
          <Text style={styles.compactErrorText} numberOfLines={2}>{playError}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  } as ViewStyle,
  slimLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slimIconWrap: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary[500] + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slimLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  slimStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slimStatusGenerating: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.primary[300],
  },
  slimStatusPending: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
  },
  compactContainer: {
    backgroundColor: theme.colors.dark.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  } as ViewStyle,
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success[400],
  },
  compactPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.primary[500],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
  },
  compactPlayBtnDisabled: {
    opacity: 0.6,
  },
  compactPlayText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  compactErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  compactErrorText: {
    flex: 1,
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
});
