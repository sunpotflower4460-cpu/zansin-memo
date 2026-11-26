// 件数が増えたときの、画面の元になる計算の時間（Node 上。端末の実測ではない）。
// 使い方: npm run measure:logic
import { makeConnection } from '../src/data/gardenModel';
import type { Seed, SeedConnection } from '../src/domain/types';
import { buildAdjacency, findRecurringWords, getLinkCounts, suggestLinks } from '../src/utils/links';
import { layoutMap } from '../src/utils/mapLayout';
import { buildMatchExcerpt, searchableText } from '../src/utils/seedText';

const SIZES = [50, 500, 2000, 5000];
const words = ['散歩', '写真', '友人', '近況', '読書会', '企画', 'カフェ', '手紙', '朝の光', '記録', '道具', '料理', '音楽', '旅行', '季節'];
const fillers = ['について考えている。', 'を試してみたい。', 'がいつも気になる。', 'を続けてみる。', 'と関係がありそう。'];

const makeSeeds = (n: number, longEvery: number): Seed[] =>
  Array.from({ length: n }, (_, i) => {
    const body = `${words[i % words.length]}と${words[(i * 7 + 3) % words.length]}${fillers[i % fillers.length]}` + (i % longEvery === 0 ? 'あ'.repeat(1500) : '');
    const t = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
    return {
      id: `s${i}`, body, createdAt: t, updatedAt: t, importance: 3, growthState: i % 9 === 0 ? 'sprout' : 'seed',
      tags: i % 4 === 0 ? [words[i % words.length]] : [], transformOutputs: [], schemaVersion: 2,
    } as Seed;
  });

const makeConnections = (seeds: Seed[], degree: number, hubDegree: number): SeedConnection[] => {
  const map = new Map<string, SeedConnection>();
  const add = (a: number, b: number) => {
    if (a !== b) {
      const c = makeConnection(seeds[a].id, seeds[b].id, 'manual', seeds[a].createdAt);
      map.set(c.id, c);
    }
  };
  for (let i = 0; i < seeds.length; i += 1) for (let d = 1; d <= degree; d += 1) add(i, (i * 31 + d * 17) % seeds.length);
  for (let h = 1; h <= hubDegree && h < seeds.length; h += 1) add(0, h); // 高次数の中心（s0）
  return Array.from(map.values());
};

const median = (fn: () => void, runs = 7): number => {
  const t: number[] = [];
  for (let r = 0; r < runs; r += 1) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[Math.floor(t.length / 2)];
};

console.log(`Node ${process.version} / ${process.platform}-${process.arch}（端末の実測ではありません）`);
console.log('件数 | 検索index作成 | 検索1回(全件) | 隣接+件数 | 繰り返す言葉 | 候補(1件分) | マップ配置(6件) | 高次数500の局所リスト作成');
for (const n of SIZES) {
  const seeds = makeSeeds(n, 10);
  const connections = makeConnections(seeds, 3, Math.min(500, n - 1));
  let hay = new Map<string, string>();
  const index = median(() => { hay = new Map(seeds.map((s) => [s.id, searchableText(s)])); });
  const search = median(() => { const q = '友人'; seeds.filter((s) => (hay.get(s.id) ?? '').includes(q)).forEach((s) => buildMatchExcerpt(s, q)); });
  const adjacency = median(() => { buildAdjacency(seeds, connections); getLinkCounts(seeds, connections); });
  const recurring = median(() => findRecurringWords(seeds), 3);
  const suggest = median(() => suggestLinks(seeds[Math.floor(n / 2)], seeds, connections), 3);
  const map = median(() => layoutMap(6, 320));
  const hub = median(() => { const ids = buildAdjacency(seeds, connections).get('s0') ?? new Set(); const byId = new Map(seeds.map((s) => [s.id, s])); Array.from(ids).map((id) => byId.get(id)).sort((a, b) => (b?.updatedAt ?? '').localeCompare(a?.updatedAt ?? '')); });
  console.log(`${n} | ${index.toFixed(1)}ms | ${search.toFixed(1)}ms | ${adjacency.toFixed(1)}ms | ${recurring.toFixed(1)}ms | ${suggest.toFixed(1)}ms | ${map.toFixed(3)}ms | ${hub.toFixed(1)}ms`);
}
