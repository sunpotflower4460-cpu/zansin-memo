import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GrowthState, Mood, Seed, TransformOutput, TransformType } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import type { SeedLoadResult, SeedRepository, SeedSaveResult } from './seedRepository';

const STORAGE_KEY = 'kizashi-notes:seeds:v1';
const LAST_GOOD_STORAGE_KEY = 'kizashi-notes:seeds:v1:lastGood';
const CORRUPT_BACKUP_PREFIX = 'kizashi-notes:seeds:v1:corruptBackup';
const RECOVERY_BODY_FALLBACK = '（復元できなかった種）';
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
  const lastResurfacedAt = asString(data.lastResurfacedAt);
  const deletedAt = asString(data.deletedAt);

  return {
    id: asString(data.id)?.trim() || createId(),
    title: asString(data.title)?.trim() || undefined,
    body: asString(data.body)?.trim() || RECOVERY_BODY_FALLBACK,
    createdAt,
    updatedAt,
    mood: mood && MOODS.includes(mood as Mood) ? (mood as Mood) : undefined,
    importance,
    growthState: growthState && GROWTH_STATES.includes(growthState as GrowthState) ? (growthState as GrowthState) : 'seed',
    tags: normalizeStringArray(data.tags),
    relatedSeedIds: normalizeStringArray(data.relatedSeedIds),
    resurfacingScore: typeof data.resurfacingScore === 'number' && Number.isFinite(data.resurfacingScore) ? data.resurfacingScore : undefined,
    lastResurfacedAt: lastResurfacedAt && isValidIsoDate(lastResurfacedAt) ? new Date(lastResurfacedAt).toISOString() : undefined,
    deletedAt: deletedAt && isValidIsoDate(deletedAt) ? new Date(deletedAt).toISOString() : undefined,
    transformOutputs: normalizeTransformOutputs(data.transformOutputs, updatedAt),
    schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : SEED_SCHEMA_VERSION,
  };
};

const parseSeeds = (raw: string): Seed[] | undefined => {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    return undefined;
  }
  return parsed.map(normalizeSeed).filter((seed): seed is Seed => Boolean(seed));
};

const buildErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) {
    return error.message;
  }
  return undefined;
};

const backupCorruptRaw = async (raw: string): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await AsyncStorage.setItem(`${CORRUPT_BACKUP_PREFIX}:${timestamp}`, raw);
  } catch {
    // Best-effort only. Never let backup failure trigger destructive writes.
  }
};

export class AsyncStorageSeedRepository implements SeedRepository {
  async getAll(): Promise<SeedLoadResult> {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return { ok: false, reason: 'read_error', message: buildErrorMessage(error) };
    }

    if (!raw) {
      return { ok: true, seeds: [] };
    }

    try {
      const seeds = parseSeeds(raw);
      if (seeds) {
        return { ok: true, seeds };
      }
    } catch {
      // Continue to corrupt backup + lastGood recovery below.
    }

    await backupCorruptRaw(raw);

    try {
      const lastGoodRaw = await AsyncStorage.getItem(LAST_GOOD_STORAGE_KEY);
      if (!lastGoodRaw) {
        return { ok: false, reason: 'parse_error', message: '保存データの形式を復元できませんでした。' };
      }

      const recoveredSeeds = parseSeeds(lastGoodRaw);
      if (!recoveredSeeds) {
        await backupCorruptRaw(lastGoodRaw);
        return { ok: false, reason: 'parse_error', message: 'バックアップデータの形式を復元できませんでした。' };
      }

      return { ok: true, seeds: recoveredSeeds, recoveredFromBackup: true };
    } catch (error) {
      return { ok: false, reason: 'parse_error', message: buildErrorMessage(error) };
    }
  }

  async saveAll(seeds: Seed[]): Promise<SeedSaveResult> {
    const normalized = seeds.map(normalizeSeed).filter((seed): seed is Seed => Boolean(seed));
    const serialized = JSON.stringify(normalized);

    try {
      await AsyncStorage.setItem(STORAGE_KEY, serialized);
      await AsyncStorage.setItem(LAST_GOOD_STORAGE_KEY, serialized);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'write_error', message: buildErrorMessage(error) };
    }
  }
}

export const seedRepository = new AsyncStorageSeedRepository();
