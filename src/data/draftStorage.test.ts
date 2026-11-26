import assert from 'node:assert/strict';
import test from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_WRITE_DRAFT, isEmptyDraft, loadDraft, parseDraft, saveDraft } from './draftStorage';

const withStore = async (run: (store: Map<string, string>) => Promise<void>) => {
  const store = new Map<string, string>();
  const original = {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
    removeItem: AsyncStorage.removeItem,
  };
  AsyncStorage.getItem = async (key: string) => store.get(key) ?? null;
  AsyncStorage.setItem = async (key: string, value: string) => {
    store.set(key, value);
  };
  AsyncStorage.removeItem = async (key: string) => {
    store.delete(key);
  };
  try {
    await run(store);
  } finally {
    Object.assign(AsyncStorage, original);
  }
};

test('saveDraft then loadDraft round-trips a draft', async () => {
  await withStore(async () => {
    const draft = { ...EMPTY_WRITE_DRAFT, body: '書きかけ', tags: '企画', mood: 'calm' as const, importance: 5 as const };
    await saveDraft(draft);
    assert.deepEqual(await loadDraft(), draft);
  });
});

test('saveDraft removes the stored draft once it is empty', async () => {
  await withStore(async (store) => {
    await saveDraft({ ...EMPTY_WRITE_DRAFT, body: '書きかけ' });
    assert.equal(store.size, 1);
    await saveDraft({ ...EMPTY_WRITE_DRAFT, body: '   ' });
    assert.equal(store.size, 0);
    assert.equal(await loadDraft(), undefined);
  });
});

test('parseDraft repairs invalid fields and rejects non-objects', () => {
  assert.equal(parseDraft('not json'), undefined);
  assert.equal(parseDraft('null'), undefined);
  assert.deepEqual(parseDraft(JSON.stringify({ body: 'a', mood: 'bogus', growthState: 'x', importance: 9, title: 5 })), {
    title: '',
    body: 'a',
    tags: '',
    mood: undefined,
    growthState: 'seed',
    importance: 3,
  });
});

test('isEmptyDraft ignores whitespace-only input but not mood/importance choices alone', () => {
  assert.equal(isEmptyDraft({ ...EMPTY_WRITE_DRAFT, body: ' \n' }), true);
  assert.equal(isEmptyDraft({ ...EMPTY_WRITE_DRAFT, body: 'x' }), false);
});
