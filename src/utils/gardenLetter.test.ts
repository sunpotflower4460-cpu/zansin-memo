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

test('the letter counts only connections the user made (not legacy), only sprouts the user adopted, and only while they still stand', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const seeds = [
    createSeed({ id: 'a', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' }),
    createSeed({ id: 'b', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' }),
    createSeed({ id: 'c', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' }),
    createSeed({ id: 'gone', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', deletedAt: '2026-07-13T00:00:00.000Z' }),
  ];
  const connection = (a: string, b: string, origin: 'manual' | 'legacy', createdAt?: string) => ({ id: JSON.stringify([a, b].sort()), aSeedId: [a, b].sort()[0], bSeedId: [a, b].sort()[1], origin, createdAt });
  const letter = buildGardenLetter(
    seeds,
    now,
    [
      connection('a', 'b', 'manual', '2026-07-12T00:00:00.000Z'), // 今週・本人 → 数える
      connection('a', 'c', 'legacy'), // 日時不明の旧データ → 数えない
      connection('b', 'c', 'manual', '2026-06-01T00:00:00.000Z'), // 今週より前 → 数えない
      connection('a', 'gone', 'manual', '2026-07-13T00:00:00.000Z'), // 削除済みへ → 数えない
    ],
  );
  assert.equal(letter.newConnectionCount, 1);
  assert.equal(letter.newSproutCount, 0);
  assert.equal(letter.hasActivity, true);
  assert.match(letter.reflection, /つなぎました/);

  const withSprout = buildGardenLetter(
    [
      createSeed({
        id: 's',
        growthState: 'sprout',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        synthesis: { id: 'x', statement: '案', sources: [], createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z', promotedAt: '2026-07-12T00:00:00.000Z' },
      }),
      // 種へ戻した考えは、現在の芽として数えない
      createSeed({
        id: 'r',
        growthState: 'seed',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        synthesis: { id: 'y', statement: '案', sources: [], createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z', promotedAt: '2026-07-12T00:00:00.000Z' },
      }),
    ],
    now,
  );
  assert.equal(withSprout.newSproutCount, 1);
  assert.match(withSprout.reflection, /芽/);
});

test('browsing and a quiet week add nothing to the new counts', () => {
  const letter = buildGardenLetter([createSeed({ createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', lastResurfacedAt: '2026-07-14T00:00:00.000Z' })], new Date('2026-07-14T12:00:00.000Z'), []);
  assert.equal(letter.newConnectionCount + letter.newSproutCount, 0);
  assert.equal(letter.hasActivity, false);
});
