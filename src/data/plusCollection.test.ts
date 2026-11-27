import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCollectionWork, defaultWorkLayout, getWorkOnReturn, recordWorkOutput, saveWorkDraft, saveWorkEdit, workContent, workOutputKey, workText } from '../domain/plus/collection';
import { disconnectSeeds, promoteToSprout, softDeleteSeed, undoPromotion } from '../domain/gardenCommands';
import { createAtelier, saveAtelierRevision, saveAtelierText } from '../domain/plus/atelier';
import { makeConnection } from './gardenModel';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from './gardenV3Model';
import { PLUS_KEYS } from './gardenV3Storage';
import { GardenV3Writer, withCoreCommand } from './gardenV3Writer';
import { FakeStorage, makeSeed } from './testSupport';

const at = '2026-11-27T00:00:00.000Z';
const seeds = [makeSeed('A'), makeSeed('B'), makeSeed('C')];
const edges = [makeConnection('A', 'B', 'manual', at, '本人のつながりメモ'), makeConnection('B', 'C', 'manual', at)];
async function fixture() {
  const storage = new FakeStorage();
  const writer = new GardenV3Writer(storage, { ...emptyStoreV3(), seeds, connections: edges });
  await writer.run(createAtelier({ id: 'a', branchId: 'b', at, materials: [{ ref: { seedId: 'B', part: 'body' }, id: 'source' }] }));
  await writer.run(saveAtelierText({ projectId: 'a', branchId: 'b', expected: 0 }, '自分の作品🌱\n次の行', 'text', at));
  await writer.run(saveAtelierRevision({ projectId: 'a', branchId: 'b', expected: 1 }, 'version', at));
  const create = createCollectionWork({ itemId: 'work', revisionId: 'r1', atelierRevisionId: 'version', title: 'すきなこと',
    text: writer.getSnapshot().atelierRevisions[0].text, at, layout: { ...defaultWorkLayout, includeSources: true }, materialSnapshotIds: ['source'],
    map: { nodes: ['A', 'B', 'C'].map((seedId) => ({ seedId, snapshotId: `node-${seedId}` })) },
  });
  return { writer, storage, create };
}

test('PC13: a fixed Atelier revision can save a work directly, and failed or duplicate writes do not adopt a sprout', async () => {
  const { writer, storage, create } = await fixture();
  storage.failNext('setItem', PLUS_KEYS.main);
  assert.equal((await writer.run(create)).ok, false);
  assert.equal(writer.getSnapshot().collectionItems.length, 0);
  assert.equal((await writer.run(create)).ok, true);
  assert.equal((await writer.run(create)).ok, true);
  const parsed = parseStoreV3(serializeStoreV3(writer.getSnapshot()));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.store.collectionItems.length, 1);
  assert.equal(parsed.store.adoptionRecords.length, 0);
  assert.ok(parsed.store.seeds.every((seed) => !seed.synthesis));
  const work = parsed.store.collectionRevisions[0];
  assert.equal(work.kind, 'map_and_text_page');
  assert.equal(work.mapSnapshot.confirmedConnections.length, 2);
  assert.deepEqual(work.mapSnapshot.confirmedConnections.map(({ aSeedId, bSeedId }) => [aSeedId, bSeedId]), [['A', 'B'], ['B', 'C']]);
});

test('PC14/15: returns to the older fixed work after edits, and masks deleted source text and lines from standard output', async () => {
  const { writer, create } = await fixture();
  await writer.run(create);
  const old = writer.getSnapshot().collectionRevisions[0];
  await writer.run(saveWorkDraft({ itemId: 'work', base: 'r1', expected: 0, operationId: 'edit', title: '題名', text: '本人が編集した新しい文章', at }));
  await writer.run(saveWorkEdit('work', 'r1', 1, 'r2', at));
  const older = getWorkOnReturn(writer.getSnapshot(), { collectionItemId: 'work', collectionRevisionId: 'r1', scrollOffset: 90 });
  assert.equal(older?.newer, true);
  assert.equal(older?.revision.textSnapshot, old.textSnapshot);
  const newWork = writer.getSnapshot().collectionRevisions[1];
  assert.equal(newWork.kind, old.kind);
  assert.deepEqual(newWork.layout, old.layout);
  await writer.run(withCoreCommand(disconnectSeeds({ commandId: 'disconnect', a: 'A', b: 'B' })));
  assert.equal(workContent(writer.getSnapshot(), newWork).diagram?.lines.length, 2);
  const earlierOutput = workOutputKey(workContent(writer.getSnapshot(), newWork));
  await writer.run(withCoreCommand(softDeleteSeed({ commandId: 'delete', seedId: 'B', now: at })));
  const masked = workContent(writer.getSnapshot(), newWork);
  assert.equal(masked.diagram?.lines.length, 0);
  assert.equal(masked.diagram?.nodes.length, 2);
  assert.equal(masked.materials.length, 0);
  assert.match(workText(masked), /本人が編集した新しい文章/);
  assert.doesNotMatch(workText(masked), /本文B/);
  assert.equal((await writer.run(recordWorkOutput('stale-output', newWork, at, earlierOutput))).ok, false);
  assert.equal((await writer.run(recordWorkOutput('masked-output', newWork, at, workOutputKey(masked)))).ok, true);
  assert.equal(writer.getSnapshot().collectionExportReceipts[0].collectionRevisionId, 'r2');
});

test('an undone sprout is masked in a work and invalidates its prepared output', async () => {
  const writer = new GardenV3Writer(new FakeStorage(), { ...emptyStoreV3(), seeds });
  const statement = '取り消した芽の文章';
  const text = '作品に自分で書いた一文';
  assert.equal((await writer.run(withCoreCommand(promoteToSprout({ commandId: 'sprout', centerId: 'A', synthesisId: 's', statement,
    centerBodyText: seeds[0].body, materials: [], now: at })))).ok, true);
  const sprouted = writer.getSnapshot().seeds[0];
  const target = { projectId: 'a', branchId: 'b', expected: 0 };
  await writer.run(createAtelier({ id: 'a', branchId: 'b', at, materials: [{ ref: { seedId: 'A', part: 'synthesis', synthesisId: 's' }, id: 'source' }] }));
  await writer.run(saveAtelierText(target, text, 'text', at));
  await writer.run(saveAtelierRevision({ ...target, expected: 1 }, 'version', at));
  await writer.run(createCollectionWork({ itemId: 'work', revisionId: 'r1', atelierRevisionId: 'version',
    text, at, layout: { ...defaultWorkLayout, includeSources: true }, materialSnapshotIds: ['source'] }));
  const work = writer.getSnapshot().collectionRevisions[0];
  const before = workContent(writer.getSnapshot(), work);
  assert.ok(workText(before).includes(statement));

  assert.equal((await writer.run(withCoreCommand(undoPromotion({ commandId: 'undo', seedId: 'A', savedSynthesisId: 's',
    savedSynthesisUpdatedAt: at, savedGrowthState: sprouted.growthState, previous: { growthState: seeds[0].growthState } })))).ok, true);
  const after = workContent(writer.getSnapshot(), work);
  assert.equal(after.missingMaterials, 1);
  assert.equal(workText(after), text);
  assert.equal(writer.getSnapshot().sourceSnapshots[0].text, statement);
  assert.equal((await writer.run(recordWorkOutput('pre-undo-output', work, at, workOutputKey(before)))).ok, false);
  assert.equal((await writer.run(recordWorkOutput('masked-output', work, at, workOutputKey(after)))).ok, true);
});
