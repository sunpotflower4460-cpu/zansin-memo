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
const RECOVERY_BODY_FALLBACK = '（復元できなかった種）';

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const DAY_MS = 1000 * 60 * 60 * 24;
const FALLBACK_SCORE = 0;

const cleanArray = (values: string[] | undefined): string[] =>
  Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));

const toTimestamp = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
};

const clampImportance = (value: number | undefined): 1 | 2 | 3 | 4 | 5 => {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return 3;
};

export const createSeed = (input: SeedCreateInput): Seed => {
  const now = new Date().toISOString();
  const body = input.body.trim();

  return {
    id: createId(),
    title: input.title?.trim() || undefined,
    body,
    createdAt: now,
    updatedAt: now,
    mood: input.mood,
    importance: clampImportance(input.importance),
    growthState: input.growthState ?? 'seed',
    tags: cleanArray(input.tags),
    relatedSeedIds: cleanArray(input.relatedSeedIds),
    transformOutputs: [],
    schemaVersion: SEED_SCHEMA_VERSION,
  };
};

export const updateSeed = (seed: Seed, patch: SeedUpdateInput): Seed => {
  const currentBody = seed.body.trim() || RECOVERY_BODY_FALLBACK;
  const nextBody = patch.body !== undefined ? patch.body.trim() : currentBody;

  return {
    ...seed,
    ...patch,
    title: patch.title !== undefined ? patch.title?.trim() || undefined : seed.title,
    body: nextBody || currentBody,
    tags: patch.tags !== undefined ? cleanArray(patch.tags) : seed.tags,
    relatedSeedIds: patch.relatedSeedIds !== undefined ? cleanArray(patch.relatedSeedIds) : seed.relatedSeedIds,
    transformOutputs: patch.transformOutputs ?? seed.transformOutputs ?? [],
    updatedAt: new Date().toISOString(),
  };
};

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
  const updatedAt = toTimestamp(seed.updatedAt);
  const ageDays = updatedAt ? Math.max(0, (now.getTime() - updatedAt) / DAY_MS) : SCORE_DECAY_DAYS;
  const lastResurfacedAt = toTimestamp(seed.lastResurfacedAt);
  const daysSinceResurfaced = lastResurfacedAt ? Math.max(0, (now.getTime() - lastResurfacedAt) / DAY_MS) : SCORE_DECAY_DAYS;

  const stateWeight =
    seed.growthState === 'seed' ? 1.2 : seed.growthState === 'sprout' ? 1.1 : seed.growthState === 'tree' ? 1 : 0.3;

  const recencyFactor = Math.min(ageDays, SCORE_DECAY_DAYS) / SCORE_DECAY_DAYS;
  const resurfacingFactor = Math.min(daysSinceResurfaced, SCORE_DECAY_DAYS) / SCORE_DECAY_DAYS;

  const score = seed.importance * 1.6 + recencyFactor * 2 + resurfacingFactor * 2 + stateWeight;
  return Number.isFinite(score) ? score : FALLBACK_SCORE;
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
  if (!picked) {
    return undefined;
  }

  const updatedAt = toTimestamp(picked.seed.updatedAt) ?? now.getTime();
  const days = Math.floor((now.getTime() - updatedAt) / DAY_MS);
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
  if (Number.isNaN(date.getTime())) {
    return '日付不明';
  }
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
