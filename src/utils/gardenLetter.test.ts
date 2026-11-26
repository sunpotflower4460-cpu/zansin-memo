import assert from 'node:assert/strict';
import test from 'node:test';
import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import { buildGardenLetter } from './gardenLetter';

const createSeed = (overrides: Partial<Seed> = {}): Seed => ({
  id: 'seed-1',
  body: 'ひとつの種',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  importance: 3,
  growthState: 'seed',
  tags: [],
  relatedSeedIds: [],
  schemaVersion: SEED_SCHEMA_VERSION,
  ...overrides,
});

test('buildGardenLetter summarizes new, tended, transformed, and recurring themes', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const letter = buildGardenLetter(
    [
      createSeed({ id: 'new-1', tags: ['音楽'] }),
      createSeed({ id: 'new-2', createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', tags: ['音楽'] }),
      createSeed({
        id: 'tended',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
        tags: ['自然'],
        transformOutputs: [
          {
            id: 'transform-1',
            type: 'question',
            content: '問い',
            createdAt: '2026-07-11T00:00:00.000Z',
          },
        ],
      }),
    ],
    now,
  );

  assert.equal(letter.newSeedCount, 2);
  assert.equal(letter.tendedSeedCount, 1);
  assert.equal(letter.transformCount, 1);
  assert.deepEqual(letter.leadingTheme, { label: '音楽', seedCount: 2 });
  assert.equal(letter.hasActivity, true);
  assert.match(letter.reflection, /音楽/);
});

test('buildGardenLetter ignores deleted, future, invalid, and old activity', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const letter = buildGardenLetter(
    [
      createSeed({ id: 'deleted', deletedAt: '2026-07-14T00:00:00.000Z' }),
      createSeed({ id: 'future', createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z' }),
      createSeed({ id: 'invalid', createdAt: 'invalid', updatedAt: 'invalid' }),
      createSeed({ id: 'old', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }),
    ],
    now,
  );

  assert.equal(letter.newSeedCount, 0);
  assert.equal(letter.tendedSeedCount, 0);
  assert.equal(letter.transformCount, 0);
  assert.equal(letter.leadingTheme, undefined);
  assert.equal(letter.hasActivity, false);
});

test('a theme appears only when it repeats across at least two active seeds', () => {
  const letter = buildGardenLetter(
    [createSeed({ tags: ['宇宙'] })],
    new Date('2026-07-14T12:00:00.000Z'),
  );

  assert.equal(letter.leadingTheme, undefined);
  assert.match(letter.reflection, /新しい気配/);
});
