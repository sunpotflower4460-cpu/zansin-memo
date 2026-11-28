import assert from 'node:assert/strict';
import test from 'node:test';
import { adoptCraft, createAtelier, readCraftEvidence, saveAtelierText, trackPin } from '../domain/plus/atelier';
import { composeCraft, craftExcerpts, craftPart, craftRecipes, defaultCraftExcerpt } from '../domain/plus/craft';
import { requirePlusAccess } from '../domain/plus/entitlements';
import { rankInsights, settleInsight, shortlistInsights } from '../domain/plus/insights';
import { indexMap } from '../domain/plus/map';
import { studioAtlas, studioRoute, topicConstellations } from '../domain/plus/studioAtlas';
import { makeConnection } from './gardenModel';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from './gardenV3Model';
import { PLUS_KEYS } from './gardenV3Storage';
import { GardenV3Writer } from './gardenV3Writer';
import { FakeStorage, makeSeed } from './testSupport';

const at = '2026-11-28T12:00:00.000Z';
const seeds = [
  makeSeed('walk', { title: '今日の日記', body: '歩いて気づきを残す。' }),
  makeSeed('photo', { title: '光', body: '写真を一枚選んだ。' }),
  makeSeed('shade', { title: '木陰', body: '木陰の音を聴く。' }),
];
const parts = seeds.map((seed) => craftPart(seed, craftExcerpts(seed.body)[0]));
const candidate = composeCraft(parts, 'experience')!;
const target = { projectId: 'project', branchId: 'branch', expected: 0 };
const args = { id: 'craft', candidate, target, create: true, saveVersion: true, at };
const store = { ...emptyStoreV3(), seeds, connections: [makeConnection('walk', 'shade', 'manual', at)] };

test('a craft quotes the selected occurrence including emoji, repeated sentences and long lines', () => {
  const body = '  🌱です。\n 🌱です。\n' + '草'.repeat(119) + '🌱'.repeat(3);
  const excerpts = craftExcerpts(body);
  assert.equal(excerpts.length, 4);
  assert.ok(excerpts[1].start > excerpts[0].end);
  for (const excerpt of excerpts) assert.equal(body.slice(excerpt.start, excerpt.end), excerpt.quote);
  assert.deepEqual(excerpts.slice(-2).map((e) => Array.from(e.quote).length), [120, 2]);
  assert.deepEqual(craftExcerpts(' \n '), []);
});

test('the suggested excerpt skips a repeated title and retains its exact source range', () => {
  const body = '川辺の銀杏。\n写真に残したあとの印象。';
  const excerpt = defaultCraftExcerpt({ title: '川辺の銀杏', body })!;
  assert.equal(excerpt.quote, '写真に残したあとの印象。');
  assert.equal(body.slice(excerpt.start, excerpt.end), excerpt.quote);
  assert.equal(defaultCraftExcerpt({ title: '川辺の銀杏', body: '川辺の銀杏。' })?.quote, '川辺の銀杏。');
});

test('each craft recipe uses its roles, never invents permission to take photos and accepts unrelated materials', () => {
  const recipes = craftRecipes.map(({ id }) => composeCraft(parts, id)!);
  assert.equal(new Set(recipes.map((item) => item.body)).size, 3);
  assert.equal(new Set(recipes.map((item) => item.summary)).size, 3);
  assert.equal(recipes[0].title, '一枚から始まる日記');
  for (const item of recipes) {
    assert.ok(item.body.includes(parts[2].quote));
    assert.deepEqual(item.parts, parts);
    assert.equal(item.generator, 'recipe');
    assert.equal(item.uses?.length, 3);
  }
  const restricted = makeSeed('restricted', { body: 'ここでは写真を撮れない。' });
  const other = craftPart(restricted, craftExcerpts(restricted.body)[0]);
  const cards = composeCraft([parts[0], other], 'experience')!;
  assert.ok(cards.body.includes(other.quote));
  assert.ok(cards.body.includes(parts[0].quote));
  assert.notEqual(cards.title, recipes[0].title);
  assert.equal(composeCraft([parts[0], parts[0]], 'letter'), undefined);
  assert.equal(composeCraft([parts[0]], 'letter'), undefined);
  assert.notEqual(composeCraft([other, parts[0]], 'experience')!.title, cards.title);
});

test('an entrance and a gesture make a repeatable interaction with a different first trial', () => {
  const opening = makeSeed('entrance', { body: '説明なしで参加できる入口を作りたい。' });
  const gesture = makeSeed('gesture', { body: '動きをまねる遊びなら入りやすかった。' });
  const ingredients = [opening, gesture].map((seed) => craftPart(seed, defaultCraftExcerpt(seed)!));
  const play = composeCraft(ingredients, 'experience')!;
  const trial = composeCraft(ingredients, 'experiment')!;
  assert.equal(play.title, 'まねから始まる遊び');
  assert.match(play.body, /変化を次の人がまねする/);
  assert.ok(play.uses?.[1].includes('動き'));
  assert.match(trial.body, /一回目は説明を一文/);
  assert.ok(trial.uses?.[1].includes('二回目'));
});

test('sound and photography have specific roles only when drawn from different notes', () => {
  const sound = makeSeed('sound', { body: '路地で雨音を聞いた。' });
  const one = makeSeed('both', { body: '写真を選び、路地の雨音も書いた。' });
  const other = makeSeed('unrelated', { body: '靴紐を結び直す。' });
  const from = (seed: typeof sound) => craftPart(seed, defaultCraftExcerpt(seed)!);
  const photos = [from(sound), parts[1]];
  assert.equal(composeCraft(photos, 'experience')?.title, '耳でめくる写真帖');
  assert.equal(composeCraft(photos, 'letter')?.title, '音のあとに写真が届く便り');
  assert.equal(composeCraft(photos, 'experiment')?.title, '音を足すと景色はどう変わる？');
  assert.match(composeCraft([...photos].reverse(), 'experience')!.uses![0], /写真を選び/);
  const combined = composeCraft([from(one), from(other)], 'experience')!;
  assert.notEqual(combined.title, '耳でめくる写真帖');
  assert.ok(combined.body.includes(other.body));
});

test('changing the clue changes how a reader can try the same opening excerpt', () => {
  for (const [quote, form] of [['足音を聞いた。', '音のしおり'], ['布の配色を選ぶ。', '色見本'], ['散歩の途中で休む。', '散歩']]) {
    const clue = makeSeed('clue', { body: quote });
    const idea = composeCraft([parts[0], craftPart(clue, craftExcerpts(quote)[0])], 'experience')!;
    assert.ok(idea.title.endsWith(form));
    assert.ok(idea.body.includes(quote));
    assert.ok(idea.body.includes(parts[0].quote));
  }
});

test('adoption saves all ingredients and a work source atomically and can be retried after a write failure', async () => {
  const storage = new FakeStorage({ [PLUS_KEYS.main]: serializeStoreV3(store) });
  const writer = new GardenV3Writer(storage, store);
  const command = adoptCraft(args);
  storage.failNext('setItem', PLUS_KEYS.main);
  assert.equal((await writer.run(command)).ok, false);
  assert.equal(writer.getSnapshot().atelierProjects.length, 0);
  assert.equal(writer.getSnapshot().sourceSnapshots.length, 0);
  assert.equal((await writer.run(command)).ok, true);
  assert.equal((await writer.run(command)).ok, true);
  const restored = parseStoreV3(storage.data.get(PLUS_KEYS.main)!);
  assert.ok(restored.ok);
  const saved = restored.store;
  assert.deepEqual(saved.seeds, store.seeds);
  assert.deepEqual(saved.connections, store.connections);
  assert.equal(saved.collectionItems.length, 0);
  assert.equal(saved.atelierRevisions.length, 1);
  assert.equal(saved.atelierRevisions[0].title, candidate.title);
  assert.equal(saved.atelierRevisions[0].text, candidate.body);
  assert.equal(saved.atelierProjects.length, 1);
  assert.deepEqual(saved.atelierSuggestions[0].evidence.map((item) => item.quote), parts.map((part) => part.quote));
  assert.deepEqual(saved.atelierSuggestions[0].craft, { title: candidate.title, recipe: 'experience', generator: 'recipe', uses: candidate.uses });
  assert.deepEqual(saved.atelierRevisions[0].insertedSuggestionIds, ['craft']);
  assert.equal(saved.aiRequestReceipts.length, 0);
  assert.deepEqual(command.apply(saved), saved);
  assert.ok('rejected' in adoptCraft({ ...args, target: { ...target, projectId: 'different' } }).apply(saved));
});

test('edited, deleted, stale or misquoted material rejects the whole craft, including a tentative new project', () => {
  const command = adoptCraft(args);
  for (const change of [{ title: '別の題' }, { body: '書き換えた原文。' }, { deletedAt: at }]) {
    const updated = { ...store, seeds: seeds.map((seed, i) => i === 2 ? { ...seed, ...change } : seed) };
    assert.ok('rejected' in command.apply(updated));
    assert.deepEqual(updated.sourceSnapshots, []);
    assert.deepEqual(updated.atelierDrafts, []);
  }
  assert.ok('rejected' in requirePlusAccess(command, () => false).apply(store));
  const bad = { ...candidate, parts: [parts[0], { ...parts[1], quote: '別の一節' }] };
  assert.ok('rejected' in adoptCraft({ ...args, candidate: bad }).apply(store));
  assert.ok('rejected' in adoptCraft({ ...args, candidate: { ...candidate, uses: ['一行だけ'] } }).apply(store));
});

test('a work can show an exact historical craft excerpt and hides lost or deleted sources', () => {
  const saved = adoptCraft(args).apply(store);
  assert.ok(!('rejected' in saved));
  const [evidence] = saved.atelierSuggestions[0].evidence;
  assert.equal(readCraftEvidence(saved, evidence)?.quote, parts[0].quote);
  assert.equal(readCraftEvidence(saved, { ...evidence, quote: '別の一節' }), undefined);
  const changed = { ...saved, seeds: saved.seeds.map((seed) => seed.id === 'walk' ? { ...seed, body: '新しい原文。' } : seed) };
  const historical = readCraftEvidence(changed, evidence);
  assert.equal(historical?.state, 'changed');
  assert.equal(historical?.quote, parts[0].quote);
  assert.equal(readCraftEvidence({ ...changed, seeds: changed.seeds.map((seed) => seed.id === 'walk' ? { ...seed, deletedAt: at } : seed) }, evidence), undefined);
  assert.equal(readCraftEvidence({ ...changed, sourceSnapshots: [] }, evidence), undefined);
  const older = { ...saved, atelierSuggestions: saved.atelierSuggestions.map((entry) => ({ ...entry,
    craft: { ...entry.craft!, uses: undefined } })) };
  assert.equal(parseStoreV3(serializeStoreV3(older)).ok, true);
});

test('an existing branch keeps its text and pins and rejects adoption after a competing edit', async () => {
  const writer = new GardenV3Writer(new FakeStorage(), store);
  await writer.run(createAtelier({ id: target.projectId, branchId: target.branchId, materials: [], at }));
  await writer.run(saveAtelierText(target, '最初の一行', 'write', at));
  await writer.run(trackPin({ target: { ...target, expected: 1 }, id: 'pin', range: { start: 0, end: 5 }, at }));
  assert.equal((await writer.run(adoptCraft({ ...args, create: false }))).ok, false);
  const before = writer.getSnapshot().atelierDrafts[0];
  const ai = { ...candidate, generator: 'on_device' as const, title: '紙に残す音', body: '二枚をめくって聞き比べよう。' };
  assert.equal((await writer.run(adoptCraft({ ...args, id: 'append', candidate: ai, create: false, saveVersion: false,
    target: { ...target, expected: before.editRevision } }))).ok, true);
  const saved = writer.getSnapshot();
  assert.equal(saved.atelierDrafts[0].text, before.text + '\n\n' + ai.title + '\n' + ai.body);
  assert.deepEqual(saved.atelierDrafts[0].pinnedExcerpts, before.pinnedExcerpts);
  assert.equal(saved.atelierSuggestions[0].craft?.generator, 'on_device');
  assert.equal(saved.atelierSuggestions[0].craft?.uses, undefined);
  assert.equal(saved.atelierRevisions.length, 0);
});

test('a blank existing draft takes the chosen idea title and can become a work without duplicating the project', () => {
  const blank = createAtelier({ id: target.projectId, branchId: target.branchId, materials: [], at }).apply(store);
  assert.ok(!('rejected' in blank));
  const adopted = adoptCraft({ ...args, create: false }).apply(blank);
  assert.ok(!('rejected' in adopted));
  assert.equal(adopted.atelierProjects.length, 1);
  assert.equal(adopted.atelierRevisions[0].title, candidate.title);
});

test('topic constellations use shared categories or actual words, deduplicate variants and include solitary notes', () => {
  const notes = [
    makeSeed('one', { tags: ['旅', 'ＧＰＳ', 'gps'] }), makeSeed('two', { tags: ['旅'] }),
    makeSeed('three', { body: '鉱石をみつけた' }), makeSeed('four', { body: '鉱石のみがきかた' }),
    makeSeed('five', { body: 'ひとりであるく' }), makeSeed('old', { tags: ['旅'], deletedAt: at }),
  ];
  const index = indexMap(notes, []);
  const groups = topicConstellations(index);
  assert.deepEqual(groups.find((g) => g.label === '旅')?.seedIds, ['one', 'two']);
  assert.deepEqual(groups.find((g) => g.label === 'gps')?.seedIds, ['one']);
  assert.deepEqual(groups.find((g) => g.basis === 'word' && g.label === '鉱石')?.seedIds, ['three', 'four']);
  assert.deepEqual(groups.find((g) => g.basis === 'ungrouped')?.seedIds, ['five']);
  assert.deepEqual(index.edges, []);
});

test('the whole-garden atlas covers distant and isolated notes and returns a saved shortest route through a cycle', () => {
  const notes = Array.from({ length: 5000 }, (_, i) => makeSeed(String(i)));
  const links = notes.slice(1, -1).map((seed, i) => makeConnection(notes[i].id, seed.id, 'manual', at));
  links.push(makeConnection('1', '3', 'manual', at));
  const atlas = studioAtlas(indexMap(notes, links), '0');
  assert.deepEqual(atlas.nearby.map(({ kind, seedIds }) => [kind, seedIds.length]), [['branch', 4998]]);
  assert.deepEqual(atlas.apart.map(({ kind, seedIds }) => [kind, seedIds]), [['isolated', ['4999']]]);
  assert.equal(atlas.depth.get('2'), 2);
  assert.equal(atlas.depth.get('3'), 2);
  assert.deepEqual(studioRoute(atlas, '4'), ['0', '1', '3', '4']);
  assert.equal(studioRoute(atlas, '4998').length, 4998);
  assert.deepEqual(studioRoute(atlas, '4999'), []);
});

test('the atlas groups direct notes by saved reason, category or common words while keeping each route distinct', () => {
  const notes = ['center', 'branch', 'deep', 'a', 'b', 'c', 'd', 'e', 'f', 'other', 'peer', 'solo']
    .map((id) => makeSeed(id, { title: id, tags: id === 'c' || id === 'd' || id === 'deep' ? ['散歩'] : [],
      body: id === 'e' ? '苔玉をつくる' : id === 'f' ? '苔玉にみずをやる' : id }));
  const pairs = [
    ['center', 'branch'], ['branch', 'deep'], ['center', 'a', '外で見つけたもの'], ['center', 'b', '外で見つけたもの'],
    ['center', 'c', '理由1'], ['center', 'd', '理由2'], ['center', 'e'], ['center', 'f'], ['other', 'peer'],
  ];
  const edges = pairs.map(([a, b, note]) => makeConnection(a, b, 'manual', at, note));
  const atlas = studioAtlas(indexMap(notes, edges), 'center');
  assert.deepEqual(atlas.nearby.map(({ kind, title, seedIds }) => [kind, title, seedIds]), [
    ['branch', 'branch', ['branch', 'deep']], ['reason', '外で見つけたもの', ['a', 'b']], ['category', '散歩', ['c', 'd']], ['word', '苔玉', ['e', 'f']],
  ]);
  assert.deepEqual(atlas.apart.map(({ kind, seedIds }) => [kind, seedIds]), [['component', ['other', 'peer']], ['isolated', ['solo']]]);
  assert.deepEqual(studioRoute(atlas, 'deep'), ['center', 'branch', 'deep']);
  assert.deepEqual(studioRoute(atlas, 'b'), ['center', 'b']);
  assert.deepEqual(studioRoute(atlas, 'peer'), []);
  assert.equal(atlas.edgeNotes.size, 4);
});

test('a suggestion via a shared neighbor requires both saved links and an included, live bridge at decision time', () => {
  const notes = [makeSeed('a', { body: 'ふわりとゆれる。' }), makeSeed('b', { body: 'そっとひらく。' }),
    makeSeed('via', { title: 'しおり', body: 'はさんでおく。' })];
  const connections = ['a', 'b'].map((id) => makeConnection(id, 'via', 'manual', at));
  const garden = { ...emptyStoreV3(), seeds: notes, connections };
  const index = indexMap(notes, connections);
  const [idea] = rankInsights(shortlistInsights(index, garden, 'a')!);
  assert.equal(idea.kind, '共通のつなぎ役');
  assert.ok(idea.reason.includes('しおり'));
  const add = settleInsight(idea, 'connect', 'connect-ab', at);
  assert.ok(!('rejected' in add.apply(garden)));
  assert.ok('rejected' in add.apply({ ...garden, connections: connections.slice(0, 1) }));
  const excluded = { ...garden, permissions: [{ seedId: 'via', epoch: 1, externalAi: 'deny' as const, discovery: 'exclude' as const, changedAt: at }] };
  assert.deepEqual(rankInsights(shortlistInsights(index, excluded, 'a')!), []);
  assert.ok('rejected' in add.apply(excluded));
});

test('numbered duplicates do not consume the semantic shortlist for distinct notes', () => {
  const repeated = Array.from({ length: 36 }, (_, i) => makeSeed('entry-' + i, { title: '帰り道のメモ ' + i,
    body: '帰り道のメモ ' + i + '。写真に光を残した。' }));
  const different = makeSeed('different', { body: '川面がきらきらしていた。' });
  const garden = { ...emptyStoreV3(), seeds: [seeds[0], ...repeated, different] };
  const shortlist = shortlistInsights(indexMap(garden.seeds, []), garden, seeds[0].id)!;
  assert.equal(shortlist.ranked.length, 2);
  assert.ok(shortlist.ranked.some(({ to }) => to.seed.id === different.id));
});
