import type { Seed } from '../domain/types';

export type SeedLoadResult =
  | {
      ok: true;
      seeds: Seed[];
      recoveredFromBackup?: boolean;
    }
  | {
      ok: false;
      reason: 'read_error' | 'parse_error';
      message?: string;
    };

export type SeedSaveResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'write_error';
      message?: string;
    };

export interface SeedRepository {
  getAll(): Promise<SeedLoadResult>;
  saveAll(seeds: Seed[]): Promise<SeedSaveResult>;
}
