import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResurfacedSeed, Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import {
  buildTransformOutput,
  createSeed,
  getTagGroupKey,
  getTagGroupLabel,
  groupSeedsByTag,
  isSoftDeletedSeed,
  matchesTagFilter,
  parseTags,
  pickRelatedCandidates,
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
  relatedSeedIds: [],
  schemaVersion: 1,
});

test('parseTags trims blanks and removes duplicates', () => {
  assert.deepEqual(parseTags(' alpha, beta ,alpha,,  gamma  '), ['alpha', 'beta', 'gamma']);
});

test('createSeed normalizes input fields', () => {
  const created = createSeed({
    title: '  タイトル  ',
    body: '  本文  ',
    tags: [' idea ', 'idea', ''],
    relatedSeedIds: [' seed-2 ', 'seed-2', ''],
  });

  assert.equal(created.title, 'タイトル');
  assert.equal(created.body, '本文');
  assert.deepEqual(created.tags, ['idea']);
  assert.deepEqual(created.relatedSeedIds, ['seed-2']);
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
      relatedSeedIds: [' seed-2 ', 'seed-2', ''],
    },
  );

  assert.equal(updated.title, undefined);
  assert.equal(updated.body, '元の本文');
  assert.deepEqual(updated.tags, ['next']);
  assert.deepEqual(updated.relatedSeedIds, ['seed-2']);
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

const createManySeeds = (count: number): Seed[] =>
  Array.from({ length: count }, (_, index) => ({ ...createBaseSeed(), id: `seed-${index}` }));

test('pickRelatedCandidates lists other seeds up to the limit', () => {
  const candidates = pickRelatedCandidates(createManySeeds(25), 'seed-0', [], 20);

  assert.deepEqual(
    candidates.map((seed) => seed.id),
    Array.from({ length: 20 }, (_, index) => `seed-${index + 1}`),
  );
});

test('pickRelatedCandidates keeps selected seeds beyond the limit so saving does not drop them', () => {
  const candidates = pickRelatedCandidates(createManySeeds(25), 'seed-0', ['seed-24'], 20);
  const ids = candidates.map((seed) => seed.id);

  assert.equal(ids.length, 21);
  assert.ok(ids.includes('seed-24'));
  assert.ok(!ids.includes('seed-0'));
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
