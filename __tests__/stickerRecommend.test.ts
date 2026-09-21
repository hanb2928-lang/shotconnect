import {
  recommendStickerStyle,
  recommendStickerSize,
  getCardStyleForPlatform,
} from '@/lib/stickerRecommend';
import type { PlatformKey } from '@/types/database';

describe('recommendStickerStyle', () => {
  it('카테고리가 매칭되면 해당 스타일을 반환한다', () => {
    expect(recommendStickerStyle('bold', 'sneakers')).toBe('pill');
    expect(recommendStickerStyle('bold', 'lighting')).toBe('rounded');
    expect(recommendStickerStyle('bold', 'electronics')).toBe('minimal');
  });

  it('카테고리가 없으면 cardStyle 기반 기본값을 반환한다', () => {
    expect(recommendStickerStyle('bold', '')).toBe('pill');
    expect(recommendStickerStyle('magazine', '')).toBe('rounded');
    expect(recommendStickerStyle('minimal', '')).toBe('minimal');
  });

  it('부분 매칭도 동작한다', () => {
    expect(recommendStickerStyle('bold', 'running shoes')).toBe('pill');
    expect(recommendStickerStyle('bold', 'desk lamp')).toBe('rounded');
  });
});

describe('recommendStickerSize', () => {
  it('bold 카드 스타일은 48을 반환한다', () => {
    expect(recommendStickerSize('bold')).toBe(48);
  });

  it('magazine 카드 스타일은 48을 반환한다', () => {
    expect(recommendStickerSize('magazine')).toBe(48);
  });

  it('minimal 카드 스타일은 40을 반환한다', () => {
    expect(recommendStickerSize('minimal')).toBe(40);
  });

  it('feed 카드 스타일은 48을 반환한다', () => {
    expect(recommendStickerSize('feed')).toBe(48);
  });
});

describe('getCardStyleForPlatform', () => {
  it('shortform은 bold를 반환한다', () => {
    expect(getCardStyleForPlatform('shortform')).toBe('bold');
  });

  it('naverBlog는 magazine을 반환한다', () => {
    expect(getCardStyleForPlatform('naverBlog')).toBe('magazine');
  });

  it('instagram은 feed를 반환한다', () => {
    expect(getCardStyleForPlatform('instagram')).toBe('feed');
  });

  it('twitter는 minimal을 반환한다', () => {
    expect(getCardStyleForPlatform('twitter')).toBe('minimal');
  });

  it('threads는 minimal을 반환한다', () => {
    expect(getCardStyleForPlatform('threads')).toBe('minimal');
  });

  it('templateData가 있으면 해당 플랫폼의 cardStyle을 반환한다', () => {
    const templateData = {
      platformVariants: {
        naverBlog: { hook: '', caption: '', hashtags: [], cardStyle: 'magazine' as const },
        shortform: { hook: '', caption: '', hashtags: [], cardStyle: 'magazine' as const },
        twitter: { hook: '', caption: '', hashtags: [], cardStyle: 'minimal' as const },
        instagram: { hook: '', caption: '', hashtags: [], cardStyle: 'feed' as const },
        threads: { hook: '', caption: '', hashtags: [], cardStyle: 'minimal' as const },
        pinterest: { hook: '', caption: '', hashtags: [], cardStyle: 'magazine' as const },
        smartstore: { hook: '', caption: '', hashtags: [], cardStyle: 'magazine' as const },
      },
    };
    expect(getCardStyleForPlatform('shortform', templateData)).toBe('magazine');
  });
});
