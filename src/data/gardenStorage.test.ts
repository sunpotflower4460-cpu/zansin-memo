import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyStore, serializeStore } from './gardenModel';
import { KEYS, finishDeletion, loadGarden } from './gardenStorage';
import { FakeStorage, makeSeed, makeV1Seed } from './testSupport';

const v2 = (ids: string[], revision = 1) => serializeStore({ ...emptyStore(), revision, seeds: ids.map((id) => makeSeed(id)) });

test('a valid v2 is used as-is and v1 is never re-imported over it', async () => {
  const v1Raw = JSON.stringify([makeV1Seed('OLD')]);
  const storage = new FakeStorage({ [KEYS.main]: v2(['A', 'B']), [KEYS.v1Main]: v1Raw });
  const result = await loadGarden(storage);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.source, 'v2');
  assert.deepEqual(result.store.seeds.map((s) => s.id), ['A', 'B']);
  assert.equal(storage.data.get(KEYS.v1Main), v1Raw);
  assert.deepEqual(storage.writes, []);
});

test('D02 v1 → v2 migration persists a verified v2, keeps the v1 original untouched, and reloads identically', async () => {
  const v1Raw = JSON.stringify([makeV1Seed('A', { relatedSeedIds: ['B'] }), makeV1Seed('B', { body: '日本語の原文' })]);
  const storage = new FakeStorage({ [KEYS.v1Main]: v1Raw });
  const first = await loadGarden(storage);
  assert.equal(first.status, 'ready');
  if (first.status !== 'ready') return;
  assert.equal(first.source, 'migrated-v1');
  assert.equal(first.needsInitialPersist, false);
  assert.equal(first.report?.legacyConnectionCount, 1);
  assert.equal(storage.data.get(KEYS.v1Main), v1Raw); // 原本は触らない
  assert.ok(storage.data.has(KEYS.main) && storage.data.has(KEYS.lastGood));

  const second = await loadGarden(storage);
  assert.equal(second.status === 'ready' && second.source, 'v2');
  assert.deepEqual(second.status === 'ready' && second.store.seeds.map((s) => s.body), ['本文A', '日本語の原文']);
  assert.equal(second.status === 'ready' && second.store.connections.length, 1);
});

test('a failed migration write does not lose data: the app runs from memory and the v1 original stays', async () => {
  const v1Raw = JSON.stringify([makeV1Seed('A')]);
  const storage = new FakeStorage({ [KEYS.v1Main]: v1Raw });
  storage.failNext('setItem', KEYS.main);
  const result = await loadGarden(storage);
  assert.equal(result.status === 'ready' && result.needsInitialPersist, true);
  assert.equal(storage.data.get(KEYS.v1Main), v1Raw);
  assert.equal(storage.data.has(KEYS.main), false);
});

test('recovery: a corrupt v2 falls back to the v2 backup, never silently to v1, and keeps the corrupt copy', async () => {
  const storage = new FakeStorage({
    [KEYS.main]: '{broken',
    [KEYS.lastGood]: v2(['B']),
    [KEYS.v1Main]: JSON.stringify([makeV1Seed('OLD')]),
  });
  const result = await loadGarden(storage);
  assert.equal(result.status === 'ready' && result.source, 'v2-backup');
  assert.deepEqual(result.status === 'ready' && result.store.seeds.map((s) => s.id), ['B']);
  assert.equal(result.status === 'ready' && result.needsInitialPersist, true);
  assert.ok(Array.from(storage.data.keys()).some((key) => key.startsWith(KEYS.corruptBackupPrefix)));
  assert.equal(storage.data.get(KEYS.main), '{broken'); // 読込だけでは上書きしない
});

test('recovery: a corrupt v2 without a usable backup blocks writes instead of starting empty', async () => {
  const storage = new FakeStorage({ [KEYS.main]: '{broken', [KEYS.v1Main]: JSON.stringify([makeV1Seed('OLD')]) });
  const result = await loadGarden(storage);
  assert.deepEqual(result, { status: 'blocked', reason: 'corrupt', detail: 'invalid_json' });
  assert.equal(storage.data.get(KEYS.main), '{broken');
  assert.equal(storage.writes.filter((w) => w.key === KEYS.main).length, 0);
});

test('recovery: an unknown future store version is never read with today\'s normalizer or overwritten', async () => {
  const future = JSON.stringify({ storeVersion: 3, seeds: [], connections: [], extra: 'keep' });
  const storage = new FakeStorage({ [KEYS.main]: future });
  const result = await loadGarden(storage);
  assert.deepEqual(result, { status: 'blocked', reason: 'unsupported_version' });
  assert.equal(storage.data.get(KEYS.main), future);
  assert.deepEqual(storage.writes, []);
});

test('a read error blocks without writing anything', async () => {
  const storage = new FakeStorage({ [KEYS.main]: v2(['A']) });
  storage.failNext('getItem', KEYS.main);
  const result = await loadGarden(storage);
  assert.equal(result.status === 'blocked' && result.reason, 'read_error');
  assert.deepEqual(storage.writes, []);
});

test('a corrupt v1 recovers from the v1 backup and keeps the corrupt original copy', async () => {
  const storage = new FakeStorage({ [KEYS.v1Main]: '[{"id"', [KEYS.v1LastGood]: JSON.stringify([makeV1Seed('SAFE')]) });
  const result = await loadGarden(storage);
  assert.equal(result.status === 'ready' && result.source, 'migrated-v1');
  assert.equal(result.status === 'ready' && result.recoveredFromBackup, true);
  assert.deepEqual(result.status === 'ready' && result.store.seeds.map((s) => s.id), ['SAFE']);
  assert.equal(storage.data.get(KEYS.v1Main), '[{"id"');
});

test('an ambiguous v1 (duplicate ids) blocks migration and leaves the original', async () => {
  const raw = JSON.stringify([makeV1Seed('A'), makeV1Seed('A')]);
  const storage = new FakeStorage({ [KEYS.v1Main]: raw });
  const result = await loadGarden(storage);
  assert.deepEqual(result, { status: 'blocked', reason: 'migration_failed', detail: 'duplicate_ids' });
  assert.equal(storage.data.get(KEYS.v1Main), raw);
  assert.equal(storage.data.has(KEYS.main), false);
});

// ---- D14: 削除の各段階で終了・再起動しても、旧内容が復活しない ----

const populated = () =>
  new FakeStorage({
    [KEYS.main]: v2(['A']),
    [KEYS.lastGood]: v2(['A']),
    [KEYS.v1Main]: JSON.stringify([makeV1Seed('OLD')]),
    [KEYS.v1LastGood]: JSON.stringify([makeV1Seed('OLD')]),
    [KEYS.legacyDraft]: JSON.stringify({ body: '書きかけ' }),
    [`${KEYS.corruptBackupPrefix}:2026`]: 'broken-but-private',
    [KEYS.onboarding]: 'seen',
    'other-app:setting': 'keep',
  });

test('D14 finishDeletion clears every app key, keeps unrelated and UI-only keys, and ends with an empty verified v2', async () => {
  const storage = populated();
  storage.data.set(KEYS.deletingMarker, '{"generationId":"g"}');
  const result = await finishDeletion(storage);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(Array.from(storage.data.keys()).sort(), [KEYS.lastGood, KEYS.main, KEYS.onboarding, 'other-app:setting'].sort());
  assert.equal(storage.data.get(KEYS.main), serializeStore(emptyStore()));
});

test('D14 a marker at startup resumes the deletion before any normal load, recovery or v1 migration', async () => {
  const storage = populated();
  storage.data.set(KEYS.deletingMarker, '{"generationId":"g"}');
  const result = await loadGarden(storage);
  assert.equal(result.status === 'ready' && result.source, 'deletion-resumed');
  assert.deepEqual(result.status === 'ready' && result.store.seeds, []);
  assert.equal(storage.data.has(KEYS.deletingMarker), false);
  assert.equal(storage.data.has(KEYS.v1Main), false);
  assert.equal(storage.data.has(KEYS.legacyDraft), false);
});

test('D14 a crash mid-deletion leaves the marker; the next start finishes it and nothing old comes back', async () => {
  const storage = populated();
  storage.data.set(KEYS.deletingMarker, '{"generationId":"g"}');
  storage.failNext('setItem', KEYS.lastGood); // 空のv2を確定する途中で失敗
  const first = await finishDeletion(storage);
  assert.equal(first.ok, false);
  assert.equal(storage.data.has(KEYS.deletingMarker), true);

  const restart = await loadGarden(storage);
  assert.equal(restart.status === 'ready' && restart.source, 'deletion-resumed');
  assert.deepEqual(restart.status === 'ready' && restart.store.seeds, []);
  assert.equal(storage.data.has(KEYS.deletingMarker), false);
  assert.equal(Array.from(storage.data.keys()).some((key) => key.includes('corruptBackup') || key === KEYS.v1Main), false);
});

test('D14 when the marker cannot be read, nothing is initialised or deleted and writes stay stopped', async () => {
  const storage = populated();
  storage.failNext('getItem', KEYS.deletingMarker);
  const result = await loadGarden(storage);
  assert.equal(result.status === 'blocked' && result.reason, 'marker_unreadable');
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.data.has(KEYS.v1Main), true);
});
