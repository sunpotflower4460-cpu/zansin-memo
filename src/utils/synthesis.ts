import type { Seed, SeedSynthesis, SynthesisSource } from '../domain/types';

// 芽（synthesis）の読み取り。材料は「芽をまとめたときに読んだ文章」のスナップショットで、現在のメモとは別。

/** 現在の芽として数えるのは、芽の文があり、育ち方が芽・木のもの。種へ戻した考えは数えない。 */
export type SynthesisStatus = 'current' | 'reconsidered' | 'legacy' | 'none';

export const getSynthesisStatus = (seed: Seed): SynthesisStatus => {
  const sprouted = seed.growthState === 'sprout' || seed.growthState === 'tree';
  if (seed.synthesis) {
    return sprouted ? 'current' : 'reconsidered';
  }
  // 以前から芽・木の状態だけだったもの。芽の文章は作らない。
  return sprouted ? 'legacy' : 'none';
};

export const hasCurrentSynthesis = (seed: Seed): seed is Seed & { synthesis: SeedSynthesis } => getSynthesisStatus(seed) === 'current';

export type SourceState =
  | { kind: 'unchanged'; currentText: string }
  | { kind: 'changed'; currentText: string }
  | { kind: 'deleted' }
  | { kind: 'missing' };

/**
 * 芽をまとめたときの材料が、いまどうなっているか。
 * 文章の差分で判定する（タグの変更などで更新日時だけが動いたものは「変更」にしない）。
 * 削除済みの本文は、通常の画面には出さない。
 */
export const describeSource = (source: SynthesisSource, byId: Map<string, Seed>): SourceState => {
  const origin = byId.get(source.seedId);
  if (!origin) {
    return { kind: 'missing' };
  }
  if (origin.deletedAt) {
    return { kind: 'deleted' };
  }
  const currentText = source.sourcePart === 'body' ? origin.body : origin.synthesis?.statement;
  if (currentText === undefined) {
    return { kind: 'missing' };
  }
  return currentText === source.textSnapshot ? { kind: 'unchanged', currentText } : { kind: 'changed', currentText };
};

export const sourcePartLabel = (part: SynthesisSource['sourcePart']): string => (part === 'synthesis' ? '芽の文' : '元のメモ');

/** 材料に、現在のメモと違いがあるものがあるか（芽の見直しを促す目印に使う）。 */
export const hasChangedSources = (seed: Seed, byId: Map<string, Seed>): boolean =>
  Boolean(seed.synthesis?.sources.some((source) => describeSource(source, byId).kind === 'changed'));
