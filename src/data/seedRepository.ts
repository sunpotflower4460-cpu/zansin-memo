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

export type SeedClearResult = { ok: true } | { ok: false; message?: string };

export interface SeedRepository {
  getAll(): Promise<SeedLoadResult>;
  saveAll(seeds: Seed[]): Promise<SeedSaveResult>;
  /** 種の本体だけでなく、復元用・破損退避用のコピーも含めて端末内から消す。 */
  clearAll(): Promise<SeedClearResult>;
}
