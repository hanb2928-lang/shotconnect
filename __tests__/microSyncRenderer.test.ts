import {
  generateSyncTimeline,
  getSyncMarkersAtTime,
  getTempoLayerAtTime,
  getEffectLabel,
  getEffectEmoji,
  buildRenderInstructions,
} from '@/lib/microSyncRenderer';

describe('microSyncRenderer', () => {
  describe('generateSyncTimeline', () => {
    it('generates markers for known keywords', () => {
      const timeline = generateSyncTimeline('이거 진짜 대박이에요. 완전 꿀템입니다.', 15);
      expect(timeline.markers.length).toBeGreaterThan(0);
    });

    it('generates tempo layers covering full duration', () => {
      const timeline = generateSyncTimeline('테스트 텍스트입니다.', 10);
      expect(timeline.tempoLayers.length).toBeGreaterThan(0);
      const lastLayer = timeline.tempoLayers[timeline.tempoLayers.length - 1];
      expect(lastLayer.endSec).toBe(10);
    });

    it('first tempo layer starts at 0', () => {
      const timeline = generateSyncTimeline('테스트', 10);
      expect(timeline.tempoLayers[0].startSec).toBe(0);
    });

    it('tempo layers are within 0.8~1.2s intervals (except last clipped)', () => {
      const timeline = generateSyncTimeline('테스트 텍스트입니다.', 10);
      // All layers except the last one should be within interval range
      // The last layer is clipped to totalDurationSec so may be shorter
      timeline.tempoLayers.slice(0, -1).forEach((layer) => {
        const duration = layer.endSec - layer.startSec;
        expect(duration).toBeGreaterThanOrEqual(0.7); // 0.8 with rounding
        expect(duration).toBeLessThanOrEqual(1.3); // 1.2 with rounding
      });
    });

    it('detects "진짜" keyword', () => {
      const timeline = generateSyncTimeline('이거 진짜 좋아요', 10);
      const 진짜Markers = timeline.markers.filter((m) => m.keyword === '진짜');
      expect(진짜Markers.length).toBeGreaterThan(0);
      expect(진짜Markers[0].effect).toBe('zoomIn');
    });

    it('detects "대박" keyword', () => {
      const timeline = generateSyncTimeline('이거 대박이에요', 10);
      const 대박Markers = timeline.markers.filter((m) => m.keyword === '대박');
      expect(대박Markers.length).toBeGreaterThan(0);
      expect(대박Markers[0].effect).toBe('captionBounce');
    });

    it('detects English keywords', () => {
      const timeline = generateSyncTimeline('This is amazing and crazy', 10);
      expect(timeline.markers.length).toBeGreaterThan(0);
    });

    it('detects Japanese keywords', () => {
      const timeline = generateSyncTimeline('これやばいですね', 10);
      expect(timeline.markers.length).toBeGreaterThan(0);
    });

    it('returns empty markers for text without keywords', () => {
      const timeline = generateSyncTimeline('안녕하세요 반갑습니다', 10);
      expect(timeline.markers).toHaveLength(0);
    });

    it('still generates tempo layers for text without keywords', () => {
      const timeline = generateSyncTimeline('안녕하세요', 10);
      expect(timeline.tempoLayers.length).toBeGreaterThan(0);
    });

    it('sets total duration correctly', () => {
      const timeline = generateSyncTimeline('테스트', 20);
      expect(timeline.totalDurationSec).toBe(20);
    });
  });

  describe('getSyncMarkersAtTime', () => {
    it('returns markers near the specified time', () => {
      const timeline = generateSyncTimeline('이거 진짜 좋아요 대박', 10);
      if (timeline.markers.length > 0) {
        const firstMarker = timeline.markers[0];
        const found = getSyncMarkersAtTime(timeline, firstMarker.timeSec);
        expect(found.length).toBeGreaterThan(0);
      }
    });

    it('returns empty array when no markers near time', () => {
      const timeline = generateSyncTimeline('이거 진짜 좋아요', 10);
      const found = getSyncMarkersAtTime(timeline, 999);
      expect(found).toHaveLength(0);
    });
  });

  describe('getTempoLayerAtTime', () => {
    it('returns the layer containing the specified time', () => {
      const timeline = generateSyncTimeline('테스트', 10);
      const layer = getTempoLayerAtTime(timeline, 2);
      expect(layer).not.toBeNull();
      expect(layer!.startSec).toBeLessThanOrEqual(2);
      expect(layer!.endSec).toBeGreaterThan(2);
    });

    it('returns null for time beyond duration', () => {
      const timeline = generateSyncTimeline('테스트', 10);
      const layer = getTempoLayerAtTime(timeline, 999);
      expect(layer).toBeNull();
    });
  });

  describe('getEffectLabel / getEffectEmoji', () => {
    it('returns correct labels', () => {
      expect(getEffectLabel('zoomIn')).toBe('줌인');
      expect(getEffectLabel('captionBounce')).toBe('자막 바운스');
      expect(getEffectLabel('pixelShake')).toBe('픽셀 셰이크');
      expect(getEffectLabel('colorPulse')).toBe('컬러 펄스');
    });

    it('returns correct emojis', () => {
      expect(getEffectEmoji('zoomIn')).toBe('🔍');
      expect(getEffectEmoji('captionBounce')).toBe('💬');
    });
  });

  describe('buildRenderInstructions', () => {
    it('generates human-readable render instructions', () => {
      const timeline = generateSyncTimeline('이거 진짜 대박이에요', 10);
      const instructions = buildRenderInstructions(timeline);
      expect(instructions).toContain('비트-텍스트 동기화');
      expect(instructions).toContain('템포 페이싱');
      expect(instructions).toContain('총 마커 수');
    });
  });
});
