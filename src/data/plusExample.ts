import { buildSeed } from '../domain/gardenCommands';
import { makeConnection } from './gardenModel';

const at = '2026-11-27T00:00:00.000Z';

export function buildPlusExample(count = 64) {
  const examples = [
    ['散歩の記録', '長い日記は続かない。帰り道の気づきを、もっと手軽に残してみたい。', '散歩'],
    ['雨の日の音', '軒下で聞いた音は、写真に写っていなくても思い出せる。', '散歩'],
    ['写真を一枚選ぶ', '散歩の写真は自然に撮り続けている。朝の光を一枚ずつ残したい。', '写真'],
    ['一日の便り', '写真と一言だけで、日曜日に小さな便りを作ってみる。', '写真'],
    ['小さな遊びの入口', '説明を読まずに遊べる入口を作りたい。', '遊び'],
    ['音をまねる遊び', '音をまねる遊びにはすぐ参加してくれた。', '遊び'],
    ['光の色', '曇りの日の青と、晴れた朝の白。', '散歩'],
    ['切符の裏', '地名だけ残しておくと、あとでその日に戻れる気がする。', '記録'],
  ];
  const seeds = examples.map(([title, body, tag], i) => buildSeed(`example-${i}`, { title, body, tags: [tag] }, at));
  for (let i = examples.length; i < count; i++) {
    const material = i === count - 1 ? '川辺の銀杏' : `帰り道のメモ ${i - 7}`;
    seeds.push(buildSeed(`example-${i}`, { title: material, body: `${material}。写真に残したあとの印象。`, tags: ['街歩き'] }, at));
  }
  const edges: Array<[number, number, string]> = [
    [0, 1, '思い出を呼び戻す手がかり'], [1, 2, '同じ散歩を音と写真で記録した'],
    [2, 3, '便りに写真を添える'], [4, 5, '参加しやすい入口を考える'],
  ];
  for (let i = 8; i < Math.min(count, 309); i++) edges.push([0, i, '散歩で見つけたもの']);
  const connections = edges.map(([a, b, note]) => makeConnection(seeds[a].id, seeds[b].id, 'manual', at, note));
  const displayGroups = [
    { id: 'walk', label: '散歩で見つけたこと', seedIds: ['example-0', 'example-1', 'example-6'], collapsed: true },
    { id: 'pictures', label: '写真と便り', seedIds: ['example-2', 'example-3'], collapsed: true },
  ];
  return { seeds, connections, displayGroups };
}
