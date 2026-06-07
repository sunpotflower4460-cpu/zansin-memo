import assert from 'node:assert/strict';
import test from 'node:test';
import type { Seed } from '../domain/types';
import { isSoftDeletedSeed, restoreSeed, softDeleteSeed } from './seedUtils';

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
});
