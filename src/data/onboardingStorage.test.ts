import assert from 'node:assert/strict';
import test from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSeenOnboarding, markOnboardingSeen } from './onboardingStorage';

test('onboarding is unseen until marked, then stays seen', async () => {
  const store = new Map<string, string>();
  const original = { getItem: AsyncStorage.getItem, setItem: AsyncStorage.setItem };
  AsyncStorage.getItem = async (key: string) => store.get(key) ?? null;
  AsyncStorage.setItem = async (key: string, value: string) => {
    store.set(key, value);
  };
  try {
    assert.equal(await hasSeenOnboarding(), false);
    await markOnboardingSeen();
    assert.equal(await hasSeenOnboarding(), true);
  } finally {
    Object.assign(AsyncStorage, original);
  }
});

test('onboarding stays hidden when storage cannot be read', async () => {
  const original = AsyncStorage.getItem;
  AsyncStorage.getItem = async () => {
    throw new Error('read failed');
  };
  try {
    assert.equal(await hasSeenOnboarding(), true);
  } finally {
    AsyncStorage.getItem = original;
  }
});
