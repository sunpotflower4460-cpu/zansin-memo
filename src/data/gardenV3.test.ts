import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureSeed } from '../domain/gardenCommands';
import { buildPlusJsonExport, buildPlusTextExport } from '../utils/plusExport';
import { emptyStore, makeConnection, serializeStore } from './gardenModel';
import { KEYS, loadGarden } from './gardenStorage';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from './gardenV3Model';
import { loadGardenV3, PLUS_KEYS } from './gardenV3Storage';
import { GardenV3Writer, withCoreCommand } from './gardenV3Writer';
import { FakeStorage, makeSeed, makeV1Seed } from './testSupport';

const at = '2026-11-27T01:00:00.000Z';
const material = makeSeed('材料', { body: '選んだ時の材料', deletedAt: at });
const seed = makeSeed('起点', {
  body: '原文の景色\n', growthState: 'tree', bloom: { note: '花の記録', bloomedAt: at },
  synthesis: {
    id: '芽', statement: '芽の文章', createdAt: at, updatedAt: at, promotedAt: at,
    sources: [{ seedId: material.id, sourcePart: 'body', textSnapshot: material.body, sourceUpdatedAt: material.updatedAt }],
  },
});
const oldStore = {
  ...emptyStore(), revision: 9, lastMutationId: 'last-v2-edit', seeds: [seed, material],
  connections: [makeConnection(seed.id, material.id, 'legacy')],
  drafts: [{ id: 'draft', kind: 'edit-body' as const, targetSeedId: seed.id, title: '', body: '書きかけ🌱\n', updatedAt: at }],
};
const original = serializeStore(oldStore);
const oldSnapshot = () => ({ [KEYS.main]: original, [KEYS.lastGood]: original, [KEYS.dismissedSuggestions]: JSON.stringify([JSON.stringify([seed.id, material.id])]) });

test('DATA-01: keeps v2 source, draft and relation meaning while adding unasked permissions', async () => {
  const storage = new FakeStorage(oldSnapshot());
  const migrated = await loadGardenV3(storage, () => at);
  assert.equal(migrated.status, 'ready');
  assert.equal(migrated.migrationSource, 'v2');
  assert.equal(migrated.store.revision, oldStore.revision);
  assert.equal(migrated.store.lastMutationId, oldStore.lastMutationId);
  const json = JSON.parse(original);
  assert.deepEqual(migrated.store.seeds, json.seeds);
  assert.deepEqual(migrated.store.connections, json.connections);
  assert.deepEqual(migrated.store.drafts, json.drafts);
  assert.deepEqual(migrated.store.permissions.map(({ externalAi, discovery, epoch }) => [externalAi, discovery, epoch]),
    [['unasked', 'include', 0], ['unasked', 'include', 0]]);
  assert.deepEqual(migrated.store.proposalSuppressions.map((entry) => entry.pair), [JSON.parse(oldStore.connections[0].id)]);
  assert.equal(migrated.store.aiRequestReceipts.length, 0);
  assert.equal(migrated.store.outbox.length, 0);
  assert.ok([...storage.data].some(([key, raw]) => key.startsWith(PLUS_KEYS.archives) && key.endsWith(`:${KEYS.main}`) && raw === original));
  assert.deepEqual(await loadGarden(storage), { status: 'blocked', reason: 'unsupported_version' });
  const writes = storage.writes.length;
  storage.failNext('getItem', KEYS.main);
  assert.deepEqual(await loadGardenV3(storage), { status: 'ready', source: 'v3', store: migrated.store, needsInitialPersist: false });
  assert.equal(storage.writes.length, writes);
});

test('DATA-21: restart at each copy, fence and finalization write without duplicating or losing the source', async (t) => {
  for (const key of [new RegExp(':original:'), PLUS_KEYS.staging, KEYS.main, KEYS.lastGood, PLUS_KEYS.main, PLUS_KEYS.lastGood, PLUS_KEYS.active]) {
    await t.test(`write to ${key}`, async () => {
      const storage = new FakeStorage(oldSnapshot());
      storage.failNext('setItem', key);
      assert.equal((await loadGardenV3(storage, () => at)).status, 'blocked');
      assert.notEqual(storage.data.get(PLUS_KEYS.marker), undefined);
      const resumed = await loadGardenV3(storage, () => '2027-01-01T00:00:00.000Z');
      assert.equal(resumed.status, 'ready');
      assert.equal(resumed.store.permissions[0].changedAt, at);
      assert.equal(resumed.store.seeds[0].body, seed.body);
      assert.equal(resumed.store.connections.length, 1);
      assert.equal(storage.data.has(PLUS_KEYS.marker), false);
    });
  }
  for (const key of [PLUS_KEYS.staging, PLUS_KEYS.marker]) {
    await t.test(`cleanup of ${key}`, async () => {
      const storage = new FakeStorage(oldSnapshot());
      storage.failNext('removeItem', key);
      assert.equal((await loadGardenV3(storage, () => at)).status, 'blocked');
      const resumed = await loadGardenV3(storage);
      assert.equal(resumed.status, 'ready');
      assert.equal(resumed.store.seeds.length, 2);
    });
  }
});

test('DATA-22: a v1-only migration archives the original before any v2 fence is written', async () => {
  const legacy = JSON.stringify([makeV1Seed('first', { relatedSeedIds: ['second'] }), makeV1Seed('second')]);
  const storage = new FakeStorage({ [KEYS.v1Main]: legacy });
  storage.failNext('setItem', new RegExp(':original:'));
  assert.equal((await loadGardenV3(storage, () => at)).status, 'blocked');
  assert.equal(storage.data.has(KEYS.main), false);
  const result = await loadGardenV3(storage);
  assert.equal(result.status, 'ready');
  assert.equal(result.migrationSource, 'v1');
  assert.equal(result.store.connections[0].createdAt, undefined);
  assert.equal(storage.data.get(KEYS.v1Main), legacy);
  const archived = storage.writes.findIndex(({ key }) => key.startsWith(PLUS_KEYS.archives));
  assert.ok(archived >= 0 && archived < storage.writes.findIndex(({ key }) => key === KEYS.main));
});

test('v2 backup recovery archives the corrupt primary and the valid backup separately', async () => {
  const storage = new FakeStorage({ [KEYS.main]: 'corrupt original', [KEYS.lastGood]: original });
  const result = await loadGardenV3(storage);
  assert.equal(result.status, 'ready');
  assert.equal(result.migrationSource, 'v2-backup');
  assert.equal(result.store.seeds[0].body, seed.body);
  assert.ok([...storage.data].some(([key, value]) => key.startsWith(PLUS_KEYS.archives) && value === 'corrupt original'));
});

test('v3 startup distinguishes traces, corrupt data, unknown versions and unreadable keys', async (t) => {
  const valid = serializeStoreV3(emptyStoreV3());
  for (const [overrides, reason] of [
    [{ [PLUS_KEYS.active]: '3', [PLUS_KEYS.lastGood]: '{' }, 'recovery_required'],
    [{ [PLUS_KEYS.staging]: valid }, 'recovery_required'],
    [{ [KEYS.main]: '{"storeVersion":3}' }, 'recovery_required'],
    [{ [PLUS_KEYS.main]: '{"storeVersion":4}', [PLUS_KEYS.lastGood]: valid }, 'unsupported_version'],
    [{ [PLUS_KEYS.marker]: '{', [PLUS_KEYS.main]: valid }, 'migration_failed'],
    [{ [KEYS.deletingMarker]: '{', [PLUS_KEYS.main]: valid }, 'marker_unreadable'],
  ] as const) {
    await t.test(reason, async () => {
      const storage = new FakeStorage({ ...oldSnapshot(), ...overrides });
      assert.deepEqual(await loadGardenV3(storage), { status: 'blocked', reason });
      assert.equal(storage.writes.length, 0);
    });
  }
  const storage = new FakeStorage();
  storage.failNext('getItem', PLUS_KEYS.lastGood);
  assert.deepEqual(await loadGardenV3(storage), { status: 'blocked', reason: 'read_error' });
  assert.equal(storage.writes.length, 0);
  const result = await loadGardenV3(storage);
  assert.equal(result.status, 'ready');
  assert.equal(result.migrationSource, 'empty');
  assert.deepEqual(result.store.seeds, []);
});

test('v3 recovery preserves the corrupt primary and only uses the v3 lastGood', async () => {
  const originalV3 = serializeStoreV3({ ...emptyStoreV3(), revision: 10 });
  const storage = new FakeStorage({ ...oldSnapshot(), [PLUS_KEYS.main]: 'corrupt', [PLUS_KEYS.lastGood]: originalV3 });
  const result = await loadGardenV3(storage);
  assert.equal(result.status, 'ready');
  assert.equal(result.source, 'v3-backup');
  assert.equal(result.store.revision, 10);
  assert.equal(storage.data.get(PLUS_KEYS.corrupt), 'corrupt');
});

test('missing collections or immutable references and duplicate IDs are rejected without dropping records', () => {
  const empty = emptyStoreV3();
  assert.deepEqual(parseStoreV3(JSON.stringify({ ...empty, collectionDrafts: undefined })), { ok: false, reason: 'invalid_shape' });
  assert.deepEqual(parseStoreV3(JSON.stringify({ ...empty, seeds: [seed, seed] })), { ok: false, reason: 'invalid_references' });
  assert.deepEqual(parseStoreV3(JSON.stringify({ ...empty, collectionItems: [{ id: 'work', currentRevisionId: 'missing', order: 0, createdAt: at, updatedAt: at }] })),
    { ok: false, reason: 'invalid_references' });
});

test('DATA-13: an ambiguous v3 commit blocks later updates until readback and retries the same core operation once', async () => {
  const storage = new FakeStorage();
  const opened = await loadGardenV3(storage);
  assert.equal(opened.status, 'ready');
  const writer = new GardenV3Writer(storage, opened.store);
  const save = withCoreCommand(captureSeed({ commandId: 'capture', seedId: 'seed', input: { body: '書いた言葉' }, now: at }));
  storage.failNext('setItem', PLUS_KEYS.main, 1, true);
  storage.failNext('getItem', PLUS_KEYS.main, 2);
  assert.equal((await writer.run(save)).ok, false);
  assert.equal((await writer.run(save)).ok, false);
  assert.equal(writer.getSnapshot().seeds.length, 0);
  assert.deepEqual(await writer.run(save), { ok: true, revision: 1, backupOk: true, alreadyApplied: true });
  assert.equal(writer.getSnapshot().seeds.length, 1);
});

test('v3 delete resumes ahead of migration and removes archives, staging, preferences and parked results', async () => {
  const storage = new FakeStorage({ ...oldSnapshot(), [KEYS.onboarding]: 'keep', ['other-app']: 'keep' });
  const opened = await loadGardenV3(storage);
  assert.equal(opened.status, 'ready');
  const writer = new GardenV3Writer(storage, opened.store);
  await storage.setItem(PLUS_KEYS.marker, 'broken migration');
  await storage.setItem(PLUS_KEYS.staging, 'stage');
  await storage.setItem('kizashi-notes:parked-result', 'result');
  storage.failNext('multiRemove');
  assert.equal((await writer.deleteAll()).ok, false);
  const resumed = await loadGardenV3(storage);
  assert.equal(resumed.status, 'ready');
  assert.equal(resumed.source, 'deletion-resumed');
  assert.equal(resumed.store.seeds.length, 0);
  assert.deepEqual([...storage.data.keys()].sort(), [KEYS.onboarding, PLUS_KEYS.main, PLUS_KEYS.lastGood, 'other-app'].sort());
  assert.equal((await loadGardenV3(storage)).status, 'ready');
});

test('a v3 deletion marker written without an acknowledgement still completes deletion', async () => {
  const storage = new FakeStorage(oldSnapshot());
  const opened = await loadGardenV3(storage);
  assert.equal(opened.status, 'ready');
  const writer = new GardenV3Writer(storage, opened.store);
  storage.failNext('setItem', KEYS.deletingMarker, 1, true);
  assert.deepEqual(await writer.deleteAll(), { ok: true });
  assert.equal(storage.data.has(KEYS.deletingMarker), false);
  assert.equal(writer.getSnapshot().seeds.length, 0);
});

test('v3 export includes the fixed work and keeps deleted material out of normal text', async () => {
  const opened = await loadGardenV3(new FakeStorage(oldSnapshot()));
  assert.equal(opened.status, 'ready');
  const store = opened.store;
  const lineage = { rootSeedIds: [material.id], status: 'known' as const };
  store.sourceSnapshots.push({ id: 'snapshot', source: { ref: { seedId: material.id, part: 'body' }, textDigest: 'digest', updatedAt: at },
    text: material.body, capturedAt: at, lineage });
  store.collectionItems.push({ id: 'work', currentRevisionId: 'rev', order: 0, createdAt: at, updatedAt: at });
  store.collectionRevisions.push({ id: 'rev', itemId: 'work', kind: 'word_card', templateId: 'word_card_v1', styleVersion: 1, outputSpecVersion: 1,
    textSnapshot: '作品の自分の文', materialSnapshotIds: ['snapshot'], lineage, savedAt: at,
    layout: { paper: 'washi', textAlign: 'start', mapPosition: 'above', includeSources: true } });
  const json = buildPlusJsonExport(store, at);
  assert.equal(JSON.parse(json).exportVersion, 3);
  assert.ok(json.includes(material.body));
  const text = buildPlusTextExport(store);
  assert.match(text, /作品の自分の文/);
  assert.match(text, /最近削除した種/);
  assert.ok(!text.includes(material.body));
});
