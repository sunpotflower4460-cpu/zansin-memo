// 検証用のテストデータ（v2形式のJSON）を作る。実際のメモは含まない、機械的な文だけ。
// 使い方: node --import tsx scripts/make-testdata.ts <件数> <出力パス> [--hub=300] [--long=0.1]
//   --hub    最新のメモにつなぐ本数（高次数の中心）
//   --long   長文メモの割合（0〜1）
// 出力は `kizashi-notes:garden:v2` に入れる文字列そのもの。Web検証では localStorage へ、
// 実機ではデバッグ用の読込手段が必要（現状は未実装。docs/core-growth-verification.md を参照）。
import { writeFileSync } from 'node:fs';
import { makeConnection, serializeStore } from '../src/data/gardenModel';
import type { GardenStoreV2, Seed } from '../src/domain/types';

const [countArg, outPath, ...flags] = process.argv.slice(2);
const count = Number(countArg);
if (!Number.isInteger(count) || count < 1 || !outPath) {
  console.error('usage: make-testdata.ts <count> <outPath> [--hub=N] [--long=R]');
  process.exit(1);
}
const flag = (name: string, fallback: number) => {
  const hit = flags.find((f) => f.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const hub = Math.min(flag('hub', 0), count - 1);
const longRatio = flag('long', 0.05);
const words = ['散歩', '写真', '友人', '近況', '読書会', '企画', 'カフェ', '手紙', '朝の光', '記録'];
const base = Date.UTC(2026, 0, 1);

const seeds: Seed[] = Array.from({ length: count }, (_, i) => {
  const at = new Date(base + i * 60_000).toISOString();
  const sentence = `${words[i % 10]}と${words[(i * 7 + 3) % 10]}について考えている。(${i})`;
  const isLong = longRatio > 0 && i % Math.max(1, Math.round(1 / longRatio)) === 0;
  return {
    id: `t${i}`,
    body: isLong ? sentence.repeat(40) : sentence,
    createdAt: at,
    updatedAt: at,
    importance: 3,
    growthState: 'seed',
    tags: i % 3 === 0 ? ['日々'] : [],
    transformOutputs: [],
    schemaVersion: 2,
  };
});
const last = seeds[count - 1].id;
const connections = [];
for (let h = 0; h < hub; h += 1) connections.push(makeConnection(last, seeds[h].id, 'manual', seeds[h].createdAt));
for (let i = 0; i + 1 < count; i += 5) connections.push(makeConnection(seeds[i].id, seeds[i + 1].id, 'manual', seeds[i].createdAt));

const store: GardenStoreV2 = { storeVersion: 2, revision: 1, lastMutationId: undefined, seeds, connections, drafts: [] } as GardenStoreV2;
writeFileSync(outPath, serializeStore(store));
console.log(`wrote ${count} memos, ${connections.length} connections → ${outPath}`);
