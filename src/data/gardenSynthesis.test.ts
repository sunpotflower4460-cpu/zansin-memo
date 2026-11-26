import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureSeed,
  connectSeeds,
  disconnectSeeds,
  promoteToSprout,
  reconsiderSynthesis,
  softDeleteSeed,
  restoreSeed,
  undoPromotion,
  updateSeedFields,
} from '../domain/gardenCommands';
import type { Seed } from '../domain/types';
import { describeSource, getSynthesisStatus, hasChangedSources, hasCurrentSynthesis } from '../utils/synthesis';
import { emptyStore, parseStoreV2 } from './gardenModel';
import { KEYS } from './gardenStorage';
import { GardenWriter } from './gardenWriter';
import { FakeStorage } from './testSupport';

const T0 = '2026-03-01T00:00:00.000Z';
const T1 = '2026-03-02T00:00:00.000Z';
const T2 = '2026-03-03T00:00:00.000Z';

const setup = async () => {
  const storage = new FakeStorage();
  const writer = new GardenWriter(storage, emptyStore(), { schedule: () => 1, cancel: () => undefined });
  for (const [id, body] of [['A', '散歩写真が溜まる'], ['B', '写真に短文を添えるのが好き'], ['C', '離れた友人と近況を伝えたい'], ['D', '紙のカードも楽しそう']] as const) {
    await writer.run(captureSeed({ commandId: `cap-${id}`, seedId: id, input: { body }, now: T0 }));
  }
  await writer.run(connectSeeds({ commandId: 'ab', a: 'A', b: 'B', now: T0 }));
  const seed = (id: string): Seed => writer.getSnapshot().seeds.find((s) => s.id === id)!;
  const stored = () => {
    const parsed = parseStoreV2(storage.data.get(KEYS.main) ?? '');
    assert.equal(parsed.ok, true);
    return parsed.ok ? parsed.store : emptyStore();
  };
  return { storage, writer, seed, stored };
};

const promote = (overrides: Partial<Parameters<typeof promoteToSprout>[0]> = {}) =>
  promoteToSprout({
    commandId: 'promote-1',
    centerId: 'A',
    synthesisId: 'syn-1',
    statement: '写真3枚にひと言を添えた近況便りが作れそう',
    centerBodyText: '散歩写真が溜まる',
    materials: [
      { seedId: 'B', sourcePart: 'body', expectedText: '写真に短文を添えるのが好き' },
      { seedId: 'C', sourcePart: 'body', expectedText: '離れた友人と近況を伝えたい' },
    ],
    now: T1,
    ...overrides,
  });

test('promoting keeps the original text, saves a separate synthesis with snapshots, and does not touch materials or connections', async () => {
  const { writer, seed, stored } = await setup();
  const connectionsBefore = JSON.stringify(writer.getSnapshot().connections);
  const bBefore = JSON.stringify(seed('B'));
  const result = await writer.run(promote());
  assert.equal(result.ok, true);

  const a = stored().seeds.find((s) => s.id === 'A')!;
  assert.equal(a.body, '散歩写真が溜まる'); // 原文は変わらない
  assert.equal(a.growthState, 'sprout');
  assert.equal(a.synthesis?.statement, '写真3枚にひと言を添えた近況便りが作れそう');
  assert.deepEqual(a.synthesis?.sources.map((s) => `${s.seedId}:${s.sourcePart}`), ['A:body', 'B:body', 'C:body']);
  assert.equal(a.synthesis?.sources[1].textSnapshot, '写真に短文を添えるのが好き');
  assert.equal(a.synthesis?.promotedAt, T1);
  assert.equal(JSON.stringify(writer.getSnapshot().connections), connectionsBefore); // 材料にしただけでは線を追加しない（B-C, A-C なし）
  assert.equal(JSON.stringify(seed('B')), bBefore); // 他の材料の本文・状態は変わらない
  assert.equal(stored().connections.length, 1);
});

test('the center body is always a material, and a sprout needs no other materials (no unlock condition)', async () => {
  const { seed, writer } = await setup();
  const result = await writer.run(promote({ commandId: 'solo', materials: [], statement: 'ひとつの思いつきから、小さく試せそう' }));
  assert.equal(result.ok, true);
  assert.deepEqual(seed('A').synthesis?.sources.map((s) => `${s.seedId}:${s.sourcePart}`), ['A:body']);
});

test('D07 an empty statement is rejected, nothing changes, and a retry or a double tap creates exactly one sprout', async () => {
  const { writer, seed } = await setup();
  assert.deepEqual(await writer.run(promote({ commandId: 'e', statement: '   ' })), { ok: false, reason: 'rejected', detail: 'empty_statement' });
  assert.equal(seed('A').growthState, 'seed');
  assert.equal(seed('A').synthesis, undefined);

  const command = promote({ commandId: 'once' });
  const [first, second] = await Promise.all([writer.run(command), writer.run(command)]);
  assert.equal(first.ok && second.ok, true);
  assert.equal(seed('A').synthesis?.id, 'syn-1');
  assert.equal(writer.getSnapshot().revision, 4 + 1 + 1); // 4メモ + 接続 + 芽(1回だけ)
});

test('D07 a save failure leaves the memo as a seed; retrying with the same ids succeeds without changing anything else', async () => {
  const { storage, writer, seed } = await setup();
  storage.failNext('setItem', KEYS.main);
  const failed = await writer.run(promote());
  assert.equal(failed.ok, false);
  assert.equal(seed('A').growthState, 'seed');
  assert.equal(seed('A').synthesis, undefined);
  assert.equal((await writer.run(promote())).ok, true);
  assert.equal(seed('A').growthState, 'sprout');
});

test('materials whose text changed since the user read them are refused (input is kept by the caller), and deleted ones cannot be newly adopted', async () => {
  const { writer, seed } = await setup();
  await writer.run(updateSeedFields({ commandId: 'edit-B', seedId: 'B', patch: { body: '写真に短文を添えるのが大好き' }, now: T1 }));
  assert.deepEqual(await writer.run(promote()), { ok: false, reason: 'rejected', detail: 'source_changed:B' });
  assert.equal(seed('A').synthesis, undefined);

  await writer.run(softDeleteSeed({ commandId: 'del-C', seedId: 'C', now: T1 }));
  const withDeleted = await writer.run(
    promote({ materials: [{ seedId: 'C', sourcePart: 'body', expectedText: '離れた友人と近況を伝えたい' }] }),
  );
  assert.deepEqual(withDeleted, { ok: false, reason: 'rejected', detail: 'source_missing:C' });

  const centerChanged = await writer.run(promote({ materials: [], centerBodyText: '古い中心の本文' }));
  assert.deepEqual(centerChanged, { ok: false, reason: 'rejected', detail: 'source_changed:center' });
});

test('D13 using another sprout as a material records exactly the sentence that was read and never copies its own materials', async () => {
  const { writer, seed } = await setup();
  await writer.run(promote()); // A に芽
  const result = await writer.run(
    promoteToSprout({
      commandId: 'promote-D',
      centerId: 'D',
      synthesisId: 'syn-D',
      statement: '近況便りを紙のカードで届けるのも楽しそう',
      centerBodyText: '紙のカードも楽しそう',
      materials: [
        { seedId: 'A', sourcePart: 'synthesis', expectedText: '写真3枚にひと言を添えた近況便りが作れそう' },
        { seedId: 'A', sourcePart: 'body', expectedText: '散歩写真が溜まる' }, // 同じメモの原文と芽の文を両方選んでもよい
      ],
      now: T2,
    }),
  );
  assert.equal(result.ok, true);
  const sources = seed('D').synthesis!.sources;
  assert.deepEqual(sources.map((s) => `${s.seedId}:${s.sourcePart}`), ['D:body', 'A:synthesis', 'A:body']);
  assert.equal(sources[1].textSnapshot, '写真3枚にひと言を添えた近況便りが作れそう');
  assert.equal(sources[1].sourceSynthesisId, 'syn-1');
  assert.equal(sources.length, 3); // Aの材料(B,C)は再帰的に複製されない
  assert.equal(sources.some((s) => s.seedId === 'B' || s.seedId === 'C'), false);

  // 読んだ文章と違う芽の文を材料にしようとすると拒否される
  const stale = await writer.run(
    promoteToSprout({ commandId: 'stale', centerId: 'B', synthesisId: 'syn-B', statement: 'x', centerBodyText: '写真に短文を添えるのが好き', materials: [{ seedId: 'A', sourcePart: 'synthesis', expectedText: '別の文' }], now: T2 }),
  );
  assert.deepEqual(stale, { ok: false, reason: 'rejected', detail: 'source_changed:A' });
});

test('D15 creating a new sprout on a memo that already has one is refused (nothing is overwritten); review is explicit and keeps ids/dates', async () => {
  const { writer, seed } = await setup();
  await writer.run(promote());
  const before = JSON.stringify(seed('A').synthesis);
  const clash = await writer.run(promote({ commandId: 'clash', synthesisId: 'syn-other', statement: '別の案を書いてしまった' }));
  assert.deepEqual(clash, { ok: false, reason: 'rejected', detail: 'center_has_synthesis' });
  assert.equal(JSON.stringify(seed('A').synthesis), before);

  const review = await writer.run(
    promote({ commandId: 'review', synthesisId: 'syn-1', review: true, keepExistingSources: true, statement: '写真に言葉を添えた近況便りを、友人に送れそう', now: T2 }),
  );
  assert.equal(review.ok, true);
  const synthesis = seed('A').synthesis!;
  assert.equal(synthesis.statement, '写真に言葉を添えた近況便りを、友人に送れそう');
  assert.equal(synthesis.id, 'syn-1');
  assert.equal(synthesis.createdAt, T1);
  assert.equal(synthesis.promotedAt, T1); // 文章を直しただけでは採用時刻を更新しない
  assert.equal(synthesis.updatedAt, T2);
  assert.deepEqual(synthesis.sources.map((s) => s.seedId), ['A', 'B', 'C']); // 材料のスナップショットは保持
});

test('a review can replace the materials, which re-reads the current text', async () => {
  const { writer, seed } = await setup();
  await writer.run(promote());
  await writer.run(updateSeedFields({ commandId: 'edit-B', seedId: 'B', patch: { body: '写真に短文を添えるのが大好き' }, now: T2 }));
  const review = await writer.run(
    promote({
      commandId: 'review-materials',
      synthesisId: 'syn-1',
      review: true,
      materials: [{ seedId: 'B', sourcePart: 'body', expectedText: '写真に短文を添えるのが大好き' }],
      now: T2,
    }),
  );
  assert.equal(review.ok, true);
  assert.deepEqual(seed('A').synthesis!.sources.map((s) => `${s.seedId}:${s.textSnapshot}`), ['A:散歩写真が溜まる', 'B:写真に短文を添えるのが大好き']);
});

test('D06 editing, deleting or restoring a material, or unlinking, never rewrites the sprout; the materials report their own state', async () => {
  const { writer, seed } = await setup();
  await writer.run(promote());
  const frozen = JSON.stringify(seed('A').synthesis);

  await writer.run(updateSeedFields({ commandId: 'edit', seedId: 'B', patch: { body: '写真に短文を添えるのが大好き', tags: ['日々'] }, now: T2 }));
  await writer.run(disconnectSeeds({ commandId: 'unlink', a: 'A', b: 'B' }));
  assert.equal(JSON.stringify(seed('A').synthesis), frozen); // 芽の文章も材料のスナップショットも不変

  const byId = () => new Map(writer.getSnapshot().seeds.map((s) => [s.id, s]));
  const source = (id: string) => seed('A').synthesis!.sources.find((s) => s.seedId === id)!;
  assert.equal(describeSource(source('B'), byId()).kind, 'changed'); // 材料に更新あり
  assert.equal(describeSource(source('C'), byId()).kind, 'unchanged');
  assert.equal(hasChangedSources(seed('A'), byId()), true);

  await writer.run(softDeleteSeed({ commandId: 'del-C', seedId: 'C', now: T2 }));
  assert.equal(describeSource(source('C'), byId()).kind, 'deleted'); // 削除済みの本文は露出しない
  assert.equal(JSON.stringify(seed('A').synthesis), frozen);
  await writer.run(restoreSeed({ commandId: 'res-C', seedId: 'C', now: T2 }));
  assert.equal(describeSource(source('C'), byId()).kind, 'unchanged'); // 復元すると戻る
  assert.equal(JSON.stringify(seed('A').synthesis), frozen);
});

test('tag-only changes do not count as a material update (text diff decides)', async () => {
  const { writer, seed } = await setup();
  await writer.run(promote());
  await writer.run(updateSeedFields({ commandId: 'tag', seedId: 'B', patch: { tags: ['日々'] }, now: T2 }));
  const byId = new Map(writer.getSnapshot().seeds.map((s) => [s.id, s]));
  assert.equal(hasChangedSources(seed('A'), byId), false);
});

test('reconsidering returns the memo to a seed but keeps the thought and its materials; it can be adopted again', async () => {
  const { writer, seed } = await setup();
  await writer.run(promote());
  const kept = JSON.stringify(seed('A').synthesis);
  await writer.run(reconsiderSynthesis({ commandId: 'reconsider', seedId: 'A' }));
  assert.equal(seed('A').growthState, 'seed');
  assert.equal(JSON.stringify(seed('A').synthesis), kept);
  assert.equal(getSynthesisStatus(seed('A')), 'reconsidered');
  assert.equal(hasCurrentSynthesis(seed('A')), false); // 現在の芽として数えない

  await writer.run(promote({ commandId: 'readopt', synthesisId: 'syn-1', review: true, keepExistingSources: true, statement: '写真3枚にひと言を添えた近況便りが作れそう', now: T2 }));
  assert.equal(seed('A').growthState, 'sprout');
  assert.equal(seed('A').synthesis?.promotedAt, T2); // 採り直した時刻
});

test('legacy sprout/tree memos stay readable as "以前からの育ち状態" and never get an invented sentence', async () => {
  const { writer, seed } = await setup();
  await writer.run(updateSeedFields({ commandId: 'legacy', seedId: 'C', patch: { growthState: 'tree' }, now: T1 }));
  assert.equal(getSynthesisStatus(seed('C')), 'legacy');
  assert.equal(seed('C').synthesis, undefined);
});

test('D07 undo restores the previous state and sprout, keeps the newly written sentence as a draft, and refuses if something changed since', async () => {
  const { writer, seed, stored } = await setup();
  const previous = { growthState: seed('A').growthState, synthesis: seed('A').synthesis };
  await writer.run(promote());
  const saved = seed('A').synthesis!;
  const draft = { id: 'syn-draft', kind: 'synthesis' as const, targetSeedId: 'A', plannedId: 'syn-1', body: saved.statement, updatedAt: T1 };

  const undone = await writer.run(
    undoPromotion({ commandId: 'undo', seedId: 'A', savedSynthesisId: saved.id, savedSynthesisUpdatedAt: saved.updatedAt, previous, keepDraft: draft }),
  );
  assert.equal(undone.ok, true);
  assert.equal(seed('A').growthState, 'seed');
  assert.equal(seed('A').synthesis, undefined);
  assert.equal(seed('A').body, '散歩写真が溜まる');
  assert.equal(stored().drafts.find((d) => d.id === 'syn-draft')?.body, saved.statement);

  // 保存→別の見直し→古い Undo は巻き戻さない
  await writer.run(promote({ commandId: 'again' }));
  const saved2 = seed('A').synthesis!;
  await writer.run(promote({ commandId: 'tweak', synthesisId: saved2.id, review: true, keepExistingSources: true, statement: '直した文', now: T2 }));
  const stale = await writer.run(
    undoPromotion({ commandId: 'undo-2', seedId: 'A', savedSynthesisId: saved2.id, savedSynthesisUpdatedAt: saved2.updatedAt, previous }),
  );
  assert.deepEqual(stale, { ok: false, reason: 'rejected', detail: 'changed_since_save' });
  assert.equal(seed('A').synthesis?.statement, '直した文');
});

test('an existing tree is never downgraded by a review, and a seed or archived memo becomes a sprout when adopted', async () => {
  const { writer, seed } = await setup();
  await writer.run(updateSeedFields({ commandId: 'tree', seedId: 'A', patch: { growthState: 'tree' }, now: T1 }));
  await writer.run(promote({ commandId: 'p-tree' }));
  assert.equal(seed('A').growthState, 'tree');
  await writer.run(updateSeedFields({ commandId: 'arch', seedId: 'B', patch: { growthState: 'archived' }, now: T1 }));
  await writer.run(promoteToSprout({ commandId: 'p-arch', centerId: 'B', synthesisId: 'syn-B', statement: '保管していたが、こうできそう', centerBodyText: '写真に短文を添えるのが好き', materials: [], now: T2 }));
  assert.equal(seed('B').growthState, 'sprout');
});
