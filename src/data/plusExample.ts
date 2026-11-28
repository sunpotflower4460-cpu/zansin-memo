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

export function buildStudioExample(reference = new Date()) {
  function ago(days: number, hour = 17) {
    const date = new Date(reference);
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return new Date(Math.min(date.getTime(), reference.getTime())).toISOString();
  }
  const original = buildPlusExample(8);
  const more = [
    ['川辺の銀杏', '川沿いの遊歩道に落ち葉。地面に差す光を、歩きながら見つけた。', '散歩'],
    ['五分だけ書く', '就寝前に今日の出来事を一言だけ書いてみた。短ければ毎晩できそう。', '記録'],
    ['窓辺で深呼吸', '携帯の通知を切ったら、部屋の静けさに気づいた。短い休憩でも頭が切り替わる。', '暮らし'],
    ['葉のかたち', '鉢植えの新芽を毎朝見ている。昨日と今日の葉の色を、週に一枚ずつ撮ってみる。', '植物'],
    ['声から始まる絵本', '読み進める前に声をまねてもらった。最初の一歩があると子どもが自分から参加した。', '遊び'],
    ['雨上がりの縁側', '葉にたまった水滴の向こうに庭の緑が映っていた。', '植物'],
    ['封筒を一枚だけ', 'ひとことと切手だけで送れる手紙を作ってみる。読む人が忙しい日にも届くといい。', '記録'],
    ['朝の台所', 'お弁当の献立を前日に決めたら、朝の調理が落ち着いた。', '暮らし'],
  ];
  const offsets = [0, 3, 1, 7, 9, 6, 2, 4, 2, 0, 8, 5, 4, 12, 3, 14];
  const seeds = original.seeds.map((seed, index) => ({ ...seed, createdAt: ago(offsets[index]), updatedAt: ago(offsets[index]) }))
    .concat(more.map(([title, body, tag], index) => buildSeed(`example-${index + 8}`, { title, body, tags: [tag] }, ago(offsets[index + 8]))));
  const connections: typeof original.connections = original.connections.map((edge, index) => ({ ...edge, createdAt: ago([0, 0, 1, 5][index], 19) }));
  for (const [a, b, days, note] of [
    [0, 6, 1, '帰り道に目を向ける'], [0, 7, 0, '短く記録する手がかり'], [0, 8, 0, '歩いた場所を残す'],
    [2, 6, 1, '光を一枚に残す'], [3, 14, 3, '短い便りの形を考える'], [5, 12, 3, '最初に声を出してみる'], [11, 13, 4, '庭で見つけた色'],
  ] as const) connections.push(makeConnection(seeds[a].id, seeds[b].id, 'manual', ago(days, 19), note));
  return { seeds, connections };
}
