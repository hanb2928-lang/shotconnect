/**
 * High-performance cached image component backed by expo-image.
 *
 * Uses native caching layers (Glide on Android, SDWebImage on iOS)
 * for memory + disk caching, preventing frame drops during scroll.
 * Falls back to react-native Image on web since expo-image's web
 * implementation doesn't add native caching benefits.
 */

import { Platform, Image as RNImage, type ImageStyle, type StyleProp } from 'react-native';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';
import { memo } from 'react';

export interface CachedImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  /** Optional blurhash placeholder shown while the image loads. */
  placeholder?: string;
  /** Transition duration in ms for the fade-in effect. 0 disables. */
  transition?: number;
  /** Cache policy. 'memory-disk' is the default for maximum hit rate. */
  cachePolicy?: 'memory-disk' | 'memory' | 'none';
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  onLoad?: () => void;
}

function CachedImageImpl({
  uri,
  style,
  resizeMode = 'cover',
  placeholder,
  transition = 200,
  cachePolicy = 'memory-disk',
  testID,
  accessible,
  accessibilityLabel,
  onLoad,
}: CachedImageProps) {
  // On web, expo-image doesn't provide native caching benefits beyond
  // what the browser already does. Use the standard RN Image to avoid
  // the extra bundle weight and maintain consistent web behavior.
  if (Platform.OS === 'web') {
    const rnResizeMode = resizeMode === 'fill' || resizeMode === 'none' ? 'cover' : resizeMode;
    return (
      <RNImage
        source={{ uri }}
        style={style}
        resizeMode={rnResizeMode as 'cover' | 'contain' | 'stretch'}
        testID={testID}
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        onLoad={onLoad}
      />
    );
  }

  const contentFit: ImageContentFit =
    resizeMode === 'scale-down' ? 'none' : (resizeMode as ImageContentFit);

  return (
    <ExpoImage
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      placeholder={placeholder ? { blurhash: placeholder } : undefined}
      transition={transition}
      cachePolicy={cachePolicy}
      testID={testID}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      onLoad={onLoad ? (e: any) => { if (e?.nativeEvent) onLoad(); } : undefined}
    />
  );
}

export const CachedImage = memo(CachedImageImpl);
