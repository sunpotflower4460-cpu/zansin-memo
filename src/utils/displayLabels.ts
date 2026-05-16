import type { GrowthState, Mood, TransformType } from '../domain/types';

export const growthStateLabels: Record<GrowthState, string> = {
  seed: '種',
  sprout: '芽',
  tree: '木',
  archived: '保管',
};

export const moodLabels: Record<Mood, string> = {
  calm: 'おだやか',
  excited: '高まり',
  uncertain: 'まだ曖昧',
  heavy: '重たい',
  bright: '明るい',
};

export const transformLabels: Record<TransformType, string> = {
  question: '問いの候補',
  task: '小さな行動の候補',
  article: '記事案の候補',
  project: 'プロジェクト案の候補',
};

export const sortLabels: Record<'updated' | 'importance', string> = {
  updated: '最近',
  importance: '大切度',
};

export const tabLabels: Record<'home' | 'write' | 'seeds' | 'garden', string> = {
  home: 'ホーム',
  write: '書く',
  seeds: '種一覧',
  garden: '庭',
};

export const allLabel = 'すべて';
export const tabLabelSuffix = 'タブ';
export const chipSelectorScrollHint = '左右にスワイプして選択肢を表示できます';
export const chipSelectorOptionsSuffix = 'の選択肢';

export const toGrowthLabel = (value: GrowthState) => growthStateLabels[value];
export const toMoodLabel = (value?: Mood) => (value ? moodLabels[value] : 'なし');
