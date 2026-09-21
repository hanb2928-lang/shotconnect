import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Animated,
  Easing,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { Search, Film, Check, X, RefreshCw, Settings, Download, Image as ImageIcon, Camera, RotateCcw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/lib/theme';
import { getThumbnailUrl } from '@/lib/imageUtils';
import { StockVideoClip, searchStockVideos } from '@/lib/pexelsVideo';
import { getSafeVideoConstraints, clampCaptureDimensions } from '@/lib/captureConstraints';

interface StockVideoPickerProps {
  productName?: string;
  productCategory?: string;
  orientation?: 'portrait' | 'landscape' | 'square';
  mediaType?: 'video' | 'image';
  selectedClip: StockVideoClip | null;
  onSelectClip: (clip: StockVideoClip | null) => void;
}

export function StockVideoPicker({
  productName,
  productCategory,
  orientation = 'portrait',
  mediaType = 'video',
  selectedClip,
  onSelectClip,
}: StockVideoPickerProps) {
  const [clips, setClips] = useState<StockVideoClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [progress, setProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = useCallback(() => {
    setProgress(0);
    progressAnim.setValue(0);
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
      const next = Math.min(prev + Math.random() * 15 + 5, 90);
        return next;
      });
    }, 200);
  }, [progressAnim]);

  const finishProgress = useCallback(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setProgress(100);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  const buildQuery = useCallback(() => {
    if (searchQuery.trim()) return searchQuery.trim();
    if (productName && productCategory) return `${productName} ${productCategory}`;
    if (productName) return productName;
    if (productCategory) return productCategory;
    return '';
  }, [searchQuery, productName, productCategory]);

  const handleSearch = useCallback(async () => {
    const query = buildQuery();
    if (!query) {
      setError('검색어를 입력하거나 제품 정보를 먼저 불러와주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    startProgress();
    try {
      const results = await searchStockVideos(query, orientation, 12, mediaType);
      setClips(results);
      if (results.length === 0) {
        setError(mediaType === 'image' ? '검색된 이미지가 없습니다. 다른 키워드로 시도해보세요.' : '검색된 영상이 없습니다. 다른 키워드로 시도해보세요.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (mediaType === 'image' ? '이미지 검색에 실패했습니다.' : '영상 검색에 실패했습니다.'));
    } finally {
      finishProgress();
      setLoading(false);
    }
  }, [buildQuery, orientation, startProgress, finishProgress, mediaType]);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveToGallery = useCallback(async () => {
    if (!selectedClip) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      if (Platform.OS === 'web') {
        window.open(selectedClip.videoUrl, '_blank');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        return;
      }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '갤러리에 저장하려면 미디어 접근 권한이 필요합니다. 설정에서 허용해주세요.', [
          { text: '설정으로', onPress: () => Linking.openSettings() },
          { text: '취소', style: 'cancel' },
        ]);
        return;
      }
      const fileName = `pexels_${selectedClip.id}.mp4`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      const downloadRes = await FileSystem.downloadAsync(selectedClip.videoUrl, fileUri);
      if (downloadRes.status !== 200) {
        throw new Error('영상 다운로드에 실패했습니다.');
      }
      const asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
      await MediaLibrary.createAlbumAsync('SnapConnect', asset, false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      Alert.alert('저장 실패', err instanceof Error ? err.message : '갤러리 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }, [selectedClip]);

  // ── In-component camera capture (webcam) ──
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraMountedRef = useRef(true);
  const streamGenRef = useRef(0);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* element may be detached */ }
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (face: 'user' | 'environment') => {
    if (Platform.OS !== 'web') return;
    if (!cameraMountedRef.current) return;
    stopCameraStream();
    const gen = ++streamGenRef.current;
    setCameraError(null);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getSafeVideoConstraints(face),
        audio: false,
      });
      if (!cameraMountedRef.current || gen !== streamGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        if (cameraMountedRef.current && gen === streamGenRef.current) setCameraReady(true);
      }
    } catch (err) {
      if (!cameraMountedRef.current || gen !== streamGenRef.current) return;
      const msg = err instanceof Error ? err.message : '카메라 접근 실패';
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('카메라 권한이 필요합니다. 브라우저 설정에서 카메라를 허용해주세요.');
      } else if (msg.includes('NotFound') || msg.includes('NotReadable')) {
        setCameraError('사용 가능한 카메라를 찾을 수 없습니다.');
      } else {
        setCameraError('카메라를 시작할 수 없습니다: ' + msg);
      }
    }
  }, [stopCameraStream]);

  const cameraOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenCamera = useCallback(() => {
    setCapturedDataUrl(null);
    setShowCamera(true);
    if (cameraOpenTimerRef.current) clearTimeout(cameraOpenTimerRef.current);
    cameraOpenTimerRef.current = setTimeout(() => {
      cameraOpenTimerRef.current = null;
      startCamera(facing);
    }, 100);
  }, [facing, startCamera]);

  const handleCloseCamera = useCallback(() => {
    stopCameraStream();
    setShowCamera(false);
    setCapturedDataUrl(null);
    setCameraError(null);
  }, [stopCameraStream]);

  const handleFlipCamera = useCallback(() => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    if (showCamera) startCamera(next);
  }, [facing, showCamera, startCamera]);

  const handleCapturePhoto = useCallback(async () => {
    if (!videoRef.current || !cameraReady) return;
    setCapturing(true);
    try {
      const video = videoRef.current;
      const rawW = video.videoWidth || 1080;
      const rawH = video.videoHeight || 1920;
      const { width: w, height: h } = clampCaptureDimensions(rawW, rawH, 1080);
      const canvas = captureCanvasRef.current ?? document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 미지원');
      if (facing === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      canvas.width = 0;
      canvas.height = 0;
      setCapturedDataUrl(dataUrl);
    } catch {
      setCameraError('촬영에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, facing]);

  const handleConfirmCapture = useCallback(() => {
    if (!capturedDataUrl) return;
    const clip: StockVideoClip = {
      id: Date.now(),
      duration: 0,
      width: 1080,
      height: 1920,
      previewUrl: capturedDataUrl,
      thumbnailUrl: capturedDataUrl,
      videoUrl: capturedDataUrl,
      author: '직접 촬영',
      ratio: '9:16',
      mediaType: 'image',
    };
    onSelectClip(clip);
    stopCameraStream();
    setShowCamera(false);
    setCapturedDataUrl(null);
  }, [capturedDataUrl, onSelectClip, stopCameraStream]);

  const handleRetakeCapture = useCallback(() => {
    setCapturedDataUrl(null);
  }, []);

  // ── Mobile camera capture (expo-camera) ──
  const [mobileCamPermission, requestMobileCamPermission] = useCameraPermissions();
  const [showMobileCamera, setShowMobileCamera] = useState(false);
  const [mobileFacing, setMobileFacing] = useState<CameraType>('back');
  const mobileCameraRef = useRef<React.ComponentRef<typeof CameraView> | null>(null);
  const [mobileCapturedUri, setMobileCapturedUri] = useState<string | null>(null);
  const [mobileCapturing, setMobileCapturing] = useState(false);
  const [mobileSaveSuccess, setMobileSaveSuccess] = useState(false);

  const handleOpenMobileCamera = useCallback(async () => {
    if (!mobileCamPermission?.granted) {
      const result = await requestMobileCamPermission();
      if (!result.granted) {
        Alert.alert('권한 필요', '카메라를 사용하려면 카메라 접근 권한이 필요합니다. 설정에서 허용해주세요.', [
          { text: '설정으로', onPress: () => Linking.openSettings() },
          { text: '취소', style: 'cancel' },
        ]);
        return;
      }
    }
    setMobileCapturedUri(null);
    setShowMobileCamera(true);
  }, [mobileCamPermission, requestMobileCamPermission]);

  const handleCloseMobileCamera = useCallback(() => {
    setShowMobileCamera(false);
    setMobileCapturedUri(null);
  }, []);

  const handleMobileCapture = useCallback(async () => {
    if (!mobileCameraRef.current || mobileCapturing) return;
    setMobileCapturing(true);
    try {
      const photo = await mobileCameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (photo?.uri) {
        setMobileCapturedUri(photo.uri);
      }
    } catch {
      Alert.alert('촬영 실패', '사진 촬영 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setMobileCapturing(false);
    }
  }, [mobileCapturing]);

  const handleMobileFlipCamera = useCallback(() => {
    setMobileFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, []);

  const handleMobileRetake = useCallback(() => {
    setMobileCapturedUri(null);
  }, []);

  const handleMobileConfirmCapture = useCallback(async () => {
    if (!mobileCapturedUri) return;
    const clip: StockVideoClip = {
      id: Date.now(),
      duration: 0,
      width: 1080,
      height: 1920,
      previewUrl: mobileCapturedUri,
      thumbnailUrl: mobileCapturedUri,
      videoUrl: mobileCapturedUri,
      author: '직접 촬영',
      ratio: '9:16',
      mediaType: 'image',
    };
    onSelectClip(clip);
    setShowMobileCamera(false);
    setMobileCapturedUri(null);
  }, [mobileCapturedUri, onSelectClip]);

  const handleMobileSaveToGallery = useCallback(async () => {
    if (!mobileCapturedUri) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '갤러리에 저장하려면 미디어 접근 권한이 필요합니다. 설정에서 허용해주세요.', [
          { text: '설정으로', onPress: () => Linking.openSettings() },
          { text: '취소', style: 'cancel' },
        ]);
        return;
      }
      const asset = await MediaLibrary.createAssetAsync(mobileCapturedUri);
      await MediaLibrary.createAlbumAsync('SnapConnect', asset, false);
      setMobileSaveSuccess(true);
      setTimeout(() => setMobileSaveSuccess(false), 3000);
    } catch {
      Alert.alert('저장 실패', '갤러리 저장 중 오류가 발생했습니다.');
    }
  }, [mobileCapturedUri]);

  useEffect(() => {
    return () => {
      cameraMountedRef.current = false;
      if (cameraOpenTimerRef.current) {
        clearTimeout(cameraOpenTimerRef.current);
        cameraOpenTimerRef.current = null;
      }
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // ── Image picker (from gallery / file system) ──
  const [pickingImage, setPickingImage] = useState(false);

  const handlePickImage = useCallback(async () => {
    if (pickingImage) return;
    setPickingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const clip: StockVideoClip = {
        id: Date.now(),
        duration: 0,
        width: asset.width || 1080,
        height: asset.height || 1920,
        previewUrl: asset.uri,
        thumbnailUrl: asset.uri,
        videoUrl: asset.uri,
        author: '불러온 이미지',
        ratio: asset.width && asset.height
          ? `${asset.width >= asset.height ? '9' : '3'}:${asset.width >= asset.height ? '16' : '4'}`
          : '9:16',
        mediaType: 'image',
      };
      onSelectClip(clip);
    } catch {
      Alert.alert('오류', '이미지를 불러오는 중 문제가 발생했습니다.');
    } finally {
      setPickingImage(false);
    }
  }, [pickingImage, onSelectClip]);

  const initialQuery = productName || productCategory || '';
  const hasSearched = clips.length > 0 || error !== null;

  const autoSearchedRef = useRef<string | null>(null);
  useEffect(() => {
    const query = productName || productCategory || '';
    if (query && autoSearchedRef.current !== `${query}:${mediaType}` && !loading) {
      autoSearchedRef.current = `${query}:${mediaType}`;
      setSearchQuery('');
      handleSearch();
    }
  }, [productName, productCategory, handleSearch, loading, mediaType]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          {mediaType === 'image' ? (
            <ImageIcon size={16} color={theme.colors.success[400]} strokeWidth={2.5} />
          ) : (
            <Film size={16} color={theme.colors.success[400]} strokeWidth={2.5} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{mediaType === 'image' ? '제품 테마 이미지 가져오기' : '제품 테마 영상 가져오기'}</Text>
          <Text style={styles.subtitle}>
            {mediaType === 'image'
              ? '제품과 관련된 무료 재사용 이미지를 검색해서 콘텐츠에 활용하세요'
              : '제품과 관련된 무료 재사용 영상을 검색해서 숏폼에 활용하세요'}
          </Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Search size={15} color={theme.colors.dark.textDim} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder={initialQuery || '예: 운동화 러닝, 스킨케어 화장품'}
            placeholderTextColor={theme.colors.dark.textDim}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
        </View>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={handleSearch}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Search size={16} color="#fff" strokeWidth={2.5} />
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {(error.includes('Pexels API 키') || error.includes('유효하지 않습니다')) && (
            <TouchableOpacity
              style={styles.errorSettingsBtn}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
            >
              <Settings size={12} color={theme.colors.error[400]} strokeWidth={2} />
              <Text style={styles.errorSettingsBtnText}>설정에서 Pexels 키 입력하기</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{mediaType === 'image' ? '이미지 다운로드 중...' : '영상 다운로드 중...'}</Text>
            <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }) }]}
            />
          </View>
        </View>
      )}

      {selectedClip && (
        <View style={styles.selectedBox}>
          <Image
            source={{ uri: getThumbnailUrl(selectedClip.thumbnailUrl, 96) }}
            style={styles.selectedThumb}
            resizeMode="cover"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedTitle} numberOfLines={1}>
              {mediaType === 'image' ? '선택된 이미지' : '선택된 영상'} #{selectedClip.id}
            </Text>
            <Text style={styles.selectedMeta}>
              {selectedClip.ratio}{selectedClip.duration > 0 ? ` · ${selectedClip.duration}초` : ''} · {selectedClip.author}
            </Text>
            {saveSuccess && (
              <Text style={styles.savedHint}>
                {Platform.OS === 'web' ? '영상을 새 창에서 열었습니다' : '갤러리에 저장되었습니다'}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              onPress={handleSaveToGallery}
              disabled={saving}
              style={styles.selectedSaveBtn}
              activeOpacity={0.7}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.success[400]} />
              ) : saveSuccess ? (
                <Check size={16} color={theme.colors.success[400]} strokeWidth={2.5} />
              ) : (
                <Download size={16} color={theme.colors.success[400]} strokeWidth={2} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSelectClip(null)}
              style={styles.selectedRemoveBtn}
              activeOpacity={0.7}
            >
              <X size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {hasSearched && !loading && clips.length > 0 && (
        <View style={styles.clipGridLabel}>
          <Text style={styles.clipGridLabelText}>
            {clips.length}개 영상 · 탭하여 선택
          </Text>
          <TouchableOpacity onPress={handleSearch} activeOpacity={0.7}>
            <View style={styles.refreshRow}>
              <RefreshCw size={12} color={theme.colors.dark.textDim} strokeWidth={2} />
              <Text style={styles.refreshText}>새로고침</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={clips}
        keyExtractor={(item) => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.clipList}
        renderItem={({ item }) => {
          const isSelected = selectedClip?.id === item.id;
          return (
            <TouchableOpacity
              style={[styles.clipCard, isSelected && styles.clipCardActive]}
              onPress={() => onSelectClip(isSelected ? null : item)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: getThumbnailUrl(item.thumbnailUrl, 240) }}
                style={styles.clipThumb}
                resizeMode="cover"
              />
              <View style={styles.clipOverlay}>
                {item.duration > 0 && (
                  <View style={styles.clipBadge}>
                    <Text style={styles.clipBadgeText}>{item.duration}초</Text>
                  </View>
                )}
                {isSelected && (
                  <View style={styles.clipSelectedBadge}>
                    <Check size={14} color="#fff" strokeWidth={2.5} />
                  </View>
                )}
                <View style={styles.clipPlayBadge}>
                  {item.mediaType === 'image' ? (
                    <ImageIcon size={20} color="#fff" strokeWidth={2} />
                  ) : (
                    <Film size={20} color="#fff" strokeWidth={2} />
                  )}
                </View>
              </View>
              <View style={styles.clipMetaBox}>
                <Text style={styles.clipRatio}>{item.ratio}</Text>
                <Text style={styles.clipAuthor} numberOfLines={1}>{item.author}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? null : error ? null : (
            <View style={styles.emptyState}>
              {mediaType === 'image' ? (
                <ImageIcon size={24} color={theme.colors.dark.textDim} strokeWidth={1.5} />
              ) : (
                <Film size={24} color={theme.colors.dark.textDim} strokeWidth={1.5} />
              )}
              <Text style={styles.emptyText}>검색 버튼을 눌러 {mediaType === 'image' ? '이미지를' : '영상을'} 찾아보세요</Text>
            </View>
          )
        }
      />

      {/* ── Camera capture & image picker section ── */}
      {!showCamera && !showMobileCamera && (
        <View style={styles.captureRow}>
          <TouchableOpacity
            style={styles.pickImageBtn}
            onPress={handlePickImage}
            disabled={pickingImage}
            activeOpacity={0.8}
          >
            {pickingImage ? (
              <ActivityIndicator size="small" color={theme.colors.success[400]} />
            ) : (
              <ImageIcon size={18} color={theme.colors.success[400]} strokeWidth={2.5} />
            )}
            <Text style={styles.pickImageBtnText}>이미지 불러오기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={Platform.OS === 'web' ? handleOpenCamera : handleOpenMobileCamera}
            activeOpacity={0.8}
          >
            <Camera size={18} color="#fff" strokeWidth={2.5} />
            <Text style={styles.captureBtnText}>캡처하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Web camera (web only) ── */}
      {showCamera && Platform.OS === 'web' && (
        <View style={styles.cameraSection}>
          <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
          {capturedDataUrl ? (
            <View style={styles.capturePreviewWrap}>
              {/* @ts-ignore web-only img */}
              <img
                src={capturedDataUrl}
                style={{ width: '100%', maxHeight: 400, borderRadius: 12, objectFit: 'contain' }}
              />
              <View style={styles.capturePreviewActions}>
                <TouchableOpacity style={styles.captureRetakeBtn} onPress={handleRetakeCapture} activeOpacity={0.8}>
                  <RotateCcw size={16} color="#fff" strokeWidth={2} />
                  <Text style={styles.captureRetakeText}>다시 촬영</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.captureConfirmBtn} onPress={handleConfirmCapture} activeOpacity={0.85}>
                  <Check size={16} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.captureConfirmText}>이 사진 사용</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.cameraViewWrap}>
              {/* @ts-ignore web-only video */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: 320,
                  borderRadius: 12,
                  objectFit: 'cover',
                  transform: facing === 'user' ? 'scaleX(-1)' : 'none',
                }}
              />
              {!cameraReady && !cameraError && (
                <View style={styles.cameraLoadingWrap}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.cameraLoadingText}>카메라 시작 중...</Text>
                </View>
              )}
              {cameraError && (
                <View style={styles.cameraErrorWrap}>
                  <Text style={styles.cameraErrorText}>{cameraError}</Text>
                  <TouchableOpacity
                    style={styles.cameraRetryBtn}
                    onPress={() => startCamera(facing)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cameraRetryText}>다시 시도</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {!capturedDataUrl && (
            <View style={styles.cameraActions}>
              <TouchableOpacity style={styles.cameraFlipBtn} onPress={handleFlipCamera} disabled={!cameraReady} activeOpacity={0.7}>
                <RotateCcw size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.cameraFlipText}>카메라 전환</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cameraShutterBtn, !cameraReady && styles.cameraShutterDisabled]}
                onPress={handleCapturePhoto}
                disabled={!cameraReady || capturing}
                activeOpacity={0.85}
              >
                {capturing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Camera size={26} color="#fff" strokeWidth={2.5} />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraCloseBtn} onPress={handleCloseCamera} activeOpacity={0.7}>
                <X size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
                <Text style={styles.cameraCloseText}>닫기</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── Mobile camera (expo-camera, native only) ── */}
      {showMobileCamera && Platform.OS !== 'web' && (
        <View style={styles.cameraSection}>
          {mobileCapturedUri ? (
            <View style={styles.capturePreviewWrap}>
              <Image
                source={{ uri: mobileCapturedUri }}
                style={{ width: '100%', height: 400, borderRadius: 12 }}
                resizeMode="contain"
              />
              <View style={styles.capturePreviewActions}>
                <TouchableOpacity style={styles.captureRetakeBtn} onPress={handleMobileRetake} activeOpacity={0.8}>
                  <RotateCcw size={16} color="#fff" strokeWidth={2} />
                  <Text style={styles.captureRetakeText}>다시 촬영</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.captureConfirmBtn} onPress={handleMobileConfirmCapture} activeOpacity={0.85}>
                  <Check size={16} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.captureConfirmText}>이 사진 사용</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.captureConfirmBtn, { backgroundColor: theme.colors.success[600], marginTop: 4 }]}
                onPress={handleMobileSaveToGallery}
                activeOpacity={0.85}
              >
                <Download size={16} color="#fff" strokeWidth={2} />
                <Text style={styles.captureConfirmText}>
                  {mobileSaveSuccess ? '갤러리 저장됨' : '갤러리에 저장'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mobileCameraWrap}>
              <CameraView
                ref={mobileCameraRef as never}
                facing={mobileFacing}
                style={styles.mobileCameraView}
              />
              <View style={styles.cameraActions}>
                <TouchableOpacity style={styles.cameraFlipBtn} onPress={handleMobileFlipCamera} activeOpacity={0.7}>
                  <RotateCcw size={18} color="#fff" strokeWidth={2} />
                  <Text style={styles.cameraFlipText}>전환</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cameraShutterBtn}
                  onPress={handleMobileCapture}
                  disabled={mobileCapturing}
                  activeOpacity={0.85}
                >
                  {mobileCapturing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Camera size={26} color="#fff" strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cameraCloseBtn} onPress={handleCloseMobileCamera} activeOpacity={0.7}>
                  <X size={18} color={theme.colors.dark.textDim} strokeWidth={2} />
                  <Text style={styles.cameraCloseText}>닫기</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.success[400] + '25',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.sm + 2,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.success[400] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontFamily: theme.typography.fontFamily.bold,
    color: theme.colors.dark.text,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.dark.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.text,
    paddingVertical: 10,
  },
  searchBtn: {
    backgroundColor: theme.colors.success[500],
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    backgroundColor: theme.colors.error[400] + '12',
    borderRadius: theme.radius.sm,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error[400] + '60',
  },
  errorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    lineHeight: 17,
  },
  errorSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  errorSettingsBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.error[400],
  },
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.success[500] + '12',
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success[400] + '60',
  },
  selectedThumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
  },
  selectedTitle: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  selectedMeta: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 2,
  },
  selectedRemoveBtn: {
    padding: 6,
  },
  selectedSaveBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.success[400] + '15',
  },
  savedHint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
    marginTop: 2,
  },
  clipGridLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clipGridLabelText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  refreshText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  clipList: {
    gap: 10,
  },
  clipCard: {
    width: 120,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dark.surface,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  clipCardActive: {
    borderColor: theme.colors.success[400],
  },
  clipThumb: {
    width: 120,
    height: 180,
  },
  clipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clipBadgeText: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  clipSelectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.success[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipPlayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipMetaBox: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: theme.colors.dark.surface,
  },
  clipRatio: {
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.text,
  },
  clipAuthor: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  progressContainer: {
    marginBottom: theme.spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  progressPercent: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  progressTrack: {
    height: 4,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.success[400],
    borderRadius: 2,
  },
  // ── Camera capture styles ──
  captureRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: theme.spacing.sm,
  },
  pickImageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.success[400] + '18',
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.success[400] + '40',
  },
  pickImageBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.success[400],
  },
  captureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary[600],
    borderRadius: theme.radius.md,
    paddingVertical: 12,
  },
  captureBtnText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  cameraSection: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  cameraViewWrap: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraLoadingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cameraLoadingText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  cameraErrorWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    backgroundColor: 'rgba(5,8,18,0.85)',
  },
  cameraErrorText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
    textAlign: 'center',
    lineHeight: 18,
  },
  cameraRetryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary[600],
    borderRadius: theme.radius.md,
  },
  cameraRetryText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  cameraActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraFlipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.dark.surfaceLight,
    borderRadius: theme.radius.md,
  },
  cameraFlipText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  cameraShutterBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cameraShutterDisabled: {
    backgroundColor: theme.colors.dark.surfaceLight,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cameraCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.md,
  },
  cameraCloseText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.dark.textDim,
  },
  capturePreviewWrap: {
    gap: theme.spacing.sm,
  },
  capturePreviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  captureRetakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.radius.md,
    flex: 1,
    justifyContent: 'center',
  },
  captureRetakeText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: '#fff',
  },
  captureConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: theme.colors.success[500],
    borderRadius: theme.radius.md,
    flex: 1,
    justifyContent: 'center',
  },
  captureConfirmText: {
    fontSize: 13,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#fff',
  },
  // ── Mobile camera styles ──
  mobileCameraWrap: {
    gap: theme.spacing.sm,
  },
  mobileCameraView: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
