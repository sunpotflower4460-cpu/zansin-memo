import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeed } from '../domain/gardenCommands';
import { rankInsights, settleInsight, shortlistInsights } from '../domain/plus/insights';
import { indexMap } from '../domain/plus/map';
import { adjacentMonth, monthDays, recordDays, saveReflection, saveStudioArrangement, saveStudioPreferences } from '../domain/plus/studio';
import { canPlaceStudioNode, constellationFigure, constellationGroups, placeStudioNodes, radialGraph, studioMapLabel } from '../domain/plus/studioGraph';
import { buildPlusTextExport } from '../utils/plusExport';
import { connectionId, makeConnection } from './gardenModel';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from './gardenV3Model';
import { buildStudioExample } from './plusExample';

const today = '2026-11-28T03:00:00.000Z';

test('hand placement preserves connections and falls back to reachable cards in a smaller view', () => {
  const { seeds, connections } = buildStudioExample(new Date(today));
  const index = indexMap(seeds, connections);
  const frame = { width: 350, height: 440 };
  const automatic = radialGraph(index, seeds[0], frame, [], false);
  const note = automatic.nodes.find(({ seed }) => seed.id === seeds[1].id)!;
  assert.equal(canPlaceStudioNode(automatic, note, automatic.nodes[0]), false);
  const placements = [{ seedId: note.seed.id, x: 0.11, y: -0.09 }];
  const placed = placeStudioNodes(automatic, frame, placements);
  assert.ok(placed.nodes.find(({ seed }) => seed.id === note.seed.id)!.x > note.x + 30);
  assert.deepEqual(placed.lines.map(({ id }) => id), automatic.lines.map(({ id }) => id));
  const small = { width: 294, height: 209 };
  const resized = placeStudioNodes(radialGraph(index, seeds[0], small, [], false), small, placements);
  for (const [i, node] of resized.nodes.entries()) {
    assert.ok(node.x - node.width / 2 >= 0 && node.x + node.width / 2 <= small.width);
    for (const peer of resized.nodes.slice(i + 1)) {
      assert.ok(Math.abs(node.x - peer.x) >= (node.width + peer.width) / 2 ||
        Math.abs(node.y - peer.y) >= (node.height + peer.height) / 2);
    }
  }
});

test('saved hand placements round-trip independently of the notes and reject stale edits', () => {
  const initial = { ...emptyStoreV3(), ...buildStudioExample(new Date(today)) };
  const placements = [{ seedId: 'example-1', x: 0.1, y: -0.08 }];
  const next = saveStudioArrangement('example-0', placements, [], 'arrange').apply(initial);
  assert.ok(!('rejected' in next));
  assert.deepEqual(next.seeds, initial.seeds);
  assert.deepEqual(next.connections, initial.connections);
  assert.equal(parseStoreV3(serializeStoreV3(next)).ok, true);
  assert.ok('rejected' in saveStudioArrangement('example-0', [], [], 'stale').apply(next));
  assert.ok('rejected' in saveStudioArrangement('example-0', [{ seedId: 'example-1', x: NaN, y: 0 }], placements, 'invalid').apply(next));
  const reset = saveStudioArrangement('example-0', [], placements, 'reset').apply(next);
  assert.ok(!('rejected' in reset));
  assert.deepEqual(reset.studioArrangements, []);
});

test('Studio suggests real excerpts, distinguishes pending and accepted edges, and honors suppression', () => {
  const initial = { ...emptyStoreV3(), ...buildStudioExample(new Date(today)) };
  const index = indexMap(initial.seeds, initial.connections);
  const shortlist = shortlistInsights(index, initial, 'example-0')!;
  const suggestions = rankInsights(shortlist);
  const chosen = suggestions.find(({ to }) => to.id === 'example-9')!;
  assert.equal(chosen.kind, '目的と手がかり');
  assert.equal(chosen.from.body.includes(chosen.evidence[0]), true);
  assert.equal(chosen.to.body.includes(chosen.evidence[1]), true);
  const edgeId = connectionId(chosen.from.id, chosen.to.id);
  const graph = radialGraph(index, chosen.from, { width: 347, height: 285 }, [chosen], false);
  assert.equal(graph.lines.find(({ id }) => id === edgeId)?.suggested, true);
  const dismissed = settleInsight(chosen, 'dismiss', 'decision1', today).apply(initial);
  assert.ok(!('rejected' in dismissed));
  assert.equal(rankInsights(shortlistInsights(index, dismissed, chosen.from.id)!).some(({ to }) => to.id === chosen.to.id), false);
  assert.equal(dismissed.connections.length, initial.connections.length);
  const accepted = settleInsight(chosen, 'connect', 'decision2', today).apply(initial);
  assert.ok(!('rejected' in accepted));
  assert.equal(accepted.connections.length, initial.connections.length + 1);
  assert.equal(accepted.connections.find(({ id }) => id === edgeId)?.note, undefined);
  assert.deepEqual(accepted.seeds, initial.seeds);
  const stale = { ...initial, seeds: initial.seeds.map((seed) => seed.id === chosen.to.id ? { ...seed, body: '別の内容' } : seed) };
  assert.ok('rejected' in settleInsight(chosen, 'connect', 'decision3', today).apply(stale));
  const excluded = { ...initial, permissions: [{ seedId: chosen.to.id, epoch: 0, externalAi: 'deny' as const, discovery: 'exclude' as const, changedAt: today }] };
  assert.equal(shortlistInsights(index, excluded, chosen.to.id), undefined);
  assert.ok('rejected' in settleInsight(chosen, 'connect', 'decision4', today).apply(excluded));
});

test('semantic scores can surface an unrelated vocabulary pair without fabricating quotes', () => {
  const first = buildSeed('first', { body: '厳しい暑さで海面が上昇した。' }, today);
  const second = buildSeed('second', { body: '気候変動により氷河が後退する。' }, today);
  const unrelated = buildSeed('third', { body: '週末に楽器の修理を頼む。' }, today);
  const store = { ...emptyStoreV3(), seeds: [first, second, unrelated] };
  const plan = shortlistInsights(indexMap(store.seeds, []), store, first.id)!;
  assert.deepEqual(rankInsights(plan), []);
  const candidates = rankInsights(plan, plan.ranked.map(({ to }) => to.seed.id === second.id ? 0.88 : 0.42));
  assert.deepEqual(candidates.map(({ to, kind }) => [to.id, kind]), [[second.id, '意味が近い記録']]);
});

test('constellation traces only actual connections and can reveal a member outside the sketch', () => {
  const { seeds, connections } = buildStudioExample(new Date(today));
  const index = indexMap(seeds, connections);
  const groups = constellationGroups(index);
  const group = groups.find(({ seedIds }) => seedIds.includes('example-0'))!;
  const plot = constellationFigure(index, group, 6);
  assert.equal(group.label, '散歩の記録');
  assert.equal(plot.stars[0].id, 'example-0');
  assert.ok(plot.stars.length < group.seedIds.length);
  assert.ok(plot.lines.length >= plot.stars.length - 1);
  assert.ok(plot.lines.every((line) => connections.some(({ id }) => line.id === id)));
  for (const { x, y } of plot.stars) {
    assert.ok(x > 0 && x < 1 && y > 0 && y < 1);
  }
  assert.equal(plot.stars.some(({ id }) => id === 'example-14'), false);
  const revealed = constellationFigure(index, group, 4, 'example-14');
  assert.equal(revealed.stars[0].id, 'example-14');
  assert.ok(revealed.lines.some(({ id }) => id === connectionId('example-14', 'example-3')));
  const isolated = groups.find(({ linked }) => !linked)!;
  assert.deepEqual(constellationFigure(index, isolated, 6).lines, []);
});

test('constellation groups account for undisplayed members and radial emphasis keeps a recorded relation visible', () => {
  const { seeds, connections } = buildStudioExample(new Date(today));
  const index = indexMap(seeds, connections);
  const groups = constellationGroups(index);
  assert.equal(new Set(groups.flatMap(({ seedIds }) => seedIds)).size, seeds.length);
  const first = groups.find(({ seedIds }) => seedIds.includes('example-0'));
  assert.equal(first?.linked, true);
  assert.ok(first?.seedIds.includes('example-14'));
  assert.equal(groups.find(({ seedIds }) => seedIds.includes('example-9'))?.linked, false);
  const focus = index.byId.get('example-0')!;
  const peer = index.byId.get('example-8')!;
  const graph = radialGraph(index, focus, { width: 307, height: 250 }, [], true, peer.id);
  assert.ok(graph.nodes.some(({ seed }) => seed.id === peer.id));
  assert.equal(graph.lines.find(({ id }) => id === connectionId(focus.id, peer.id))?.suggested, false);
  const days = recordDays({ ...emptyStoreV3(), seeds, connections }, index.byId);
  const event = [...days.values()].flat().find((item) => item.id === `edge-${connectionId(focus.id, peer.id)}`);
  assert.ok(event?.kind === 'connection');
  assert.deepEqual(event.pair, [focus.id, peer.id]);
  assert.equal(event.note, '歩いた場所を残す');
});

test('a small radial map reveals an omitted second-hop note beside its actual intermediary', () => {
  const seeds = Array.from({ length: 10 }, (_, i) => buildSeed(`note-${i}`, { body: `メモ${i}` }, today));
  const connections = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 6], [1, 7], [2, 8], [4, 9]]
    .map(([a, b]) => makeConnection(seeds[a].id, seeds[b].id, 'manual', today));
  const index = indexMap(seeds, connections);
  const frame = { width: 294, height: 218 };
  const initial = radialGraph(index, seeds[0], frame, [], true);
  const find = (graph: typeof initial, id: string) => graph.nodes.find(({ seed }) => seed.id === id);
  const onMap = find(initial, 'note-5');
  assert.ok(onMap && onMap.via === 'note-1');
  assert.deepEqual(radialGraph(index, seeds[0], frame, [], true, undefined, 'note-5'), initial);
  assert.equal(find(initial, 'note-9'), undefined);

  const revealed = radialGraph(index, seeds[0], frame, [], true, undefined, 'note-9');
  const chosen = find(revealed, 'note-9');
  const intermediary = find(revealed, 'note-4');
  assert.ok(chosen && intermediary && chosen.via === intermediary.seed.id);
  assert.equal(Math.sign(chosen.x - frame.width / 2), Math.sign(intermediary.x - frame.width / 2));
  assert.equal(revealed.hidden + revealed.nodes.length, seeds.length);
  assert.ok(revealed.lines.some(({ id }) => id === connectionId('note-4', 'note-9')));
  assert.ok(revealed.lines.some(({ id }) => id === connectionId('note-0', 'note-4')));
  assert.ok(!revealed.lines.some(({ id }) => id === connectionId('note-0', 'note-9')));
  for (const [i, node] of revealed.nodes.entries()) {
    assert.ok(node.width >= 44 && node.height >= 44);
    for (const peer of revealed.nodes.slice(i + 1)) {
      assert.ok(Math.abs(node.x - peer.x) >= (node.width + peer.width) / 2 ||
        Math.abs(node.y - peer.y) >= (node.height + peer.height) / 2);
    }
  }
});

test('short Japanese card titles split near a particle when the final line would be cramped', () => {
  assert.equal(studioMapLabel('写真を一枚選ぶ', 6), '写真を\n一枚選ぶ');
  assert.equal(studioMapLabel('写真を一枚選ぶ', 7), '写真を一枚選ぶ');
  assert.equal(studioMapLabel('金木犀', 2), '金\n木犀');
  assert.equal(studioMapLabel('New ideas', 5), 'New ideas');
  assert.equal(studioMapLabel('写真の記録🌱', 4), '写真の記録🌱');
  assert.equal(studioMapLabel('とても長い題名のメモ', 3), 'とても長い題名のメモ');
});

test('Studio preferences and reflections round-trip without requiring new fields in old gardens', () => {
  const empty = emptyStoreV3();
  assert.equal(parseStoreV3(serializeStoreV3(empty)).ok, true);
  const design = saveStudioPreferences({ palette: 'night' }, 'style1').apply(empty);
  assert.ok(!('rejected' in design));
  const view = saveStudioPreferences({ layout: 'constellation' }, 'style2').apply(design);
  assert.ok(!('rejected' in view));
  assert.deepEqual(view.studioPreferences, { palette: 'night', layout: 'constellation' });
  const record = saveReflection('2026-11-03', 'ひとことの振り返り', undefined, 'journal', today).apply(view);
  assert.ok(!('rejected' in record));
  assert.equal(parseStoreV3(serializeStoreV3(record)).ok, true);
  assert.equal(recordDays(record, new Map()).get('2026-11-03')?.[0].kind, 'reflection');
  assert.match(buildPlusTextExport(record), /振り返り.*2026-11-03\n\nひとことの振り返り/u);
  assert.ok('rejected' in saveReflection('2026-11-03', '上書き', undefined, 'journal2', today).apply(record));
  const deleted = saveReflection('2026-11-03', ' ', today, 'journal3', today).apply(record);
  assert.ok(!('rejected' in deleted));
  assert.deepEqual(deleted.reflections, []);
  assert.equal(adjacentMonth('2026-12', 1), '2027-01');
  const february = monthDays('2028-02');
  assert.equal(february.length, 42);
  assert.equal(february.filter(({ inMonth }) => inMonth).length, 29);
});
