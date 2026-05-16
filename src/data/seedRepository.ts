import type { Seed } from '../domain/types';

export interface SeedRepository {
  getAll(): Promise<Seed[]>;
  saveAll(seeds: Seed[]): Promise<void>;
}
