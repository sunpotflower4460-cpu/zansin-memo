import type { PlusCommand } from '../../data/gardenV3Writer';
import { captureMaterial, materialState } from './atelier';
import type { CollectionReturnContext, CollectionRevision, GardenStoreV3, MapView, SourceSnapshot } from './contracts';
import { indexMap, mapGroups, mapInScope, placeMap } from './map';
import { mergeLineage } from './sources';

export const defaultWorkLayout = { paper: 'washi', textAlign: 'start', mapPosition: 'above', includeSources: false } as const;
type Layout = NonNullable<CollectionRevision['layout']>;
export const workFormat = (revision: CollectionRevision) => revision.kind === 'word_card' ? 'png' : 'pdf';

export function createCollectionWork(args: {
  itemId: string; revisionId: string; atelierRevisionId: string; title?: string; text: string; at: string; layout: Layout;
  materialSnapshotIds: string[];
  map?: { nodes: Array<{ seedId: string; snapshotId: string }>; positions?: MapView['positions']; viewId?: string };
}): PlusCommand {
  return { id: `collection:${args.itemId}`, apply: (store) => {
    if (store.collectionItems.some(({ id }) => id === args.itemId)) return store;
    if (store.collectionRevisions.some(({ id }) => id === args.revisionId)) return { rejected: '作品の版を確認できません' };
    const source = store.atelierRevisions.find(({ id }) => id === args.atelierRevisionId);
    if (!source || !args.text.trim()) return { rejected: '作品に残す言葉を選んでください' };
    const materialSnapshotIds = [...new Set(args.materialSnapshotIds)];
    if (materialSnapshotIds.some((id) => !source.materialSnapshotIds.includes(id) ||
        ['missing', 'deleted'].includes(materialState(store.seeds, store.sourceSnapshots.find((entry) => entry.id === id))))) {
      return { rejected: '作品に含める材料を選び直してください' };
    }
    let working = store;
    let mapSnapshot: Extract<CollectionRevision, { kind: 'map_and_text_page' }>['mapSnapshot'] | undefined;
    const lineage = [source.lineage];
    if (args.map) {
      const selected = [...new Map(args.map.nodes.map((node) => [node.seedId, node])).values()];
      if (!selected.length) return { rejected: '作品の地図に含める種を選んでください' };
      const index = indexMap(store.seeds, store.connections);
      const graph = mapInScope(index, { kind: 'selection', seedIds: selected.map((node) => node.seedId) });
      if (graph.missing) return { rejected: '地図の材料に変更があります' };
      const positions = placeMap(graph, Object.fromEntries(Object.entries(args.map.positions ?? {}).filter(([id]) => graph.byId.has(id))), mapGroups(graph, []));
      const nodes = [];
      for (const { seedId, snapshotId } of selected) {
        const captured = captureMaterial(working, { seedId, part: 'body' }, snapshotId, args.at);
        if (!captured) return { rejected: '地図の材料を確認できません' };
        working = { ...working, sourceSnapshots: captured.snapshots };
        const value = captured.snapshot;
        const words = Array.from((value.title || value.text).replace(/\s+/g, ' '));
        nodes.push({ seedId, labelSnapshot: words.length > 36 ? words.slice(0, 36).join('') + '…' : words.join(''), sourceSnapshotId: value.id });
        lineage.push(value.lineage);
      }
      mapSnapshot = { viewId: args.map.viewId, positions, nodes, layoutVersion: 1,
        confirmedConnections: graph.edges.map(({ id, aSeedId, bSeedId, note }) => ({ id, aSeedId, bSeedId, noteSnapshot: note })) };
    }
    const revision = {
      id: args.revisionId, itemId: args.itemId, title: args.title?.trim() || undefined, textSnapshot: args.text, atelierRevisionId: source.id,
      materialSnapshotIds, layout: args.layout, styleVersion: 1, outputSpecVersion: 1, lineage: mergeLineage(...lineage), savedAt: args.at,
    };
    const work: CollectionRevision = mapSnapshot ? { ...revision, kind: 'map_and_text_page', templateId: 'map_text_v1', mapSnapshot }
      : { ...revision, kind: 'word_card', templateId: 'word_card_v1' };
    const order = store.collectionItems.reduce((largest, item) => Math.max(largest, item.order + 1), 0);
    return { ...working, collectionRevisions: [...working.collectionRevisions, work], collectionItems: [...working.collectionItems, {
      id: args.itemId, currentRevisionId: work.id, order, createdAt: args.at, updatedAt: args.at,
    }] };
  } };
}

export function saveWorkDraft(args: { itemId: string; base: string; expected: number; title?: string; text: string; at: string; operationId: string }): PlusCommand {
  return { id: args.operationId, skipBackup: true, apply: (store) => {
    const item = store.collectionItems.find(({ id }) => id === args.itemId);
    const draft = store.collectionDrafts.find((entry) => entry.itemId === args.itemId);
    if (item?.currentRevisionId !== args.base || (draft?.editRevision ?? 0) !== args.expected) return { rejected: '作品の版が更新されています。入力を残して確認してください' };
    const next = { itemId: args.itemId, baseCollectionRevisionId: args.base, title: args.title, text: args.text, editRevision: args.expected + 1, updatedAt: args.at };
    return { ...store, collectionDrafts: [...store.collectionDrafts.filter((entry) => entry !== draft), next] };
  } };
}

export function saveWorkEdit(itemId: string, base: string, expected: number, id: string, at: string): PlusCommand {
  return { id: `collection-revision:${id}`, apply: (store) => {
    if (store.collectionRevisions.some((entry) => entry.id === id && entry.itemId === itemId)) return store;
    const item = store.collectionItems.find((entry) => entry.id === itemId);
    const draft = store.collectionDrafts.find((entry) => entry.itemId === itemId);
    const work = store.collectionRevisions.find((entry) => entry.id === base && entry.itemId === itemId);
    if (!draft || !work || item?.currentRevisionId !== base || draft.baseCollectionRevisionId !== base || draft.editRevision !== expected) return { rejected: '編集内容を確認してください' };
    if (!draft.text.trim()) return { rejected: '作品の本文を入力してください' };
    const collectionDrafts = store.collectionDrafts.filter((entry) => entry !== draft);
    const title = draft.title?.trim() || undefined;
    if (work.textSnapshot === draft.text && work.title === title) return { ...store, collectionDrafts };
    const next = { ...work, id, previousRevisionId: base, title, textSnapshot: draft.text, savedAt: at };
    return { ...store, collectionDrafts, collectionRevisions: [...store.collectionRevisions, next], collectionItems: store.collectionItems.map((entry) => entry === item
      ? { ...entry, currentRevisionId: id, updatedAt: at } : entry) };
  } };
}

export function removeWork(id: string, commandId: string): PlusCommand {
  return { id: commandId, apply: (store) => ({ ...store, collectionItems: store.collectionItems.filter((item) => item.id !== id),
    collectionRevisions: store.collectionRevisions.filter((item) => item.itemId !== id), collectionDrafts: store.collectionDrafts.filter((item) => item.itemId !== id),
    collectionExportReceipts: store.collectionExportReceipts.filter((item) => item.itemId !== id) }) };
}

export function moveWork(id: string, direction: -1 | 1, commandId: string): PlusCommand {
  return { id: commandId, apply: (store) => {
    const sorted = [...store.collectionItems].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((item) => item.id === id);
    const item = sorted[index];
    const other = sorted[index + direction];
    if (!item || !other) return store;
    return { ...store, collectionItems: store.collectionItems.map((entry) => entry === item ? { ...entry, order: other.order }
      : entry === other ? { ...entry, order: item.order } : entry) };
  } };
}

export function getWorkOnReturn(store: GardenStoreV3, context: CollectionReturnContext) {
  const item = store.collectionItems.find((entry) => entry.id === context.collectionItemId);
  const revision = item && store.collectionRevisions.find((entry) => entry.id === context.collectionRevisionId && entry.itemId === item.id);
  return revision && { revision, newer: item.currentRevisionId !== revision.id };
}

export function workContent(store: GardenStoreV3, work: CollectionRevision) {
  const live = new Set(store.seeds.filter((seed) => !seed.deletedAt).map((seed) => seed.id));
  const byId = new Map(store.sourceSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const all = work.materialSnapshotIds.map((id) => byId.get(id));
  const materials = all.filter((snapshot): snapshot is SourceSnapshot => Boolean(snapshot && live.has(snapshot.source.ref.seedId)));
  const map = work.kind === 'map_and_text_page' ? work.mapSnapshot : undefined;
  const nodes = map?.nodes.filter((node) => live.has(node.seedId) && byId.has(node.sourceSnapshotId)) ?? [];
  const present = new Set(nodes.map(({ seedId }) => seedId));
  const references = new Set([...work.lineage.rootSeedIds, ...all.flatMap((entry) => entry ? [entry.source.ref.seedId] : []), ...(map?.nodes.map(({ seedId }) => seedId) ?? [])]);
  const hidden = [...references].filter((id) => !live.has(id));
  return { work, layout: work.layout ?? defaultWorkLayout, materials, hidden, missingMaterials: all.length - materials.length,
    diagram: map && { nodes, positions: map.positions, lines: map.confirmedConnections.filter((line) => present.has(line.aSeedId) && present.has(line.bSeedId)) } };
}
export type WorkContent = ReturnType<typeof workContent>;

export function recordWorkOutput(id: string, work: CollectionRevision, at: string, hidden: string[]): PlusCommand {
  return { id: `collection-output:${id}`, apply: (store) => {
    if (store.collectionExportReceipts.some((receipt) => receipt.id === id)) return store;
    if (!store.collectionRevisions.some(({ id, itemId }) => id === work.id && itemId === work.itemId) ||
        JSON.stringify(workContent(store, work).hidden) !== JSON.stringify(hidden)) return { rejected: '作品の材料に変更があります。確認してから書き出してください' };
    return { ...store, collectionExportReceipts: [...store.collectionExportReceipts, { id, itemId: work.itemId, collectionRevisionId: work.id,
      format: workFormat(work), outputSpecVersion: work.outputSpecVersion, createdAt: at }] };
  } };
}

export function workText(content: WorkContent): string {
  return [content.work.title, content.work.textSnapshot,
    ...(content.layout.includeSources ? content.materials.map((source) => [source.title, source.text].filter(Boolean).join('\n')) : [])].filter(Boolean).join('\n\n');
}
