import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeConnection } from '../data/gardenModel';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from '../data/gardenV3Model';
import { buildPlusExample } from '../data/plusExample';
import { makeSeed, FakeStorage } from '../data/testSupport';
import { GardenV3Writer } from '../data/gardenV3Writer';
import type { MapScope, MapView } from '../domain/plus/contracts';
import { allNotes, captureMapReturn, focusMap, indexMap, mapGroupLinks, mapGroups, mapInScope, mapViewportBounds, newMapView,
  outsideMap, placeMap, restoreMapReturn, saveMapView } from '../domain/plus/map';
import { routeMapLine } from '../domain/plus/mapGeometry';

const at = '2026-11-27T00:00:00.000Z';
const chain = [makeConnection('A', 'X', 'manual', at), makeConnection('X', 'B', 'manual', at)];
const seeds = ['A', 'X', 'B', 'C'].map((id) => makeSeed(id, { tags: id === 'X' ? ['橋'] : ['風景'] }));

test('PM01/PM15: focus never invents a direct edge or crosses an excluded intermediary', () => {
  const index = indexMap(seeds, chain);
  const full = mapInScope(index, allNotes);
  assert.deepEqual([...focusMap(full, { viewMode: 'neighborhood', centerSeedId: 'A', expandedHop: 2 })].sort(), ['A', 'B', 'X']);
  assert.deepEqual(full.edges, chain);

  const scoped = mapInScope(index, { kind: 'selection', seedIds: ['A', 'B'] });
  assert.deepEqual([...focusMap(scoped, { viewMode: 'neighborhood', centerSeedId: 'A', expandedHop: 2 })], ['A']);
  assert.deepEqual(scoped.edges, []);
  const groups = mapGroups(scoped, []);
  assert.ok(groups.every((group) => group.kind === 'isolated'));
  assert.deepEqual(outsideMap(index, scoped, 'A').map((seed) => seed.id), ['X']);
});

test('PM02/PM05/PM17: filtered views keep manual memberships and existing positions as the garden grows', () => {
  const scope: MapScope = { kind: 'query', query: { ...allNotes.query, tags: ['風景'] } };
  const manual = [{ id: 'first', label: '朝', seedIds: ['A', 'X'], collapsed: true }, { id: 'other', label: '光', seedIds: ['A', 'B'], collapsed: false }];
  const initial = mapInScope(indexMap(seeds, chain), scope);
  const first = mapGroups(initial, manual);
  assert.deepEqual(first.filter((group) => group.kind === 'manual').map((group) => group.seedIds), [['A'], ['A', 'B']]);
  assert.deepEqual(manual[0].seedIds, ['A', 'X']);
  const positions = placeMap(initial, { A: { x: 188, y: 0, pinned: true } }, first);
  const added = makeSeed('D', { tags: ['風景'] });
  const next = mapInScope(indexMap([added, ...seeds], [...chain, makeConnection('A', 'D', 'manual', at)]), scope);
  assert.equal(next.seeds.length, 4);
  const placed = placeMap(next, positions, mapGroups(next, manual));
  for (const key of Object.keys(positions)) assert.deepEqual(placed[key], positions[key]);
  assert.deepEqual(placeMap(next, positions, mapGroups(next, manual), true).A, positions.A);
  assert.deepEqual(mapInScope(indexMap([...seeds, added], chain), { kind: 'selection', seedIds: ['A', 'B'] }).seeds.map((seed) => seed.id), ['A', 'B']);
});

test('PM01/PM02: the overview only connects different memberships with actual confirmed endpoints', () => {
  const graph = mapInScope(indexMap(seeds, [...chain, makeConnection('B', 'C', 'manual', at), makeConnection('A', 'B', 'manual', at)]), allNotes);
  const manual = [
    { id: 'morning', label: '朝', seedIds: ['A', 'X'], collapsed: true },
    { id: 'light', label: '光', seedIds: ['B', 'X'], collapsed: true },
    { id: 'later', label: 'あとで', seedIds: ['C'], collapsed: true },
  ];
  const groups = mapGroups(graph, manual);
  const links = mapGroupLinks(graph.edges, groups);
  assert.deepEqual(links.map(({ groups, edges }) => [groups.map(({ id }) => id), edges.map(({ aSeedId, bSeedId }) => [aSeedId, bSeedId])]), [
    [['manual:later', 'manual:light'], [['B', 'C']]],
    [['manual:light', 'manual:morning'], [['A', 'B']]],
  ]);
  assert.deepEqual(mapGroupLinks(graph.edges, groups, 'manual:morning'), [links[1]]);
  const scoped = mapInScope(indexMap(seeds, graph.edges), { kind: 'selection', seedIds: ['A', 'X', 'C'] });
  assert.deepEqual(mapGroupLinks(scoped.edges, mapGroups(scoped, manual)), []);
});

test('drawn links stop outside cards and can go around a third card', () => {
  const a = { x: 45, y: 65, width: 50, height: 30 };
  const b = { x: 255, y: 65, width: 50, height: 30 };
  const obstacle = { x: 150, y: 65, width: 50, height: 30 };
  const frame = { width: 300, height: 130 };
  assert.deepEqual(routeMapLine(a, b, [a, b], frame), [{ start: { x: 72, y: 65 }, end: { x: 228, y: 65 } }]);
  const route = routeMapLine(a, b, [a, b, obstacle], frame);
  assert.equal(route.length, 3);
  assert.equal(route[0].end.y, route[2].start.y);
  assert.ok(Math.abs(route[1].start.y - obstacle.y) > obstacle.height / 2);
  assert.deepEqual(routeMapLine(a, b, [a, b, { ...obstacle, height: frame.height }], frame), []);
});

test('pan bounds are limited to the current drawing, including negative and saved coordinates', () => {
  const positions = { A: { x: -188, y: 126, pinned: true }, B: { x: 10, y: 8, pinned: false }, C: { x: 1000, y: 400, pinned: false } };
  assert.deepEqual(mapViewportBounds(new Set(['A', 'B', 'missing']), positions), { left: -188, right: 10, top: 8, bottom: 126 });
  assert.equal(mapViewportBounds(new Set(['missing']), positions), undefined);
});

test('PM10/PM16: restore retains unsaved or saved display state and never rewinds a newer saved revision', () => {
  const view: MapView = { ...newMapView('map', at), revision: 2, scope: { kind: 'selection', seedIds: ['A', 'B'] },
    viewport: { x: 90, y: 350, scale: 1.18 }, selectedSeedId: 'A', searchText: '雨', expandedGroupIds: ['manual:first'],
    viewMode: 'neighborhood', centerSeedId: 'A', expandedHop: 2 };
  const context = captureMapReturn(view, [view], 184);
  const current = { ...view, revision: 3, scope: allNotes };
  const restored = restoreMapReturn(context, [current], 'temporary-view', at);
  assert.equal(restored.changed, true);
  assert.equal(restored.view.id, 'temporary-view');
  assert.deepEqual(restored.view.scope, view.scope);
  assert.deepEqual(restored.view.viewport, view.viewport);
  assert.equal(restored.view.selectedSeedId, 'A');
  assert.equal(restored.view.searchText, '雨');
  assert.equal(restored.scroll, 184);
  assert.deepEqual(current.scope, allNotes);

  const unsaved = captureMapReturn(view, []);
  assert.equal(restoreMapReturn(unsaved, [], 'fallback', at).view.id, view.id);
  assert.equal(restoreMapReturn(context, [view], 'fallback', at).view.id, view.id);
});

test('map saves preserve core edges, reject stale revisions and read back the saved viewport', async () => {
  const store = { ...emptyStoreV3(), seeds, connections: chain };
  const writer = new GardenV3Writer(new FakeStorage(), store);
  const view = { ...newMapView('map', at), name: '見たい範囲', selectedSeedId: 'X', viewport: { x: 100, y: 400, scale: 1 } };
  const save = saveMapView('save', view);
  assert.equal((await writer.run(save)).ok, true);
  assert.equal((await writer.run(save)).ok, true);
  assert.equal((await writer.run(saveMapView('older-edit', { ...view, name: '競合した名前' }))).ok, false);
  const loaded = parseStoreV3(serializeStoreV3(writer.getSnapshot()));
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.store.mapViews[0].viewport, view.viewport);
  assert.equal(loaded.store.mapViews.length, 1);
  assert.deepEqual(loaded.store.connections, chain.map((edge) => JSON.parse(JSON.stringify(edge))));
});

test('PM08: all notes stay reachable at four data sizes with a high-degree focus', (t) => {
  for (const size of [50, 500, 2000, 5000]) {
    const fixture = buildPlusExample(size);
    const start = performance.now();
    const graph = mapInScope(indexMap(fixture.seeds, fixture.connections), allNotes);
    const groups = mapGroups(graph, fixture.displayGroups);
    const positions = placeMap(graph, {}, groups);
    const focused = focusMap(graph, { viewMode: 'neighborhood', centerSeedId: 'example-0', expandedHop: 1 });
    t.diagnostic(`${size} seeds / ${fixture.connections.length} edges / ${focused.size} focused seeds: ${(performance.now() - start).toFixed(1)} ms (Node)`);
    assert.equal(Object.keys(positions).length, size);
    assert.equal(graph.seeds.length, size);
    assert.equal(focused.size, Math.min(size, 309) - 6);
  }
});
