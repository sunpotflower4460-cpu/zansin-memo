import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResurfacedSeed, Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import { makeConnection } from '../data/gardenModel';
import {
  buildTransformOutput,
  createSeed,
  formatRelativeDay,
  getTagGroupKey,
  getTagGroupLabel,
  groupSeedsByTag,
  isSoftDeletedSeed,
  matchesTagFilter,
  parseTags,
  pickTodaySeed,
  resolveTagFilter,
  restoreSeed,
  softDeleteSeed,
  syncResurfacedSeed,
  updateSeed,
} from './seedUtils';

const createBaseSeed = (): Seed => ({
  id: 'seed-1',
  body: 'テスト',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  importance: 3,
  growthState: 'seed',
  tags: [],
  schemaVersion: SEED_SCHEMA_VERSION,
});

test('parseTags trims blanks and removes duplicates', () => {
  assert.deepEqual(parseTags(' alpha, beta ,alpha,,  gamma  '), ['alpha', 'beta', 'gamma']);
});

test('createSeed normalizes input fields', () => {
  const created = createSeed({
    title: '  タイトル  ',
    body: '  本文  ',
    tags: [' idea ', 'idea', ''],
  });

  assert.equal(created.title, 'タイトル');
  assert.equal(created.body, '本文');
  assert.deepEqual(created.tags, ['idea']);
  assert.equal(created.importance, 3);
  assert.equal(created.growthState, 'seed');
  assert.deepEqual(created.transformOutputs, []);
  assert.equal(created.schemaVersion, SEED_SCHEMA_VERSION);
  assert.equal(created.createdAt, created.updatedAt);
  assert.ok(!Number.isNaN(new Date(created.createdAt).getTime()));
});

test('updateSeed keeps recoverable body and normalizes patch arrays', () => {
  const updated = updateSeed(
    {
      ...createBaseSeed(),
      title: '元タイトル',
      body: '  元の本文  ',
    },
    {
      title: '   ',
      body: '   ',
      tags: [' next ', 'next', ''],
    },
  );

  assert.equal(updated.title, undefined);
  assert.equal(updated.body, '元の本文');
  assert.deepEqual(updated.tags, ['next']);
  assert.ok(!Number.isNaN(new Date(updated.updatedAt).getTime()));
});

test('softDeleteSeed marks seed as deleted', () => {
  const seed = createBaseSeed();
  const deletedAt = '2026-06-07T00:00:00.000Z';
  const deleted = softDeleteSeed(seed, deletedAt);

  assert.equal(isSoftDeletedSeed(seed), false);
  assert.equal(isSoftDeletedSeed(deleted), true);
  assert.equal(deleted.deletedAt, deletedAt);
});

test('restoreSeed clears deletedAt', () => {
  const deleted = softDeleteSeed(createBaseSeed(), '2026-06-07T00:00:00.000Z');
  const restored = restoreSeed(deleted);

  assert.equal(isSoftDeletedSeed(restored), false);
  assert.equal(restored.deletedAt, undefined);
  assert.equal('deletedAt' in restored, false);
});

test('pickTodaySeed returns a non-archived seed with resurfacing reason', () => {
  const picked = pickTodaySeed([
    {
      ...createBaseSeed(),
      id: 'active-seed',
      updatedAt: '2026-01-01T00:00:00.000Z',
      importance: 5,
    },
    {
      ...createBaseSeed(),
      id: 'archived-seed',
      growthState: 'archived',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
  ]);

  assert.equal(picked?.seed.id, 'active-seed');
  assert.equal(picked?.reason, 'しばらく見返していない種です');
  assert.ok(typeof picked?.seed.resurfacingScore === 'number');
});

test('buildTransformOutput creates a typed template output', () => {
  const output = buildTransformOutput(createBaseSeed(), 'question');

  assert.equal(output.type, 'question');
  assert.ok(output.id.length > 0);
  assert.ok(output.content.includes('テスト'));
  assert.ok(!Number.isNaN(new Date(output.createdAt).getTime()));
});

test('groupSeedsByTag groups seeds by tag and keeps untagged seeds apart', () => {
  const groups = groupSeedsByTag([
    { ...createBaseSeed(), id: 'a', tags: ['企画'] },
    { ...createBaseSeed(), id: 'b', tags: [] },
    { ...createBaseSeed(), id: 'c', tags: ['未分類', '企画'] },
  ]);

  assert.deepEqual(groups.get('企画')?.map((seed) => seed.id), ['a', 'c']);
  assert.deepEqual(groups.get('未分類')?.map((seed) => seed.id), ['c']);
  assert.deepEqual(groups.get(undefined)?.map((seed) => seed.id), ['b']);
});

test('groupSeedsByTag handles tag names that exist on Object.prototype', () => {
  const groups = groupSeedsByTag([{ ...createBaseSeed(), id: 'a', tags: ['constructor', 'toString', '__proto__'] }]);

  assert.deepEqual([...groups.keys()], ['constructor', 'toString', '__proto__']);
  assert.deepEqual(groups.get('constructor')?.map((seed) => seed.id), ['a']);
});

const createResurfaced = (seed: Seed): ResurfacedSeed => ({
  seed,
  reason: 'いまのあなたに合いそうな種です',
});

test('syncResurfacedSeed shows the latest content of today seed', () => {
  const picked = createResurfaced({ ...createBaseSeed(), id: 'today', body: '古い本文' });
  const edited = { ...createBaseSeed(), id: 'today', body: '編集後の本文' };

  const synced = syncResurfacedSeed(picked, [edited]);

  assert.equal(synced?.seed.body, '編集後の本文');
  assert.equal(synced?.reason, picked.reason);
});

test('syncResurfacedSeed drops today seed that is no longer active', () => {
  const picked = createResurfaced({ ...createBaseSeed(), id: 'today' });

  assert.equal(syncResurfacedSeed(picked, [createBaseSeed()]), undefined);
  assert.equal(syncResurfacedSeed(undefined, [createBaseSeed()]), undefined);
});

test('syncResurfacedSeed drops today seed once it is archived', () => {
  const picked = createResurfaced({ ...createBaseSeed(), id: 'today' });
  const archived: Seed = { ...createBaseSeed(), id: 'today', growthState: 'archived' };

  assert.equal(syncResurfacedSeed(picked, [archived]), undefined);
});

test('getTagGroupKey keeps the untagged group apart from a tag with the same name', () => {
  const groups = groupSeedsByTag([
    { ...createBaseSeed(), id: 'a', tags: ['未分類'] },
    { ...createBaseSeed(), id: 'b', tags: [] },
    { ...createBaseSeed(), id: 'c', tags: ['untagged'] },
  ]);

  const keys = Array.from(groups.keys(), (tag) => getTagGroupKey(tag));

  assert.equal(new Set(keys).size, groups.size);
  assert.notEqual(getTagGroupKey(undefined), getTagGroupKey('未分類'));
});

test('getTagGroupLabel names the untagged group differently from a tag named 未分類', () => {
  assert.equal(getTagGroupLabel('企画'), '企画');
  assert.notEqual(getTagGroupLabel(undefined), getTagGroupLabel('未分類'));
});

test('matchesTagFilter treats null as no filter and a tag named all as a real tag', () => {
  assert.equal(matchesTagFilter(createBaseSeed(), null), true);
  assert.equal(matchesTagFilter({ ...createBaseSeed(), tags: ['all'] }, 'all'), true);
  assert.equal(matchesTagFilter({ ...createBaseSeed(), tags: ['企画'] }, 'all'), false);
});

test('resolveTagFilter clears a tag filter whose tag no longer exists', () => {
  assert.equal(resolveTagFilter(null, ['企画']), null);
  assert.equal(resolveTagFilter('企画', ['企画', 'all']), '企画');
  assert.equal(resolveTagFilter('企画', ['all']), null);
});

test('formatRelativeDay reads naturally by calendar day', () => {
  const now = new Date(2026, 10, 26, 9, 0, 0);
  const at = (y: number, m: number, d: number, h = 23) => new Date(y, m, d, h, 30).toISOString();

  assert.equal(formatRelativeDay(at(2026, 10, 26, 0), now), '今日');
  assert.equal(formatRelativeDay(at(2026, 10, 25), now), '昨日');
  assert.equal(formatRelativeDay(at(2026, 10, 23), now), '3日前');
  assert.equal(formatRelativeDay(at(2026, 10, 19), now), '1週間前');
  assert.equal(formatRelativeDay(at(2026, 10, 5), now), '3週間前');
  assert.equal(formatRelativeDay(at(2026, 9, 1), now), '2026/10/1');
  assert.equal(formatRelativeDay('broken', now), '日付不明');
  // 未来の日付（端末の時計変更など）は今日として扱う
  assert.equal(formatRelativeDay(at(2026, 10, 30), now), '今日');
});

test('pickTodaySeed explains a resurfacing caused by a recently active linked seed', () => {
  const now = Date.now();
  const old = new Date(now - 20 * 86400000).toISOString();
  const recent = new Date(now - 3600000).toISOString();
  const quiet = { ...createBaseSeed(), id: 'quiet', createdAt: old, updatedAt: old };
  const busy = { ...createBaseSeed(), id: 'busy', createdAt: old, updatedAt: recent, growthState: 'archived' as const };

  const picked = pickTodaySeed([quiet, busy], [makeConnection('quiet', 'busy', 'manual', recent)]);
  assert.equal(picked?.seed.id, 'quiet');
  assert.equal(picked?.reason, 'つながる種が、最近育っています');
});
