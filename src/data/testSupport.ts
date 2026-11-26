import type { Seed } from '../domain/types';
import { SEED_SCHEMA_VERSION } from '../domain/types';
import type { StorageLike } from './gardenStorage';

// 試験用の保存先。書込みの失敗・遅延・「書けたのに失敗と返る」を注入できる。

type Op = 'getItem' | 'setItem' | 'removeItem' | 'multiRemove' | 'getAllKeys';
type Matcher = string | RegExp | undefined;
const matches = (matcher: Matcher, key: string | undefined): boolean =>
  matcher === undefined || (key !== undefined && (typeof matcher === 'string' ? key === matcher : matcher.test(key)));

type Failure = { op: Op; key: Matcher; times: number; applyBeforeFail: boolean };
type Hold = { op: Op; key: Matcher; release: Promise<void>; remaining: number };

export class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  readonly writes: Array<{ op: Op; key: string }> = [];
  private failures: Failure[] = [];
  private holds: Hold[] = [];

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.data.set(key, value);
    }
  }

  /** 指定の操作を、指定回数だけ失敗させる。applyBeforeFail なら、書込みを反映してから失敗を返す（応答不明）。 */
  failNext(op: Op, key?: Matcher, times = 1, applyBeforeFail = false): void {
    this.failures.push({ op, key, times, applyBeforeFail });
  }

  /** 指定の操作を、release() が呼ばれるまで待たせる（遅い書込み）。 */
  hold(op: Op, key?: Matcher, count = 1): () => void {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.holds.push({ op, key, release: promise, remaining: count });
    return release;
  }

  private async gate(op: Op, key?: string): Promise<{ failAfterApply: boolean }> {
    const hold = this.holds.find((h) => h.op === op && h.remaining > 0 && matches(h.key, key));
    if (hold) {
      hold.remaining -= 1;
      await hold.release;
    }
    const failure = this.failures.find((f) => f.op === op && f.times > 0 && matches(f.key, key));
    if (failure) {
      failure.times -= 1;
      if (!failure.applyBeforeFail) {
        throw new Error(`injected ${op} failure`);
      }
      return { failAfterApply: true };
    }
    return { failAfterApply: false };
  }

  async getItem(key: string): Promise<string | null> {
    await this.gate('getItem', key);
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const { failAfterApply } = await this.gate('setItem', key);
    this.data.set(key, value);
    this.writes.push({ op: 'setItem', key });
    if (failAfterApply) {
      throw new Error('injected setItem failure after apply');
    }
  }

  async removeItem(key: string): Promise<void> {
    await this.gate('removeItem', key);
    this.data.delete(key);
    this.writes.push({ op: 'removeItem', key });
  }

  async multiRemove(keys: readonly string[]): Promise<void> {
    await this.gate('multiRemove', keys[0]);
    for (const key of keys) {
      this.data.delete(key);
      this.writes.push({ op: 'removeItem', key });
    }
  }

  async getAllKeys(): Promise<readonly string[]> {
    await this.gate('getAllKeys');
    return Array.from(this.data.keys());
  }

  writesTo(key: string): number {
    return this.writes.filter((w) => w.op === 'setItem' && w.key === key).length;
  }
}

export const makeSeed = (id: string, overrides: Partial<Seed> = {}): Seed => ({
  id,
  body: `本文${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  importance: 3,
  growthState: 'seed',
  tags: [],
  transformOutputs: [],
  schemaVersion: SEED_SCHEMA_VERSION,
  ...overrides,
});

/** v1（以前の保存形式）の Seed。relatedSeedIds / continuedFromId を含む。 */
export const makeV1Seed = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  body: `本文${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  importance: 3,
  growthState: 'seed',
  tags: [],
  relatedSeedIds: [],
  transformOutputs: [],
  schemaVersion: 1,
  ...overrides,
});
