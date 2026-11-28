import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeed } from '../domain/gardenCommands';
import { rankInsights, settleInsight, shortlistInsights } from '../domain/plus/insights';
import { indexMap } from '../domain/plus/map';
import { adjacentMonth, monthDays, recordDays, saveReflection, saveStudioPreferences } from '../domain/plus/studio';
import { constellationGraph, radialGraph } from '../domain/plus/studioGraph';
import { buildPlusTextExport } from '../utils/plusExport';
import { connectionId } from './gardenModel';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from './gardenV3Model';
import { buildStudioExample } from './plusExample';

const today = '2026-11-28T03:00:00.000Z';

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

test('constellation draws only present connections and leaves all undisplayed notes counted', () => {
  const { seeds, connections } = buildStudioExample(new Date(today));
  const index = indexMap(seeds, connections);
  const plot = constellationGraph(index, seeds[0], { width: 321, height: 275 });
  assert.equal(plot.hidden + plot.nodes.length, seeds.length);
  assert.ok(plot.nodes.some(({ seed }) => seed.id === seeds[0].id));
  assert.ok(plot.lines.length > 0 && plot.lines.every((line) => connections.some(({ id }) => line.id === id)));
  for (const node of plot.nodes) {
    assert.ok(node.x - node.width / 2 >= 0 && node.x + node.width / 2 <= 321);
    assert.ok(node.y - node.height / 2 >= 0 && node.y + node.height / 2 <= 275);
  }
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
