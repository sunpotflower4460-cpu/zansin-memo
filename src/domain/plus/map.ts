import type { PlusCommand } from '../../data/gardenV3Writer';
import type { Seed, SeedConnection } from '../types';
import { buildAdjacency } from '../../utils/links';
import { normalizeSearchText, searchableText } from '../../utils/seedText';
import type { MapFocus, MapReturnContext, MapScope, MapView } from './contracts';

export const allNotes: Extract<MapScope, { kind: 'query' }> = {
  kind: 'query', query: { queryVersion: 1, text: '', tags: [], tagMode: 'any', growthStates: [], connection: 'all' },
};

export function indexMap(seeds: Seed[], connections: SeedConnection[]) {
  const live = seeds.filter((seed) => !seed.deletedAt);
  const byId = new Map(live.map((seed) => [seed.id, seed]));
  const edges = connections.filter((edge) => byId.has(edge.aSeedId) && byId.has(edge.bSeedId));
  return { live, byId, edges, adjacent: buildAdjacency(live, edges) };
}
export type MapIndex = ReturnType<typeof indexMap>;

function queryMatches(seed: Seed, query: Extract<MapScope, { kind: 'query' }>['query'], text: string, linked: boolean): boolean {
  if (text && !searchableText(seed).includes(text)) return false;
  if (query.growthStates.length && !query.growthStates.includes(seed.growthState)) return false;
  if (query.hasSynthesis !== undefined && Boolean(seed.synthesis) !== query.hasSynthesis) return false;
  if (query.connection !== 'all' && linked !== (query.connection === 'linked')) return false;
  if (!query.tags.length) return true;
  return query.tagMode === 'any' ? query.tags.some((tag) => seed.tags.includes(tag)) : query.tags.every((tag) => seed.tags.includes(tag));
}

export function mapInScope(index: MapIndex, scope: MapScope) {
  let seeds: Seed[];
  let missing = 0;
  if (scope.kind === 'selection') {
    const ids = [...new Set(scope.seedIds)];
    seeds = ids.flatMap((id) => index.byId.get(id) ?? []);
    missing = ids.length - seeds.length;
  } else {
    const query = scope.query;
    const text = normalizeSearchText(query.text.trim());
    seeds = index.live.filter((seed) => queryMatches(seed, query, text, Boolean(index.adjacent.get(seed.id)?.size)));
  }
  const byId = new Map(seeds.map((seed) => [seed.id, seed]));
  const edges = index.edges.filter((edge) => byId.has(edge.aSeedId) && byId.has(edge.bSeedId));
  const adjacent = buildAdjacency(seeds, edges);
  return { seeds, byId, edges, adjacent, missing };
}
export type ScopedMap = ReturnType<typeof mapInScope>;

export function focusMap(graph: ScopedMap, focus: MapFocus): Set<string> {
  if (focus.viewMode === 'overview') return new Set(graph.byId.keys());
  const center = focus.centerSeedId;
  if (!graph.byId.has(center)) return new Set();
  const visible = new Set([center]);
  let frontier = [center];
  for (let depth = 0; depth < focus.expandedHop && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of graph.adjacent.get(id) ?? []) {
        if (visible.has(neighbor)) continue;
        visible.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return visible;
}

export function outsideMap(index: MapIndex, graph: ScopedMap, seedId: string): Seed[] {
  return [...index.adjacent.get(seedId) ?? []].flatMap((id) => graph.byId.has(id) ? [] : index.byId.get(id) ?? []);
}

export type MapGroup = { id: string; label: string; kind: 'connections' | 'manual' | 'isolated'; seedIds: string[]; collapsed: boolean };

export function mapGroups(graph: ScopedMap, manual: MapView['displayGroups']): MapGroup[] {
  const groups = manual.map<MapGroup>((group) => ({
    id: `manual:${group.id}`, label: group.label || '名前のないまとまり', kind: 'manual', collapsed: group.collapsed,
    seedIds: [...new Set(group.seedIds)].filter((id) => graph.byId.has(id)),
  })).filter((group) => group.seedIds.length > 0);
  const visited = new Set<string>();
  const isolated: string[] = [];
  let number = 0;
  for (const id of [...graph.byId.keys()].sort()) {
    if (visited.has(id)) continue;
    if (!graph.adjacent.get(id)?.size) { isolated.push(id); continue; }
    const queue = [id];
    visited.add(id);
    for (let i = 0; i < queue.length; i++) {
      for (const neighbor of graph.adjacent.get(queue[i]) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    number++;
    groups.push({ id: `connections:${id}`, label: `接続のまとまり ${number}`, kind: 'connections', seedIds: queue, collapsed: true });
  }
  if (isolated.length) groups.push({ id: 'isolated', label: 'つながりのない種', kind: 'isolated', seedIds: isolated, collapsed: true });
  return groups;
}

export function mapGroupLinks(edges: readonly SeedConnection[], groups: readonly MapGroup[], fromGroupId?: string) {
  const memberships = new Map<string, Set<MapGroup>>();
  for (const group of groups) {
    if (group.kind !== 'manual') continue;
    for (const id of group.seedIds) {
      const existing = memberships.get(id) ?? new Set<MapGroup>();
      existing.add(group);
      memberships.set(id, existing);
    }
  }
  const links = new Map<string, { groups: [MapGroup, MapGroup]; edges: SeedConnection[] }>();
  for (const edge of edges) {
    const a = memberships.get(edge.aSeedId);
    const b = memberships.get(edge.bSeedId);
    if (!a || !b) continue;
    for (const first of a) {
      if (b.has(first)) continue;
      for (const second of b) {
        // Shared membership alone is not a connection between these two groups.
        if (a.has(second) || (fromGroupId && first.id !== fromGroupId && second.id !== fromGroupId)) continue;
        const pair: [MapGroup, MapGroup] = first.id < second.id ? [first, second] : [second, first];
        const key = JSON.stringify(pair.map(({ id }) => id));
        const link = links.get(key);
        if (link) link.edges.push(edge);
        else links.set(key, { groups: pair, edges: [edge] });
      }
    }
  }
  return [...links.values()];
}

export const mapCell = { x: 188, y: 126 };
export function placeMap(graph: ScopedMap, previous: MapView['positions'], groups: MapGroup[], arrange = false): MapView['positions'] {
  const positions = new Map(Object.entries(previous).filter(([id, pos]) => !arrange || pos.pinned || !graph.byId.has(id)));
  const cellKey = (x: number, y: number) => `${Math.round(x / mapCell.x)},${Math.round(y / mapCell.y)}`;
  const occupied = new Set([...positions.values()].map(({ x, y }) => cellKey(x, y)));
  const order = new Set(groups.filter((group) => group.kind !== 'manual').flatMap((group) => group.seedIds));
  let slot = 0;
  for (const id of order) {
    if (positions.has(id)) continue;
    const neighbor = [...graph.adjacent.get(id) ?? []].map((key) => positions.get(key)).find(Boolean);
    const nearby = neighbor && [[mapCell.x, 0], [0, mapCell.y], [-mapCell.x, 0], [0, -mapCell.y]]
      .map(([dx, dy]) => ({ x: neighbor.x + dx, y: neighbor.y + dy }))
      .find(({ x, y }) => x >= 0 && y >= 0 && !occupied.has(cellKey(x, y)));
    let pos = nearby;
    while (!pos) {
      const x = slot % 5 * mapCell.x;
      const y = Math.floor(slot / 5) * mapCell.y;
      slot++;
      if (!occupied.has(cellKey(x, y))) pos = { x, y };
    }
    positions.set(id, { ...pos, pinned: false });
    occupied.add(cellKey(pos.x, pos.y));
  }
  return Object.fromEntries(positions);
}

export const newMapView = (id: string, updatedAt: string): MapView => ({
  id, revision: 0, updatedAt, viewMode: 'overview', scope: allNotes, layoutVersion: 1,
  positions: {}, displayGroups: [], viewport: { x: 0, y: 0, scale: 0.75 }, presentation: 'plot',
});

export const mapFocus = (view: MapView): MapFocus => view.viewMode === 'overview'
  ? { viewMode: 'overview' }
  : { viewMode: 'neighborhood', centerSeedId: view.centerSeedId, expandedHop: view.expandedHop };

export function mapViewportBounds(ids: ReadonlySet<string>, positions: MapView['positions']) {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const id of ids) {
    if (!Object.hasOwn(positions, id)) continue;
    const { x, y } = positions[id];
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return Number.isFinite(left) ? { left, right, top, bottom } : undefined;
}

export function captureMapReturn(view: MapView, saved: readonly MapView[], scroll = 0): MapReturnContext {
  const isSaved = saved.some(({ id, revision }) => id === view.id && revision === view.revision);
  return {
    origin: isSaved ? { kind: 'saved', mapViewId: view.id, mapRevision: view.revision } : { kind: 'unsaved', localViewId: view.id, localRevision: view.revision },
    scope: view.scope, focus: mapFocus(view), layoutSnapshot: { layoutVersion: view.layoutVersion, positions: view.positions, displayGroups: view.displayGroups },
    viewport: view.viewport, expandedGroupIds: view.expandedGroupIds ?? [], selectedSeedIds: view.selectedSeedId ? [view.selectedSeedId] : [],
    navigationTrail: [], focusedControlId: view.selectedSeedId, listScrollOffset: scroll, searchText: view.searchText, presentation: view.presentation,
  };
}

export function restoreMapReturn(context: MapReturnContext, saved: readonly MapView[], fallbackId: string, at: string) {
  const origin = context.origin;
  const current = origin.kind === 'saved' ? saved.find((view) => view.id === origin.mapViewId) : undefined;
  const savedMatch = origin.kind === 'saved' && current?.revision === origin.mapRevision;
  const changed = origin.kind === 'saved' && !savedMatch;
  const view: MapView = {
    id: changed ? fallbackId : origin.kind === 'saved' ? origin.mapViewId : origin.localViewId,
    revision: changed ? 0 : origin.kind === 'saved' ? origin.mapRevision : origin.localRevision,
    name: savedMatch ? current?.name : undefined, updatedAt: at, ...context.focus, ...context.layoutSnapshot,
    scope: context.scope, viewport: context.viewport, expandedGroupIds: context.expandedGroupIds,
    selectedSeedId: context.selectedSeedIds[0], searchText: context.searchText, presentation: context.presentation,
  };
  return { changed, view, scroll: context.listScrollOffset ?? 0 };
}

export function saveMapView(commandId: string, view: MapView): PlusCommand {
  return {
    id: commandId,
    apply: (store) => {
      const current = store.mapViews.find((entry) => entry.id === view.id);
      if (current?.revision === view.revision + 1 && current.updatedAt === view.updatedAt && JSON.stringify(current) === JSON.stringify({ ...view, revision: current.revision })) return store;
      if ((current?.revision ?? 0) !== view.revision) return { rejected: '保存した見方に更新があります' };
      const revised = { ...view, revision: view.revision + 1 };
      return { ...store, mapViews: current ? store.mapViews.map((entry) => entry.id === view.id ? revised : entry) : [...store.mapViews, revised] };
    },
  };
}
