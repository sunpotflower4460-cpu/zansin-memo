import type { Draft, GardenStoreV2 } from '../domain/types';
import {
  type MigrationReport,
  emptyStore,
  migrateV1,
  normalizeDraft,
  parseStoreV2,
  serializeStore,
} from './gardenModel';

// 保存先との境界。ここで「主保存が確定点」「バックアップは補助」「削除は再開できる保守操作」を実現する。
// 契約: docs/core-growth-data.md §5〜§7

export interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
  multiRemove(keys: readonly string[]): Promise<unknown>;
  getAllKeys(): Promise<readonly string[]>;
}

export const APP_KEY_PREFIX = 'kizashi-notes:';
export const KEYS = {
  main: 'kizashi-notes:garden:v2',
  lastGood: 'kizashi-notes:garden:v2:lastGood',
  corruptBackupPrefix: 'kizashi-notes:garden:v2:corruptBackup',
  v1Main: 'kizashi-notes:seeds:v1',
  v1LastGood: 'kizashi-notes:seeds:v1:lastGood',
  legacyDraft: 'kizashi-notes:draft:v1',
  deletingMarker: 'kizashi-notes:maintenance:deleting',
  /** 「例で使い方を見る」を見たかなどの画面設定。意味データではないので全データ削除でも残す。 */
  onboarding: 'kizashi-notes:onboarding:v1',
  dismissedSuggestions: 'kizashi-notes:suggestions:dismissed:v1',
} as const;

/** 全データ削除でも消さないキー（本人の意味データではない画面設定）。 */
const PRESERVED_KEYS = new Set<string>([KEYS.onboarding]);

export type BlockedReason =
  | 'read_error'
  | 'corrupt'
  | 'unsupported_version'
  | 'migration_failed'
  | 'marker_unreadable'
  | 'deletion_incomplete';

export type LoadResult =
  | {
      status: 'ready';
      store: GardenStoreV2;
      source: 'v2' | 'v2-backup' | 'migrated-v1' | 'empty' | 'deletion-resumed';
      /** v2 がまだ保存先に無い（移行直後など）。最初の保存で書き出される。 */
      needsInitialPersist: boolean;
      report?: MigrationReport;
      recoveredFromBackup?: boolean;
    }
  | { status: 'blocked'; reason: BlockedReason; detail?: string };

const backupCorruptRaw = async (storage: StorageLike, raw: string): Promise<void> => {
  try {
    await storage.setItem(`${KEYS.corruptBackupPrefix}:${new Date().toISOString().replace(/[:.]/g, '-')}`, raw);
  } catch {
    // 退避は最善努力。失敗しても破壊的な書込みに進まない。
  }
};

export const readLegacyDraft = (raw: string | null, fallbackAt = new Date().toISOString()): Draft | undefined => {
  if (!raw) {
    return undefined;
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const body = typeof data.body === 'string' ? data.body : '';
    const title = typeof data.title === 'string' ? data.title : '';
    if (!body.trim() && !title.trim()) {
      return undefined;
    }
    return normalizeDraft({
      id: 'legacy-draft',
      kind: 'new',
      body,
      title,
      tags: data.tags,
      mood: data.mood,
      growthState: data.growthState,
      importance: data.importance,
      updatedAt: fallbackAt,
    });
  } catch {
    return undefined;
  }
};

/**
 * 起動時の読込。順序は固定:
 *  1. 削除中marker（あれば削除を再開。通常の読込・回復・v1移行より先）
 *  2. v2 本体 → v2 lastGood（壊れていてもv1を最新として黙って復元しない）
 *  3. v2が未作成のときだけ v1 から移行（原本は変更しない）
 */
export const loadGarden = async (storage: StorageLike): Promise<LoadResult> => {
  let marker: string | null;
  try {
    marker = await storage.getItem(KEYS.deletingMarker);
  } catch (error) {
    return { status: 'blocked', reason: 'marker_unreadable', detail: error instanceof Error ? error.message : undefined };
  }
  if (marker !== null) {
    const resumed = await finishDeletion(storage);
    if (!resumed.ok) {
      return { status: 'blocked', reason: 'deletion_incomplete', detail: resumed.detail };
    }
    return { status: 'ready', store: emptyStore(), source: 'deletion-resumed', needsInitialPersist: false };
  }

  let mainRaw: string | null;
  try {
    mainRaw = await storage.getItem(KEYS.main);
  } catch (error) {
    return { status: 'blocked', reason: 'read_error', detail: error instanceof Error ? error.message : undefined };
  }

  if (mainRaw !== null) {
    const parsed = parseStoreV2(mainRaw);
    if (parsed.ok) {
      return { status: 'ready', store: parsed.store, source: 'v2', needsInitialPersist: false };
    }
    if (parsed.reason === 'unsupported_version') {
      return { status: 'blocked', reason: 'unsupported_version' };
    }
    await backupCorruptRaw(storage, mainRaw);
    try {
      const backupRaw = await storage.getItem(KEYS.lastGood);
      const backup = backupRaw === null ? undefined : parseStoreV2(backupRaw);
      if (backup?.ok) {
        return { status: 'ready', store: backup.store, source: 'v2-backup', needsInitialPersist: true, recoveredFromBackup: true };
      }
    } catch (error) {
      return { status: 'blocked', reason: 'read_error', detail: error instanceof Error ? error.message : undefined };
    }
    return { status: 'blocked', reason: 'corrupt', detail: parsed.reason };
  }

  // v2 本体が無く、lastGood だけが残っている場合（本体の削除・欠落）。
  try {
    const backupRaw = await storage.getItem(KEYS.lastGood);
    if (backupRaw !== null) {
      const backup = parseStoreV2(backupRaw);
      if (backup.ok) {
        return { status: 'ready', store: backup.store, source: 'v2-backup', needsInitialPersist: true, recoveredFromBackup: true };
      }
      return { status: 'blocked', reason: backup.reason === 'unsupported_version' ? 'unsupported_version' : 'corrupt' };
    }
  } catch (error) {
    return { status: 'blocked', reason: 'read_error', detail: error instanceof Error ? error.message : undefined };
  }

  // v2 が未作成: v1 を読む。
  let v1Raw: string | null;
  let v1BackupRaw: string | null;
  let legacyDraftRaw: string | null;
  try {
    [v1Raw, v1BackupRaw, legacyDraftRaw] = await Promise.all([
      storage.getItem(KEYS.v1Main),
      storage.getItem(KEYS.v1LastGood),
      storage.getItem(KEYS.legacyDraft),
    ]);
  } catch (error) {
    return { status: 'blocked', reason: 'read_error', detail: error instanceof Error ? error.message : undefined };
  }

  let migrated = v1Raw === null ? undefined : migrateV1(v1Raw);
  let recoveredFromBackup = false;
  if (v1Raw !== null && migrated && !migrated.ok && (migrated.reason === 'invalid_json' || migrated.reason === 'not_array')) {
    await backupCorruptRaw(storage, v1Raw);
    if (v1BackupRaw !== null) {
      migrated = migrateV1(v1BackupRaw);
      recoveredFromBackup = true;
    }
  } else if (v1Raw === null && v1BackupRaw !== null) {
    migrated = migrateV1(v1BackupRaw);
    recoveredFromBackup = true;
  }

  if (!migrated) {
    // 何も保存されていない新規利用。
    const store = emptyStore();
    const draft = readLegacyDraft(legacyDraftRaw);
    if (draft) {
      store.drafts = [draft];
    }
    return { status: 'ready', store, source: 'empty', needsInitialPersist: false };
  }
  if (!migrated.ok) {
    return { status: 'blocked', reason: 'migration_failed', detail: migrated.reason };
  }

  const store = migrated.store;
  const draft = readLegacyDraft(legacyDraftRaw);
  if (draft) {
    store.drafts = [draft];
  }
  const persisted = await persistMigration(storage, store);
  return {
    status: 'ready',
    store,
    source: 'migrated-v1',
    needsInitialPersist: !persisted,
    report: migrated.report,
    recoveredFromBackup,
  };
};

/** v2 を保存し、読み直して件数・ID・本文・接続を照合する。v1 原本は触らない。 */
const persistMigration = async (storage: StorageLike, store: GardenStoreV2): Promise<boolean> => {
  try {
    const json = serializeStore(store);
    await storage.setItem(KEYS.main, json);
    const readBack = await storage.getItem(KEYS.main);
    const parsed = readBack === null ? undefined : parseStoreV2(readBack);
    if (!parsed?.ok) {
      return false;
    }
    const sameSeeds =
      parsed.store.seeds.length === store.seeds.length &&
      parsed.store.seeds.every((seed, index) => seed.id === store.seeds[index].id && seed.body === store.seeds[index].body);
    if (!sameSeeds || parsed.store.connections.length !== store.connections.length) {
      return false;
    }
    await storage.setItem(KEYS.lastGood, json);
    return true;
  } catch {
    return false;
  }
};

// ---- 全データ削除（再開できる保守操作） ----

export type DeletionResult = { ok: true } | { ok: false; detail?: string };

/** 削除中markerを永続化する。失敗したら削除を始めない。本文は含めない。 */
export const beginDeletion = async (storage: StorageLike, generationId: string): Promise<DeletionResult> => {
  try {
    await storage.setItem(KEYS.deletingMarker, JSON.stringify({ generationId, startedAt: new Date().toISOString() }));
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : undefined };
  }
};

/**
 * marker が立っている前提で、対象キーを消し、空のv2を確定して、markerを解消する。
 * 途中で失敗しても marker を残すので、次回起動は必ずこの手順から再開する。
 */
export const finishDeletion = async (storage: StorageLike): Promise<DeletionResult> => {
  try {
    const keys = await storage.getAllKeys();
    const targets = keys.filter((key) => key.startsWith(APP_KEY_PREFIX) && key !== KEYS.deletingMarker && !PRESERVED_KEYS.has(key));
    if (targets.length > 0) {
      await storage.multiRemove(targets);
    }

    const json = serializeStore(emptyStore());
    await storage.setItem(KEYS.main, json);
    await storage.setItem(KEYS.lastGood, json);

    // 残った旧版・退避がないことを確認してから、markerを外す。
    const remaining = (await storage.getAllKeys()).filter(
      (key) =>
        key.startsWith(APP_KEY_PREFIX) &&
        key !== KEYS.deletingMarker &&
        key !== KEYS.main &&
        key !== KEYS.lastGood &&
        !PRESERVED_KEYS.has(key),
    );
    if (remaining.length > 0) {
      return { ok: false, detail: `削除できなかったデータが残っています（${remaining.length}件）` };
    }
    const verify = await storage.getItem(KEYS.main);
    const parsed = verify === null ? undefined : parseStoreV2(verify);
    if (!parsed?.ok || parsed.store.seeds.length !== 0) {
      return { ok: false, detail: '空の保存データを確認できませんでした' };
    }

    await storage.removeItem(KEYS.deletingMarker);
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : undefined };
  }
};
