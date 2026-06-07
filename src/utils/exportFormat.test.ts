import assert from 'node:assert/strict';
import test from 'node:test';
import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import { buildJsonExport, buildTextExport } from './exportFormat';

const createBaseSeed = (overrides: Partial<Seed> = {}): Seed => ({
  id: 'seed-1',
  body: 'テストのメモです',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  importance: 3,
  growthState: 'seed',
  tags: [],
  relatedSeedIds: [],
  schemaVersion: 1,
  ...overrides,
});

test('buildJsonExport includes schemaVersion', () => {
  const seeds = [createBaseSeed()];
  const json = buildJsonExport(seeds);
  const parsed = JSON.parse(json) as { schemaVersion: number };
  assert.equal(parsed.schemaVersion, SEED_SCHEMA_VERSION);
});

test('buildJsonExport empty seeds does not throw', () => {
  assert.doesNotThrow(() => buildJsonExport([]));
  const json = buildJsonExport([]);
  const parsed = JSON.parse(json) as { count: number; seeds: Seed[] };
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.seeds, []);
});

test('buildJsonExport contains all seeds', () => {
  const seeds = [createBaseSeed({ id: 'seed-1' }), createBaseSeed({ id: 'seed-2' })];
  const parsed = JSON.parse(buildJsonExport(seeds)) as { seeds: Seed[] };
  assert.equal(parsed.seeds.length, 2);
});

test('buildJsonExport includes exportedAt field', () => {
  const json = buildJsonExport([]);
  const parsed = JSON.parse(json) as { exportedAt: string };
  assert.ok(typeof parsed.exportedAt === 'string');
  assert.ok(!Number.isNaN(new Date(parsed.exportedAt).getTime()));
});

test('buildTextExport includes schemaVersion', () => {
  const text = buildTextExport([createBaseSeed()]);
  assert.ok(text.includes(`schemaVersion: ${SEED_SCHEMA_VERSION}`));
});

test('buildTextExport empty seeds does not throw', () => {
  assert.doesNotThrow(() => buildTextExport([]));
  const text = buildTextExport([]);
  assert.ok(text.includes('種はまだありません'));
});

test('buildTextExport contains seed body', () => {
  const seed = createBaseSeed({ body: 'ユニークなメモ本文' });
  const text = buildTextExport([seed]);
  assert.ok(text.includes('ユニークなメモ本文'));
});

test('buildTextExport contains title when present', () => {
  const seed = createBaseSeed({ title: 'タイトルあり' });
  const text = buildTextExport([seed]);
  assert.ok(text.includes('タイトルあり'));
});

test('buildTextExport contains tags when present', () => {
  const seed = createBaseSeed({ tags: ['tagA', 'tagB'] });
  const text = buildTextExport([seed]);
  assert.ok(text.includes('tagA'));
  assert.ok(text.includes('tagB'));
});

test('buildTextExport contains transform outputs when present', () => {
  const seed = createBaseSeed({
    transformOutputs: [
      {
        id: 'tf-1',
        type: 'question',
        content: '何を学びたいか？',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  const text = buildTextExport([seed]);
  assert.ok(text.includes('何を学びたいか？'));
});
