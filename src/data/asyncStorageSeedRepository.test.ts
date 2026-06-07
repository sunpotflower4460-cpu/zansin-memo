import assert from 'node:assert/strict';
import test from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import { AsyncStorageSeedRepository } from './asyncStorageSeedRepository';

const STORAGE_KEY = 'kizashi-notes:seeds:v1';
const LAST_GOOD_STORAGE_KEY = 'kizashi-notes:seeds:v1:lastGood';
const CORRUPT_BACKUP_PREFIX = 'kizashi-notes:seeds:v1:corruptBackup';

const createBaseSeed = (overrides: Partial<Seed> = {}): Seed => ({
  id: 'seed-1',
  body: 'テスト',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  importance: 3,
  growthState: 'seed',
  tags: [],
  relatedSeedIds: [],
  schemaVersion: SEED_SCHEMA_VERSION,
  ...overrides,
});

const withMockedStorage = async (
  initialEntries: Record<string, string> | undefined,
  run: (context: { setCalls: Array<[string, string]> }) => Promise<void>,
): Promise<void> => {
  const store = new Map(Object.entries(initialEntries ?? {}));
  const setCalls: Array<[string, string]> = [];
  const originalGetItem = AsyncStorage.getItem;
  const originalSetItem = AsyncStorage.setItem;

  AsyncStorage.getItem = async (key: string) => store.get(key) ?? null;
  AsyncStorage.setItem = async (key: string, value: string) => {
    setCalls.push([key, value]);
    store.set(key, value);
  };

  try {
    await run({ setCalls });
  } finally {
    AsyncStorage.getItem = originalGetItem;
    AsyncStorage.setItem = originalSetItem;
  }
};

test('getAll normalizes old or broken saved seeds', async () => {
  await withMockedStorage(
    {
      [STORAGE_KEY]: JSON.stringify([
        {
          id: ' legacy-seed ',
          title: '  タイトル  ',
          body: 123,
          createdAt: 'not-a-date',
          updatedAt: '2026-03-01T00:00:00.000Z',
          mood: 'invalid',
          importance: 4.4,
          growthState: 'invalid',
          tags: [' tag ', '', 'tag', 5],
          relatedSeedIds: null,
          transformOutputs: [
            {
              type: 'question',
              content: '  深掘りする？  ',
              createdAt: 'not-a-date',
            },
            {
              type: 'invalid',
              content: 'skip me',
            },
          ],
        },
      ]),
    },
    async () => {
      const repository = new AsyncStorageSeedRepository();
      const result = await repository.getAll();

      assert.equal(result.ok, true);
      if (!result.ok) {
        return;
      }

      assert.equal(result.seeds.length, 1);
      assert.deepEqual(result.seeds[0], {
        id: 'legacy-seed',
        title: 'タイトル',
        body: '（復元できなかった種）',
        createdAt: result.seeds[0].createdAt,
        updatedAt: '2026-03-01T00:00:00.000Z',
        mood: undefined,
        importance: 4,
        growthState: 'seed',
        tags: ['tag'],
        relatedSeedIds: [],
        resurfacingScore: undefined,
        lastResurfacedAt: undefined,
        deletedAt: undefined,
        transformOutputs: [
          {
            id: result.seeds[0].transformOutputs?.[0]?.id ?? '',
            type: 'question',
            content: '深掘りする？',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        schemaVersion: SEED_SCHEMA_VERSION,
      });
      assert.ok(result.seeds[0].transformOutputs?.[0]?.id);
      assert.ok(!Number.isNaN(new Date(result.seeds[0].createdAt).getTime()));
    },
  );
});

test('getAll recovers from last good backup without overwriting primary keys', async () => {
  await withMockedStorage(
    {
      [STORAGE_KEY]: '{broken json',
      [LAST_GOOD_STORAGE_KEY]: JSON.stringify([createBaseSeed({ id: 'backup-seed' })]),
    },
    async ({ setCalls }) => {
      const repository = new AsyncStorageSeedRepository();
      const result = await repository.getAll();

      assert.equal(result.ok, true);
      if (!result.ok) {
        return;
      }

      assert.equal(result.recoveredFromBackup, true);
      assert.equal(result.seeds.length, 1);
      assert.equal(result.seeds[0].id, 'backup-seed');
      assert.equal(result.seeds[0].body, 'テスト');
      assert.deepEqual(result.seeds[0].tags, []);
      assert.deepEqual(result.seeds[0].transformOutputs, []);
      assert.equal(result.seeds[0].schemaVersion, SEED_SCHEMA_VERSION);
      assert.equal(setCalls.length, 1);
      assert.ok(setCalls[0][0].startsWith(CORRUPT_BACKUP_PREFIX));
      assert.equal(setCalls.some(([key]) => key === STORAGE_KEY || key === LAST_GOOD_STORAGE_KEY), false);
    },
  );
});

test('getAll does not write anything when reading storage fails', async () => {
  const originalGetItem = AsyncStorage.getItem;
  const originalSetItem = AsyncStorage.setItem;
  const setCalls: Array<[string, string]> = [];

  AsyncStorage.getItem = async () => {
    throw new Error('read failed');
  };
  AsyncStorage.setItem = async (key: string, value: string) => {
    setCalls.push([key, value]);
  };

  try {
    const repository = new AsyncStorageSeedRepository();
    const result = await repository.getAll();

    assert.deepEqual(result, {
      ok: false,
      reason: 'read_error',
      message: 'read failed',
    });
    assert.deepEqual(setCalls, []);
  } finally {
    AsyncStorage.getItem = originalGetItem;
    AsyncStorage.setItem = originalSetItem;
  }
});
