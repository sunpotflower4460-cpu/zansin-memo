import assert from 'node:assert/strict';
import test from 'node:test';
import { dismissKey } from '../utils/links';
import { KEYS } from './gardenStorage';
import { dismissedKeysFor, loadDismissed, parseDismissed, saveDismissed } from './suggestionPrefs';

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => void data.set(key, value),
  } as never;
};

test('dismissed pairs survive a restart (round trip) and ignore broken data', async () => {
  const storage = memory();
  await saveDismissed(new Set([dismissKey('b', 'a'), dismissKey('c', 'a')]), storage);
  const loaded = await loadDismissed(storage);
  assert.deepEqual(Array.from(loaded).sort(), [dismissKey('a', 'b'), dismissKey('a', 'c')].sort());
  assert.deepEqual(Array.from(parseDismissed('not json')), []);
  assert.deepEqual(Array.from(parseDismissed('{"a":1}')), []);
  assert.deepEqual(Array.from(parseDismissed(JSON.stringify([1, 'x']))), ['x']);
});

test('the dismissed list lives under a key that "delete all data" removes', () => {
  assert.ok(KEYS.dismissedSuggestions.startsWith('kizashi-notes:'));
});

test('dismissedKeysFor finds only the pairs that involve a memo, in either direction', () => {
  const set = new Set([dismissKey('a', 'b'), dismissKey('c', 'a'), dismissKey('b', 'c')]);
  assert.deepEqual(dismissedKeysFor(set, 'a').sort(), [dismissKey('a', 'b'), dismissKey('a', 'c')].sort());
  assert.deepEqual(dismissedKeysFor(set, 'z'), []);
});
