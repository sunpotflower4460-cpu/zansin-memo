// 保存サイズ・直列化/読込時間の測定（Node 上。端末の実測ではない）。
// 使い方: npm run measure:store
import { emptyStore, makeConnection, parseStoreV2, serializeStore } from '../src/data/gardenModel';
import type { GardenStoreV2, Seed } from '../src/domain/types';
import { buildAdjacency } from '../src/utils/links';

const SIZES = [50, 500, 2000, 5000];
const lorem = '朝の散歩で見かけた景色や、ふと浮かんだ疑問を、そのまま短く書き留めた思いつき。';

const makeSeed = (i: number, longBody: boolean, withSynthesis: boolean): Seed => {
  const body = longBody ? lorem.repeat(60) : lorem.repeat(1 + (i % 4));
  const now = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
  return {
    id: `seed-${i.toString(36)}-${(i * 7919).toString(36)}`,
    title: i % 5 === 0 ? `題名${i}` : undefined,
    body,
    createdAt: now,
    updatedAt: now,
    importance: 3,
    growthState: withSynthesis ? 'sprout' : 'seed',
    tags: i % 3 === 0 ? ['日々', '写真'] : [],
    transformOutputs: [],
    schemaVersion: 2,
    synthesis: withSynthesis
      ? {
          id: `syn-${i}`,
          statement: 'このメモを合わせると、近況便りが作れそう。',
          sources: Array.from({ length: 5 }, (_, k) => ({
            seedId: `seed-${k}`,
            sourcePart: 'body' as const,
            textSnapshot: lorem.repeat(2),
            sourceUpdatedAt: now,
          })),
          createdAt: now,
          updatedAt: now,
          promotedAt: now,
        }
      : undefined,
  };
};

const build = (n: number, { degree, longRatio, synthRatio }: { degree: number; longRatio: number; synthRatio: number }): GardenStoreV2 => {
  const seeds = Array.from({ length: n }, (_, i) => makeSeed(i, i % Math.round(1 / longRatio) === 0, i % Math.round(1 / synthRatio) === 0));
  const connections = new Map<string, ReturnType<typeof makeConnection>>();
  for (let i = 0; i < n; i += 1) {
    for (let d = 1; d <= degree; d += 1) {
      const j = (i * 31 + d * 17) % n;
      if (j !== i) {
        const c = makeConnection(seeds[i].id, seeds[j].id, 'manual', seeds[i].createdAt);
        connections.set(c.id, c);
      }
    }
  }
  return { ...emptyStore(), seeds, connections: Array.from(connections.values()) };
};

const ms = (fn: () => void, runs = 5): number => {
  const times: number[] = [];
  for (let r = 0; r < runs; r += 1) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
};

console.log(`Node ${process.version} / ${process.platform}-${process.arch}（端末の実測ではありません）`);
console.log('件数 | 条件 | JSON | serialize(中央値) | parse+正規化(中央値) | 隣接index');
for (const n of SIZES) {
  for (const [label, opts] of [
    ['通常(短文・接続3)', { degree: 3, longRatio: 0.0001, synthRatio: 0.0001 }],
    ['重い(長文1/10・接続10・芽1/10)', { degree: 10, longRatio: 0.1, synthRatio: 0.1 }],
  ] as const) {
    const store = build(n, opts);
    const json = serializeStore(store);
    const ser = ms(() => serializeStore(store));
    const parse = ms(() => parseStoreV2(json));
    const idx = ms(() => buildAdjacency(store.seeds, store.connections));
    console.log(`${n} | ${label} | ${(Buffer.byteLength(json, 'utf8') / 1024 / 1024).toFixed(2)}MB(UTF-8) | ${ser.toFixed(1)}ms | ${parse.toFixed(1)}ms | ${idx.toFixed(1)}ms`);
  }
}
