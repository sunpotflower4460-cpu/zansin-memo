import type { GardenStoreV3 } from '../domain/plus/contracts';
import { buildTextExport } from './exportFormat';

/** Full user data, including deleted originals and drafts. Permissions here are records, not new consent. */
export function buildPlusJsonExport(store: GardenStoreV3, exportedAt = new Date().toISOString()): string {
  return JSON.stringify({
    exportFormat: 'kizashi-notes', exportVersion: 3, exportedAt,
    includes: ['deletedSeeds', 'connections', 'syntheses', 'drafts', 'mapViews', 'studioArrangements', 'atelier', 'collection', 'sources', 'permissions', 'proposalHistory', 'reflections'],
    ...store,
    outbox: [],
  }, null, 2);
}

export function buildPlusTextExport(store: GardenStoreV3): string {
  const seeds = new Map(store.seeds.map((seed) => [seed.id, seed]));
  const snapshots = new Map(store.sourceSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const materialLines = (ids: readonly string[]) => ids.map((id) => {
    const snapshot = snapshots.get(id);
    const original = snapshot && seeds.get(snapshot.source.ref.seedId);
    if (!original) return '  ・原文を確認できないメモ';
    if (original.deletedAt) return '  ・最近削除した種';
    return `  ・選んだときの材料\n${snapshot.text}`;
  });
  const output = [buildTextExport(store)];
  for (const reflection of [...store.reflections ?? []].sort((a, b) => a.day.localeCompare(b.day))) {
    output.push(`【振り返り】 ${reflection.day}`, reflection.body);
  }
  for (const project of store.atelierProjects) {
    output.push(`【アトリエ】 ${project.title || '題名なし'}`);
    for (const revision of store.atelierRevisions.filter((entry) => entry.projectId === project.id)) {
      output.push(`保存した版 ${revision.savedAt}`, revision.text, ...materialLines(revision.materialSnapshotIds));
    }
    for (const draft of store.atelierDrafts.filter((entry) => entry.projectId === project.id)) {
      output.push(`アトリエの下書き ${draft.updatedAt}`, draft.text, ...materialLines(draft.materials.map(({ snapshotId }) => snapshotId)));
    }
  }
  for (const item of [...store.collectionItems].sort((a, b) => a.order - b.order)) {
    const work = store.collectionRevisions.find((revision) => revision.id === item.currentRevisionId);
    if (!work) continue;
    output.push(`【作品】 ${work.title || '題名なし'}`, work.textSnapshot);
    if (work.layout?.includeSources) output.push(...materialLines(work.materialSnapshotIds));
    const draft = store.collectionDrafts.find((draft) => draft.itemId === item.id);
    if (draft) output.push('作品の下書き', draft.title ?? '', draft.text);
  }
  return output.join('\n\n');
}
