import { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
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
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  onLoadRef.current = onLoad;
  onErrorRef.current = onError;

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
  }, [isPlaying, player, ttsPlayer, ttsUrl]);

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
