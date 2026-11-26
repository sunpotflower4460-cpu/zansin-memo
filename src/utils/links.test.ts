import assert from 'node:assert/strict';
import test from 'node:test';
import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import {
  buildClusters,
  extractKeywords,
  findRecurringWords,
  getLinkCounts,
  getLinkedSeeds,
  getThread,
  linkSeeds,
  suggestLinks,
  unlinkSeeds,
} from './links';

const seed = (id: string, overrides: Partial<Seed> = {}): Seed => ({
  id,
  body: `種${id}`,
  createdAt: `2026-01-0${id.length === 1 && /\d/.test(id) ? id : '1'}T00:00:00.000Z`,
  updatedAt: `2026-01-0${id.length === 1 && /\d/.test(id) ? id : '1'}T00:00:00.000Z`,
  importance: 3,
  growthState: 'seed',
  tags: [],
  relatedSeedIds: [],
  schemaVersion: SEED_SCHEMA_VERSION,
  ...overrides,
});

test('linkSeeds makes a link visible from both seeds without touching updatedAt', () => {
  const seeds = [seed('1'), seed('2')];
  const linked = linkSeeds(seeds, '1', '2');

  assert.deepEqual(linked[0].relatedSeedIds, ['2']);
  assert.deepEqual(linked[1].relatedSeedIds, ['1']);
  assert.equal(linked[0].updatedAt, seeds[0].updatedAt);
  assert.deepEqual(getLinkedSeeds(linked[0], linked).map((s) => s.id), ['2']);
  assert.deepEqual(getLinkedSeeds(linked[1], linked).map((s) => s.id), ['1']);
});

test('linkSeeds ignores self links, unknown ids and duplicates', () => {
  const seeds = [seed('1'), seed('2')];
  assert.equal(linkSeeds(seeds, '1', '1'), seeds);
  assert.equal(linkSeeds(seeds, '1', 'missing'), seeds);
  const twice = linkSeeds(linkSeeds(seeds, '1', '2'), '2', '1');
  assert.deepEqual(twice[0].relatedSeedIds, ['2']);
  assert.deepEqual(twice[1].relatedSeedIds, ['1']);
});

test('old one-sided links are read as two-way', () => {
  const seeds = [seed('1', { relatedSeedIds: ['2'] }), seed('2')];
  assert.deepEqual(getLinkedSeeds(seeds[1], seeds).map((s) => s.id), ['1']);
  assert.equal(getLinkCounts(seeds).get('2'), 1);
});

test('links to missing or soft-deleted seeds are not shown', () => {
  const seeds = [seed('1', { relatedSeedIds: ['gone'], continuedFromId: 'gone' })];
  assert.deepEqual(getLinkedSeeds(seeds[0], seeds), []);
  assert.equal(getLinkCounts(seeds).get('1'), 0);
});

test('unlinkSeeds removes both directions and the continuation mark', () => {
  const seeds = [seed('1', { relatedSeedIds: ['2'] }), seed('2', { relatedSeedIds: ['1'], continuedFromId: '1' })];
  const result = unlinkSeeds(seeds, '1', '2');
  assert.deepEqual(result[0].relatedSeedIds, []);
  assert.deepEqual(result[1].relatedSeedIds, []);
  assert.equal(result[1].continuedFromId, undefined);
  assert.deepEqual(getLinkedSeeds(result[0], result), []);
});

test('getThread follows continuations through the whole story, oldest first', () => {
  const seeds = [
    seed('1'),
    seed('2', { continuedFromId: '1' }),
    seed('3', { continuedFromId: '2' }),
    seed('4', { continuedFromId: '1' }), // 枝分かれ
    seed('5'), // 別の話
    seed('6', { relatedSeedIds: ['5'] }), // 「つなぐ」だけの関係は話のながれには含めない
  ];
  assert.deepEqual(getThread(seeds[2], seeds).map((s) => s.id), ['1', '2', '3', '4']);
  assert.deepEqual(getThread(seeds[4], seeds).map((s) => s.id), ['5']);
});

test('buildClusters groups linked seeds, biggest first, and skips lonely seeds', () => {
  const seeds = [
    seed('1', { relatedSeedIds: ['2'] }),
    seed('2'),
    seed('3', { continuedFromId: '2' }),
    seed('4', { relatedSeedIds: ['5'] }),
    seed('5'),
    seed('6'),
  ];
  const clusters = buildClusters(seeds).map((cluster) => cluster.map((s) => s.id));
  assert.deepEqual(clusters, [['1', '2', '3'], ['4', '5']]);
});

test('extractKeywords keeps content words and drops hiragana-only words and stop words', () => {
  assert.deepEqual(extractKeywords('今日は読書会で、カフェに行って Coffee を飲む。自分の時間。'), ['読書会', 'カフェ', 'coffee']);
});

test('suggestLinks explains why, prefers stronger matches and skips linked seeds', () => {
  const base = seed('1', { body: '小さな読書会を開きたい', tags: ['企画'] });
  const sameWord = seed('2', { body: '読書会のゲストを考える' });
  const sameTag = seed('3', { body: 'ほかの話', tags: ['企画'] });
  const both = seed('4', { body: '読書会の場所探し', tags: ['企画'] });
  const unrelated = seed('5', { body: '朝の散歩' });
  const alreadyLinked = seed('6', { body: '読書会の記録', relatedSeedIds: ['1'] });

  const result = suggestLinks(base, [base, sameWord, sameTag, both, unrelated, alreadyLinked], 5);
  assert.deepEqual(result.map((r) => r.seed.id), ['4', '3', '2']);
  assert.match(result[0].reason, /「読書会」という言葉が共通/);
  assert.match(result[0].reason, /カテゴリ「企画」が同じ/);
  assert.match(result[2].reason, /「読書会」/);
});

test('suggestLinks does not suggest seeds that are already in the same thread', () => {
  const first = seed('1', { body: '読書会を開きたい', tags: ['企画'] });
  const second = seed('2', { body: '読書会の会場', tags: ['企画'], continuedFromId: '1' });
  const third = seed('3', { body: '読書会の本選び', tags: ['企画'], continuedFromId: '2' });
  const outsider = seed('4', { body: '読書会の予算', tags: ['企画'] });
  // third から見ると first は直接はつながっていないが、同じ話のながれなので提案しない
  assert.deepEqual(suggestLinks(third, [first, second, third, outsider]).map((r) => r.seed.id), ['4']);
});

test('suggestLinks treats a word contained in another as shared', () => {
  const base = seed('1', { body: '読書会を開きたい' });
  const other = seed('2', { body: '最近の読書の記録' });
  const result = suggestLinks(base, [base, other]);
  assert.equal(result.length, 1);
  assert.match(result[0].reason, /「読書」という言葉が共通/);
});

test('findRecurringWords counts each word once per seed and respects the minimum', () => {
  const seeds = [
    seed('1', { body: '読書と散歩 読書' }),
    seed('2', { body: '読書の散歩' }),
    seed('3', { body: '散歩の記録' }),
  ];
  assert.deepEqual(findRecurringWords(seeds, 2, 5), [
    { word: '散歩', count: 3 },
    { word: '読書', count: 2 },
  ]);
});
