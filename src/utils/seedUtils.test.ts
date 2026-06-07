import assert from 'node:assert/strict';
import test from 'node:test';
import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import {
  buildTransformOutput,
  createSeed,
  isSoftDeletedSeed,
  parseTags,
  pickTodaySeed,
  restoreSeed,
  softDeleteSeed,
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
