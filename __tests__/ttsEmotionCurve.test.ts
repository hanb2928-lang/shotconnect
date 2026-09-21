import {
  generateEmotionCurve,
  getEmotionParamsAtTime,
  buildTtsInstructionsForPhase,
  splitTextForEmotionCurve,
  enableVoiceCloning,
  getPhaseLabel,
  getPhaseEmoji,
  EMOTION_PHASES,
  type EmotionPhase,
} from '@/lib/ttsEmotionCurve';
import { mapVoiceKeyToProsody } from '@/lib/prosodyProfile';

describe('ttsEmotionCurve', () => {
  describe('EMOTION_PHASES', () => {
    it('has 5 AIDCA phases', () => {
      expect(Object.keys(EMOTION_PHASES)).toHaveLength(5);
    });

    it('attention phase has higher speed', () => {
      expect(EMOTION_PHASES.attention.speed).toBeGreaterThan(1.0);
    });

    it('interest phase has pause', () => {
      expect(EMOTION_PHASES.interest.pauseSec).toBeGreaterThan(0);
    });

    it('action phase has highest style exaggeration', () => {
      expect(EMOTION_PHASES.action.styleExaggeration).toBeGreaterThan(0.1);
    });
  });

  describe('generateEmotionCurve', () => {
    it('generates 5 segments for a 15s video', () => {
      const curve = generateEmotionCurve(15);
      expect(curve.segments).toHaveLength(5);
      expect(curve.totalDurationSec).toBe(15);
    });

    it('first segment starts at 0', () => {
      const curve = generateEmotionCurve(15);
      expect(curve.segments[0].startSec).toBe(0);
    });

    it('last segment ends at total duration', () => {
      const curve = generateEmotionCurve(15);
      expect(curve.segments[curve.segments.length - 1].endSec).toBe(15);
    });

    it('phases are in AIDCA order', () => {
      const curve = generateEmotionCurve(15);
      expect(curve.segments[0].phase).toBe('attention');
      expect(curve.segments[1].phase).toBe('interest');
      expect(curve.segments[2].phase).toBe('desire');
      expect(curve.segments[3].phase).toBe('conviction');
      expect(curve.segments[4].phase).toBe('action');
    });

    it('voiceCloningReady defaults to false without prosody profile', () => {
      const curve = generateEmotionCurve(15);
      expect(curve.voiceCloningReady).toBe(false);
    });

    it('voiceCloningReady is true with prosody profile', () => {
      const profile = mapVoiceKeyToProsody('f1_trendy_beauty');
      const curve = generateEmotionCurve(15, profile);
      expect(curve.voiceCloningReady).toBe(true);
      expect(curve.prosodyProfileId).toBe(profile.id);
    });

    it('each segment has instructions when prosody profile is provided', () => {
      const profile = mapVoiceKeyToProsody('m2_trendy_hype');
      const curve = generateEmotionCurve(15, profile);
      curve.segments.forEach((seg) => {
        expect(seg.instructions).toBeTruthy();
        expect(seg.instructions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getEmotionParamsAtTime', () => {
    it('returns attention phase at t=1', () => {
      const curve = generateEmotionCurve(15);
      const params = getEmotionParamsAtTime(curve, 1);
      expect(params?.phase).toBe('attention');
    });

    it('returns interest phase at t=4', () => {
      const curve = generateEmotionCurve(15);
      const params = getEmotionParamsAtTime(curve, 4);
      expect(params?.phase).toBe('interest');
    });

    it('returns desire phase at t=7', () => {
      const curve = generateEmotionCurve(15);
      const params = getEmotionParamsAtTime(curve, 7);
      expect(params?.phase).toBe('desire');
    });

    it('returns conviction phase at t=11', () => {
      const curve = generateEmotionCurve(15);
      const params = getEmotionParamsAtTime(curve, 11);
      expect(params?.phase).toBe('conviction');
    });

    it('returns action phase at t=14', () => {
      const curve = generateEmotionCurve(15);
      const params = getEmotionParamsAtTime(curve, 14);
      expect(params?.phase).toBe('action');
    });

    it('returns null for out of range', () => {
      const curve = generateEmotionCurve(15);
      const params = getEmotionParamsAtTime(curve, 20);
      expect(params).toBeNull();
    });
  });

  describe('buildTtsInstructionsForPhase', () => {
    it('includes phase guide for attention', () => {
      const instructions = buildTtsInstructionsForPhase('attention');
      expect(instructions).toContain('attention');
    });

    it('appends base instructions when provided', () => {
      const instructions = buildTtsInstructionsForPhase('desire', 'Base voice instructions');
      expect(instructions).toContain('Base voice instructions');
      expect(instructions).toContain('warm');
    });
  });

  describe('splitTextForEmotionCurve', () => {
    it('produces 5 segments', () => {
      const curve = generateEmotionCurve(15);
      const segments = splitTextForEmotionCurve('이거 진짜 좋아요. 한번 써보세요. 최고예요. 강춨합니다. 사세요.', curve, 'alloy');
      expect(segments).toHaveLength(5);
    });

    it('each segment has speed and instructions', () => {
      const curve = generateEmotionCurve(15);
      const segments = splitTextForEmotionCurve('이거 진짜 좋아요. 한번 써보세요. 최고예요.', curve, 'alloy');
      segments.forEach((seg) => {
        expect(seg.speed).toBeGreaterThan(0);
        expect(seg.instructions).toBeTruthy();
        expect(seg.voice).toBe('alloy');
      });
    });

    it('applies breath markers with prosody profile', () => {
      const profile = mapVoiceKeyToProsody('f2_professional');
      const curve = generateEmotionCurve(15, profile);
      const segments = splitTextForEmotionCurve(
        '이거 진짜 좋아요. 한번 써보세요. 최고예요. 강춨합니다. 사세요.',
        curve, 'shimmer', undefined, profile,
      );
      segments.forEach((seg) => {
        expect(seg.instructions).toContain('calm');
        expect(seg.instructions.length).toBeGreaterThan(50);
      });
    });
  });

  describe('enableVoiceCloning', () => {
    it('sets voiceCloningReady to true', () => {
      const curve = generateEmotionCurve(15);
      const cloned = enableVoiceCloning(curve);
      expect(cloned.voiceCloningReady).toBe(true);
    });
  });

  describe('getPhaseLabel / getPhaseEmoji', () => {
    it('returns correct labels for all 5 phases', () => {
      expect(getPhaseLabel('attention')).toBe('어텐션');
      expect(getPhaseLabel('interest')).toBe('관심');
      expect(getPhaseLabel('desire')).toBe('욕구');
      expect(getPhaseLabel('conviction')).toBe('확신');
      expect(getPhaseLabel('action')).toBe('액션');
    });

    it('returns correct emojis for all 5 phases', () => {
      expect(getPhaseEmoji('attention')).toBe('👀');
      expect(getPhaseEmoji('interest')).toBe('🤔');
      expect(getPhaseEmoji('desire')).toBe('✨');
      expect(getPhaseEmoji('conviction')).toBe('💪');
      expect(getPhaseEmoji('action')).toBe('🔥');
    });
  });

  describe('prosodyProfile mapping', () => {
    it('maps trendy hype voices to trendy_hype profile', () => {
      const profile = mapVoiceKeyToProsody('m2_trendy_hype');
      expect(profile.id).toBe('trendy_hype');
    });

    it('maps professional voices to professional_female profile', () => {
      const profile = mapVoiceKeyToProsody('f2_professional');
      expect(profile.id).toBe('professional_female');
    });

    it('maps trendy beauty voices to trendy_beauty profile', () => {
      const profile = mapVoiceKeyToProsody('f1_trendy_beauty');
      expect(profile.id).toBe('trendy_beauty');
    });

    it('maps authoritative male voices to authoritative_male profile', () => {
      const profile = mapVoiceKeyToProsody('m1_authoritative');
      expect(profile.id).toBe('authoritative_male');
    });
  });
});
