import {
  type ResurfacedSeed,
  type Seed,
  type SeedCreateInput,
  type SeedUpdateInput,
  type TransformOutput,
  type TransformType,
  SEED_SCHEMA_VERSION,
} from '../domain/types';

const SCORE_DECAY_DAYS = 14;

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const cleanArray = (values: string[] | undefined): string[] =>
  Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));

export const createSeed = (input: SeedCreateInput): Seed => {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: input.title?.trim() || undefined,
    body: input.body.trim(),
    createdAt: now,
    updatedAt: now,
    mood: input.mood,
    importance: input.importance ?? 3,
    growthState: input.growthState ?? 'seed',
    tags: cleanArray(input.tags),
    relatedSeedIds: cleanArray(input.relatedSeedIds),
    transformOutputs: [],
    schemaVersion: SEED_SCHEMA_VERSION,
  };
};

export const updateSeed = (seed: Seed, patch: SeedUpdateInput): Seed => ({
  ...seed,
  ...patch,
  title: patch.title !== undefined ? patch.title?.trim() || undefined : seed.title,
  body: patch.body !== undefined ? patch.body.trim() : seed.body,
  tags: patch.tags !== undefined ? cleanArray(patch.tags) : seed.tags,
  relatedSeedIds: patch.relatedSeedIds !== undefined ? cleanArray(patch.relatedSeedIds) : seed.relatedSeedIds,
  transformOutputs: patch.transformOutputs ?? seed.transformOutputs ?? [],
  updatedAt: new Date().toISOString(),
});

export const updateSeedResurfacingMeta = (
  seed: Seed,
  meta: Pick<Seed, 'lastResurfacedAt' | 'resurfacingScore'>,
): Seed => ({
  ...seed,
  lastResurfacedAt: meta.lastResurfacedAt ?? seed.lastResurfacedAt,
  resurfacingScore: meta.resurfacingScore ?? seed.resurfacingScore,
});

export const parseTags = (raw: string): string[] =>
  cleanArray(
    raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

const buildResurfacingScore = (seed: Seed, now: Date): number => {
  const updatedAt = new Date(seed.updatedAt).getTime();
  const ageDays = Math.max(0, (now.getTime() - updatedAt) / (1000 * 60 * 60 * 24));
  const lastResurfacedAt = seed.lastResurfacedAt ? new Date(seed.lastResurfacedAt).getTime() : 0;
  const daysSinceResurfaced =
    lastResurfacedAt > 0 ? Math.max(0, (now.getTime() - lastResurfacedAt) / (1000 * 60 * 60 * 24)) : SCORE_DECAY_DAYS;

  const stateWeight =
    seed.growthState === 'seed' ? 1.2 : seed.growthState === 'sprout' ? 1.1 : seed.growthState === 'tree' ? 1 : 0.3;

  const recencyFactor = Math.min(ageDays, SCORE_DECAY_DAYS) / SCORE_DECAY_DAYS;
  const resurfacingFactor = Math.min(daysSinceResurfaced, SCORE_DECAY_DAYS) / SCORE_DECAY_DAYS;

  return seed.importance * 1.6 + recencyFactor * 2 + resurfacingFactor * 2 + stateWeight;
};

export const pickTodaySeed = (seeds: Seed[]): ResurfacedSeed | undefined => {
  const candidates = seeds.filter((seed) => seed.growthState !== 'archived');
  if (candidates.length === 0) {
    return undefined;
  }

  const now = new Date();
  const scored = candidates
    .map((seed) => ({ seed, score: buildResurfacingScore(seed, now) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const picked = scored[Math.floor(Math.random() * scored.length)];

  const days = Math.floor((now.getTime() - new Date(picked.seed.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
  const reason =
    days >= 7
      ? 'しばらく見返していない種です'
      : picked.seed.importance >= 4
        ? '大切度が高い種です'
        : 'いまのあなたに合いそうな種です';

  return {
    seed: {
      ...picked.seed,
      resurfacingScore: Number(picked.score.toFixed(2)),
    },
    reason,
  };
};

const transformTemplates: Record<TransformType, (seed: Seed) => string> = {
  question: (seed) => `問い: 「${seed.body}」を深めるために、次に確かめたいことは何だろう？`,
  task: (seed) => `タスク案: 「${seed.body}」に向けて、最初の小さな一歩を1つ書き出す。`,
  article: (seed) => `記事案: 「${seed.body}」をテーマに、導入→背景→気づき→次の提案の構成で下書きを作る。`,
  project: (seed) => `プロジェクト案: 「${seed.body}」を育てるため、目的・最小実験・期限を3行で定義する。`,
};

export const buildTransformOutput = (seed: Seed, type: TransformType): TransformOutput => ({
  id: createId(),
  type,
  content: transformTemplates[type](seed),
  createdAt: new Date().toISOString(),
});

export const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

export const getLocalDateKey = (date = new Date()): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
