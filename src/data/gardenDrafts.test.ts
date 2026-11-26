import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSeed } from '../domain/gardenCommands';
import type { Draft } from '../domain/types';
import { emptyStore, parseStoreV2 } from './gardenModel';
import { KEYS } from './gardenStorage';
import { GardenWriter } from './gardenWriter';
import { FakeStorage } from './testSupport';

// 保存に失敗したとき・応答が分からないときに、入力と保存済みの内容を失わないことの試験。

const NOW = '2026-03-01T00:00:00.000Z';
const make = (storage = new FakeStorage()) => ({
  storage,
  writer: new GardenWriter(storage, emptyStore(), { draftDebounceMs: 10_000, schedule: () => 1, cancel: () => undefined }),
});
const draft = (body: string, id = 'd1'): Draft => ({ id, kind: 'new', body, updatedAt: NOW });
const capture = (id: string, draftId?: string) => captureSeed({ commandId: `cmd-${id}`, seedId: id, input: { body: `本文${id}` }, now: NOW, draftId });
const stored = (storage: FakeStorage) => {
  const parsed = parseStoreV2(storage.data.get(KEYS.main) ?? '');
  assert.equal(parsed.ok, true);
  return parsed.ok ? parsed.store : emptyStore();
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('autosave keeps working for the same draft after the save that would clear it fails', async () => {
  const { storage, writer } = make();
  writer.saveDraft(draft('書きかけ'));
  await writer.flushDrafts();
  storage.failNext('setItem', KEYS.main);
  assert.equal((await writer.run(capture('A', 'd1'))).ok, false);

  writer.saveDraft(draft('書きかけの続き'));
  await writer.flushDrafts();
  assert.deepEqual(stored(storage).drafts.map((d) => d.body), ['書きかけの続き']);
});

test('input that was still waiting to be written survives a failed save', async () => {
  const { storage, writer } = make();
  writer.saveDraft(draft('まだ書き込んでいない入力'));
  storage.failNext('setItem', KEYS.main);
  assert.equal((await writer.run(capture('A', 'd1'))).ok, false);
  await writer.flushDrafts();
  assert.equal(stored(storage).drafts[0]?.body, 'まだ書き込んでいない入力');
});

test('a successful save clears its draft, including input queued while it was in flight', async () => {
  const { storage, writer } = make();
  const release = storage.hold('setItem', KEYS.main);
  const saving = writer.run(capture('A', 'd1'));
  writer.saveDraft(draft('確定を待つ間の下書き'));
  assert.equal(await writer.flushDrafts(), undefined); // 確定を待つ下書きは書き込まない
  release();
  assert.equal((await saving).ok, true);
  await writer.flushDrafts();
  assert.deepEqual(stored(storage).drafts, []);
  assert.deepEqual(writer.getDrafts(), []);
});

test('a draft whose write failed is written again by the next flush', async () => {
  const { storage, writer } = make();
  writer.saveDraft(draft('消えてはいけない'));
  storage.failNext('setItem', KEYS.main);
  assert.equal((await writer.flushDrafts())?.ok, false);
  assert.equal(writer.getDrafts()[0]?.body, '消えてはいけない'); // 画面を開き直しても読める
  assert.equal((await writer.flushDrafts())?.ok, true);
  assert.equal(stored(storage).drafts[0]?.body, '消えてはいけない');
  assert.equal(writer.getStatus().lastFailure, undefined);
});

test('a failed older draft write never replaces newer input', async () => {
  const { storage, writer } = make();
  const release = storage.hold('setItem', KEYS.main);
  storage.failNext('setItem', KEYS.main);
  writer.saveDraft(draft('古い'));
  const older = writer.flushDrafts();
  await tick();
  writer.saveDraft(draft('新しい'));
  const newer = writer.flushDrafts();
  release();
  await Promise.all([older, newer]);
  await writer.flushDrafts();
  assert.equal(stored(storage).drafts[0]?.body, '新しい');
});

test('the unsaved-draft warning clears once there is nothing left to write', async () => {
  const { storage, writer } = make();
  storage.failNext('setItem', KEYS.main);
  writer.saveDraft(draft('入力'));
  await writer.flushDrafts();
  assert.ok(writer.getStatus().lastFailure);
  writer.saveDraft(null, 'd1'); // 本人が入力を消した
  await writer.flushDrafts();
  assert.equal(writer.getStatus().lastFailure, undefined);
});

test('flushing while a draft write is in flight reports that write', async () => {
  const { storage, writer } = make();
  const release = storage.hold('setItem', KEYS.main);
  storage.failNext('setItem', KEYS.main);
  writer.saveDraft(draft('入力'));
  const first = writer.flushDrafts();
  const second = writer.flushDrafts();
  release();
  assert.equal((await first)?.ok, false);
  assert.equal((await second)?.ok, false);
});

test('a write that landed but could not be confirmed is not overwritten by the next command', async () => {
  const { storage, writer } = make();
  storage.failNext('setItem', KEYS.main, 1, true); // 反映されたのに失敗が返る
  storage.failNext('getItem', KEYS.main, 1); // 直後の読み直しもできない
  assert.equal((await writer.run(capture('A'))).ok, false);

  assert.equal((await writer.run(capture('B'))).ok, true);
  assert.deepEqual(stored(storage).seeds.map((s) => s.id).sort(), ['A', 'B']);
});

test('while the outcome stays unknown, later commands are not committed', async () => {
  const { storage, writer } = make();
  storage.failNext('setItem', KEYS.main, 1, true);
  storage.failNext('getItem', KEYS.main, 2);
  await writer.run(capture('A'));
  assert.equal((await writer.run(capture('B'))).ok, false);
  assert.deepEqual(stored(storage).seeds.map((s) => s.id), ['A']);
  // 読めるようになれば、同じ操作の再試行は二重にならず、後続も保存できる。
  assert.equal((await writer.run(capture('A'))).ok, true);
  assert.equal((await writer.run(capture('B'))).ok, true);
  assert.deepEqual(stored(storage).seeds.map((s) => s.id).sort(), ['A', 'B']);
});

test('an emptied title and emptied categories stay empty after a restart', () => {
  const store = { ...emptyStore(), drafts: [{ id: 'e', kind: 'edit-body', targetSeedId: 'A', body: '本文', title: '', tags: '', reselect: true, updatedAt: NOW }] };
  const parsed = parseStoreV2(JSON.stringify(store));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.store.drafts[0].title, '');
  assert.equal(parsed.store.drafts[0].tags, '');
  assert.equal(parsed.store.drafts[0].reselect, true);
});
