import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import {
  Plus,
  Check,
  Trash2,
  X,
  Sparkles,
  Image as ImageIcon,
  ArrowRight,
  Upload,
  Zap,
  BookOpen,
  Link as LinkIcon,
  FolderOpen,
  Save,
  Camera,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';
import { TOON_PERSONA_PRESETS, type ToonCharacter } from '@/components/PhotoToonUpload';
import { useInspectorContext } from '@/lib/inspectorContext';
import { applyToonFilter } from '@/lib/toonFilter';

export interface ToonCut {
  id: string;
  label: string;
  speechBubble: string;
  imageUrl: string | null;
}

interface CaptureSlot {
  id: string;
  uri: string;
}

interface ToonModeEditorProps {
  visible: boolean;
  onClose: () => void;
  onPublish?: (cuts: ToonCut[], blogHtml?: string) => void;
  onCutSelected?: (cutId: string) => void;
  toonCharacter?: ToonCharacter | null;
  onCharacterCreated?: (char: ToonCharacter) => void;
}

const MAX_CUTS = 12;

let cutCounter = 0;
function makeCutId(): string {
  cutCounter += 1;
  return `toon_cut_${Date.now()}_${cutCounter}`;
}

let slotCounter = 0;
function makeSlotId(): string {
  slotCounter += 1;
  return `slot_${Date.now()}_${slotCounter}`;
}

const PSYCHOLOGY_TONES = [
  { id: 'raw', label: '날것의 심리자극', emoji: '🧠' },
  { id: 'fomo', label: 'FOMO 유발', emoji: '🔥' },
  { id: 'curiosity', label: '호기증폭', emoji: '🤔' },
  { id: 'empathy', label: '공감대폭발', emoji: '💛' },
];

// Light theme palette with electric purple accent
const BG_PAGE = '#FAFAFB';
const CARD_SURFACE = '#FFFFFF';
const PAPER = '#F8F8FA';
const INK_LIGHT = '#94A3B8';
const BORDER_SLATE = '#E2E8F0';
const TEXT_DARK = '#1E293B';
const TEXT_DIM = '#475569';
const TEXT_FAINT = '#94A3B8';
const ACCENT = '#A855F7';
const ACCENT_SOFT = '#A855F715';

export function ToonModeEditor({
  visible,
  onClose,
  onPublish,
  onCutSelected,
  toonCharacter = null,
  onCharacterCreated,
}: ToonModeEditorProps) {
  const inspectorCtx = useInspectorContext();
  const { width: winW } = useWindowDimensions();
  const [slots, setSlots] = useState<CaptureSlot[]>([]);
  const slotsRef = useRef<CaptureSlot[]>([]);
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(inspectorCtx.selectedPresetId);
  const [psychoTone, setPsychoTone] = useState('raw');
  const [tooningSlots, setTooningSlots] = useState(false);
  // Map from slot ID to original raw (unfiltered) image URI, for re-processing on style change
  const rawImageMap = useRef<Map<string, string>>(new Map());
  const [cuts, setCuts] = useState<ToonCut[]>(() => [{
    id: makeCutId(),
    label: '1컷',
    speechBubble: '',
    imageUrl: null,
  }]);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [editingBubbleId, setEditingBubbleId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [captureMode, setCaptureMode] = useState<'file' | 'link'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [urlCapturing, setUrlCapturing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'loaded'>('idle');
  const [publishFeedback, setPublishFeedback] = useState<'idle' | 'copied'>('idle');

  // Sync local cuts to inspector context so the panel can read cut data
  useEffect(() => {
    inspectorCtx.setCuts(cuts.map((c) => ({
      id: c.id,
      label: c.label,
      speechBubble: c.speechBubble,
      imageUrl: c.imageUrl,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuts]);

  // Reverse sync: pick up cut edits made from the inspector panel (via onUpdateCut)
  const lastSyncRef = useRef<string>('');
  useEffect(() => {
    if (inspectorCtx.cuts.length === 0) return;
    const sig = inspectorCtx.cuts.map((c) => `${c.id}:${c.speechBubble}`).join('|');
    if (sig === lastSyncRef.current) return;
    lastSyncRef.current = sig;
    setCuts((prev) => prev.map((localCut) => {
      const ctxCut = inspectorCtx.cuts.find((c) => c.id === localCut.id);
      if (!ctxCut) return localCut;
      if (ctxCut.speechBubble !== localCut.speechBubble) {
        return { ...localCut, speechBubble: ctxCut.speechBubble };
      }
      return localCut;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorCtx.cuts]);

  // Apply toon filter to a slot image and map it to the corresponding cut 1:1
  const applyToonToSlot = useCallback(async (slotId: string, rawUri: string) => {
    setTooningSlots(true);
    try {
      const toonedUri = await applyToonFilter(rawUri, {
        toneLevel: inspectorCtx.toneLevel,
        style: inspectorCtx.toonStyle,
        artStyle: inspectorCtx.artStyle,
        edgeThreshold: 40,
        posterizeLevels: 4,
        dotSize: 3,
      });
      // Update the slot to show the toonified image
      setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, uri: toonedUri } : s));
      // Find the cut index from the ref and assign
      const slotIndex = slotsRef.current.findIndex((s) => s.id === slotId);
      if (slotIndex < 0) {
        setTooningSlots(false);
        return;
      }
      setCuts((prevCuts) => {
        const cutIdx = slotIndex;
        if (cutIdx >= prevCuts.length && prevCuts.length < MAX_CUTS) {
          const newCuts = [...prevCuts];
          while (newCuts.length <= cutIdx && newCuts.length < MAX_CUTS) {
            newCuts.push({
              id: makeCutId(),
              label: `${newCuts.length + 1}컷`,
              speechBubble: '',
              imageUrl: null,
            });
          }
          if (cutIdx < newCuts.length) {
            newCuts[cutIdx] = { ...newCuts[cutIdx], imageUrl: toonedUri };
          }
          return newCuts;
        }
        if (cutIdx < prevCuts.length) {
          return prevCuts.map((c, i) => i === cutIdx ? { ...c, imageUrl: toonedUri } : c);
        }
        return prevCuts;
      });
    } catch {
      setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, uri: rawUri } : s));
    }
    setTooningSlots(false);
  }, [inspectorCtx.toneLevel, inspectorCtx.toonStyle, inspectorCtx.artStyle]);

  const handleSlotFile = useCallback((index: number, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const uri = reader.result as string;
      if (index < slots.length) {
        // Replace existing slot and re-toonify
        const existingId = slots[index].id;
        rawImageMap.current.set(existingId, uri);
        setSlots((prev) => prev.map((s, i) => i === index ? { ...s, uri } : s));
        applyToonToSlot(existingId, uri);
      } else {
        const slotId = makeSlotId();
        rawImageMap.current.set(slotId, uri);
        setSlots((prev) => [...prev, { id: slotId, uri }]);
        applyToonToSlot(slotId, uri);
      }
    };
    reader.readAsDataURL(file);
  }, [slots, applyToonToSlot]);

  const handleSlotFiles = useCallback((files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    valid.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const uri = reader.result as string;
        const slotId = makeSlotId();
        rawImageMap.current.set(slotId, uri);
        setSlots((prev) => [...prev, { id: slotId, uri }]);
        // Auto-apply toon filter and assign to a cut 1:1
        applyToonToSlot(slotId, uri);
      };
      reader.readAsDataURL(file);
    });
  }, [applyToonToSlot]);

  // URL capture — uses WordPress mShots free screenshot service
  const handleUrlCapture = useCallback(() => {
    const url = urlInput.trim();
    if (!url || urlCapturing) return;
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    setUrlCapturing(true);
    const screenshotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(normalized)}?w=800`;
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Convert to data URL via canvas so it persists in slots
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          const dataUri = canvas.toDataURL('image/png');
          const slotId = makeSlotId();
          rawImageMap.current.set(slotId, dataUri);
          setSlots((prev) => [...prev, { id: slotId, uri: dataUri }]);
          applyToonToSlot(slotId, dataUri);
        } catch {
          // CORS taint — use the screenshot URL directly
          const slotId = makeSlotId();
          rawImageMap.current.set(slotId, screenshotUrl);
          setSlots((prev) => [...prev, { id: slotId, uri: screenshotUrl }]);
          applyToonToSlot(slotId, screenshotUrl);
        }
      }
      setUrlCapturing(false);
      setUrlInput('');
    };
    img.onerror = () => {
      setUrlCapturing(false);
    };
    img.src = screenshotUrl;
  }, [urlInput, urlCapturing, applyToonToSlot]);

  // Save slots to localStorage
  const handleSaveSlots = useCallback(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    const rawEntries: Array<[string, string]> = Array.from(rawImageMap.current.entries());
    const data = {
      slots: slotsRef.current.map((s) => ({ id: s.id, uri: s.uri })),
      rawMap: rawEntries,
      savedAt: Date.now(),
    };
    localStorage.setItem('shotconnect_toon_slots', JSON.stringify(data));
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, []);

  // Load slots from localStorage
  const handleLoadSlots = useCallback(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('shotconnect_toon_slots');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const loadedSlots: CaptureSlot[] = (data.slots as Array<{ id: string; uri: string }>).map((s) => ({ id: s.id, uri: s.uri }));
      rawImageMap.current = new Map(data.rawMap as Array<[string, string]>);
      setSlots(loadedSlots);
      // Re-apply toon filter to all loaded slots
      loadedSlots.forEach((slot) => {
        const rawUri = rawImageMap.current.get(slot.id);
        if (rawUri) applyToonToSlot(slot.id, rawUri);
      });
      setSaveStatus('loaded');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      // ignore corrupt data
    }
  }, [applyToonToSlot]);

  const handleSlotPick = useCallback((index: number) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (index === -1 && target.files && target.files.length > 0) {
        handleSlotFiles(target.files);
      } else if (target.files && target.files[0]) {
        handleSlotFile(index, target.files[0]);
      }
    };
    input.click();
  }, [handleSlotFile, handleSlotFiles]);

  const handleSlotDrop = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (index === -1 || index >= slots.length) {
        handleSlotFiles(e.dataTransfer.files);
      } else {
        handleSlotFile(index, e.dataTransfer.files[0]);
      }
    }
  }, [handleSlotFile, handleSlotFiles, slots.length]);

  // Clipboard paste support — paste images directly into the slot area
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems: DataTransferItem[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) imageItems.push(items[i]);
      }
      if (imageItems.length === 0) return;
      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const uri = reader.result as string;
            const slotId = makeSlotId();
            rawImageMap.current.set(slotId, uri);
            setSlots((prev) => [...prev, { id: slotId, uri }]);
            applyToonToSlot(slotId, uri);
          };
          reader.readAsDataURL(file);
        }
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [applyToonToSlot]);

  const relabelCuts = useCallback((arr: ToonCut[]) =>
    arr.map((c, i) => ({ ...c, label: `${i + 1}컷` })), []);

  const handleSlotRemove = useCallback((index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
    // Remove the corresponding slot from rawImageMap
    const slotToRemove = slotsRef.current[index];
    if (slotToRemove) {
      rawImageMap.current.delete(slotToRemove.id);
    }
    // Clear the image on the corresponding cut, but keep the cut itself
    setCuts((prev) => relabelCuts(prev.map((c, i) =>
      i === index ? { ...c, imageUrl: null } : c
    )));
  }, [relabelCuts]);

  const handleAddCut = useCallback(() => {
    setCuts((prev) => {
      if (prev.length >= MAX_CUTS) return prev;
      return [...prev, {
        id: makeCutId(),
        label: `${prev.length + 1}컷`,
        speechBubble: '',
        imageUrl: null,
      }];
    });
  }, []);

  const handleRemoveCut = useCallback((id: string) => {
    setCuts((prev) => {
      if (prev.length <= 1) return prev;
      const cutIndex = prev.findIndex((c) => c.id === id);
      if (cutIndex < 0) return prev;
      // Also remove the corresponding slot and its raw image entry
      const slotToRemove = slotsRef.current[cutIndex];
      if (slotToRemove) {
        rawImageMap.current.delete(slotToRemove.id);
        setSlots((curSlots) => curSlots.filter((_, i) => i !== cutIndex));
      }
      return relabelCuts(prev.filter((c) => c.id !== id));
    });
    setSelectedCutId((prev) => prev === id ? null : prev);
  }, [relabelCuts]);

  const handleSelectCut = useCallback((id: string) => {
    setSelectedCutId(id);
    onCutSelected?.(id);
  }, [onCutSelected]);

  const handleUpdateBubble = useCallback((id: string, text: string) => {
    setCuts((prev) => prev.map((c) => c.id === id ? { ...c, speechBubble: text } : c));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);

    // Map all slots to cuts 1:1, applying toon filter to any unprocessed ones
    const slotsSnapshot = slots;
    const newCuts: ToonCut[] = [];

    for (let i = 0; i < Math.min(slotsSnapshot.length, MAX_CUTS); i++) {
      const slot = slotsSnapshot[i];
      // Check if the corresponding cut already has a toonified image
      const existingCut = cuts[i];
      if (existingCut?.imageUrl) {
        newCuts.push(existingCut);
      } else {
        try {
          const toonedUri = await applyToonFilter(slot.uri, {
            toneLevel: inspectorCtx.toneLevel,
            style: inspectorCtx.toonStyle,
            artStyle: inspectorCtx.artStyle,
          });
          newCuts.push({
            id: existingCut?.id ?? makeCutId(),
            label: `${i + 1}컷`,
            speechBubble: existingCut?.speechBubble ?? '',
            imageUrl: toonedUri,
          });
        } catch {
          newCuts.push({
            id: existingCut?.id ?? makeCutId(),
            label: `${i + 1}컷`,
            speechBubble: existingCut?.speechBubble ?? '',
            imageUrl: slot.uri,
          });
        }
      }
    }

    // Keep any extra cuts beyond the slot count
    for (let i = slotsSnapshot.length; i < cuts.length; i++) {
      newCuts.push(cuts[i]);
    }

    if (newCuts.length > 0) {
      setCuts(relabelCuts(newCuts));
    }

    // Also set character if not yet set
    if (!toonCharacter && slotsSnapshot.length > 0) {
      const preset = TOON_PERSONA_PRESETS.find((p) => p.id === selectedPresetId);
      if (preset && onCharacterCreated) {
        onCharacterCreated({
          id: `char_${Date.now()}`,
          imageUrl: cuts[0]?.imageUrl || slotsSnapshot[0].uri,
          presetId: selectedPresetId,
          toneLevel: inspectorCtx.toneLevel,
        });
      }
    }

    setGenerating(false);
  }, [generating, toonCharacter, slots, cuts, selectedPresetId, inspectorCtx.toneLevel, inspectorCtx.artStyle, onCharacterCreated, relabelCuts]);

  // Build blog HTML markup with images and speech bubbles
  const buildBlogHtml = useCallback((allCuts: ToonCut[]): string => {
    const cutImages = allCuts
      .filter((c) => c.imageUrl)
      .map((c) => {
        const bubbleHtml = c.speechBubble ? `<figcaption>${c.speechBubble}</figcaption>` : '';
        return `<figure><img src="${c.imageUrl}" alt="${c.label}" />${bubbleHtml}</figure>`;
      })
      .join('\n');
    return `<section class="shotconnect-toon">\n${cutImages}\n</section>`;
  }, []);

  const handlePublish = useCallback(() => {
    const html = buildBlogHtml(cuts);
    onPublish?.(cuts, html);
    // Copy blog HTML to clipboard on web
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(html).then(() => {
        setPublishFeedback('copied');
        setTimeout(() => setPublishFeedback('idle'), 2500);
      }).catch(() => {});
    }
  }, [cuts, onPublish, buildBlogHtml]);

  // Re-apply toon filter to all slots when artStyle changes
  const prevArtStyleRef = useRef(inspectorCtx.artStyle);
  useEffect(() => {
    if (prevArtStyleRef.current === inspectorCtx.artStyle) return;
    prevArtStyleRef.current = inspectorCtx.artStyle;
    const rawEntries = Array.from(rawImageMap.current.entries());
    if (rawEntries.length === 0) return;
    let cancelled = false;
    (async () => {
      setTooningSlots(true);
      for (let i = 0; i < rawEntries.length && i < MAX_CUTS; i++) {
        const [slotId, rawUri] = rawEntries[i];
        try {
          const toonedUri = await applyToonFilter(rawUri, {
            toneLevel: inspectorCtx.toneLevel,
            style: inspectorCtx.toonStyle,
            artStyle: inspectorCtx.artStyle,
            edgeThreshold: 40,
            posterizeLevels: 4,
            dotSize: 3,
          });
          if (cancelled) return;
          setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, uri: toonedUri } : s));
          setCuts((prev) => {
            if (i >= prev.length) return prev;
            return prev.map((c, idx) => idx === i ? { ...c, imageUrl: toonedUri } : c);
          });
        } catch {
          // skip on error
        }
      }
      setTooningSlots(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorCtx.artStyle, inspectorCtx.toneLevel, inspectorCtx.toonStyle]);

  // Batch re-apply toon filter to all cuts when triggered from inspector
  useEffect(() => {
    if (inspectorCtx.batchToonTrigger === 0) return;
    let cancelled = false;
    (async () => {
      setTooningSlots(true);
      inspectorCtx.setBatchTooning(true);
      const rawEntries = Array.from(rawImageMap.current.entries());
      if (rawEntries.length === 0) {
        setTooningSlots(false);
        inspectorCtx.setBatchTooning(false);
        return;
      }
      const newCuts: ToonCut[] = [];
      for (let i = 0; i < rawEntries.length && i < MAX_CUTS; i++) {
        const [slotId, rawUri] = rawEntries[i];
        const existingCut = cuts[i];
        try {
          const toonedUri = await applyToonFilter(rawUri, {
            toneLevel: inspectorCtx.toneLevel,
            style: inspectorCtx.toonStyle,
            artStyle: inspectorCtx.artStyle,
            edgeThreshold: 40,
            posterizeLevels: 4,
            dotSize: 3,
          });
          if (cancelled) return;
          setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, uri: toonedUri } : s));
          newCuts.push({
            id: existingCut?.id ?? makeCutId(),
            label: `${i + 1}컷`,
            speechBubble: existingCut?.speechBubble ?? '',
            imageUrl: toonedUri,
          });
        } catch {
          if (cancelled) return;
          newCuts.push(existingCut ?? {
            id: makeCutId(),
            label: `${i + 1}컷`,
            speechBubble: '',
            imageUrl: rawUri,
          });
        }
      }
      for (let i = rawEntries.length; i < cuts.length; i++) {
        newCuts.push(cuts[i]);
      }
      if (!cancelled && newCuts.length > 0) {
        setCuts(relabelCuts(newCuts));
      }
      setTooningSlots(false);
      inspectorCtx.setBatchTooning(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorCtx.batchToonTrigger, relabelCuts]);

  // Compact 6-column grid on wide, responsive fallback on narrow
  const cutCols = winW > 900 ? 6 : winW > 600 ? 4 : winW > 400 ? 3 : 2;
  const cutGap = 8;
  const cutCardWidth = `calc((100% - ${cutGap * (cutCols - 1)}px) / ${cutCols})`;

  const selectedCut = cuts.find((c) => c.id === selectedCutId) ?? null;

  return (
    <View style={[styles.container, { backgroundColor: BG_PAGE }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: CARD_SURFACE, borderBottomColor: BORDER_SLATE }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: ACCENT_SOFT }]}>
            <BookOpen size={18} color={ACCENT} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: TEXT_DARK }]}>만화 숏툰 에디터</Text>
            <Text style={[styles.headerSub, { color: TEXT_FAINT }]}>손그림 텍스처 · 리얼 말풍선 · 만화 타일 편집</Text>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={20} color={TEXT_FAINT} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── STEP 1: Capture Slots — slim band, no box ─── */}
        <View style={styles.stepBand}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>캡처 입력</Text>
            <Text style={[styles.stepCount, { color: TEXT_FAINT }]}>{slots.length}장</Text>
          </View>

          {/* Capture mode tabs */}
          <View style={styles.captureTabs}>
            <TouchableOpacity
              style={[styles.captureTab, captureMode === 'file' && styles.captureTabActive]}
              onPress={() => setCaptureMode('file')}
              activeOpacity={0.7}
            >
              <FolderOpen size={14} color={captureMode === 'file' ? ACCENT : TEXT_FAINT} strokeWidth={2} />
              <Text style={[styles.captureTabText, captureMode === 'file' && styles.captureTabTextActive]}>
                파일 불러오기 / 저장
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.captureTab, captureMode === 'link' && styles.captureTabActive]}
              onPress={() => setCaptureMode('link')}
              activeOpacity={0.7}
            >
              <LinkIcon size={14} color={captureMode === 'link' ? ACCENT : TEXT_FAINT} strokeWidth={2} />
              <Text style={[styles.captureTabText, captureMode === 'link' && styles.captureTabTextActive]}>
                링크 주소로 직접 캡처
              </Text>
            </TouchableOpacity>
          </View>

          {/* Link capture mode */}
          {captureMode === 'link' && (
            <View style={styles.urlCaptureWrap}>
              <View style={styles.urlInputRow}>
                <View style={styles.urlInputWrap}>
                  <LinkIcon size={15} color={TEXT_FAINT} strokeWidth={2} />
                  <TextInput
                    style={styles.urlInput}
                    placeholder="https:// 상품 페이지 URL 입력"
                    placeholderTextColor={TEXT_FAINT}
                    value={urlInput}
                    onChangeText={setUrlInput}
                    onSubmitEditing={handleUrlCapture}
                    returnKeyType="go"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.urlCaptureBtn, !urlInput.trim() && styles.urlCaptureBtnDisabled]}
                  onPress={handleUrlCapture}
                  disabled={!urlInput.trim() || urlCapturing}
                  activeOpacity={0.85}
                >
                  {urlCapturing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Camera size={16} color="#fff" strokeWidth={2.5} />
                  )}
                  <Text style={styles.urlCaptureBtnText}>
                    {urlCapturing ? '캡처 중...' : '화면 캡처'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.urlHint}>입력한 링크의 화면을 캡처하여 슬롯에 자동 추가됩니다</Text>
            </View>
          )}

          {/* File mode save/load actions */}
          {captureMode === 'file' && slots.length > 0 && (
            <View style={styles.fileActionsRow}>
              <TouchableOpacity style={styles.fileActionBtn} onPress={handleSaveSlots} activeOpacity={0.7}>
                <Save size={14} color={ACCENT} strokeWidth={2} />
                <Text style={styles.fileActionBtnText}>
                  {saveStatus === 'saved' ? '저장됨' : '저장'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fileActionBtn} onPress={handleLoadSlots} activeOpacity={0.7}>
                <FolderOpen size={14} color={ACCENT} strokeWidth={2} />
                <Text style={styles.fileActionBtnText}>
                  {saveStatus === 'loaded' ? '불러옴' : '불러오기'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.slotRow}>
            {slots.map((slot, i) => (
              <View key={slot.id} style={[styles.slotCard, { borderColor: BORDER_SLATE }]}>
                <Image source={{ uri: slot.uri }} style={styles.slotImage} resizeMode="cover" />
                <View style={styles.slotOverlay}>
                  <Text style={styles.slotIndex}>{i + 1}</Text>
                  <TouchableOpacity style={styles.slotRemove} onPress={() => handleSlotRemove(i)} activeOpacity={0.7}>
                    <X size={10} color="#fff" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.slotCard, styles.slotAdd, {
                borderColor: dragOverSlot === -1 ? ACCENT : BORDER_SLATE,
                backgroundColor: dragOverSlot === -1 ? ACCENT_SOFT : PAPER,
              }]}
              onPress={() => handleSlotPick(-1)}
              activeOpacity={0.7}
              {...({ onDrop: (e: React.DragEvent) => handleSlotDrop(-1, e), onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverSlot(-1); }, onDragLeave: () => setDragOverSlot(null) } as any)}
            >
              <Upload size={20} color={TEXT_FAINT} strokeWidth={2} />
              <Text style={[styles.slotAddText, { color: TEXT_FAINT }]}>추가</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Soft divider between steps */}
        <View style={styles.divider} />

        {/* ─── STEP 2: Persona & Tone — inline strip ─── */}
        <View style={styles.stepBand}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>페르소나 & 심리자극</Text>
          </View>
          <View style={styles.chipRow}>
            {TOON_PERSONA_PRESETS.map((preset) => {
              const sel = preset.id === selectedPresetId;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.personaChip, { borderColor: sel ? ACCENT : BORDER_SLATE, backgroundColor: sel ? ACCENT_SOFT : PAPER }]}
                  onPress={() => { setSelectedPresetId(preset.id); inspectorCtx.setSelectedPresetId(preset.id); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipEmoji}>{preset.emoji}</Text>
                  <Text style={[styles.chipLabel, { color: sel ? ACCENT : TEXT_DIM }]} numberOfLines={1}>{preset.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.psychoRow}>
            {PSYCHOLOGY_TONES.map((tone) => {
              const sel = tone.id === psychoTone;
              return (
                <TouchableOpacity
                  key={tone.id}
                  style={[styles.psychoChip, { borderColor: sel ? ACCENT : BORDER_SLATE, backgroundColor: sel ? ACCENT_SOFT : PAPER }]}
                  onPress={() => setPsychoTone(tone.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipEmoji}>{tone.emoji}</Text>
                  <Text style={[styles.chipLabel, { color: sel ? ACCENT : TEXT_DIM }]} numberOfLines={1}>{tone.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Soft divider before the main grid */}
        <View style={styles.divider} />

        {/* ─── STEP 3: Manga Tile Grid — the visual centerpiece ─── */}
        <View style={styles.gridSection}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.stepBadgeText}>3</Text>
            </View>
            <Text style={[styles.stepTitle, { color: TEXT_DARK }]}>만화 타일 그리드</Text>
            <Text style={[styles.stepCount, { color: TEXT_FAINT }]}>{cuts.length}/{MAX_CUTS}컷</Text>
          </View>

          {/* Generate + Add row — inline */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.generateBtn, { backgroundColor: ACCENT }, (generating || tooningSlots) && styles.generateBtnDisabled]}
              onPress={handleGenerate}
              disabled={generating || tooningSlots}
              activeOpacity={0.85}
            >
              {generating || tooningSlots ? <ActivityIndicator size="small" color="#fff" /> : <Zap size={16} color="#fff" strokeWidth={2.5} />}
              <Text style={styles.generateBtnText}>{generating ? '만화 변환 중...' : tooningSlots ? '필터 적용 중...' : '만화 숏툰 자동 생성'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addPageBtn, { borderColor: ACCENT }]}
              onPress={handleAddCut}
              disabled={cuts.length >= MAX_CUTS}
              activeOpacity={0.7}
            >
              <Plus size={15} color={ACCENT} strokeWidth={2.5} />
              <Text style={[styles.addPageBtnText, { color: ACCENT }, cuts.length >= MAX_CUTS && { opacity: 0.3 }]}>
                컷 추가 ({cuts.length}/{MAX_CUTS})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ─── Manga tile grid ─── */}
          <View style={styles.cutGrid}>
            {cuts.map((cut, cutIdx) => {
              const isSelected = cut.id === selectedCutId;
              const isLastCut = cutIdx === cuts.length - 1;
              return (
                <Pressable
                  key={cut.id}
                  style={[
                    styles.cutCard,
                    { width: cutCardWidth as unknown as number },
                    isSelected && styles.cutCardSelected,
                  ]}
                  onPress={() => handleSelectCut(cut.id)}
                >
                  {/* Cut number badge */}
                  <View style={styles.cutNumberBadge}>
                    <Text style={styles.cutNumberText}>{cut.label}</Text>
                  </View>

                  {/* Delete button */}
                  <TouchableOpacity
                    style={styles.cutDeleteBtn}
                    onPress={() => handleRemoveCut(cut.id)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={8} color={theme.colors.error[400]} strokeWidth={2} />
                  </TouchableOpacity>

                  {/* Manga panel */}
                  <View style={styles.cutPanel}>
                    {cut.imageUrl ? (
                      <Image
                        source={{ uri: cut.imageUrl }}
                        style={styles.cutPanelImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.cutPanelEmpty}>
                        <ImageIcon size={16} color={INK_LIGHT} strokeWidth={1.5} />
                      </View>
                    )}

                    {/* Speech bubble overlay */}
                    {editingBubbleId === cut.id ? (
                      <View style={styles.bubbleFloat}>
                        <View style={styles.bubbleFloatShape}>
                          <TextInput
                            style={styles.bubbleFloatInput}
                            value={cut.speechBubble}
                            onChangeText={(t) => handleUpdateBubble(cut.id, t)}
                            onBlur={() => setEditingBubbleId(null)}
                            autoFocus
                            placeholder="말풍선 입력..."
                            placeholderTextColor={INK_LIGHT}
                            multiline
                          />
                        </View>
                        <View style={styles.bubbleTail} />
                      </View>
                    ) : (
                      <Pressable
                        style={styles.bubbleFloat}
                        onPress={() => setEditingBubbleId(cut.id)}
                      >
                        <View style={styles.bubbleFloatShape}>
                          <Text style={styles.bubbleFloatText} numberOfLines={3}>
                            {cut.speechBubble || '말풍선 입력...'}
                          </Text>
                        </View>
                        <View style={styles.bubbleTail} />
                      </Pressable>
                    )}

                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Selected cut detail — inline */}
          {selectedCut && (
            <View style={[styles.detailPanel, { backgroundColor: PAPER, borderColor: BORDER_SLATE }]}>
              <Text style={[styles.detailTitle, { color: ACCENT }]}>{selectedCut.label} 편집 중</Text>
              <Text style={[styles.detailHint, { color: TEXT_DIM }]}>
                말풍선을 입력하고 만화 스타일을 조정하려면 우측 인스펙터를 사용하세요.
              </Text>
            </View>
          )}

          <TouchableOpacity style={[styles.publishBtn, { backgroundColor: ACCENT }]} onPress={handlePublish} activeOpacity={0.85}>
            <Sparkles size={16} color="#fff" strokeWidth={2.5} />
            <Text style={styles.publishBtnText}>
              {publishFeedback === 'copied' ? '블로그 HTML 복사됨!' : '만화 콘텐츠 확정 & 발행'}
            </Text>
            <ArrowRight size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 15, fontFamily: theme.typography.fontFamily.semiBold },
  headerSub: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, marginTop: 2 },
  // Scroll — full width, generous padding
  scroll: { flex: 1, height: '100%' },
  scrollContent: { paddingHorizontal: 24, paddingVertical: 20, gap: 0, width: '100%', flexGrow: 1 },
  // Step bands — no boxed borders, just padding for organic flow
  stepBand: { paddingVertical: 16, gap: 10 },
  gridSection: { paddingVertical: 16, gap: 14, flex: 1, minHeight: 0 },
  // Soft divider between steps — subtle hairline, no box
  divider: {
    height: 1,
    backgroundColor: BORDER_SLATE,
    marginHorizontal: 0,
    opacity: 0.6,
  },
  // Step header
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBadge: { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  stepBadgeText: { fontSize: 11, fontFamily: theme.typography.fontFamily.bold, color: '#fff' },
  stepTitle: { flex: 1, fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold },
  stepCount: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  // Slots
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotCard: { width: 80, height: 80, borderRadius: 10, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  slotImage: { width: '100%', height: '100%' },
  slotOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 4 },
  slotIndex: { fontSize: 10, fontFamily: theme.typography.fontFamily.bold, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  slotRemove: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  slotAdd: { justifyContent: 'center', alignItems: 'center', gap: 4, borderStyle: 'dashed' },
  slotAddText: { fontSize: 10, fontFamily: theme.typography.fontFamily.medium },
  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  psychoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  psychoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipEmoji: { fontSize: 14 },
  chipLabel: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium },
  // Action row — generate + add side by side
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, flex: 1 },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
  addPageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 16 },
  addPageBtnText: { fontSize: 13, fontFamily: theme.typography.fontFamily.medium },
  // ─── Manga cut grid ───
  cutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cutCard: {
    width: '48%',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER_SLATE,
    backgroundColor: CARD_SURFACE,
    overflow: 'hidden',
    position: 'relative',
  },
  cutCardSelected: {
    borderColor: ACCENT,
    borderWidth: 1.5,
    shadowColor: ACCENT,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  cutNumberBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#1E293B',
    paddingHorizontal: 5,
    paddingVertical: 1,
    zIndex: 3,
  },
  cutNumberText: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.bold,
    color: '#F8F8FA',
  },
  cutDeleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  cutPanel: {
    aspectRatio: 0.75,
    backgroundColor: PAPER,
    position: 'relative',
    margin: 1,
    marginTop: 12,
  },
  cutPanelImage: {
    width: '100%',
    height: '100%',
  },
  cutPanelEmpty: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CARD_SURFACE,
  },
  // Speech bubble — compact, above image layer
  bubbleFloat: {
    position: 'absolute',
    top: 4,
    right: 4,
    maxWidth: '78%',
    zIndex: 5,
  },
  bubbleFloatShape: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 5,
    paddingVertical: 3,
    minHeight: 18,
    justifyContent: 'center',
  },
  bubbleFloatText: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#1a1a1a',
    lineHeight: 11,
  },
  bubbleFloatInput: {
    fontSize: 8,
    fontFamily: theme.typography.fontFamily.medium,
    color: '#1a1a1a',
    padding: 0,
    minHeight: 14,
    lineHeight: 11,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -5,
    left: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#cbd5e1',
  },
  // Detail panel
  detailPanel: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 8, marginTop: 4 },
  detailTitle: { fontSize: 13, fontFamily: theme.typography.fontFamily.semiBold },
  detailHint: { fontSize: 11, fontFamily: theme.typography.fontFamily.regular, lineHeight: 17 },
  // Publish
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, marginTop: 6 },
  publishBtnText: { fontSize: 14, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
  // Capture mode tabs
  captureTabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  captureTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER_SLATE, backgroundColor: CARD_SURFACE,
  },
  captureTabActive: { borderColor: ACCENT, backgroundColor: ACCENT_SOFT },
  captureTabText: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium, color: TEXT_FAINT },
  captureTabTextActive: { color: ACCENT },
  // URL capture
  urlCaptureWrap: { gap: 6, marginBottom: 4 },
  urlInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  urlInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 40, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER_SLATE, backgroundColor: CARD_SURFACE,
  },
  urlInput: { flex: 1, fontSize: 12, fontFamily: theme.typography.fontFamily.regular, color: TEXT_DARK, padding: 0 },
  urlCaptureBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: ACCENT,
  },
  urlCaptureBtnDisabled: { opacity: 0.4 },
  urlCaptureBtnText: { fontSize: 12, fontFamily: theme.typography.fontFamily.semiBold, color: '#fff' },
  urlHint: { fontSize: 10, fontFamily: theme.typography.fontFamily.regular, color: TEXT_FAINT },
  // File actions
  fileActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  fileActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: ACCENT, backgroundColor: ACCENT_SOFT,
  },
  fileActionBtnText: { fontSize: 12, fontFamily: theme.typography.fontFamily.medium, color: ACCENT },
});
