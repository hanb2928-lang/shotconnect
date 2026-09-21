export type HookEffectType = 'rotation_zoom' | 'dramatic_zoom_in' | 'paradox_reveal' | 'context_cut' | 'detail_punch';

export interface InlineEditState {
  volumeIntensity: number;
  hookEffect: HookEffectType;
  beatSyncSensitivity: number;
  sfxStyle: string;
  captionText: string;
  hashtags: string[];
  videoTemplate: string;
  captionFont: string;
  captionPosition: string;
  bgmMood: string;
  aiPrompt: string;
  titleText: string;
}
