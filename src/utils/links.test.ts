import assert from 'node:assert/strict';
import test from 'node:test';
import { makeConnection } from '../data/gardenModel';
import { makeSeed } from '../data/testSupport';
import {
  dismissKey,
  extractKeywords,
  findRecurringWords,
  getIdsWithRecentlyActiveLinks,
  getLinkCounts,
  getLinkedSeeds,
  suggestLinks,
} from './links';

const link = (a: string, b: string) => makeConnection(a, b, 'manual', '2026-01-02T00:00:00.000Z');

test('links are read from both ends, counted per pair, and never inferred transitively', () => {
  const seeds = [makeSeed('A'), makeSeed('B'), makeSeed('C')];
  const connections = [link('A', 'B'), link('C', 'B')];
  assert.deepEqual(getLinkedSeeds(seeds[0], seeds, connections).map((s) => s.id), ['B']);
  assert.deepEqual(getLinkedSeeds(seeds[1], seeds, connections).map((s) => s.id).sort(), ['A', 'C']);
  assert.equal(getLinkCounts(seeds, connections).get('A'), 1);
  assert.equal(getLinkCounts(seeds, connections).get('B'), 2);
});

test('connections to seeds that are not in the visible list (deleted or missing) are ignored', () => {
  const visible = [makeSeed('A')];
  assert.deepEqual(getLinkedSeeds(visible[0], visible, [link('A', 'gone')]), []);
  assert.equal(getLinkCounts(visible, [link('A', 'gone')]).get('A'), 0);
});

test('extractKeywords keeps content words, drops hiragana-only words and stop words, and folds width/case', () => {
  assert.deepEqual(extractKeywords('今日は読書会で、カフェに行って Coffee を飲む。自分の時間。'), ['読書会', 'カフェ', 'coffee']);
  assert.deepEqual(extractKeywords('ＣＯＦＦＥＥ ｃｏｆｆｅｅ'), ['coffee']); // 全角・大文字を吸収
  assert.deepEqual(extractKeywords('Ａ １'), []); // 単一文字は根拠にしない
});

test('suggestLinks explains why, prefers stronger matches, and skips linked, deleted and archived seeds', () => {
  const base = makeSeed('1', { body: '小さな読書会を開きたい', tags: ['企画'] });
  const sameWord = makeSeed('2', { body: '読書会のゲストを考える', updatedAt: '2026-01-05T00:00:00.000Z' });
  const sameTag = makeSeed('3', { body: 'ほかの話', tags: ['企画'] });
  const both = makeSeed('4', { body: '読書会の場所探し', tags: ['企画'] });
  const unrelated = makeSeed('5', { body: '朝の散歩' });
  const linked = makeSeed('6', { body: '読書会の記録' });
  const deleted = makeSeed('7', { body: '読書会のメモ', deletedAt: '2026-01-09T00:00:00.000Z' });
  const archived = makeSeed('8', { body: '読書会の保管', growthState: 'archived' });
  const seeds = [base, sameWord, sameTag, both, unrelated, linked, deleted, archived];

  const result = suggestLinks(base, seeds, [link('1', '6')], { limit: 5 });
  assert.deepEqual(result.map((r) => r.seed.id), ['4', '3', '2']);
  assert.match(result[0].reason, /「読書会」という言葉が共通/);
  assert.match(result[0].reason, /カテゴリ「企画」が同じ/);
});

test('suggestLinks treats a word contained in another as shared, and a category with different width/case as the same', () => {
  const base = makeSeed('1', { body: '読書会を開きたい', tags: ['Idea'] });
  assert.match(suggestLinks(base, [base, makeSeed('2', { body: '最近の読書の記録' })], [])[0].reason, /「読書」という言葉が共通/);
  assert.match(suggestLinks(base, [base, makeSeed('3', { body: 'ひとこと', tags: ['ＩＤＥＡ'] })], [])[0].reason, /カテゴリ「ＩＤＥＡ」が同じ/);
});

test('suggestLinks never suggests a pair the user chose to skip, in either direction', () => {
  const a = makeSeed('a', { body: '読書会を開く' });
  const b = makeSeed('b', { body: '読書会の準備' });
  const dismissed = new Set([dismissKey('b', 'a')]);
  assert.equal(suggestLinks(a, [a, b], [], { dismissed }).length, 0);
  assert.equal(suggestLinks(b, [a, b], [], { dismissed }).length, 0);
  assert.equal(suggestLinks(a, [a, b], []).length, 1);
});

test('suggestLinks does not use mood or time alone as a reason', () => {
  const a = makeSeed('a', { body: 'ひとこと', mood: 'calm' });
  const b = makeSeed('b', { body: 'べつの', mood: 'calm', updatedAt: a.updatedAt });
  assert.deepEqual(suggestLinks(a, [a, b], []), []);
});

test('findRecurringWords counts each word once per seed and respects the minimum', () => {
  const seeds = [makeSeed('1', { body: '読書と散歩 読書' }), makeSeed('2', { body: '読書の散歩' }), makeSeed('3', { body: '散歩の記録' })];
  assert.deepEqual(findRecurringWords(seeds, 2, 5), [
    { word: '散歩', count: 3 },
    { word: '読書', count: 2 },
  ]);
});

test('getIdsWithRecentlyActiveLinks marks quiet seeds whose connected seed was just updated', () => {
  const now = new Date('2026-03-10T00:00:00.000Z');
  const quiet = makeSeed('quiet', { updatedAt: '2026-02-01T00:00:00.000Z' });
  const busy = makeSeed('busy', { updatedAt: '2026-03-09T12:00:00.000Z' });
  const alsoBusy = makeSeed('also', { updatedAt: '2026-03-09T13:00:00.000Z' });
  const ids = getIdsWithRecentlyActiveLinks([quiet, busy, alsoBusy], [link('quiet', 'busy'), link('busy', 'also')], now);
  assert.deepEqual(Array.from(ids), ['quiet']); // 自分も最近動いている種は対象にしない
});
