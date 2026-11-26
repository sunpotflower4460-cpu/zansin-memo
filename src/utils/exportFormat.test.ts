import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionId, emptyStore, makeConnection, parseStoreV2 } from '../data/gardenModel';
import { makeSeed } from '../data/testSupport';
import type { GardenStoreV2, Seed } from '../domain/types';
import { buildJsonExport, buildTextExport } from './exportFormat';

const NOW = '2026-02-01T00:00:00.000Z';

const synthesisSeed = (): Seed =>
  makeSeed('A', {
    body: '散歩写真が溜まる',
    growthState: 'sprout',
    synthesis: {
      id: 's1',
      statement: '写真3枚にひと言を添えた近況便りが作れそう',
      sources: [
        { seedId: 'A', sourcePart: 'body', textSnapshot: '散歩写真が溜まる', sourceUpdatedAt: NOW },
        { seedId: 'B', sourcePart: 'body', textSnapshot: '写真に短文を添えるのが好き', sourceUpdatedAt: NOW },
        { seedId: 'GONE', sourcePart: 'body', textSnapshot: '消したメモの本文', sourceUpdatedAt: NOW },
      ],
      createdAt: NOW,
      updatedAt: NOW,
      promotedAt: NOW,
    },
  });

const store = (): GardenStoreV2 => ({
  ...emptyStore(),
  revision: 7,
  seeds: [
    synthesisSeed(),
    makeSeed('B', { body: '写真に短文を添えるのが好き', tags: ['日々'] }),
    makeSeed('GONE', { body: '消したメモの本文', deletedAt: NOW }),
    makeSeed('LEG', { body: '以前からの育ち', growthState: 'tree' }),
  ],
  connections: [
    makeConnection('A', 'B', 'manual', NOW, '短文がきっかけ'),
    makeConnection('A', 'GONE', 'manual', NOW),
    makeConnection('B', 'LEG', 'legacy'),
  ],
  drafts: [{ id: 'd', kind: 'new', body: '書きかけの下書き', updatedAt: NOW }],
});

test('D12 the JSON export is a full export: deleted memos, both ends of every connection, syntheses with their sources, and drafts', () => {
  const data = JSON.parse(buildJsonExport(store()));
  assert.equal(data.exportVersion, 2);
  assert.equal(data.storeVersion, 2);
  assert.deepEqual(data.counts, { seeds: 4, deletedSeeds: 1, connections: 3, syntheses: 1, drafts: 1 });
  assert.equal(data.connections.length, 3);
  assert.equal(data.connections[0].aSeedId, 'A');
  assert.equal(data.connections[0].bSeedId, 'B');
  assert.equal(data.connections[0].note, '短文がきっかけ');
  assert.equal(data.seeds[0].synthesis.sources[1].textSnapshot, '写真に短文を添えるのが好き');
  assert.equal(data.drafts[0].body, '書きかけの下書き');
  assert.ok(data.seeds.some((seed: Seed) => seed.deletedAt));
});

test('D12 the JSON export round-trips through the v2 normalizer without losing meaning', () => {
  const original = store();
  const data = JSON.parse(buildJsonExport(original));
  const parsed = parseStoreV2(JSON.stringify({ storeVersion: data.storeVersion, seeds: data.seeds, connections: data.connections, drafts: data.drafts }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.store.seeds.map((s) => s.body), original.seeds.map((s) => s.body));
  assert.deepEqual(parsed.store.connections.map((c) => c.id).sort(), original.connections.map((c) => c.id).sort());
  assert.equal(parsed.store.seeds[0].synthesis?.statement, original.seeds[0].synthesis?.statement);
  assert.equal(parsed.store.connections.find((c) => c.id === connectionId('B', 'LEG'))?.origin, 'legacy');
});

test('D12 the text export shows connections, the sprout with its materials, and hides deleted memo text and drafts', () => {
  const text = buildTextExport(store());
  assert.match(text, /できそうなこと（芽）: 写真3枚にひと言を添えた近況便りが作れそう/);
  assert.match(text, /\[元のメモ\] 写真に短文を添えるのが好き/);
  assert.match(text, /つながり:\n\s+- 写真に短文を添えるのが好き — 短文がきっかけ/);
  assert.match(text, /（以前からのつながり）/);
  assert.match(text, /以前からの育ち状態。芽の文章は書かれていません/);
  assert.doesNotMatch(text, /消したメモの本文/); // 削除済みの本文は出さない（材料側も含む）
  assert.match(text, /（削除済みのメモ）/);
  assert.doesNotMatch(text, /書きかけの下書き/);
  assert.match(text, /復元する機能は、現時点ではありません/);
  assert.match(text, /メモの数: 3/);
});

test('the text export says so when there are no memos', () => {
  assert.match(buildTextExport(emptyStore()), /（メモはまだありません）/);
});

test('text export labels are in the same words as the app (カテゴリ)', () => {
  const text = buildTextExport(store());
  assert.match(text, /カテゴリ: 日々/);
  assert.doesNotMatch(text, /タグ:/);
});
