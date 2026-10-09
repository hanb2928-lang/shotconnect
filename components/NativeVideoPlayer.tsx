import { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, Platform, AppState, type AppStateStatus } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

interface NativeVideoPlayerProps {
  videoUri: string;
  isPlaying: boolean;
  ttsUrl?: string | null;
  onLoad?: () => void;
  onError?: () => void;
  style?: object;
}

export function NativeVideoPlayer({ videoUri, isPlaying, ttsUrl, onLoad, onError, style }: NativeVideoPlayerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reactivationKey, setReactivationKey] = useState(0);
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const isPlayingRef = useRef(isPlaying);
  onLoadRef.current = onLoad;
  onErrorRef.current = onError;
  isPlayingRef.current = isPlaying;

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const ttsPlayer = useVideoPlayer(ttsUrl ?? '', (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', (event: { status: string }) => {
      if (event.status === 'readyToPlay') {
        setStatus('ready');
        onLoadRef.current?.();
      } else if (event.status === 'error') {
        setStatus('error');
        onErrorRef.current?.();
      }
    }) as any;
    return () => { sub?.remove?.(); };
  }, [player]);

  useEffect(() => {
    if (isPlaying) {
      player.play();
      if (ttsUrl) {
        ttsPlayer.play();
      }
    } else {
      player.pause();
      if (ttsUrl) {
        ttsPlayer.pause();
      }
    }
  }, [isPlaying, player, ttsPlayer, ttsUrl, reactivationKey]);

  // Native crash defense: when the app goes to background, the OS reclaims
  // the underlying media player resources. The JS player reference survives
  // but becomes a zombie — calling play() on it after foreground return
  // triggers a native crash. We detect the background→foreground transition
  // and force re-initialization via a reactivationKey bump, which re-runs
  // the play/pause effect. We also guard play() calls with a try/catch so
  // a stale player fails gracefully instead of crashing.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        try { player.pause(); } catch { /* stale player */ }
        try { ttsPlayer.pause(); } catch { /* stale player */ }
        setStatus('loading');
      } else if (nextState === 'active') {
        // Defer reactivation by one frame so the native view has time to
        // re-attach before we call play() on the reinitialized player.
        requestAnimationFrame(() => {
          setReactivationKey((k) => k + 1);
        });
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [player, ttsPlayer]);

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
