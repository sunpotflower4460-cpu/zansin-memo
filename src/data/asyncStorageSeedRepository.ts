import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import type { SeedRepository } from './seedRepository';

const STORAGE_KEY = 'kizashi-notes:seeds:v1';

const normalizeSeed = (seed: Seed): Seed => ({
  ...seed,
  schemaVersion: seed.schemaVersion ?? SEED_SCHEMA_VERSION,
  tags: seed.tags ?? [],
  relatedSeedIds: seed.relatedSeedIds ?? [],
  transformOutputs: seed.transformOutputs ?? [],
});

export class AsyncStorageSeedRepository implements SeedRepository {
  async getAll(): Promise<Seed[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Seed[];
      return Array.isArray(parsed) ? parsed.map(normalizeSeed) : [];
    } catch {
      return [];
    }
  }

  async saveAll(seeds: Seed[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeds.map(normalizeSeed)));
  }
}

export const seedRepository = new AsyncStorageSeedRepository();
