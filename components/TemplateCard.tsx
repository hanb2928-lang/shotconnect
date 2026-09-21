import { forwardRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Pencil, Check } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import type { StickerStyle } from '@/components/StickerLink';
import type { TemplateData, PlatformKey, PlatformVariant, CustomReview } from '@/types/database';



export type TextPosition = 'top' | 'center' | 'bottom';

export const TEXT_POSITIONS: { label: string; value: TextPosition }[] = [
  { label: '상단', value: 'top' },
  { label: '중앙', value: 'center' },
  { label: '하단', value: 'bottom' },
];

interface TemplateCardProps {
  imageUrl: string;
  templateData: TemplateData | null | undefined;
  title: string;
  affiliatePlatforms?: string[];
  platform?: PlatformKey;
  customReview?: CustomReview | null;
  shortUrl?: string;
  stickerPosition?: StickerPosition;
  stickerStyle?: StickerStyle;
  stickerSize?: number;
  overlayOpacity?: number;
  textPosition?: TextPosition;
  onHookChange?: (hook: string) => void;
  cleanMode?: boolean;
}

type StickerPosition = 'top-left' | 'top-right';

export type { StickerPosition };

export const STICKER_POSITIONS: { label: string; value: StickerPosition }[] = [
  { label: '좌상단', value: 'top-left' },
  { label: '우상단', value: 'top-right' },
];

function EditableHook({
  hook,
  editing,
  hookText,
  style,
  numberOfLines,
  onStartEdit,
  onChangeText,
  onConfirm,
}: {
  hook: string;
  editing: boolean;
  hookText: string;
  style: any;
  numberOfLines: number;
  onStartEdit: () => void;
  onChangeText: (t: string) => void;
  onConfirm: () => void;
}) {
  if (editing) {
    return (
      <View style={styles.editableHookWrap}>
        <TextInput
          style={[style, styles.hookInput]}
          value={hookText}
          onChangeText={onChangeText}
          multiline
          autoFocus
          numberOfLines={numberOfLines}
        />
        <TouchableOpacity style={styles.hookConfirmBtn} onPress={onConfirm} activeOpacity={0.7}>
          <Check size={14} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={onStartEdit} activeOpacity={0.8} style={styles.hookTouchArea}>
      <Text style={style} numberOfLines={numberOfLines}>{hook}</Text>
      <View style={styles.hookPencilHint}>
        <Pencil size={10} color="rgba(255,255,255,0.5)" strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}

function getVariant(td: TemplateData | null | undefined, platform: PlatformKey): PlatformVariant {
  if (td) {
    const variants = td.platformVariants;
    if (variants && variants[platform]) return variants[platform];
  }
  return {
    hook: td?.hook || td?.oneLiner || '이 아이템, 주목해!',
    caption: td?.caption || '',
    hashtags: td?.hashtags || [],
    cardStyle: 'bold',
  };
}

const HOOK_FONT_SIZE = 26;

export const TemplateCard = forwardRef<View, TemplateCardProps>(
  ({ imageUrl, templateData, title, platform = 'shortform', shortUrl = '', overlayOpacity, textPosition = 'bottom', onHookChange, cleanMode = false }, ref) => {
    const variant = getVariant(templateData, platform);
    const [editingHook, setEditingHook] = useState(false);
    const [hookText, setHookText] = useState(variant.hook);
    const hook = editingHook ? hookText : variant.hook;
    const [imgAspect, setImgAspect] = useState<number | null>(null);

    useEffect(() => {
      if (!imageUrl) return;
      let cancelled = false;
      if (Platform.OS === 'web') {
        const img = new (global as any).Image();
        img.onload = () => { if (!cancelled) setImgAspect(img.naturalWidth / img.naturalHeight); };
        img.onerror = () => { if (!cancelled) setImgAspect(null); };
        img.src = imageUrl;
        return () => { cancelled = true; img.onload = null; img.onerror = null; };
      } else {
        Image.getSize(
          imageUrl,
          (w, h) => { if (!cancelled) setImgAspect(w / h); },
          () => { if (!cancelled) setImgAspect(null); },
        );
        return () => { cancelled = true; };
      }
    }, [imageUrl]);

    const overlayBase = cleanMode ? 0 : 0.35;
    const effectiveOpacity = overlayOpacity != null ? overlayOpacity : overlayBase;
    const overlayColor = `rgba(10, 15, 30, ${effectiveOpacity})`;

    const contentJustify = textPosition === 'top' ? 'flex-start' : textPosition === 'center' ? 'center' : 'flex-end';

    return (
      <View
        ref={ref}
        style={styles.cardBase}
        collapsable={false}
      >
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode={imgAspect ? 'cover' : 'contain'} />
        <View style={[styles.overlay, { backgroundColor: overlayColor }]} />

        <View style={[styles.content, { justifyContent: contentJustify, paddingTop: textPosition === 'top' ? theme.spacing.lg : 0 }]}>
          {!cleanMode && (
            <>
              <EditableHook
                hook={hook}
                editing={editingHook}
                hookText={hookText}
                style={styles.hookText}
                numberOfLines={3}
                onStartEdit={() => { setHookText(variant.hook); setEditingHook(true); }}
                onChangeText={setHookText}
                onConfirm={() => { setEditingHook(false); onHookChange?.(hookText); }}
              />
              {editingHook && <Text style={styles.hookEditHint}>터치해서 문구 수정</Text>}
            </>
          )}
        </View>
      </View>
    );
  },
);

TemplateCard.displayName = 'TemplateCard';

const styles = StyleSheet.create({
  cardBase: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.surface,
    position: 'relative',
    ...theme.shadows.elevated,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 30, 0.35)',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: theme.spacing.lg,
  },
  hookText: {
    fontSize: HOOK_FONT_SIZE,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
    lineHeight: 34,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  hookEditHint: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  editableHookWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  hookInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  hookConfirmBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  hookTouchArea: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  hookPencilHint: {
    marginTop: 4,
    opacity: 0.6,
  },
});
