import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureAndConnect,
  captureSeed,
  connectFromCenter,
  connectSeeds,
  disconnectSeeds,
  restoreSeed,
  softDeleteSeed,
  touchResurfacing,
  updateSeedFields,
} from '../domain/gardenCommands';
import type { Draft } from '../domain/types';
import { getLinkedSeeds } from '../utils/links';
import { connectionId, emptyStore, parseStoreV2 } from './gardenModel';
import { KEYS, loadGarden } from './gardenStorage';
import { GardenWriter } from './gardenWriter';
import { FakeStorage } from './testSupport';

const NOW = '2026-03-01T00:00:00.000Z';
const make = (storage = new FakeStorage()) => ({ storage, writer: new GardenWriter(storage, emptyStore(), { draftDebounceMs: 10_000, schedule: () => 1, cancel: () => undefined }) });
const capture = (id: string, body = `本文${id}`, commandId = `cmd-${id}`) => captureSeed({ commandId, seedId: id, input: { body }, now: NOW });
const stored = (storage: FakeStorage) => {
  const parsed = parseStoreV2(storage.data.get(KEYS.main) ?? '');
  assert.equal(parsed.ok, true);
  return parsed.ok ? parsed.store : emptyStore();
};

// ---- D03: 書込み順序 ----

test('D03 a slow older write cannot overwrite a newer one: commands apply to the latest committed state, in order', async () => {
  const { storage, writer } = make();
  const release = storage.hold('setItem', KEYS.main);
  const first = writer.run(capture('A'));
  const second = writer.run(capture('B'));
  const third = writer.run(connectSeeds({ commandId: 'c3', a: 'A', b: 'B', now: NOW }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(writer.getSnapshot().seeds.length, 0); // 主保存が確定するまで、確定済みの状態は進まない
  release();
  const results = await Promise.all([first, second, third]);
  assert.deepEqual(results.map((r) => r.ok), [true, true, true]);
  const final = stored(storage);
  assert.deepEqual(final.seeds.map((s) => s.id).sort(), ['A', 'B']);
  assert.equal(final.connections.length, 1);
  assert.equal(final.revision, 3);
  assert.equal(storage.data.get(KEYS.lastGood), storage.data.get(KEYS.main)); // 最終的に補助も同じ版
  assert.equal(writer.getStatus().pending, 0);
});

test('D03 background resurfacing writes go through the same writer and never revert an edit', async () => {
  const { storage, writer } = make();
  await writer.run(capture('A'));
  const edit = writer.run(updateSeedFields({ commandId: 'edit', seedId: 'A', patch: { body: '編集後' }, now: '2026-03-02T00:00:00.000Z' }));
  const touch = writer.run(touchResurfacing({ commandId: 'touch', seedId: 'A', resurfacedAt: '2026-03-03T00:00:00.000Z' }));
  await Promise.all([edit, touch]);
  const seed = stored(storage).seeds[0];
  assert.equal(seed.body, '編集後');
  assert.equal(seed.lastResurfacedAt, '2026-03-03T00:00:00.000Z');
  assert.equal(seed.updatedAt, '2026-03-02T00:00:00.000Z'); // 再浮上は更新日時を動かさない
});

// ---- D04: 保存失敗と再試行 ----

test('D04 a failed main write is reported, nothing is committed, and the retry with the same ids creates exactly one memo', async () => {
  const { storage, writer } = make();
  storage.failNext('setItem', KEYS.main);
  const command = capture('A');
  const failed = await writer.run(command);
  assert.deepEqual(failed, { ok: false, reason: 'main_write_failed', detail: 'injected setItem failure' });
  assert.equal(writer.getSnapshot().seeds.length, 0);
  assert.equal(writer.getStatus().lastFailure?.commandId, 'cmd-A');
  assert.equal(storage.data.has(KEYS.main), false);

  const retried = await writer.run(command);
  assert.equal(retried.ok, true);
  assert.equal(writer.getSnapshot().seeds.length, 1);
  assert.equal(writer.getStatus().lastFailure, undefined);

  const again = await writer.run(command); // 連打・再送も二重にならない
  assert.equal(again.ok && again.alreadyApplied, true);
  assert.equal(stored(storage).seeds.length, 1);
});

test('D04 main ok + backup failed is a successful save that is reported as a stale backup, and is not re-run', async () => {
  const { storage, writer } = make();
  storage.failNext('setItem', KEYS.lastGood);
  const result = await writer.run(capture('A'));
  assert.deepEqual(result.ok && { backupOk: result.backupOk }, { backupOk: false });
  assert.equal(writer.getSnapshot().seeds.length, 1);
  assert.equal(writer.getStatus().backupStale, true);
  assert.equal(storage.writesTo(KEYS.main), 1);

  await writer.run(capture('B'));
  assert.equal(writer.getStatus().backupStale, false); // 次の保存で補助も追いつく
  assert.equal(storage.data.get(KEYS.lastGood), storage.data.get(KEYS.main));
});

test('D04 when the write landed but the acknowledgement was lost, the writer re-reads and treats it as committed (no duplicate)', async () => {
  const { storage, writer } = make();
  storage.failNext('setItem', KEYS.main, 1, true);
  const command = capture('A');
  const result = await writer.run(command);
  assert.equal(result.ok, true);
  assert.equal(writer.getSnapshot().seeds.length, 1);
  const retry = await writer.run(command);
  assert.equal(retry.ok && retry.alreadyApplied, true);
  assert.equal(stored(storage).seeds.length, 1);
});

test('a first save after a migration whose write failed persists the whole v2 store', async () => {
  const storage = new FakeStorage();
  const migrated = { ...emptyStore(), seeds: [{ ...capture('X') && { id: 'X', body: '移行したメモ', createdAt: NOW, updatedAt: NOW, importance: 3 as const, growthState: 'seed' as const, tags: [], schemaVersion: 2 } }] };
  const writer = new GardenWriter(storage, migrated, { needsInitialPersist: true });
  const result = await writer.run({ id: 'noop', apply: (store) => store });
  assert.equal(result.ok, true);
  assert.deepEqual(stored(storage).seeds.map((s) => s.id), ['X']);
});

// ---- D05 / 接続の規則 ----

test('D05 connect/disconnect keeps one pair, is visible from both ends, and never touches the memos', async () => {
  const { storage, writer } = make();
  await writer.run(capture('A', '原文A'));
  await writer.run(capture('B'));
  await writer.run(capture('C'));
  const results = await Promise.all([
    writer.run(connectSeeds({ commandId: 'x1', a: 'A', b: 'B', now: NOW })),
    writer.run(connectSeeds({ commandId: 'x2', a: 'B', b: 'A', now: NOW })),
    writer.run(connectSeeds({ commandId: 'x3', a: 'A', b: 'B', now: NOW })),
  ]);
  assert.ok(results.every((r) => r.ok));
  await writer.run(connectSeeds({ commandId: 'x4', a: 'B', b: 'C', now: NOW }));

  const store = stored(storage);
  assert.equal(store.connections.length, 2);
  // A-B と B-C があっても A-C は作られない
  assert.equal(store.connections.some((c) => c.id === connectionId('A', 'C')), false);
  assert.deepEqual(getLinkedSeeds(store.seeds[2], store.seeds, store.connections).map((s) => s.id).sort(), ['B']);
  const linkedFromB = getLinkedSeeds(store.seeds.find((s) => s.id === 'B')!, store.seeds, store.connections).map((s) => s.id).sort();
  assert.deepEqual(linkedFromB, ['A', 'C']);

  await writer.run(disconnectSeeds({ commandId: 'x5', a: 'B', b: 'A' }));
  const after = stored(storage);
  assert.deepEqual(after.connections.map((c) => c.id), [connectionId('B', 'C')]);
  assert.deepEqual(after.seeds.map((s) => s.body).sort(), ['原文A', '本文B', '本文C'].sort());
});

test('connect rejects self connections and missing or deleted memos', async () => {
  const { writer } = make();
  await writer.run(capture('A'));
  await writer.run(capture('B'));
  await writer.run(softDeleteSeed({ commandId: 'del', seedId: 'B', now: NOW }));
  assert.deepEqual(await writer.run(connectSeeds({ commandId: 's', a: 'A', b: 'A', now: NOW })), { ok: false, reason: 'rejected', detail: 'self_connection' });
  assert.deepEqual(await writer.run(connectSeeds({ commandId: 'm', a: 'A', b: 'ghost', now: NOW })), { ok: false, reason: 'rejected', detail: 'missing_seed' });
  assert.deepEqual(await writer.run(connectSeeds({ commandId: 'd', a: 'A', b: 'B', now: NOW })), { ok: false, reason: 'rejected', detail: 'missing_seed' });
});

test('connectFromCenter adds only the previewed star and never links the targets to each other', async () => {
  const { storage, writer } = make();
  for (const id of ['A', 'B', 'C', 'D']) await writer.run(capture(id));
  await writer.run(connectFromCenter({ commandId: 'star', centerId: 'A', targetIds: ['B', 'C', 'B', 'A'], now: NOW }));
  const ids = stored(storage).connections.map((c) => c.id).sort();
  assert.deepEqual(ids, [connectionId('A', 'B'), connectionId('A', 'C')].sort());
});

// ---- D09: 新メモと接続は半分だけ確定しない ----

test('captureAndConnect is one atomic update: a failed save leaves neither, and the retry creates one memo and one connection', async () => {
  const { storage, writer } = make();
  await writer.run(capture('CENTER'));
  const draftId = 'draft-1';
  const command = captureAndConnect({ commandId: 'cc', seedId: 'NEW', input: { body: '足したメモ' }, centerId: 'CENTER', now: NOW, draftId });

  storage.failNext('setItem', KEYS.main);
  assert.equal((await writer.run(command)).ok, false);
  assert.deepEqual(writer.getSnapshot().seeds.map((s) => s.id), ['CENTER']);
  assert.equal(writer.getSnapshot().connections.length, 0);

  assert.equal((await writer.run(command)).ok, true);
  assert.equal((await writer.run(command)).ok, true);
  const store = stored(storage);
  assert.equal(store.seeds.filter((s) => s.id === 'NEW').length, 1);
  assert.deepEqual(store.connections.map((c) => c.id), [connectionId('NEW', 'CENTER')]);
  assert.equal(store.seeds.find((s) => s.id === 'CENTER')?.body, '本文CENTER'); // 中心の原文は変わらない
});

// ---- 下書き ----

const draft = (body: string, id = 'd1'): Draft => ({ id, kind: 'new', plannedId: 'NEW', body, updatedAt: NOW });

test('drafts are coalesced, unchanged drafts are not rewritten, and the confirming command clears the draft atomically', async () => {
  const { storage, writer } = make();
  const before = storage.writesTo(KEYS.main);
  for (const body of ['あ', 'あい', 'あいう']) writer.saveDraft(draft(body));
  await writer.flushDrafts();
  assert.equal(storage.writesTo(KEYS.main) - before, 1);
  assert.equal(stored(storage).drafts[0].body, 'あいう');

  writer.saveDraft(draft('あいう'));
  await writer.flushDrafts();
  assert.equal(storage.writesTo(KEYS.main) - before, 1); // 同じ内容は再保存しない

  writer.saveDraft(draft('あいうえ')); // 待機中の自動保存が…
  const result = await writer.run(captureSeed({ commandId: 'save', seedId: 'NEW', input: { body: 'あいうえ' }, now: NOW, draftId: 'd1' }));
  assert.equal(result.ok, true);
  await writer.flushDrafts();
  const final = stored(storage);
  assert.deepEqual(final.drafts, []); // …確定した下書きを復活させない
  assert.equal(final.seeds[0].body, 'あいうえ');
  writer.saveDraft(draft('遅れて届いた入力')); // 確定済みの下書きIDへの遅い保存も無視
  await writer.flushDrafts();
  assert.deepEqual(stored(storage).drafts, []);
});

test('draft-only saves skip the backup copy, so typing writes the large store once, not twice', async () => {
  const { storage, writer } = make();
  await writer.run(capture('A'));
  const mainBefore = storage.writesTo(KEYS.main);
  const backupBefore = storage.writesTo(KEYS.lastGood);
  writer.saveDraft(draft('入力中'));
  await writer.flushDrafts();
  assert.equal(storage.writesTo(KEYS.main) - mainBefore, 1);
  assert.equal(storage.writesTo(KEYS.lastGood) - backupBefore, 0);
});

test('D03 typing drafts never rewrites the memo list or connections beyond the draft itself', async () => {
  const { storage, writer } = make();
  await writer.run(capture('A'));
  await writer.run(capture('B'));
  await writer.run(connectSeeds({ commandId: 'c', a: 'A', b: 'B', now: NOW }));
  const seedsBefore = JSON.stringify(writer.getSnapshot().seeds);
  writer.saveDraft(draft('入力中'));
  await writer.flushDrafts();
  assert.equal(JSON.stringify(stored(storage).seeds), seedsBefore);
});

// ---- 編集の衝突 ----

test('an edit started from an older version is rejected instead of overwriting a newer edit', async () => {
  const { writer } = make();
  await writer.run(capture('A'));
  const base = writer.getSnapshot().seeds[0].updatedAt;
  await writer.run(updateSeedFields({ commandId: 'first', seedId: 'A', patch: { body: '先に確定' }, now: '2026-03-05T00:00:00.000Z', expectedUpdatedAt: base }));
  const stale = await writer.run(updateSeedFields({ commandId: 'second', seedId: 'A', patch: { body: '古い入力' }, now: '2026-03-06T00:00:00.000Z', expectedUpdatedAt: base }));
  assert.deepEqual(stale, { ok: false, reason: 'rejected', detail: 'conflict' });
  assert.equal(writer.getSnapshot().seeds[0].body, '先に確定');
});

// ---- 削除と復元（D06 の一部） ----

test('soft delete keeps connections for restore; they are hidden only while a memo is deleted', async () => {
  const { storage, writer } = make();
  await writer.run(capture('A'));
  await writer.run(capture('B'));
  await writer.run(connectSeeds({ commandId: 'c', a: 'A', b: 'B', now: NOW }));
  await writer.run(softDeleteSeed({ commandId: 'del', seedId: 'B', now: NOW }));
  assert.equal(stored(storage).connections.length, 1);
  const live = stored(storage).seeds.filter((s) => !s.deletedAt);
  assert.deepEqual(getLinkedSeeds(live[0], live, stored(storage).connections), []);
  await writer.run(restoreSeed({ commandId: 'res', seedId: 'B', now: NOW }));
  const restored = stored(storage);
  assert.deepEqual(getLinkedSeeds(restored.seeds.find((s) => s.id === 'A')!, restored.seeds, restored.connections).map((s) => s.id), ['B']);
});

// ---- D14: 全削除 ----

test('D14 deleteAll waits for the in-flight write, cancels queued commands, rejects new ones, and nothing old returns after restart', async () => {
  const storage = new FakeStorage({ [KEYS.v1Main]: JSON.stringify([{ id: 'OLD', body: '旧', schemaVersion: 1 }]) });
  const writer = new GardenWriter(storage, emptyStore(), { draftDebounceMs: 10_000, schedule: () => 1, cancel: () => undefined });
  await writer.run(capture('A'));

  const release = storage.hold('setItem', KEYS.main);
  const inFlight = writer.run(capture('B'));
  await new Promise((resolve) => setTimeout(resolve, 5)); // B が実際に書込み中（保留）になるのを待つ
  const queued = writer.run(capture('C')); // 未着手のキュー
  const deleting = writer.deleteAll();
  const late = await writer.run(capture('D'));
  assert.deepEqual(late, { ok: false, reason: 'locked' });
  release();

  const [inFlightResult, queuedResult, deleted] = await Promise.all([inFlight, queued, deleting]);
  assert.equal(inFlightResult.ok, true);
  assert.deepEqual(queuedResult, { ok: false, reason: 'cancelled' });
  assert.deepEqual(deleted, { ok: true });

  assert.deepEqual(writer.getSnapshot().seeds, []);
  assert.equal(storage.data.has(KEYS.deletingMarker), false);
  assert.equal(storage.data.has(KEYS.v1Main), false);
  const restarted = await loadGarden(storage);
  assert.equal(restarted.status === 'ready' && restarted.store.seeds.length, 0);
  assert.equal((await writer.run(capture('E'))).ok, true); // 削除後は通常どおり使える
});

test('D14 if the deletion marker cannot be written, deletion does not start and the data stays', async () => {
  const { storage, writer } = make();
  await writer.run(capture('A'));
  storage.failNext('setItem', KEYS.deletingMarker);
  const result = await writer.deleteAll();
  assert.equal(result.ok, false);
  assert.equal(writer.getSnapshot().seeds.length, 1);
  assert.equal(stored(storage).seeds.length, 1);
  assert.equal((await writer.run(capture('B'))).ok, true);
});

test('D14 an interrupted deleteAll keeps the writer locked until it is retried, then completes', async () => {
  const { storage, writer } = make();
  await writer.run(capture('A'));
  storage.failNext('multiRemove');
  const first = await writer.deleteAll();
  assert.equal(first.ok, false);
  assert.equal(storage.data.has(KEYS.deletingMarker), true);
  assert.deepEqual(await writer.run(capture('B')), { ok: false, reason: 'locked' });
  assert.deepEqual(await writer.retryDeleteAll(), { ok: true });
  assert.equal(storage.data.has(KEYS.deletingMarker), false);
  assert.deepEqual(writer.getSnapshot().seeds, []);
});
