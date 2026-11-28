import { connectionId } from '../../data/gardenModel';
import { extractKeywords } from '../../utils/links';
import { normalizeSearchText, toSeedSnippet } from '../../utils/seedText';
import type { MapIndex } from './map';
import { constellationGroups, type ConstellationGroup } from './studioGraph';

function seedTags(tags: string[]) {
  const labels = new Map(tags.map((tag) => [normalizeSearchText(tag.trim()), tag.trim()]));
  labels.delete('');
  return labels;
}

const bodyWords = (body: string) => extractKeywords(body).filter((word) => !/^\d+$/.test(word));

export function studioGroupPreview(index: MapIndex, ids: readonly string[], omit?: string) {
  const titles: string[] = [];
  const seen = new Set([omit]);
  for (const id of ids) {
    const title = toSeedSnippet(index.byId.get(id)!, 26);
    const key = normalizeSearchText(title).replace(/[\s\d]+$/gu, '');
    if (seen.has(key) || title === omit) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length === 2) break;
  }
  return titles.join('、');
}

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
    const tags = seedTags(seed.tags);
    if (tags.size) {
      for (const label of tags.values()) add('category', label, seed.id);
    } else {
      const words = bodyWords(seed.body);
      untagged.set(seed.id, words);
      for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  for (const [id, words] of untagged) {
    const shared = words.filter((word) => frequency.get(word)! >= 2);
    if (!shared.length) add('ungrouped', '個別のメモ', id);
    else for (const word of shared) add('word', word, id);
  }
  const wordSets = new Set<string>();
  return [...groups.values()].filter((group) => {
    if (group.basis !== 'word') return true;
    const key = JSON.stringify(group.seedIds);
    if (wordSets.has(key)) return false;
    wordSets.add(key);
    return true;
  }).sort((a, b) => Number(a.basis === 'ungrouped') - Number(b.basis === 'ungrouped') ||
    b.seedIds.length - a.seedIds.length || a.label.localeCompare(b.label, 'ja'));
}

export type AtlasGroup = {
  id: string;
  title: string;
  kind: 'branch' | 'reason' | 'category' | 'word' | 'direct' | 'component' | 'isolated';
  seedIds: string[];
  furthestId?: string;
};

function groupBySharedLabel(kind: 'category' | 'word', labelsByNote: Map<string, Map<string, string>>) {
  const counts = new Map<string, number>();
  const groups = new Map<string, AtlasGroup>();
  for (const labels of labelsByNote.values()) {
    for (const key of labels.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [id, labels] of labelsByNote) {
    const key = [...labels.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b, 'ja'))[0];
    if (key === undefined || counts.get(key)! < 2) continue;
    const group = groups.get(key) ?? { id: `${kind}:${key}`, title: labels.get(key)!, kind, seedIds: [] };
    group.seedIds.push(id);
    groups.set(key, group);
  }
  return [...groups.values()].filter(({ seedIds }) => seedIds.length > 1);
}

function groupDirectNotes(index: MapIndex, ids: string[], center: string, edgeNotes: Map<string, string>) {
  const reasons = new Map<string, AtlasGroup>();
  const grouped = new Set<string>();
  for (const id of ids) {
    const reason = edgeNotes.get(connectionId(center, id));
    if (!reason) continue;
    const key = normalizeSearchText(reason);
    const group = reasons.get(key) ?? { id: `reason:${key}`, title: reason, kind: 'reason', seedIds: [] };
    group.seedIds.push(id);
    reasons.set(key, group);
  }
  const sharedReasons = [...reasons.values()].filter(({ seedIds }) => seedIds.length > 1);
  for (const { seedIds } of sharedReasons) for (const id of seedIds) grouped.add(id);

  const tags = new Map(ids.filter((id) => !grouped.has(id)).map((id) => [id, seedTags(index.byId.get(id)!.tags)]));
  const sharedCategories = groupBySharedLabel('category', tags);
  for (const { seedIds } of sharedCategories) for (const id of seedIds) grouped.add(id);
  const words = new Map(ids.filter((id) => !grouped.has(id)).map((id) => [id, new Map(bodyWords(index.byId.get(id)!.body).map((word) => [word, word]))]));
  const sharedWords = groupBySharedLabel('word', words);
  for (const { seedIds } of sharedWords) for (const id of seedIds) grouped.add(id);
  const loose = ids.filter((id) => !grouped.has(id));
  const groups = [sharedReasons, sharedCategories, sharedWords].flatMap((items) =>
    items.sort((a, b) => b.seedIds.length - a.seedIds.length || a.title.localeCompare(b.title, 'ja')));
  if (loose.length) groups.push({ id: 'direct', title: '直接つながるメモ', kind: 'direct', seedIds: loose });
  return groups;
}

export function studioAtlas(index: MapIndex, center: string) {
  const depth = new Map<string, number>();
  const parent = new Map<string, string>();
  const byEntry = new Map<string, string>();
  const byBranch = new Map<string, string[]>();
  const edgeNotes = new Map(index.edges.flatMap((edge) => {
    const note = edge.note?.trim();
    return note ? [[edge.id, note] as const] : [];
  }));
  const queue: string[] = [];
  if (index.byId.has(center)) { queue.push(center); depth.set(center, 0); }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const next of index.adjacent.get(id) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(id)! + 1);
      parent.set(next, id);
      const entry = byEntry.get(id) ?? next;
      byEntry.set(next, entry);
      const peers = byBranch.get(entry) ?? [];
      peers.push(next);
      byBranch.set(entry, peers);
      queue.push(next);
    }
  }
  const branches: AtlasGroup[] = [];
  const leaves: string[] = [];
  for (const [entry, seedIds] of byBranch) {
    if (seedIds.length === 1) { leaves.push(entry); continue; }
    branches.push({ id: `branch:${entry}`, title: toSeedSnippet(index.byId.get(entry)!, 56), kind: 'branch',
      seedIds, furthestId: seedIds.at(-1) });
  }
  branches.sort((a, b) => depth.get(b.furthestId!)! - depth.get(a.furthestId!)! || b.seedIds.length - a.seedIds.length);
  const nearby = [...branches, ...groupDirectNotes(index, leaves, center, edgeNotes)];
  const apart = depth.size === index.live.length ? [] : constellationGroups(index)
    .filter(({ seedIds, linked }) => !linked || !depth.has(seedIds[0]))
    .flatMap<AtlasGroup>(({ id, label, seedIds, linked }) => {
      const remaining = linked ? seedIds : seedIds.filter((seedId) => seedId !== center);
      return remaining.length ? [{ id, title: linked ? label : '線でつながっていないメモ', kind: linked ? 'component' : 'isolated', seedIds: remaining }] : [];
    });
  return { nearby, apart, depth, parent, edgeNotes };
}

export function studioRoute(atlas: Pick<ReturnType<typeof studioAtlas>, 'depth' | 'parent'>, id: string) {
  if (!atlas.depth.has(id)) return [];
  const path = [id];
  let next = atlas.parent.get(id);
  while (next !== undefined) { path.push(next); next = atlas.parent.get(next); }
  return path.reverse();
}
