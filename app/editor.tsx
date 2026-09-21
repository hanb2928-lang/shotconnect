import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Check,
  X,
  Trash2,
  Undo2,
  Instagram,
  AtSign,
  Pin,
  Music,
  Facebook,
  Plus,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeTop } from '@/hooks/useSafeTop';
import {
  getImageSize,
  removeBackground,
  uploadEditedImage,
  saveEditedScan,
  readUriAsBase64,
  compressImage,
  compositeOnBackground,
} from '@/lib/imageEdit';
import { BackgroundPicker, type BackgroundStyle } from '@/components/BackgroundPicker';
import { BgRemoveEditor } from '@/components/BgRemoveEditor';
import { removeBackgroundOnDevice } from '@/lib/removeBgOnDevice';
import { cleanBase64 } from '@/lib/base64';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import type { Scan, CustomAffiliateLink } from '@/types/database';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type EditMode = 'none' | 'text' | 'sticker';

type PlatformKey = 'instagram' | 'threads' | 'pinterest' | 'tiktok' | 'facebook';

interface PlatformOption {
  key: PlatformKey;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  { key: 'instagram', label: '인스타그램', icon: <Instagram size={20} color="#fff" strokeWidth={2} />, color: '#E1306C' },
  { key: 'threads', label: '스레드', icon: <AtSign size={20} color="#fff" strokeWidth={2} />, color: '#000000' },
  { key: 'pinterest', label: '핀터레스트', icon: <Pin size={20} color="#fff" strokeWidth={2} />, color: '#E60023' },
  { key: 'tiktok', label: '틱톡', icon: <Music size={20} color="#fff" strokeWidth={2} />, color: '#000000' },
  { key: 'facebook', label: '페이스북', icon: <Facebook size={20} color="#fff" strokeWidth={2} />, color: '#1877F2' },
];

interface LinkEntry {
  id: string;
  platform: PlatformKey;
  label: string;
  url: string;
}

interface TextOverlay {
  id: string;
  text: string;
  color: string;
  fontSize: number;
}

const STICKER_EMOJIS = ['🔥', '✨', '💯', '👍', '❤️', '🛒', '💰', '🚀', '😍', '⭐'];

const STICKER_DISPLAY_SIZE = 44;
const STICKER_RENDER_SIZE = 88;

const ANGLE_LABELS = ['정면', '좌측', '우측', '후면', '상부'];

function emojiToDataUrl(emoji: string, size: number): string {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.font = `${Math.round(size * 0.8)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2);
  return canvas.toDataURL('image/png');
}

async function saveImageToGallery(base64: string, mimeType: string, fileName: string): Promise<void> {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';

  if (Platform.OS === 'web') {
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${fileName}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    return;
  }

  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) throw new Error('사진 보관함 접근 권한이 필요합니다');
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('임시 저장 공간을 사용할 수 없습니다');
  const fileUri = `${directory}${fileName}.${extension}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await MediaLibrary.createAssetAsync(fileUri);
}


export default function EditorScreen() {
  const router = useRouter();
  const { id, customPrompt } = useLocalSearchParams<{ id: string; customPrompt?: string }>();
  const insets = useSafeAreaInsets();
  const safeTop = useSafeTop();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUri, setImageUri] = useState<string>('');
  const [originalUri, setOriginalUri] = useState<string>('');
  const [allImages, setAllImages] = useState<string[]>([]);
  const [selectedThumbIndex, setSelectedThumbIndex] = useState(0);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [bgPickerVisible, setBgPickerVisible] = useState(false);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgEditorVisible, setBgEditorVisible] = useState(false);
  const [bgEditorDataUrl, setBgEditorDataUrl] = useState('');
  const [bgEditorMask, setBgEditorMask] = useState<Uint8ClampedArray | null>(null);
  const undoStack = useRef<string[]>([]);
  const imageWrapRef = useRef<View | null>(null);

  // Text overlay state
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [tempText, setTempText] = useState('');
  const [tempColor] = useState('#ffffff');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Sticker overlay state
  const [stickers, setStickers] = useState<string[]>([]);
  const [stickerDataUrls, setStickerDataUrls] = useState<Record<string, string>>({});
  const [stickerModalVisible, setStickerModalVisible] = useState(false);
  const [previewArea, setPreviewArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Platform & link state
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>([]);
  const [linkEntries, setLinkEntries] = useState<LinkEntry[]>([]);
  const [linkPanelVisible, setLinkPanelVisible] = useState(true);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkPlatform, setNewLinkPlatform] = useState<PlatformKey>('instagram');

  const maxDisplayWidth = previewArea.w > 0 ? previewArea.w - 32 : screenWidth - 32;
  const maxDisplayHeight = previewArea.h > 0 ? Math.min(previewArea.h - 32, screenHeight * 0.35) : screenHeight * 0.35;
  const aspect = imageSize.width && imageSize.height ? imageSize.width / imageSize.height : 1;
  const rawHeight = maxDisplayWidth / aspect;
  const imageDisplayWidth = rawHeight > maxDisplayHeight ? maxDisplayHeight * aspect : maxDisplayWidth;
  const imageDisplayHeight = imageDisplayWidth / aspect;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('scans')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }
        if (!data) {
          setError('스캔을 찾을 수 없습니다');
          setLoading(false);
          return;
        }

        const scanData = data as Scan;
        setScan(scanData);

        if (scanData.custom_affiliate_links && scanData.custom_affiliate_links.length > 0) {
          const loaded = scanData.custom_affiliate_links.map((l, i) => ({
            id: `link-${i}-${Date.now()}`,
            platform: (l.platform as PlatformKey) || 'instagram',
            label: l.label || '',
            url: l.url || '',
          }));
          setLinkEntries(loaded);
          const platforms = [...new Set(loaded.map((l) => l.platform))] as PlatformKey[];
          setSelectedPlatforms(platforms);
        }
        const rawUri = scanData.edited_image_url || scanData.image_url;

        let uri = rawUri;
        if (Platform.OS === 'web' && !rawUri.startsWith('data:')) {
          try {
            const res = await fetch(rawUri, { mode: 'cors' });
            const blob = await res.blob();
            uri = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error('이미지를 불러올 수 없습니다'));
              reader.readAsDataURL(blob);
            });
          } catch {
            // fall back to raw URL
          }
        }

        setImageUri(uri);
        setOriginalUri(scanData.image_url);
        // Build all-images list: primary + additional
        const additional = (scanData.additional_image_urls || []).filter(Boolean) as string[];
        setAllImages([scanData.image_url, ...additional]);
        try {
          const size = await getImageSize(uri);
          setImageSize(size);
        } catch {
          // size detection will retry — use a safe default so layout doesn't jump
          setImageSize({ width: imageDisplayWidth, height: imageDisplayHeight });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '데이터를 불러올 수 없습니다');
      } finally {
        // Small delay lets the Image component begin decoding before we reveal,
        // avoiding a flash of empty layout on native.
        setLoading(false);
      }
    })();
  }, [id]);

  // Reset is handled inline; no separate imageLoaded flag needed.

  const pushUndo = useCallback((uri: string) => {
    undoStack.current.push(uri);
    setCanUndo(undoStack.current.length > 0);
  }, []);

  const updateImage = useCallback((newUri: string) => {
    pushUndo(imageUri);
    setImageUri(newUri);
    setEditMode('none');
  }, [imageUri, pushUndo]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    setImageUri(prev);
    setCanUndo(undoStack.current.length > 0);
  }, []);

  const handleQuickRemoveBg = useCallback(async () => {
    if (processing) return;
    setProcessing(true);
    setError(null);
    setProgressText('온디바이스 배경 제거 중...');
    setEditMode('none');
    try {
      let dataUrl: string;
      if (Platform.OS === 'web') {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const reader = new FileReader();
        dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('이미지를 변환할 수 없습니다'));
          reader.readAsDataURL(blob);
        });
      } else {
        const { base64, mimeType: detectedMime } = await readUriAsBase64(imageUri);
        dataUrl = `data:${detectedMime};base64,${base64}`;
      }

      const result = await removeBackgroundOnDevice(dataUrl);
      if (!result.ok) throw new Error(result.error);

      const base64 = cleanBase64(result.dataUrl);
      const newUri = await uploadEditedImage(base64, 'image/png');
      updateImage(newUri);
      setBgPickerVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 제거 실패');
    }
    setProcessing(false);
  }, [imageUri, processing, updateImage]);

  const handleRemoveBg = useCallback(async () => {
    if (processing) return;
    setProcessing(true);
    setError(null);
    setProgressText('AI 1차 배경 제거 중...');
    setEditMode('none');
    try {
      let dataUrl: string;
      if (Platform.OS === 'web') {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const reader = new FileReader();
        dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('이미지를 변환할 수 없습니다'));
          reader.readAsDataURL(blob);
        });
      } else {
        const { base64, mimeType: detectedMime } = await readUriAsBase64(imageUri);
        dataUrl = `data:${detectedMime};base64,${base64}`;
      }

      const mimeType = dataUrl.match(/^data:(image\/\w+);/)?.[1] || 'image/png';
      const editedDataUrl = await removeBackground(dataUrl, mimeType);

      // Get the edited image as a data URL for the editor
      let editorDataUrl: string;
      if (editedDataUrl.startsWith('http')) {
        // Fetch the uploaded image to get it as data URL for canvas
        if (Platform.OS === 'web') {
          const resp = await fetch(editedDataUrl);
          const blob = await resp.blob();
          editorDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('이미지를 불러올 수 없습니다'));
            reader.readAsDataURL(blob);
          });
        } else {
          editorDataUrl = editedDataUrl;
        }
      } else {
        editorDataUrl = editedDataUrl;
      }

      // Get image dimensions for the editor
      let editorImgW = imageDisplayWidth;
      let editorImgH = imageDisplayHeight;
      try {
        const size = await getImageSize(editorDataUrl);
        editorImgW = size.width;
        editorImgH = size.height;
      } catch {
        // use defaults
      }

      // On web, extract the alpha channel as the initial mask
      let initialMask: Uint8ClampedArray | null = null;
      if (Platform.OS === 'web' && editorDataUrl.startsWith('data:')) {
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new (global as unknown as { Image: typeof HTMLImageElement }).Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('img load'));
            el.src = editorDataUrl;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            initialMask = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data;
            editorImgW = img.naturalWidth;
            editorImgH = img.naturalHeight;
          }
        } catch {
          // skip mask extraction
        }
      }

      setBgEditorDataUrl(editorDataUrl);
      setBgEditorMask(initialMask);
      setBgEditorVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 제거 실패');
    }
    setProcessing(false);
  }, [imageUri, processing, updateImage, imageDisplayWidth, imageDisplayHeight]);

  const handleBgEditorConfirm = useCallback(async (resultDataUrl: string) => {
    setBgEditorVisible(false);
    if (!resultDataUrl) {
      // No user edit — use the AI result as-is (already in bgEditorDataUrl)
      const dataUrl = bgEditorDataUrl;
      try {
        let newUri: string;
        if (dataUrl.startsWith('http')) {
          newUri = dataUrl;
        } else {
          const base64 = cleanBase64(dataUrl);
          newUri = await uploadEditedImage(base64, 'image/png');
        }
        updateImage(newUri);
        setBgPickerVisible(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : '이미지 저장 실패');
      }
      return;
    }

    // User edited the mask — send to server with mask for final processing
    setProcessing(true);
    setProgressText('사용자 편집 적용 중...');
    try {
      const base64 = cleanBase64(resultDataUrl);
      const newUri = await uploadEditedImage(base64, 'image/png');
      updateImage(newUri);
      setBgPickerVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '편집 결과 저장 실패');
    }
    setProcessing(false);
  }, [bgEditorDataUrl, updateImage]);

  const handleBgEditorCancel = useCallback(() => {
    setBgEditorVisible(false);
  }, []);

  const handleBgSelect = useCallback(async (style: BackgroundStyle) => {
    if (bgProcessing) return;
    setBgProcessing(true);
    setError(null);
    try {
      let dataUrl: string;
      if (Platform.OS === 'web') {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const reader = new FileReader();
        dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('이미지를 변환할 수 없습니다'));
          reader.readAsDataURL(blob);
        });
      } else {
        const { base64, mimeType: detectedMime } = await readUriAsBase64(imageUri);
        dataUrl = `data:${detectedMime};base64,${base64}`;
      }

      const compositeDataUrl = await compositeOnBackground(dataUrl, style);
      const compositeBase64 = cleanBase64(compositeDataUrl);
      const newUri = await uploadEditedImage(compositeBase64, 'image/png');
      updateImage(newUri);
      setBgPickerVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 합성 실패');
    }
    setBgProcessing(false);
  }, [imageUri, bgProcessing, updateImage]);

  const handleBgSkip = useCallback(() => {
    setBgPickerVisible(false);
  }, []);

  const handleAddText = useCallback(() => {
    setTempText('');
    setEditingTextId(null);
    setTextModalVisible(true);
  }, []);

  const handleEditText = useCallback((overlay: TextOverlay) => {
    setTempText(overlay.text);
    setEditingTextId(overlay.id);
    setTextModalVisible(true);
  }, []);

  const handleSaveText = useCallback(() => {
    if (!tempText.trim()) {
      setTextModalVisible(false);
      return;
    }
    if (editingTextId) {
      setTextOverlays((prev) =>
        prev.map((o) => (o.id === editingTextId ? { ...o, text: tempText, color: tempColor } : o)),
      );
    } else {
      const newOverlay: TextOverlay = {
        id: `text-${Date.now()}`,
        text: tempText,
        color: '#ffffff',
        fontSize: 24,
      };
      setTextOverlays((prev) => [...prev, newOverlay]);
    }
    setTextModalVisible(false);
    setTempText('');
    setEditingTextId(null);
  }, [tempText, editingTextId]);

  const handleDeleteText = useCallback((textId: string) => {
    setTextOverlays((prev) => prev.filter((o) => o.id !== textId));
  }, []);

  const handleAddSticker = useCallback((emoji: string) => {
    setStickers((prev) => [...prev, emoji]);
    setStickerModalVisible(false);
    // Pre-render emoji to a canvas image so html2canvas captures it on web
    if (Platform.OS === 'web') {
      setStickerDataUrls((prev) => {
        if (prev[emoji]) return prev;
        return { ...prev, [emoji]: emojiToDataUrl(emoji, STICKER_RENDER_SIZE) };
      });
    }
  }, []);

  const handleRemoveLastSticker = useCallback(() => {
    setStickers((prev) => prev.slice(0, -1));
  }, []);

  const performReset = useCallback(() => {
    undoStack.current = [];
    setCanUndo(false);
    setImageUri(originalUri);
    setTextOverlays([]);
    setStickers([]);
  }, [originalUri]);

  const handleReset = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm('편집 내용을 버리고 원본 사진으로 돌아갈까요?')) {
        performReset();
      }
      return;
    }
    Alert.alert('원본으로 복원', '편집 내용을 버리고 원본 사진으로 돌아갈까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '복원',
        style: 'destructive',
        onPress: performReset,
      },
    ]);
  }, [performReset]);

  const handleSave = useCallback(async () => {
    if (!scan || processing) return;
    setProcessing(true);
    setError(null);
    setProgressText('저장 중...');
    try {
      let base64: string;
      let mimeType: string;

      const hasOverlays = textOverlays.length > 0 || stickers.length > 0;

      if (hasOverlays && imageWrapRef.current) {
        const capturedUri = await captureRef(imageWrapRef, {
          format: 'png',
          quality: 1,
          fileName: `${scan.id}-edited.png`,
        });
        const result = await readUriAsBase64(capturedUri);
        base64 = result.base64;
        mimeType = result.mimeType;
      } else if (Platform.OS === 'web') {
        mimeType = imageUri.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';
        base64 = cleanBase64(imageUri);
      } else {
        const compressedUri = await compressImage(imageUri);
        const result = await readUriAsBase64(compressedUri);
        base64 = result.base64;
        mimeType = result.mimeType;
      }
      await saveImageToGallery(base64, mimeType, `${scan.id}-edited`);

      try {
        const uploadedUrl = await uploadEditedImage(base64, mimeType);
        await saveEditedScan(scan.id, uploadedUrl);

        const customLinks: CustomAffiliateLink[] = linkEntries
          .filter((l) => l.url.trim())
          .map((l, i) => ({
            platform: l.platform,
            label: l.label,
            url: l.url,
            productIndex: i,
          }));
        if (customLinks.length > 0) {
          await supabase.from('scans').update({ custom_affiliate_links: customLinks }).eq('id', scan.id);
        }
      } catch {
        // Gallery export is the primary save action.
      }
      setProcessing(false);
      router.replace({ pathname: '/result/[id]', params: { id: scan.id, customPrompt: customPrompt || undefined } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
      setProcessing(false);
    }
  }, [scan, imageUri, processing, router, textOverlays, stickers, linkEntries, customPrompt]);

  if (error && !scan && !loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{error}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={theme.colors.dark.text} strokeWidth={2} />
          <Text style={styles.backButtonText}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? safeTop : 0}
    >
    <View style={styles.container}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: safeTop + 12 }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.dark.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>입체컷 오토</Text>
        <View style={styles.topActions}>
          {canUndo && (
            <TouchableOpacity style={styles.iconButton} onPress={handleUndo} activeOpacity={0.7}>
              <Undo2 size={18} color={theme.colors.dark.text} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconButton} onPress={handleReset} activeOpacity={0.7}>
            <Trash2 size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Section 1: Thumbnail carousel */}
      {allImages.length > 0 && (
        <View style={styles.carouselSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
          >
            {allImages.map((uri, i) => (
              <TouchableOpacity
                key={`thumb-${i}`}
                style={[
                  styles.thumbnail,
                  selectedThumbIndex === i && styles.thumbnailActive,
                ]}
                onPress={() => {
                  setSelectedThumbIndex(i);
                  setImageUri(uri);
                }}
                activeOpacity={0.8}
              >
                <Image source={{ uri }} style={styles.thumbnailImg} resizeMode="cover" />
                <View style={styles.thumbnailLabelWrap}>
                  <Text style={styles.thumbnailLabel}>{ANGLE_LABELS[i] || `사진 ${i + 1}`}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Section 2: Main preview with overlays */}
      <View style={styles.previewWrap} onLayout={(e) => setPreviewArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <View ref={imageWrapRef} style={[styles.imageWrap, { width: imageDisplayWidth, height: imageDisplayHeight }]}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
              fadeDuration={Platform.OS === 'web' ? 0 : 300}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <View style={styles.placeholderSpinner} />
            </View>
          )}

          {textOverlays.map((overlay) => (
            <TouchableOpacity
              key={overlay.id}
              style={[styles.textOverlay, { maxWidth: imageDisplayWidth * 0.8 }]}
              onPress={() => handleEditText(overlay)}
              onLongPress={() => handleDeleteText(overlay.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.overlayText, { color: overlay.color, fontSize: overlay.fontSize }]}
                numberOfLines={3}
              >
                {overlay.text}
              </Text>
            </TouchableOpacity>
          ))}

          {stickers.map((emoji, i) => {
            const maxLeft = Math.max(0, imageDisplayWidth - STICKER_DISPLAY_SIZE - 10);
            const maxTop = Math.max(0, imageDisplayHeight - STICKER_DISPLAY_SIZE - 10);
            const left = Math.min(20 + (i % 3) * 80, maxLeft);
            const top = Math.min(20 + Math.floor(i / 3) * 80, maxTop);
            return (
              <View
                key={`sticker-${i}`}
                style={[styles.stickerOverlay, { left, top }]}
              >
                {Platform.OS === 'web' && stickerDataUrls[emoji] ? (
                  <Image
                    source={{ uri: stickerDataUrls[emoji] }}
                    style={{ width: STICKER_DISPLAY_SIZE, height: STICKER_DISPLAY_SIZE }}
                  />
                ) : (
                  <Text style={styles.stickerText}>{emoji}</Text>
                )}
              </View>
            );
          })}
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <X size={16} color={theme.colors.error[400]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Section 3: Platform chips — horizontal scroll */}
      <View style={styles.platformSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.platformChipRow}
        >
          {PLATFORM_OPTIONS.map((opt) => {
            const selected = selectedPlatforms.includes(opt.key);
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.platformChip,
                  { borderColor: selected ? opt.color : theme.colors.dark.border },
                  selected && { backgroundColor: opt.color + '22' },
                ]}
                onPress={() => {
                  setSelectedPlatforms((prev) =>
                    prev.includes(opt.key)
                      ? prev.filter((k) => k !== opt.key)
                      : [...prev, opt.key],
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.platformChipIcon, { backgroundColor: selected ? opt.color : theme.colors.dark.surfaceLight }]}>
                  {opt.icon}
                </View>
                <Text
                  style={[
                    styles.platformChipLabel,
                    { color: selected ? theme.colors.dark.text : theme.colors.dark.textDim },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Section 4: Collapsible link panel */}
      <View style={styles.linkPanelContainer}>
        <TouchableOpacity
          style={styles.linkPanelHeader}
          onPress={() => setLinkPanelVisible((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.linkPanelHeaderLeft}>
            <LinkIcon size={18} color={theme.colors.primary[400]} strokeWidth={2} />
            <Text style={styles.linkPanelTitle}>맞춤 링크</Text>
            {linkEntries.length > 0 && (
              <View style={styles.linkCountBadge}>
                <Text style={styles.linkCountText}>{linkEntries.length}</Text>
              </View>
            )}
          </View>
          {linkPanelVisible ? (
            <ChevronDown size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
          ) : (
            <ChevronUp size={20} color={theme.colors.dark.textDim} strokeWidth={2} />
          )}
        </TouchableOpacity>

        {linkPanelVisible && (
          <ScrollView style={styles.linkPanelScroll} nestedScrollEnabled>
            {/* Link input row */}
            <View style={styles.linkInputRow}>
              <TouchableOpacity
                style={styles.linkPlatformPickerBtn}
                onPress={() => setNewLinkPlatform(
                  PLATFORM_OPTIONS[(PLATFORM_OPTIONS.findIndex((p) => p.key === newLinkPlatform) + 1) % PLATFORM_OPTIONS.length].key,
                )}
                activeOpacity={0.7}
              >
                {(() => {
                  const opt = PLATFORM_OPTIONS.find((p) => p.key === newLinkPlatform);
                  return (
                    <>
                      <View style={[styles.linkPlatformDot, { backgroundColor: opt?.color || theme.colors.dark.surfaceLight }]}>
                        {opt?.icon}
                      </View>
                      <Text style={styles.linkPlatformPickerLabel}>{opt?.label}</Text>
                    </>
                  );
                })()}
              </TouchableOpacity>
              <TextInput
                style={styles.linkTextInput}
                value={newLinkLabel}
                onChangeText={setNewLinkLabel}
                placeholder="링크 이름 (선택)"
                placeholderTextColor={theme.colors.dark.textFaint}
              />
              <TextInput
                style={styles.linkUrlInput}
                value={newLinkUrl}
                onChangeText={setNewLinkUrl}
                placeholder="https://..."
                placeholderTextColor={theme.colors.dark.textFaint}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.linkAddBtn}
                onPress={() => {
                  if (!newLinkUrl.trim()) return;
                  setLinkEntries((prev) => [
                    ...prev,
                    {
                      id: `link-${Date.now()}`,
                      platform: newLinkPlatform,
                      label: newLinkLabel.trim() || '',
                      url: newLinkUrl.trim(),
                    },
                  ]);
                  setNewLinkLabel('');
                  setNewLinkUrl('');
                  setSelectedPlatforms((prev) =>
                    prev.includes(newLinkPlatform) ? prev : [...prev, newLinkPlatform],
                  );
                }}
                activeOpacity={0.7}
              >
                <Plus size={22} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Saved links list */}
            {linkEntries.length > 0 && (
              <View style={styles.linkList}>
                {linkEntries.map((entry) => {
                  const platformOpt = PLATFORM_OPTIONS.find((p) => p.key === entry.platform);
                  return (
                    <View key={entry.id} style={styles.linkItem}>
                      <View style={[styles.linkItemIcon, { backgroundColor: platformOpt?.color || theme.colors.dark.surfaceLight }]}>
                        {platformOpt?.icon}
                      </View>
                      <View style={styles.linkItemText}>
                        <Text style={styles.linkItemLabel} numberOfLines={1}>
                          {entry.label || platformOpt?.label || '링크'}
                        </Text>
                        <Text style={styles.linkItemUrl} numberOfLines={1}>{entry.url}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.linkItemDelete}
                        onPress={() => setLinkEntries((prev) => prev.filter((l) => l.id !== entry.id))}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={16} color={theme.colors.error[400]} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Section 5: Sticky CTA */}
      <View style={[styles.stickyCtaWrap, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <TouchableOpacity
          style={styles.stickyCtaBtn}
          onPress={handleSave}
          disabled={processing}
          activeOpacity={0.8}
        >
          <Check size={22} color="#fff" strokeWidth={2.5} />
          <Text style={styles.stickyCtaText}>클라우드로 저장</Text>
        </TouchableOpacity>
      </View>

      <BackgroundPicker
        visible={bgPickerVisible}
        onSelect={handleBgSelect}
        onSkip={handleBgSkip}
        processing={bgProcessing}
      />

      <BgRemoveEditor
        visible={bgEditorVisible}
        imageDataUrl={bgEditorDataUrl}
        initialMask={bgEditorMask}
        imageWidth={imageSize.width || imageDisplayWidth}
        imageHeight={imageSize.height || imageDisplayHeight}
        onConfirm={handleBgEditorConfirm}
        onCancel={handleBgEditorCancel}
      />

      {(textOverlays.length > 0 || stickers.length > 0) && editMode === 'none' && (
        <View style={styles.overlaySummary}>
          {textOverlays.length > 0 && (
            <Text style={styles.overlaySummaryText}>텍스트 {textOverlays.length}개</Text>
          )}
          {stickers.length > 0 && (
            <Text style={styles.overlaySummaryText}>스티커 {stickers.length}개</Text>
          )}
          {stickers.length > 0 && (
            <TouchableOpacity onPress={handleRemoveLastSticker} style={styles.removeLastBtn}>
              <X size={14} color={theme.colors.error[400]} strokeWidth={2} />
              <Text style={styles.removeLastText}>마지막 스티커 제거</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <View style={styles.processingSpinner} />
            <Text style={styles.processingTitle}>불러오는 중</Text>
            <Text style={styles.processingSubtext}>편집기를 준비하고 있습니다</Text>
          </View>
        </View>
      )}

      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <View style={styles.processingSpinner} />
            <Text style={styles.processingTitle}>편집 중</Text>
            <Text style={styles.processingSubtext}>{progressText}</Text>
          </View>
        </View>
      )}

      {/* Text Edit Modal */}
      <Modal visible={textModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingTextId ? '텍스트 수정' : '텍스트 추가'}</Text>
            <TextInput
              style={styles.modalInput}
              value={tempText}
              onChangeText={setTempText}
              placeholder="여기에 텍스트 입력"
              placeholderTextColor={theme.colors.dark.textFaint}
              autoFocus
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setTextModalVisible(false); setTempText(''); setEditingTextId(null); }}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveText}>
                <Text style={styles.modalSaveText}>{editingTextId ? '수정' : '추가'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sticker Picker Modal */}
      <Modal visible={stickerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.stickerModalCard}>
            <Text style={styles.modalTitle}>스티커 선택</Text>
            <View style={styles.stickerGrid}>
              {STICKER_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.stickerCell}
                  onPress={() => handleAddSticker(emoji)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.stickerCellText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setStickerModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: theme.colors.dark.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: theme.spacing.sm,
  },
  topTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  topActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Carousel
  carouselSection: {
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.dark.bg,
  },
  carouselContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.dark.border,
    position: 'relative',
  },
  thumbnailActive: {
    borderColor: theme.colors.primary[400],
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
  },
  thumbnailLabelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,15,30,0.6)',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  thumbnailLabel: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#fff',
    textAlign: 'center',
  },
  previewWrap: {
    height: Math.round(Dimensions.get('window').height * 0.38),
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.sm,
    overflow: 'hidden',
  },
  imageWrap: {
    position: 'relative',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.dark.surface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.dark.surface,
  },
  placeholderSpinner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: theme.colors.dark.border,
    borderTopColor: theme.colors.primary[400],
  },
  textOverlay: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    padding: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(10, 15, 30, 0.15)',
  },
  overlayText: {
    fontFamily: theme.typography.fontFamily.bold,
    flexWrap: 'wrap',
  },
  stickerOverlay: {
    position: 'absolute',
  },
  stickerText: {
    fontSize: 40,
  },
  overlaySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  overlaySummaryText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.textFaint,
  },
  removeLastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeLastText: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.error[400],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.error[500] + '20',
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error[400],
  },
  errorText: {
    flex: 1,
    color: theme.colors.error[400],
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
  },
  errorTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.dark.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  backButtonText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 30, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.elevated,
  },
  processingSpinner: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    borderWidth: 4,
    borderColor: theme.colors.dark.border,
    borderTopColor: theme.colors.primary[400],
  },
  processingTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  processingSubtext: {
    fontSize: theme.typography.caption,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modalCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 360,
    gap: theme.spacing.md,
    ...theme.shadows.elevated,
  },
  modalTitle: {
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    minHeight: 80,
  },
  modalLabel: {
    fontSize: theme.typography.micro,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: theme.colors.dark.surfaceLight,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary[500],
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  stickerModalCard: {
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 360,
    gap: theme.spacing.md,
    ...theme.shadows.elevated,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  stickerCell: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerCellText: {
    fontSize: 32,
  },
  // Platform chips section
  platformSection: {
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
  },
  platformChipRow: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  // Link panel
  linkPanelContainer: {
    backgroundColor: theme.colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
    maxHeight: 240,
  },
  linkPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
  },
  linkPanelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  linkPanelTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  linkCountBadge: {
    backgroundColor: theme.colors.primary[500],
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  linkCountText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  linkPanelScroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    backgroundColor: theme.colors.dark.surfaceLight,
  },
  platformChipIcon: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  platformChipLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
  },
  linkInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  linkPlatformPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  linkPlatformPickerLabel: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  linkPlatformDot: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkTextInput: {
    flex: 1,
    minWidth: 80,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  linkUrlInput: {
    flex: 2,
    minWidth: 120,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
  },
  linkAddBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkList: {
    gap: 6,
    marginTop: theme.spacing.xs,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  linkItemIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkItemText: {
    flex: 1,
    gap: 2,
  },
  linkItemLabel: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  linkItemUrl: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  linkItemDelete: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Sticky CTA
  stickyCtaWrap: {
    backgroundColor: theme.colors.dark.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.dark.border,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  stickyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: theme.spacing.md + 2,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary[600],
  },
  stickyCtaText: {
    fontSize: 17,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
});
