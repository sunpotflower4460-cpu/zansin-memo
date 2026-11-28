import { extractKeywords } from '../../utils/links';
import { normalizeSearchText } from '../../utils/seedText';
import type { MapIndex } from './map';
import type { ConstellationGroup } from './studioGraph';

/** Categories are supplied by the writer. For uncategorised notes, use words actually repeated in their bodies. */
export function topicConstellations(index: MapIndex): ConstellationGroup[] {
  const groups = new Map<string, ConstellationGroup>();
  const untagged = new Map<string, string[]>();
  const frequency = new Map<string, number>();
  function add(basis: 'category' | 'word' | 'ungrouped', label: string, seedId: string) {
    const id = JSON.stringify([basis, normalizeSearchText(label)]);
    const group = groups.get(id) ?? { id, basis, label, linked: false, seedIds: [] };
    group.seedIds.push(seedId);
    groups.set(id, group);
  }
  for (const seed of index.live) {
    const tags = new Map(seed.tags.map((tag) => [normalizeSearchText(tag.trim()), tag.trim()]));
    tags.delete('');
    if (tags.size) {
      for (const label of tags.values()) add('category', label, seed.id);
    } else {
      const words = extractKeywords(seed.body);
      untagged.set(seed.id, words);
      for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  for (const [id, words] of untagged) {
    const shared = words.filter((word) => frequency.get(word)! >= 2);
    if (!shared.length) add('ungrouped', '個別のメモ', id);
    else for (const word of shared) add('word', word, id);
  }
  return [...groups.values()].sort((a, b) => Number(a.basis === 'ungrouped') - Number(b.basis === 'ungrouped') ||
    b.seedIds.length - a.seedIds.length || a.label.localeCompare(b.label, 'ja'));
}

export const distanceBands = [
  { id: 'direct', label: '直接つながる' }, { id: 'second', label: '2つ先' },
  { id: 'far', label: '3つ以上先' }, { id: 'apart', label: '別のまとまり・単独' },
] as const;
export type DistanceBand = typeof distanceBands[number]['id'];

export function distanceBand(hops: number | undefined): DistanceBand {
  if (hops === undefined) return 'apart';
  if (hops === 1) return 'direct';
  if (hops === 2) return 'second';
  return 'far';
}

export function studioAtlas(index: MapIndex, center: string) {
  const depth = new Map<string, number>();
  const parent = new Map<string, string>();
  const queue: string[] = [];
  if (index.byId.has(center)) { queue.push(center); depth.set(center, 0); }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const next of index.adjacent.get(id) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(id)! + 1);
      parent.set(next, id);
      queue.push(next);
    }
  }
  const bands: Record<DistanceBand, string[]> = { direct: [], second: [], far: [], apart: [] };
  for (const { id } of index.live) {
    if (id === center) continue;
    bands[distanceBand(depth.get(id))].push(id);
  }
  return { bands, depth, parent };
}

export function studioRoute(atlas: ReturnType<typeof studioAtlas>, id: string) {
  if (!atlas.depth.has(id)) return [];
  const path = [id];
  let next = atlas.parent.get(id);
  while (next !== undefined) { path.push(next); next = atlas.parent.get(next); }
  return path.reverse();
}
