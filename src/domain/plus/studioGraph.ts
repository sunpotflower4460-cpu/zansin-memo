import { connectionId } from '../../data/gardenModel';
import { toSeedSnippet } from '../../utils/seedText';
import type { Seed } from '../types';
import type { Suggestion } from './insights';
import { mapGroups, type MapIndex } from './map';

type Size = { width: number; height: number };
type Cell = { x: number; y: number; width: number; height: number };
type Node = Cell & { seed: Seed; group: number; isCenter: boolean; suggested: boolean; via?: string };
type Line = { id: string; a: Node; b: Node; suggested: boolean };
type Island = Cell & { group: number };
export type StudioGraph = { nodes: Node[]; lines: Line[]; islands: Island[]; hidden: number; scope: number };
export type ConstellationGroup = { id: string; label: string; seedIds: string[]; linked: boolean };
export type RadialNeighbor = { id: string; via?: string };
export type RadialNeighborhood = { direct: string[]; second: RadialNeighbor[] };

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
    seed: center, x: width / 2, y: centerY, width: Math.min(205, width * 0.34), height: 70, group: 0, isCenter: true, suggested: false,
  }];
  for (const side of [0, 1]) {
    const group = columns[side];
    const spacing = Math.min(124, 2 * available / Math.max(1, group.length - 1));
    group.forEach(({ id, via }, i) => {
      const seed = index.byId.get(id);
      if (!seed) return;
      const column = via ? 0.16 : 0.167;
      nodes.push({ seed, x: width * (side ? 1 - column : column), y: centerY + (i - (group.length - 1) / 2) * spacing,
        width: Math.min(167, width * (via ? 0.264 : 0.283)), height: via ? 44 : 48, group: side + 1,
        isCenter: false, suggested: hintIds.has(id), via });
    });
  }
  const scope = direct.size + hintIds.size + second.length + 1;
  return { nodes, lines: linkGraph(index, nodes, hints), islands: [], hidden: scope - nodes.length, scope };
}

export function constellationGroups(index: MapIndex): ConstellationGroup[] {
  const groups = mapGroups({ ...index, seeds: index.live, missing: 0 }, []);
  return groups.map(({ id, seedIds, kind }) => {
    const linked = kind === 'connections';
    const ordered = linked ? [...seedIds].sort((a, b) => (index.adjacent.get(b)?.size ?? 0) - (index.adjacent.get(a)?.size ?? 0) || a.localeCompare(b)) : seedIds;
    return { id, label: linked ? `「${toSeedSnippet(index.byId.get(ordered[0])!, 19)}」のまとまり` : 'つながりのないメモ', seedIds: ordered, linked };
  }).sort((a, b) => Number(b.linked) - Number(a.linked) || b.seedIds.length - a.seedIds.length || a.id.localeCompare(b.id));
}

export function constellationGraph(index: MapIndex, center: Seed, { width, height }: Size, groups = constellationGroups(index)): StudioGraph {
  const components = groups.flatMap<{ ids: string[]; linked: boolean }>(({ seedIds, linked }) => linked ? [{ ids: seedIds, linked }]
    : Array.from({ length: Math.ceil(seedIds.length / 3) }, (_, i) => ({ ids: seedIds.slice(i * 3, i * 3 + 3), linked })));
  const columns = width > 540 ? 3 : 2;
  const anchor = components.find((group) => group.ids.includes(center.id));
  const visible = (anchor ? [anchor, ...components.filter((group) => group !== anchor)] : components).slice(0, columns * (height < 240 ? 1 : 2));
  const columnsUsed = Math.min(columns, visible.length || 1);
  const columnWidth = (width - 26) / columnsUsed;
  const rows = Math.max(1, Math.ceil(visible.length / columns));
  const rowHeight = (height - 106) / rows;
  const islands: Island[] = [];
  const nodes = visible.flatMap(({ ids, linked }, groupIndex) => {
    const start = ids.includes(center.id) ? center.id : ids[0];
    // Extend the preview along real links from its representative, so a visible
    // component still reads as connected when most of its members are omitted.
    const walk = new Set([start]);
    if (linked) for (const id of walk) {
      for (const peer of index.adjacent.get(id) ?? []) walk.add(peer);
      if (walk.size >= 3) break;
    }
    const ranked = [...new Set([...walk, ...ids])];
    const clusterX = 13 + (groupIndex % columns + 0.5) * columnWidth;
    const clusterY = 54 + (Math.floor(groupIndex / columns) + 0.5) * rowHeight;
    const count = Math.min(rowHeight >= 90 ? 3 : 2, ranked.length);
    const pillWidth = Math.min(133, columnWidth * 0.461);
    const spread = Math.min(73, columnWidth * 0.241);
    if (count > 1 && linked) islands.push({ x: clusterX, y: clusterY, width: columnWidth - 9, height: rowHeight - 6, group: groupIndex });
    return ranked.slice(0, count).map((id, i): Node => ({
      seed: index.byId.get(id)!, x: clusterX + (count === 1 || i === 2 ? 0 : i === 0 ? -spread : spread),
      y: clusterY + (count < 3 ? (count === 1 ? 0 : i === 0 ? -13 : 13) : i === 2 ? 23 : -23),
      width: pillWidth, height: 44, group: groupIndex, isCenter: id === center.id, suggested: false,
    }));
  });
  return { nodes, lines: linkGraph(index, nodes, []), islands, hidden: index.live.length - nodes.length, scope: index.live.length };
}
