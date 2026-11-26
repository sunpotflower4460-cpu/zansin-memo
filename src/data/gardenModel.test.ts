import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionId, deriveRelatedIds, emptyStore, migrateV1, parseStoreV2, serializeStore } from './gardenModel';
import { makeSeed, makeV1Seed } from './testSupport';

// D01: v1配列、片方向・双方向・重複・自己関連、旧sprout/tree、削除済みを移行

test('D01 migrateV1 keeps text/state/outputs/deleted flags and folds every relation shape into one undirected pair', () => {
  const v1 = [
    makeV1Seed('A', { body: '原文A', relatedSeedIds: ['B', 'B', 'A', 'missing'], growthState: 'sprout' }),
    makeV1Seed('B', { body: '原文B', relatedSeedIds: ['A'], growthState: 'tree' }), // 双方向
    makeV1Seed('C', { relatedSeedIds: ['A'] }), // 片方向
    makeV1Seed('D', { deletedAt: '2026-02-01T00:00:00.000Z', relatedSeedIds: ['C'], continuedFromId: 'B' }),
    makeV1Seed('E', {
      growthState: 'archived',
      transformOutputs: [{ id: 't1', type: 'question', content: '問い', createdAt: '2026-01-05T00:00:00.000Z' }],
    }),
  ];
  const raw = JSON.stringify(v1);
  const result = migrateV1(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const { store, report } = result;
  assert.deepEqual(store.seeds.map((s) => s.id), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(store.seeds[0].body, '原文A');
  assert.equal(store.seeds[0].growthState, 'sprout');
  assert.equal(store.seeds[1].growthState, 'tree');
  assert.equal(store.seeds[3].deletedAt, '2026-02-01T00:00:00.000Z');
  assert.equal(store.seeds[4].transformOutputs?.[0].content, '問い');
  assert.ok(store.seeds.every((seed) => seed.schemaVersion === 2 && !('relatedSeedIds' in seed) && seed.synthesis === undefined));

  // A-B（両側に記録されても1件）、A-C、C-D（削除済みへの接続も保持）、B-D（旧continuedFromId）
  const pairs = store.connections.map((c) => `${c.aSeedId}-${c.bSeedId}`).sort();
  assert.deepEqual(pairs, ['A-B', 'A-C', 'B-D', 'C-D']);
  assert.ok(store.connections.every((c) => c.origin === 'legacy' && c.createdAt === undefined && c.note === undefined));
  // 自己参照(A→A)と存在しない相手(A→missing)は可視接続にしない。診断に数える。
  assert.equal(report.skippedReferences, 2);
  assert.equal(report.legacyConnectionCount, 4);
});

test('D01 migrateV1 is deterministic so an interrupted migration can simply be rerun', () => {
  const raw = JSON.stringify([makeV1Seed('B', { relatedSeedIds: ['A'] }), makeV1Seed('A', { relatedSeedIds: ['B'] })]);
  const first = migrateV1(raw);
  const second = migrateV1(raw);
  assert.equal(first.ok && second.ok && serializeStore(first.store) === serializeStore(second.store), true);
});

test('D01 migrateV1 refuses ambiguous or unknown input instead of guessing', () => {
  assert.deepEqual(migrateV1('not json'), { ok: false, reason: 'invalid_json' });
  assert.deepEqual(migrateV1('{"a":1}'), { ok: false, reason: 'not_array' });
  assert.deepEqual(migrateV1(JSON.stringify([makeV1Seed('A'), makeV1Seed('A')])), { ok: false, reason: 'duplicate_ids' });
  assert.deepEqual(migrateV1(JSON.stringify([makeV1Seed('A', { schemaVersion: 9 })])), { ok: false, reason: 'unknown_schema' });
});

test('connectionId cannot collide even when ids contain separators', () => {
  assert.notEqual(connectionId('a|b', 'c'), connectionId('a', 'b|c'));
  assert.notEqual(connectionId('a:b', 'c'), connectionId('a', 'b:c'));
  assert.equal(connectionId('x', 'y'), connectionId('y', 'x'));
});

test('parseStoreV2 refuses unknown versions and corrupt data, and drops only dangling/duplicate connections', () => {
  assert.deepEqual(parseStoreV2('nope'), { ok: false, reason: 'invalid_json' });
  assert.deepEqual(parseStoreV2(JSON.stringify({ storeVersion: 3, seeds: [], connections: [] })), { ok: false, reason: 'unsupported_version' });
  assert.deepEqual(parseStoreV2(JSON.stringify({ storeVersion: 2, seeds: {}, connections: [] })), { ok: false, reason: 'invalid_shape' });
  assert.deepEqual(
    parseStoreV2(JSON.stringify({ storeVersion: 2, seeds: [makeSeed('A'), makeSeed('A')], connections: [] })),
    { ok: false, reason: 'duplicate_ids' },
  );

  const store = {
    ...emptyStore(),
    seeds: [makeSeed('A'), makeSeed('B')],
    connections: [
      { id: 'x', aSeedId: 'B', bSeedId: 'A', origin: 'manual', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'y', aSeedId: 'A', bSeedId: 'B', origin: 'manual' }, // 同じペア
      { id: 'z', aSeedId: 'A', bSeedId: 'A', origin: 'manual' }, // 自己
      { id: 'w', aSeedId: 'A', bSeedId: 'ghost', origin: 'manual' }, // 不存在
    ],
  };
  const parsed = parseStoreV2(JSON.stringify(store));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.store.connections.length, 1);
  assert.equal(parsed.store.connections[0].id, connectionId('A', 'B'));
  assert.equal(parsed.droppedConnections, 2);
});

test('parseStoreV2 keeps a synthesis and its sources keyed by (seedId, sourcePart)', () => {
  const synthesis = {
    id: 's1',
    statement: '近況便りを作れそう',
    sources: [
      { seedId: 'A', sourcePart: 'body', textSnapshot: '写真が溜まる', sourceUpdatedAt: '2026-01-01T00:00:00.000Z' },
      { seedId: 'A', sourcePart: 'body', textSnapshot: '重複', sourceUpdatedAt: '2026-01-01T00:00:00.000Z' },
      { seedId: 'B', sourcePart: 'synthesis', textSnapshot: '芽の文', sourceUpdatedAt: '2026-01-01T00:00:00.000Z' }, // sourceSynthesisId 無し→不正
      { seedId: 'B', sourcePart: 'synthesis', textSnapshot: '芽の文', sourceUpdatedAt: '2026-01-01T00:00:00.000Z', sourceSynthesisId: 'sb' },
    ],
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    promotedAt: '2026-01-03T00:00:00.000Z',
  };
  const parsed = parseStoreV2(JSON.stringify({ ...emptyStore(), seeds: [makeSeed('A', { synthesis } as never), makeSeed('B')] }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const sources = parsed.store.seeds[0].synthesis?.sources ?? [];
  assert.deepEqual(sources.map((s) => `${s.seedId}:${s.sourcePart}`), ['A:body', 'B:synthesis']);
  assert.equal(sources[0].textSnapshot, '写真が溜まる');
});

test('deriveRelatedIds gives read-only both-direction arrays from connections', () => {
  const related = deriveRelatedIds([
    { id: connectionId('A', 'B'), aSeedId: 'A', bSeedId: 'B', origin: 'manual' },
    { id: connectionId('B', 'C'), aSeedId: 'B', bSeedId: 'C', origin: 'manual' },
  ]);
  assert.deepEqual(related.get('B')?.sort(), ['A', 'C']);
  assert.deepEqual(related.get('A'), ['B']);
  assert.equal(related.get('A')?.includes('C'), false); // A-B-C から A-C を作らない
});
