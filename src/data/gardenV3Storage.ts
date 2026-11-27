import { z } from 'zod';
import type { GardenStoreV3 } from '../domain/plus/contracts';
import type { GardenStoreV2 } from '../domain/types';
import { createId } from '../utils/ids';
import { emptyStore, migrateV1, parseStoreV2 } from './gardenModel';
import { APP_KEY_PREFIX, KEYS, readLegacyDraft, type BlockedReason, type DeletionResult, type StorageLike } from './gardenStorage';
import { checkedLegacyCore, emptyStoreV3, parseStoreV3, serializeStoreV3, upgradeV2 } from './gardenV3Model';

const prefix = `${APP_KEY_PREFIX}garden:v3`;
export const PLUS_KEYS = {
  main: prefix,
  lastGood: `${prefix}:lastGood`,
  active: `${APP_KEY_PREFIX}garden:activeVersion`,
  marker: `${prefix}:migration`,
  staging: `${prefix}:staging`,
  archives: `${prefix}:original:`,
  corrupt: `${prefix}:corrupt`,
} as const;

const migrationSource = z.enum(['v1', 'empty', 'v2', 'v2-backup']);
type MigrationSource = z.infer<typeof migrationSource>;
const legacyKeys = [KEYS.main, KEYS.lastGood, KEYS.v1Main, KEYS.v1LastGood, KEYS.legacyDraft, KEYS.dismissedSuggestions] as const;
const migrationMarker = z.strictObject({
  id: z.string().min(1), at: z.iso.datetime(), source: migrationSource, stage: z.enum(['copy', 'fence', 'finalize']),
  originalKeys: z.array(z.enum(legacyKeys)),
});
type MigrationMarker = z.infer<typeof migrationMarker>;
const deletionMarker = z.object({ generationId: z.string().min(1), startedAt: z.iso.datetime() });
const unknownAt = new Date(0).toISOString();

type Blocked = { status: 'blocked'; reason: BlockedReason | 'recovery_required' };
type Ready = {
  status: 'ready'; store: GardenStoreV3; source: 'v3' | 'v3-backup' | 'migration' | 'deletion-resumed';
  needsInitialPersist: boolean; migrationSource?: MigrationSource;
};
export type V3LoadResult = Blocked | Ready;
const blocked = (reason: Blocked['reason']): Blocked => ({ status: 'blocked', reason });

type LegacyRaw = Record<(typeof legacyKeys)[number], string | null>;
const archiveKey = (migrationId: string, key: keyof LegacyRaw) => `${PLUS_KEYS.archives}${migrationId}:${key}`;
const parseJson = (raw: string): unknown => {
  try { return JSON.parse(raw); } catch { return undefined; }
};

async function readLegacyRaw(storage: StorageLike, migrationId?: string): Promise<LegacyRaw> {
  const entries = await Promise.all(legacyKeys.map(async (key) => [key, await storage.getItem(migrationId ? archiveKey(migrationId, key) : key)] as const));
  return Object.fromEntries(entries) as LegacyRaw;
}

function readLegacyV2(raw: string) {
  const decoded = parseJson(raw);
  const checked = checkedLegacyCore.safeParse(decoded);
  if (checked.success) return { ok: true as const, store: checked.data };
  // Reuse v2's compatibility defaults, while refusing to drop damaged records on upgrade.
  const parsed = parseStoreV2(raw);
  if (!parsed.ok) return parsed;
  const data = decoded as Record<string, unknown>;
  if (parsed.droppedConnections || (data.connections as unknown[]).length !== parsed.store.connections.length ||
      (data.drafts != null && (!Array.isArray(data.drafts) || data.drafts.length !== parsed.store.drafts.length))) {
    return { ok: false as const, reason: 'invalid_shape' };
  }
  // A v2 envelope without a drafts field existed before draft persistence.
  const compatible = checkedLegacyCore.safeParse({ ...data, drafts: data.drafts ?? [] });
  return compatible.success ? { ok: true as const, store: compatible.data } : { ok: false as const, reason: 'invalid_shape' };
}

function readLegacy(raws: LegacyRaw): { store: GardenStoreV2; source: MigrationSource } | Blocked {
  const main = raws[KEYS.main];
  const backup = raws[KEYS.lastGood];
  if (main !== null || backup !== null) {
    for (const [raw, source] of [[main, 'v2'], [backup, 'v2-backup']] as const) {
      if (raw === null) continue;
      const parsed = readLegacyV2(raw);
      if (parsed.ok) {
        const checked = parseStoreV3(serializeStoreV3({ ...emptyStoreV3(), ...parsed.store, storeVersion: 3 }));
        if (checked.ok) return { store: parsed.store, source };
      } else if (parsed.reason === 'unsupported_version') {
        const decoded = parseJson(raw) as { storeVersion?: number } | undefined;
        return blocked(decoded?.storeVersion === 3 ? 'recovery_required' : 'unsupported_version');
      }
    }
    return blocked('corrupt');
  }

  const old = raws[KEYS.v1Main];
  const oldBackup = raws[KEYS.v1LastGood];
  let store = emptyStore();
  if (old !== null || oldBackup !== null) {
    let migrated = old === null ? undefined : migrateV1(old, unknownAt);
    if ((!migrated || (!migrated.ok && (migrated.reason === 'invalid_json' || migrated.reason === 'not_array'))) && oldBackup !== null) {
      migrated = migrateV1(oldBackup, unknownAt);
    }
    if (!migrated?.ok || migrated.report.skippedNonObjectEntries > 0) return blocked('migration_failed');
    store = migrated.store;
  }
  const draftRaw = raws[KEYS.legacyDraft];
  const legacyDraft = readLegacyDraft(draftRaw, unknownAt);
  if (draftRaw !== null && !z.object({ body: z.string(), title: z.string().optional() }).safeParse(parseJson(draftRaw)).success && !legacyDraft) {
    return blocked('corrupt');
  }
  if (legacyDraft) store = { ...store, drafts: [...store.drafts, legacyDraft] };
  return { store, source: old !== null || oldBackup !== null || draftRaw !== null ? 'v1' : 'empty' };
}

function migrationData(raws: LegacyRaw, marker: MigrationMarker): string {
  if (legacyKeys.some((key) => (raws[key] !== null) !== marker.originalKeys.includes(key))) {
    throw new Error('Migration original missing or unexpected');
  }
  const legacy = readLegacy(raws);
  if ('status' in legacy || legacy.source !== marker.source) throw new Error('Migration source changed');
  const prefs = raws[KEYS.dismissedSuggestions];
  const parsed = z.array(z.string()).safeParse(prefs === null ? [] : parseJson(prefs));
  const next = parsed.success ? upgradeV2(legacy.store, parsed.data, marker.at) : undefined;
  if (!next) throw new Error('Invalid legacy proposal preferences');
  const json = serializeStoreV3(next);
  if (!parseStoreV3(json).ok) throw new Error('Invalid v3 staging data');
  return json;
}

export async function setAndVerify(storage: StorageLike, key: string, raw: string): Promise<void> {
  try {
    await storage.setItem(key, raw);
  } catch {
    // An acknowledgement may be lost after a successful write. Always read back.
  }
  if (await storage.getItem(key) !== raw) throw new Error('Storage write could not be verified');
}

function fenceFor(marker: MigrationMarker): string {
  return JSON.stringify({ storeVersion: 3, migrationId: marker.id });
}

async function resumeMigration(storage: StorageLike, marker: MigrationMarker, readBeforeStart?: LegacyRaw): Promise<V3LoadResult> {
  try {
    if (marker.stage === 'copy') {
      const original = readBeforeStart ?? await readLegacyRaw(storage);
      const staged = migrationData(original, marker);
      for (const key of legacyKeys) {
        const raw = original[key];
        if (raw !== null) await setAndVerify(storage, archiveKey(marker.id, key), raw);
      }
      await setAndVerify(storage, PLUS_KEYS.staging, staged);
      marker = { ...marker, stage: 'fence' };
      await setAndVerify(storage, PLUS_KEYS.marker, JSON.stringify(marker));
    }
    if (marker.stage === 'fence') {
      const raw = await storage.getItem(PLUS_KEYS.staging);
      const original = await readLegacyRaw(storage, marker.id);
      if (raw === null || raw !== migrationData(original, marker)) return blocked('migration_failed');
      const beforeFence = await readLegacyRaw(storage);
      if (legacyKeys.some((key) => beforeFence[key] !== original[key] &&
          !((key === KEYS.main || key === KEYS.lastGood) && beforeFence[key] === fenceFor(marker)))) return blocked('migration_failed');
      await setAndVerify(storage, KEYS.main, fenceFor(marker));
      await setAndVerify(storage, KEYS.lastGood, fenceFor(marker));
      await setAndVerify(storage, PLUS_KEYS.main, raw);
      await setAndVerify(storage, PLUS_KEYS.lastGood, raw);
      await setAndVerify(storage, PLUS_KEYS.active, '3');
      marker = { ...marker, stage: 'finalize' };
      await setAndVerify(storage, PLUS_KEYS.marker, JSON.stringify(marker));
    }

    const raw = await storage.getItem(PLUS_KEYS.main);
    const parsed = raw === null ? undefined : parseStoreV3(raw);
    if (!parsed?.ok || await storage.getItem(PLUS_KEYS.lastGood) !== raw || await storage.getItem(PLUS_KEYS.active) !== '3' ||
        await storage.getItem(KEYS.main) !== fenceFor(marker) || await storage.getItem(KEYS.lastGood) !== fenceFor(marker)) return blocked('migration_failed');
    await storage.removeItem(PLUS_KEYS.staging);
    await storage.removeItem(PLUS_KEYS.marker);
    return { status: 'ready', source: 'migration', migrationSource: marker.source, store: parsed.store, needsInitialPersist: false };
  } catch {
    return blocked('migration_failed');
  }
}

/** Call before creating the writer. Production still uses loadGarden. */
export async function loadGardenV3(storage: StorageLike, now = () => new Date().toISOString()): Promise<V3LoadResult> {
  let deleting: string | null;
  try {
    deleting = await storage.getItem(KEYS.deletingMarker);
  } catch {
    return blocked('marker_unreadable');
  }
  if (deleting !== null) {
    if (!deletionMarker.safeParse(parseJson(deleting)).success) return blocked('marker_unreadable');
    const finished = await finishDeletionV3(storage);
    return finished.ok
      ? { status: 'ready', source: 'deletion-resumed', store: emptyStoreV3(), needsInitialPersist: false }
      : blocked('deletion_incomplete');
  }
  try {
    const markerRaw = await storage.getItem(PLUS_KEYS.marker);
    if (markerRaw !== null) {
      const marker = migrationMarker.safeParse(parseJson(markerRaw));
      return marker.success ? resumeMigration(storage, marker.data) : blocked('migration_failed');
    }
    const mainRaw = await storage.getItem(PLUS_KEYS.main);
    const main = mainRaw === null ? undefined : parseStoreV3(mainRaw);
    if (main?.ok) return { status: 'ready', source: 'v3', store: main.store, needsInitialPersist: false };
    if (main?.reason === 'unsupported_version') return blocked('unsupported_version');

    const backupRaw = await storage.getItem(PLUS_KEYS.lastGood);
    const backup = backupRaw === null ? undefined : parseStoreV3(backupRaw);
    if (backup?.ok) {
      if (mainRaw !== null) {
        const prior = await storage.getItem(PLUS_KEYS.corrupt);
        if (prior !== mainRaw) {
          if (prior !== null) await setAndVerify(storage, `${PLUS_KEYS.corrupt}:${createId()}`, prior);
          await setAndVerify(storage, PLUS_KEYS.corrupt, mainRaw);
        }
      }
      return { status: 'ready', source: 'v3-backup', store: backup.store, needsInitialPersist: true };
    }
    if (backup?.reason === 'unsupported_version') return blocked('unsupported_version');
    if (mainRaw !== null || backupRaw !== null || await storage.getItem(PLUS_KEYS.active) !== null || await storage.getItem(PLUS_KEYS.staging) !== null) {
      return blocked('recovery_required');
    }

    const original = await readLegacyRaw(storage);
    const legacy = readLegacy(original);
    if ('status' in legacy) return legacy;
    const marker: MigrationMarker = {
      id: createId(), at: now(), source: legacy.source, stage: 'copy', originalKeys: legacyKeys.filter((key) => original[key] !== null),
    };
    try {
      await setAndVerify(storage, PLUS_KEYS.marker, JSON.stringify(marker));
    } catch {
      return blocked('migration_failed');
    }
    return resumeMigration(storage, marker, original);
  } catch {
    return blocked('read_error');
  }
}

export async function finishDeletionV3(storage: StorageLike): Promise<DeletionResult> {
  try {
    const targets = (await storage.getAllKeys()).filter(isDeletionTarget);
    if (targets.length) await storage.multiRemove(targets);
    const raw = serializeStoreV3(emptyStoreV3());
    await setAndVerify(storage, PLUS_KEYS.main, raw);
    await setAndVerify(storage, PLUS_KEYS.lastGood, raw);
    const remaining = (await storage.getAllKeys()).filter(isDeletionTarget)
      .filter((key) => key !== PLUS_KEYS.main && key !== PLUS_KEYS.lastGood);
    if (remaining.length) return { ok: false, detail: '削除できなかったデータが残っています' };
    await storage.removeItem(KEYS.deletingMarker);
    return { ok: true };
  } catch {
    return { ok: false, detail: 'すべてのデータの削除を確認できませんでした' };
  }
}

export async function beginDeletionV3(storage: StorageLike, generationId: string): Promise<DeletionResult> {
  try {
    await setAndVerify(storage, KEYS.deletingMarker, JSON.stringify({ generationId, startedAt: new Date().toISOString() }));
    return { ok: true };
  } catch {
    return { ok: false, detail: '削除を開始できたか確認できませんでした' };
  }
}

function isDeletionTarget(key: string): boolean {
  return key.startsWith(APP_KEY_PREFIX) && key !== KEYS.onboarding && key !== KEYS.deletingMarker;
}
