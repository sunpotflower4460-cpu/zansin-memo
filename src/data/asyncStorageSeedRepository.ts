import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GrowthState, Mood, Seed, TransformOutput, TransformType } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import type { SeedRepository } from './seedRepository';

const STORAGE_KEY = 'kizashi-notes:seeds:v1';
const GROWTH_STATES: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
const MOODS: Mood[] = ['calm', 'excited', 'uncertain', 'heavy', 'bright'];
const TRANSFORM_TYPES: TransformType[] = ['question', 'task', 'article', 'project'];
const IMPORTANCE_VALUES = [1, 2, 3, 4, 5] as const;

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const isValidIsoDate = (value: string): boolean => !Number.isNaN(new Date(value).getTime());

const normalizeDate = (value: unknown, fallback: string): string => {
  const raw = asString(value);
  if (!raw || !isValidIsoDate(raw)) {
    return fallback;
  }
  return new Date(raw).toISOString();
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)));
};

const normalizeTransformOutputs = (value: unknown, fallbackDate: string): TransformOutput[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const data = asObject(item);
      if (!data) {
        return undefined;
      }

      const type = asString(data.type);
      const content = asString(data.content)?.trim();
      if (!type || !TRANSFORM_TYPES.includes(type as TransformType) || !content) {
        return undefined;
      }

      return {
        id: asString(data.id)?.trim() || createId(),
        type: type as TransformType,
        content,
        createdAt: normalizeDate(data.createdAt, fallbackDate),
      } satisfies TransformOutput;
    })
    .filter((output): output is TransformOutput => Boolean(output));
};

const normalizeSeed = (seed: unknown): Seed | undefined => {
  const data = asObject(seed);
  if (!data) {
    return undefined;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeDate(data.createdAt, now);
  const updatedAt = normalizeDate(data.updatedAt, createdAt);

  const importanceValue = typeof data.importance === 'number' ? (Math.round(data.importance) as Seed['importance']) : 3;
  const importance = IMPORTANCE_VALUES.includes(importanceValue) ? importanceValue : 3;

  const growthState = asString(data.growthState);
  const mood = asString(data.mood);

  return {
    id: asString(data.id)?.trim() || createId(),
    title: asString(data.title)?.trim() || undefined,
    body: asString(data.body)?.trim() || '（復元できなかった種）',
    createdAt,
    updatedAt,
    mood: mood && MOODS.includes(mood as Mood) ? (mood as Mood) : undefined,
    importance,
    growthState: growthState && GROWTH_STATES.includes(growthState as GrowthState) ? (growthState as GrowthState) : 'seed',
    tags: normalizeStringArray(data.tags),
    relatedSeedIds: normalizeStringArray(data.relatedSeedIds),
    resurfacingScore: typeof data.resurfacingScore === 'number' && Number.isFinite(data.resurfacingScore) ? data.resurfacingScore : undefined,
    lastResurfacedAt: isValidIsoDate(asString(data.lastResurfacedAt) ?? '') ? new Date(asString(data.lastResurfacedAt) as string).toISOString() : undefined,
    transformOutputs: normalizeTransformOutputs(data.transformOutputs, updatedAt),
    schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : SEED_SCHEMA_VERSION,
  };
};

export class AsyncStorageSeedRepository implements SeedRepository {
  async getAll(): Promise<Seed[]> {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    } catch {
      return [];
    }
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map(normalizeSeed).filter((seed): seed is Seed => Boolean(seed));
    } catch {
      return [];
    }
  }

  async saveAll(seeds: Seed[]): Promise<void> {
    const normalized = seeds.map(normalizeSeed).filter((seed): seed is Seed => Boolean(seed));
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      return;
    }
  }
}

export const seedRepository = new AsyncStorageSeedRepository();
