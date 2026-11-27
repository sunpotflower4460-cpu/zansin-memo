import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeDraft, adoptAtelierRevision, createAtelier, forkAtelier, insertAtelierExample, movePins, reviseMaterial, saveAtelierExample, saveAtelierRevision, saveAtelierText, trackPin } from '../domain/plus/atelier';
import { updateSeedFields } from '../domain/gardenCommands';
import { emptyStoreV3, parseStoreV3 } from './gardenV3Model';
import { PLUS_KEYS } from './gardenV3Storage';
import { GardenV3Writer, withCoreCommand } from './gardenV3Writer';
import { FakeStorage, makeSeed } from './testSupport';

const at = '2026-11-27T00:00:00.000Z';
const center = makeSeed('center', { body: '元の言葉' });
const source = makeSeed('source', { body: '選んだときの材料' });
const target = (expected: number) => ({ projectId: 'project', branchId: 'branch', expected });
const create = createAtelier({ id: 'project', centerSeedId: center.id, branchId: 'branch', at,
  materials: [{ ref: { part: 'body', seedId: source.id }, id: 'snapshot' }] });

test('DATA-10: a draft survives write failure and restores its original material after source edits', async () => {
  const storage = new FakeStorage();
  const writer = new GardenV3Writer(storage, { ...emptyStoreV3(), seeds: [center, source] });
  await writer.run(create);
  const edit = saveAtelierText(target(0), '本人が書いた言葉🌱', 'edit', at);
  storage.failNext('setItem', PLUS_KEYS.main);
  assert.equal((await writer.run(edit)).ok, false);
  assert.equal(writer.getSnapshot().atelierDrafts[0].text, '');
  assert.equal((await writer.run(edit)).ok, true);
  await writer.run(withCoreCommand(updateSeedFields({ commandId: 'source-edit', seedId: source.id, patch: { body: '現在の材料' }, now: at })));
  const restored = parseStoreV3(storage.data.get(PLUS_KEYS.main)!);
  assert.equal(restored.ok, true);
  assert.equal(restored.store.sourceSnapshots[0].text, source.body);
  assert.equal(restored.store.atelierDrafts[0].text, '本人が書いた言葉🌱');
  assert.equal((await writer.run(saveAtelierRevision(target(1), 'rev', at))).ok, false);
  await writer.run(reviseMaterial({ kind: 'historical', priorId: 'snapshot', commandId: 'keep', target: target(1), at }));
  assert.equal((await writer.run(saveAtelierRevision(target(2), 'rev', at))).ok, true);
  const adopt = adoptAtelierRevision({ id: 'adopt', revisionId: 'rev', centerId: center.id, centerText: center.body,
    newSynthesisId: 'new', snapshotId: 'prior', at });
  assert.equal((await writer.run(adopt)).ok, false);
  assert.equal(writer.getSnapshot().seeds[0].synthesis, undefined);
});

test('fixed excerpts move with their offsets and only an explicit unlock permits edits', async () => {
  const writer = new GardenV3Writer(new FakeStorage(), { ...emptyStoreV3(), seeds: [center, source] });
  await writer.run(create);
  await writer.run(saveAtelierText(target(0), '最初の段落\n言葉🌱\n言葉🌱', 'edit', at));
  await writer.run(trackPin({ target: target(1), id: 'pin', range: { start: 6, end: 10 }, at }));
  const pinned = writer.getSnapshot().atelierDrafts[0];
  assert.equal(pinned.pinnedExcerpts[0].text, '言葉🌱');
  assert.equal(movePins(pinned.text, pinned.text.replace('言葉', '別の文'), pinned.pinnedExcerpts), undefined);
  assert.equal((await writer.run(saveAtelierText(target(2), `前書き${pinned.text}`, 'insert-before', at))).ok, true);
  assert.equal(writer.getSnapshot().atelierDrafts[0].pinnedExcerpts[0].start, 9);
  assert.equal((await writer.run(trackPin({ target: target(3), id: 'pin', at }))).ok, true);
  assert.equal((await writer.run(saveAtelierText(target(4), '書き直した文', 'rewrite', at))).ok, true);
});

test('a repeated excerpt keeps its occurrence, including when inserting identical text at a known position', async () => {
  const pin = { id: 'pin', start: 2, end: 4, text: '同じ' };
  assert.equal(movePins('🌱同じ同じ', '🌱同じ', [pin]), undefined);
  assert.equal(movePins('🌱同じ', '🌱同じ同じ', [pin]), undefined);
  const writer = new GardenV3Writer(new FakeStorage(), { ...emptyStoreV3(), seeds: [center, source] });
  await writer.run(create);
  await writer.run(saveAtelierText(target(0), '🌱同じ', 'edit', at));
  assert.equal((await writer.run(trackPin({ target: target(1), id: 'split', range: { start: 1, end: 2 }, at }))).ok, false);
  await writer.run(trackPin({ target: target(1), id: pin.id, range: pin, at }));
  await writer.run(saveAtelierExample(target(2), { id: 'hint', snapshotId: 'snapshot', kind: 'title', content: '同じ', at }));
  assert.equal((await writer.run(insertAtelierExample(target(2), { id: 'hint', start: 1, end: 1, at }))).ok, false);
  assert.equal((await writer.run(insertAtelierExample(target(2), { id: 'hint', start: 2, end: 2, at }))).ok, true);
  const draft = writer.getSnapshot().atelierDrafts[0];
  assert.equal(draft.text, '🌱同じ同じ');
  assert.deepEqual(draft.pinnedExcerpts, [{ ...pin, start: 4, end: 6 }]);
});

test('checkpoint, fork and sprout adoption are separate and a failed adoption writes neither record nor sprout', async () => {
  const storage = new FakeStorage();
  const writer = new GardenV3Writer(storage, { ...emptyStoreV3(), seeds: [center, source] });
  await writer.run(create);
  await writer.run(saveAtelierText(target(0), '自分の案', 'edit', at));
  await writer.run(saveAtelierRevision(target(1), 'rev', at));
  await writer.run(saveAtelierRevision(target(2), 'unchanged', at));
  await writer.run(forkAtelier('project', 'other-branch', at, 'rev'));
  assert.equal(writer.getSnapshot().atelierRevisions.length, 1);
  assert.equal(activeDraft(writer.getSnapshot(), writer.getSnapshot().atelierProjects[0])?.baseRevisionId, 'rev');
  assert.equal(writer.getSnapshot().seeds[0].synthesis, undefined);
  assert.equal(writer.getSnapshot().collectionItems.length, 0);
  const adopt = adoptAtelierRevision({ id: 'adopt', revisionId: 'rev', centerId: center.id, centerText: center.body,
    newSynthesisId: 'new', snapshotId: 'prior', at });
  storage.failNext('setItem', PLUS_KEYS.main);
  assert.equal((await writer.run(adopt)).ok, false);
  assert.equal(writer.getSnapshot().adoptionRecords.length, 0);
  assert.equal(writer.getSnapshot().seeds[0].synthesis, undefined);
  assert.equal((await writer.run(adopt)).ok, true);
  assert.equal((await writer.run(adopt)).ok, true);
  const saved = writer.getSnapshot();
  assert.equal(saved.seeds[0].body, center.body);
  assert.equal(saved.seeds[0].synthesis?.statement, '自分の案');
  assert.equal(saved.seeds[0].synthesis?.sources[0].seedId, center.id);
  assert.equal(saved.adoptionRecords.length, 1);
  assert.equal(saved.connections.length, 0);
  assert.equal(saved.collectionItems.length, 0);
  const rev2 = { ...saved.atelierRevisions[0], id: 'rev2', text: '考え直した案' };
  const second = new GardenV3Writer(storage, { ...saved, atelierRevisions: [...saved.atelierRevisions, rev2] });
  const review = { id: 'review', revisionId: 'rev2', centerId: center.id, centerText: center.body, newSynthesisId: 'unused', snapshotId: 'prior', at };
  assert.equal((await second.run(adoptAtelierRevision(review))).ok, false);
  assert.equal((await second.run(adoptAtelierRevision({ ...review, oldSynthesis: saved.seeds[0].synthesis }))).ok, true);
  assert.equal(second.getSnapshot().sourceSnapshots.find(({ id }) => id === 'prior')?.text, '自分の案');
});

test('a short offline example cannot change a pinned excerpt, and explicit insertion changes only the draft', async () => {
  const writer = new GardenV3Writer(new FakeStorage(), { ...emptyStoreV3(), seeds: [center, source] });
  await writer.run(create);
  await writer.run(saveAtelierText(target(0), '固定した文', 'edit', at));
  await writer.run(trackPin({ target: target(1), id: 'pin', range: { start: 0, end: 5 }, at }));
  await writer.run(saveAtelierExample(target(2), { id: 'hint', snapshotId: 'snapshot', kind: 'title', content: '短い題名', at }));
  assert.equal(writer.getSnapshot().atelierDrafts[0].text, '固定した文');
  assert.equal((await writer.run(insertAtelierExample(target(2), { id: 'hint', start: 1, end: 1, at }))).ok, false);
  assert.equal((await writer.run(insertAtelierExample(target(2), { id: 'hint', start: 0, end: 0, append: true, at }))).ok, true);
  const saved = writer.getSnapshot();
  assert.equal(saved.atelierDrafts[0].text, '固定した文\n短い題名');
  assert.equal(saved.atelierDrafts[0].pinnedExcerpts[0].text, '固定した文');
  assert.equal(saved.atelierSuggestions[0].decision, 'inserted');
  assert.equal(saved.aiRequestReceipts.length + saved.atelierRevisions.length + saved.adoptionRecords.length + saved.connections.length + saved.collectionItems.length, 0);
});
