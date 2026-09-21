import {
  DURATION_PRESETS,
  DEFAULT_DURATION,
  tierLabel,
  tierColor,
  getTierForDuration,
  getPresetForDuration,
  getRecommendedDuration,
} from '@/lib/durationPresets';

describe('DURATION_PRESETS', () => {
  it('6개의 프리셋이 있다', () => {
    expect(DURATION_PRESETS).toHaveLength(6);
  });

  it('모든 프리셋이 필수 필드를 가진다', () => {
    for (const preset of DURATION_PRESETS) {
      expect(preset.value).toBeGreaterThan(0);
      expect(preset.label).toBeTruthy();
      expect(preset.tier).toBeTruthy();
      expect(preset.desc).toBeTruthy();
    }
  });

  it('값이 오름차순으로 정렬되어 있다', () => {
    for (let i = 1; i < DURATION_PRESETS.length; i++) {
      expect(DURATION_PRESETS[i].value).toBeGreaterThan(DURATION_PRESETS[i - 1].value);
    }
  });
});

describe('DEFAULT_DURATION', () => {
  it('20000ms (20초)이다', () => {
    expect(DEFAULT_DURATION).toBe(15000);
  });
});

describe('tierLabel', () => {
  it('각 티어에 맞는 라벨을 반환한다', () => {
    expect(tierLabel('viral')).toBe('바이럴');
    expect(tierLabel('standard')).toBe('표준');
    expect(tierLabel('detailed')).toBe('상세');
  });
});

describe('tierColor', () => {
  it('각 티어에 맞는 색상을 반환한다', () => {
    expect(tierColor('viral')).toBe('#f59e0b');
    expect(tierColor('standard')).toBe('#2f9dff');
    expect(tierColor('detailed')).toBe('#8b5cf6');
  });
});

describe('getTierForDuration', () => {
  it('프리셋에 있는 값은 해당 티어를 반환한다', () => {
    expect(getTierForDuration(12000)).toBe('viral');
    expect(getTierForDuration(18000)).toBe('standard');
    expect(getTierForDuration(30000)).toBe('detailed');
  });

  it('프리셋에 없는 값은 범위로 판단한다', () => {
    expect(getTierForDuration(13000)).toBe('viral');
    expect(getTierForDuration(19000)).toBe('standard');
    expect(getTierForDuration(25000)).toBe('detailed');
  });

  it('0이나 음수는 viral을 반환한다', () => {
    expect(getTierForDuration(0)).toBe('viral');
    expect(getTierForDuration(-1000)).toBe('viral');
  });
});

describe('getPresetForDuration', () => {
  it('존재하는 값은 프리셋을 반환한다', () => {
    const preset = getPresetForDuration(15000);
    expect(preset).toBeDefined();
    expect(preset!.label).toBe('15초');
  });

  it('존재하지 않는 값은 undefined를 반환한다', () => {
    expect(getPresetForDuration(17000)).toBeUndefined();
  });
});

describe('getRecommendedDuration', () => {
  it('패션 카테고리는 18초를 추천한다', () => {
    const result = getRecommendedDuration('fashion');
    expect(result.duration).toBe(18000);
    expect(result.reason).toContain('패션');
  });

  it('식품 카테고리는 12초를 추천한다', () => {
    const result = getRecommendedDuration('food');
    expect(result.duration).toBe(12000);
  });

  it('한글 카테고리를 인식한다', () => {
    const result = getRecommendedDuration('뷰티/화장품');
    expect(result.duration).toBe(18000);
    expect(result.reason).toContain('뷰티');
  });

  it('알 수 없는 카테고리는 기본값 20초를 추천한다', () => {
    const result = getRecommendedDuration('unknown');
    expect(result.duration).toBe(15000);
  });

  it('null 카테고리는 기본값을 추천한다', () => {
    const result = getRecommendedDuration(null);
    expect(result.duration).toBe(15000);
  });
});
