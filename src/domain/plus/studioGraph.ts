import { connectionId } from '../../data/gardenModel';
import { toSeedSnippet } from '../../utils/seedText';
import type { Seed } from '../types';
import type { StudioPlacement } from './contracts';
import type { Suggestion } from './insights';
import { mapGroups, type MapIndex } from './map';

type Size = { width: number; height: number };
type Cell = { x: number; y: number; width: number; height: number };
export type StudioNode = Cell & { seed: Seed; isCenter: boolean; suggested: boolean; via?: string };
type Node = StudioNode;
type Line = { id: string; a: Node; b: Node; suggested: boolean };
export type StudioGraph = { nodes: Node[]; lines: Line[]; hidden: number; scope: number };
export type ConstellationGroup = { id: string; label: string; seedIds: string[]; linked: boolean };
type Star = { id: string; x: number; y: number; anchor: boolean };
export type ConstellationFigure = { stars: Star[]; lines: { id: string; a: Star; b: Star }[] };
export type RadialNeighbor = { id: string; via?: string };
export type RadialNeighborhood = { direct: string[]; second: RadialNeighbor[] };

type Point = Pick<Cell, 'x' | 'y'>;

export function clampStudioPosition(node: StudioNode, { width, height }: Size, { x, y }: Point): Point {
  const marginX = Math.min(width / 2, 8 + node.width / 2);
  const marginY = Math.min(height / 2, 55 + node.height / 2);
  return {
    x: Math.max(marginX, Math.min(width - marginX, x)),
    y: Math.max(marginY, Math.min(height - marginY, y)),
  };
}

function overlaps(a: Cell, b: Cell, clearance = 0) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + clearance &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + clearance;
}

export function canPlaceStudioNode(graph: StudioGraph, node: StudioNode, point: Point) {
  const candidate = { ...node, ...point };
  return !graph.nodes.some((peer) => peer.seed.id !== node.seed.id && overlaps(peer, candidate, 4));
}

export function withStudioNodes(graph: StudioGraph, nodes: StudioNode[]): StudioGraph {
  const lookup = new Map(nodes.map((node) => [node.seed.id, node]));
  return { ...graph, nodes, lines: graph.lines.map((line) => ({
    ...line, a: lookup.get(line.a.seed.id)!, b: lookup.get(line.b.seed.id)!,
  })) };
}

export function placeStudioNodes(graph: StudioGraph, frame: Size, placements: readonly StudioPlacement[]): StudioGraph {
  if (!placements.length) return graph;
  const offsets = new Map(placements.map((point) => [point.seedId, point]));
  const nodes = graph.nodes.map((node) => {
    const delta = offsets.get(node.seed.id);
    return delta ? { ...node, ...clampStudioPosition(node, frame, { x: node.x + delta.x * frame.width, y: node.y + delta.y * frame.height }) } : node;
  });
  // The same arrangement can be opened with less room. Keep every card reachable
  // by restoring the automatic position of displaced cards that would overlap.
  let conflict = true;
  while (conflict) {
    conflict = false;
    nodes.forEach((node, i) => {
      if (node === graph.nodes[i]) return;
      if (nodes.some((other, j) => j !== i && overlaps(node, other))) {
        nodes[i] = graph.nodes[i];
        conflict = true;
      }
    });
  }
  return withStudioNodes(graph, nodes);
}

export function studioMapLabel(title: string, columns: number): string {
  if (columns < 2 || !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー]+$/u.test(title)) return title;
  const letters = [...title];
  if (letters.length <= columns || letters.length > 2 * columns) return title;
  const middle = letters.length / 2;
  const split = Math.floor(middle);
  const afterParticle = [split, split + 1, split - 1].find((i) => i >= letters.length - columns && i <= columns
    && /[をとのがにではへ]/u.test(letters[i - 1]));
  const at = afterParticle ?? split;
  return `${letters.slice(0, at).join('')}\n${letters.slice(at).join('')}`;
}

function linkGraph(index: MapIndex, nodes: Node[], suggestions: Suggestion[]) {
  const lookup = new Map(nodes.map((node) => [node.seed.id, node]));
  const lines: Line[] = [];
  for (const edge of index.edges) {
    const a = lookup.get(edge.aSeedId);
    const b = lookup.get(edge.bSeedId);
    if (a && b) lines.push({ id: edge.id, a, b, suggested: false });
  }
  const confirmed = new Set(lines.map(({ id }) => id));
  for (const { from, to } of suggestions) {
    const a = lookup.get(from.id);
    const b = lookup.get(to.id);
    const id = connectionId(from.id, to.id);
    if (a && b && !confirmed.has(id)) lines.push({ id, a, b, suggested: true });
  }
  return lines;
}

export function radialNeighbors(index: MapIndex, center: Seed): RadialNeighborhood {
  const direct = [...index.adjacent.get(center.id) ?? []];
  const degree = (id: string) => index.adjacent.get(id)?.size ?? 0;
  direct.sort((a, b) => degree(b) - degree(a) || a.localeCompare(b, undefined, { numeric: true }));
  const named = new Set<string>();
  const repetitive: string[] = [];
  const distinct = direct.filter((id) => {
    const title = index.byId.get(id)?.title?.replace(/[\s\d０-９]+$/gu, '');
    if (!title) return true;
    if (named.has(title)) { repetitive.push(id); return false; }
    named.add(title);
    return true;
  });
  const branches = [...distinct, ...repetitive];
  const visited = new Set([center.id, ...branches]);
  const second: RadialNeighbor[] = [];
  for (const via of branches) {
    for (const id of index.adjacent.get(via) ?? []) {
      if (visited.has(id)) continue;
      visited.add(id);
      second.push({ id, via });
    }
  }
  return { direct: branches, second };
}

function mapColumns(direct: string[], hints: readonly string[], second: RadialNeighbor[], perSide: number, focus?: string, reveal?: string) {
  const revealed = second.find(({ id }) => id === reveal);
  const primaryIds = new Set([...direct, ...hints]);
  const priorities = [focus, revealed?.via ?? reveal].flatMap((id) => id && primaryIds.has(id) ? [id] : []);
  const primaryLimit = perSide * 2 - (perSide > 1 && second.length ? 2 : 0);
  const preferActual = hints.length ? Math.max(1, primaryLimit - 2) : primaryLimit;
  const ordered = [...new Set([...priorities, ...direct.slice(0, preferActual), ...hints, ...direct])];
  const primary = ordered.slice(0, primaryLimit);
  const columns: RadialNeighbor[][] = [[], []];
  primary.forEach((id, i) => columns[i % 2].push({ id }));
  const next = revealed ? [revealed, ...second.filter(({ id }) => id !== reveal)] : second;
  for (const child of next) {
    const column = columns.find((items) => items.length < perSide && items.some(({ id }) => id === child.via));
    if (column) {
      let position = column.findIndex(({ id }) => id === child.via) + 1;
      while (position < column.length && column[position].via === child.via) position++;
      column.splice(position, 0, child);
    }
    if (columns.every((items) => items.length === perSide)) break;
  }
  for (const id of ordered.slice(primaryLimit)) {
    const column = columns.find((items) => items.length < perSide);
    if (!column) break;
    column.push({ id });
  }
  return columns;
}

export function radialGraph(index: MapIndex, center: Seed, { width, height }: Size, suggestions: readonly Suggestion[], expanded: boolean,
  emphasisId?: string, selectedId?: string, neighborhood = radialNeighbors(index, center)): StudioGraph {
  const direct = new Set(neighborhood.direct);
  const hints = suggestions.filter(({ from, to }) => from.id === center.id && index.byId.has(to.id) && !direct.has(to.id));
  const hintIds = new Set(hints.map(({ to }) => to.id));
  const second = expanded ? neighborhood.second.filter(({ id }) => !hintIds.has(id)) : [];
  const centerY = (height - 4) / 2;
  const available = Math.max(0, Math.min(centerY - 76, height - 77 - centerY));
  const perSide = Math.min(4, 1 + Math.floor(available * 2 / 54));
  let columns = mapColumns(neighborhood.direct, [...hintIds], second, perSide, emphasisId);
  if (selectedId && selectedId !== center.id && !columns.some((column) => column.some(({ id }) => id === selectedId)) &&
      (direct.has(selectedId) || hintIds.has(selectedId) || second.some(({ id }) => id === selectedId))) {
    columns = mapColumns(neighborhood.direct, [...hintIds], second, perSide, emphasisId, selectedId);
  }
  const nodes: Node[] = [{
    seed: center, x: width / 2, y: centerY, width: Math.min(205, width * 0.34), height: 70, isCenter: true, suggested: false,
  }];
  for (const side of [0, 1]) {
    const group = columns[side];
    const spacing = Math.min(124, 2 * available / Math.max(1, group.length - 1));
    group.forEach(({ id, via }, i) => {
      const seed = index.byId.get(id);
      if (!seed) return;
      const column = via ? 0.16 : 0.167;
      nodes.push({ seed, x: width * (side ? 1 - column : column), y: centerY + (i - (group.length - 1) / 2) * spacing,
        width: Math.min(167, width * (via ? 0.264 : 0.283)), height: via ? 44 : 48,
        isCenter: false, suggested: hintIds.has(id), via });
    });
  }
  const scope = direct.size + hintIds.size + second.length + 1;
  return { nodes, lines: linkGraph(index, nodes, hints), hidden: scope - nodes.length, scope };
}

export function constellationGroups(index: MapIndex): ConstellationGroup[] {
  const groups = mapGroups({ ...index, seeds: index.live, missing: 0 }, []);
  return groups.map(({ id, seedIds, kind }) => {
    const linked = kind === 'connections';
    const ordered = linked ? [...seedIds].sort((a, b) => (index.adjacent.get(b)?.size ?? 0) - (index.adjacent.get(a)?.size ?? 0) || a.localeCompare(b)) : seedIds;
    return { id, label: linked ? toSeedSnippet(index.byId.get(ordered[0])!, 35) : 'つながりのないメモ', seedIds: ordered, linked };
  }).sort((a, b) => Number(b.linked) - Number(a.linked) || b.seedIds.length - a.seedIds.length || a.id.localeCompare(b.id));
}

const starSlots = [[0.50, 0.47], [0.14, 0.20], [0.78, 0.14], [0.87, 0.62], [0.52, 0.88], [0.16, 0.77]] as const;

export function constellationFigure(index: MapIndex, group: ConstellationGroup, limit: number, around = group.seedIds[0]): ConstellationFigure {
  const anchor = group.seedIds.includes(around) ? around : group.seedIds[0];
  const size = Math.min(limit, starSlots.length, group.seedIds.length);
  if (size < 1) return { stars: [], lines: [] };
  const chosen = new Set([anchor]);
  if (group.linked) {
    // A partial figure stays connected by walking actual neighbors out from its anchor.
    for (const id of chosen) {
      if (chosen.size >= size) break;
      const neighbors = [...index.adjacent.get(id) ?? []].sort((a, b) =>
        (index.adjacent.get(b)?.size ?? 0) - (index.adjacent.get(a)?.size ?? 0) || a.localeCompare(b, undefined, { numeric: true }));
      for (const peer of neighbors) {
        chosen.add(peer);
        if (chosen.size >= size) break;
      }
    }
  } else {
    for (const id of group.seedIds) {
      if (chosen.size >= size) break;
      chosen.add(id);
    }
  }
  const flip = Array.from(group.id).reduce((total, letter) => total + letter.charCodeAt(0), 0) % 4;
  const slots = chosen.size === 1 ? [[0.5, 0.5]] : chosen.size === 2 ? [[0.28, 0.68], [0.73, 0.27]]
    : chosen.size === 3 ? [[0.48, 0.76], [0.19, 0.27], [0.81, 0.19]] : starSlots;
  const stars = Array.from(chosen, (id, i) => {
    const [x, y] = slots[i];
    return { id, x: flip % 2 ? 1 - x : x, y: flip > 1 ? 1 - y : y, anchor: id === anchor };
  });
  const lines = stars.flatMap((a, i) => stars.slice(i + 1).flatMap((b) =>
    index.adjacent.get(a.id)?.has(b.id) ? [{ id: connectionId(a.id, b.id), a, b }] : []));
  return { stars, lines };
}
