import { connectionId } from '../../data/gardenModel';
import type { Seed } from '../types';
import type { Suggestion } from './insights';
import { mapGroups, type MapIndex } from './map';

type Size = { width: number; height: number };
type Cell = { x: number; y: number; width: number; height: number };
type Node = Cell & { seed: Seed; group: number; isCenter: boolean; suggested: boolean };
type Line = { id: string; a: Node; b: Node; suggested: boolean };
type Island = Cell & { group: number };
export type StudioGraph = { nodes: Node[]; lines: Line[]; islands: Island[]; hidden: number; scope: number };

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

export function radialGraph(index: MapIndex, center: Seed, { width, height }: Size, suggestions: Suggestion[], expanded: boolean): StudioGraph {
  const direct = [...index.adjacent.get(center.id) ?? []];
  const directIds = new Set(direct);
  const indirect = new Set<string>();
  if (expanded) {
    for (const id of direct) for (const next of index.adjacent.get(id) ?? []) {
      if (next !== center.id && !directIds.has(next)) indirect.add(next);
    }
  }
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
  const hints = suggestions.filter(({ from, to }) => from.id === center.id && index.byId.has(to.id) && !directIds.has(to.id));
  const hintIds = new Set(hints.map(({ to }) => to.id));
  const branchCount = Math.min(8, Math.max(4, Math.floor((height - 90) / 60) * 2));
  const directVisible = branches.slice(0, Math.max(1, branchCount - (hints.length ? 2 : 0) - (indirect.size ? 2 : 0)));
  const nearIndirect = directVisible.flatMap((id) => [...index.adjacent.get(id) ?? []].filter((peer) => indirect.has(peer)));
  const ordered = [...new Set([...directVisible, ...hintIds, ...nearIndirect, ...distinct, ...repetitive, ...indirect])];
  const ids = ordered.slice(0, branchCount);
  const centerY = (height - 20) / 2;
  const nodes: Node[] = [{
    seed: center, x: width / 2, y: centerY, width: Math.min(186, width * 0.35), height: 72, group: 0, isCenter: true, suggested: false,
  }];
  for (const side of [0, 1]) {
    const group = ids.filter((_, i) => i % 2 === side);
    const available = Math.min(centerY - 50, height - 81 - centerY);
    const spacing = Math.min(142, 2 * available / Math.max(1, group.length - 1));
    group.forEach((id, i) => {
      const seed = index.byId.get(id);
      if (!seed) return;
      nodes.push({ seed, x: width * (side ? 0.837 : 0.163), y: centerY + (i - (group.length - 1) / 2) * spacing,
        width: Math.min(154, width * 0.255), height: 53, group: side + 1, isCenter: false, suggested: hintIds.has(id) });
    });
  }
  return { nodes, lines: linkGraph(index, nodes, hints), islands: [], hidden: ordered.length - ids.length, scope: ordered.length + 1 };
}

export function constellationGraph(index: MapIndex, center: Seed, { width, height }: Size): StudioGraph {
  const groups = mapGroups({ ...index, seeds: index.live, missing: 0 }, []);
  const components = groups.flatMap((group) => group.kind === 'isolated'
    ? Array.from({ length: Math.ceil(group.seedIds.length / 3) }, (_, i) => ({ ids: group.seedIds.slice(i * 3, i * 3 + 3), linked: false }))
    : [{ ids: group.seedIds, linked: true }]);
  const columns = width > 540 ? 3 : 2;
  const anchor = components.find((group) => group.ids.includes(center.id));
  const visible = (anchor ? [anchor, ...components.filter((group) => group !== anchor)] : components).slice(0, columns * 2);
  const columnsUsed = Math.min(columns, visible.length || 1);
  const columnWidth = (width - 26) / columnsUsed;
  const rows = Math.max(1, Math.ceil(visible.length / columns));
  const rowHeight = (height - 83) / rows;
  const islands: Island[] = [];
  const nodes = visible.flatMap(({ ids, linked }, groupIndex) => {
    const ranked = [...ids].sort((a, b) => Number(b === center.id) - Number(a === center.id) ||
      (index.adjacent.get(b)?.size ?? 0) - (index.adjacent.get(a)?.size ?? 0) || a.localeCompare(b, undefined, { numeric: true }));
    const clusterX = 13 + (groupIndex % columns + 0.5) * columnWidth;
    const clusterY = 36 + (Math.floor(groupIndex / columns) + 0.5) * rowHeight;
    const count = Math.min(3, ranked.length);
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
