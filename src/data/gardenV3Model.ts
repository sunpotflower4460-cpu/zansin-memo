import { z } from 'zod';
import { gardenCore, gardenV3, type GardenStoreV3 } from '../domain/plus/contracts';
import type { GardenStoreV2 } from '../domain/types';
import { connectionId, emptyStore, normalizePair } from './gardenModel';

function unique<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

const byId = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((item) => [item.id, item]));
const ownId = (value: { id: string }) => value.id;

function checkReferences(store: GardenStoreV3): boolean {
  const idLists = [store.seeds, store.connections, store.drafts, store.sourceSnapshots, store.mapViews, store.atelierProjects,
    store.atelierRevisions, store.atelierSuggestions, store.adoptionRecords, store.collectionItems, store.collectionRevisions,
    store.collectionExportReceipts, store.connectionProposals, store.aiRequestReceipts, store.outbox];
  if (idLists.some((items) => !unique(items as readonly { id: string }[], ownId)) ||
      !unique(store.permissions, (permission) => permission.seedId) ||
      !unique(store.proposalSuppressions, ({ pair }) => JSON.stringify(pair)) ||
      !unique(store.reflections ?? [], ({ day }) => day) ||
      !unique(store.atelierDrafts, ({ projectId, branchId }) => JSON.stringify([projectId, branchId])) ||
      !unique(store.collectionDrafts, ({ itemId }) => itemId)) return false;

  const seeds = byId(store.seeds);
  if (store.connections.some(({ id, aSeedId: a, bSeedId: b }) => a >= b || !seeds.has(a) || !seeds.has(b) || id !== connectionId(a, b))) return false;

  const snapshots = store.sourceSnapshots;
  const snapshotsById = byId(snapshots);
  const hasSnapshots = (ids: string[]) => ids.every((id) => snapshotsById.has(id));
  const projects = byId(store.atelierProjects);
  const atelierRevisions = byId(store.atelierRevisions);
  const items = byId(store.collectionItems);
  const works = byId(store.collectionRevisions);
  const hasBranch = (projectId: string, branchId: string) => projects.get(projectId)?.branches.some(({ id }) => id === branchId) === true;
  const sameProject = (revisionId: string, projectId: string) => atelierRevisions.get(revisionId)?.projectId === projectId;

  // A live original may change or disappear. Required references to immutable content must still resolve.
  return store.permissions.every(({ seedId }) => seeds.has(seedId)) &&
    store.mapViews.every((view) => unique(view.displayGroups, ownId)) &&
    store.atelierProjects.every((project) => unique(project.branches, ownId) && hasBranch(project.id, project.activeBranchId) &&
      project.branches.every((branch) => !branch.headRevisionId || sameProject(branch.headRevisionId, project.id))) &&
    store.atelierDrafts.every((draft) => hasBranch(draft.projectId, draft.branchId) &&
      (!draft.baseRevisionId || sameProject(draft.baseRevisionId, draft.projectId)) && hasSnapshots(draft.materials.map((material) => material.snapshotId))) &&
    store.atelierRevisions.every((revision) => hasBranch(revision.projectId, revision.branchId) &&
      (!revision.parentRevisionId || (revision.parentRevisionId !== revision.id && sameProject(revision.parentRevisionId, revision.projectId))) &&
      hasSnapshots(revision.materialSnapshotIds)) &&
    store.adoptionRecords.every((record) => atelierRevisions.has(record.atelierRevisionId) &&
      (!record.previousSynthesisSnapshotId || snapshotsById.has(record.previousSynthesisSnapshotId))) &&
    store.collectionItems.every((item) => works.get(item.currentRevisionId)?.itemId === item.id) &&
    store.collectionDrafts.every((draft) => items.has(draft.itemId) && works.get(draft.baseCollectionRevisionId)?.itemId === draft.itemId) &&
    store.collectionRevisions.every((revision) => {
      if (!items.has(revision.itemId) || !hasSnapshots(revision.materialSnapshotIds) ||
          (revision.previousRevisionId && (revision.previousRevisionId === revision.id || works.get(revision.previousRevisionId)?.itemId !== revision.itemId)) ||
          (revision.atelierRevisionId && !atelierRevisions.has(revision.atelierRevisionId))) return false;
      if (revision.kind === 'word_card') return true;
      const map = revision.mapSnapshot;
      const nodeIds = new Set(map.nodes.map((node) => node.seedId));
      return nodeIds.size === map.nodes.length && unique(map.confirmedConnections, ownId) &&
        map.nodes.every((node) => snapshotsById.get(node.sourceSnapshotId)?.source.ref.seedId === node.seedId && Object.hasOwn(map.positions, node.seedId)) &&
        map.confirmedConnections.every(({ id, aSeedId: a, bSeedId: b }) => a < b && nodeIds.has(a) && nodeIds.has(b) && id === connectionId(a, b));
    }) &&
    store.collectionExportReceipts.every(({ itemId, collectionRevisionId, outputSpecVersion }) => {
      const work = works.get(collectionRevisionId);
      return work?.itemId === itemId && work.outputSpecVersion === outputSpecVersion;
    });
}

export type V3ParseResult =
  | { ok: true; store: GardenStoreV3 }
  | { ok: false; reason: 'invalid_json' | 'invalid_shape' | 'unsupported_version' | 'invalid_references' };

export function parseStoreV3(raw: string): V3ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (data && typeof data === 'object' && 'storeVersion' in data && typeof data.storeVersion === 'number' && data.storeVersion !== 3) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = gardenV3.safeParse(data);
  if (!parsed.success) return { ok: false, reason: 'invalid_shape' };
  return checkReferences(parsed.data) ? { ok: true, store: parsed.data } : { ok: false, reason: 'invalid_references' };
}

export const serializeStoreV3 = (store: GardenStoreV3): string => JSON.stringify(store);
export const checkedLegacyCore = z.strictObject({ storeVersion: z.literal(2), ...gardenCore });

export function emptyStoreV3(): GardenStoreV3 {
  return {
    ...emptyStore(), storeVersion: 3, permissions: [], sourceSnapshots: [], mapViews: [], atelierProjects: [], atelierDrafts: [],
    atelierRevisions: [], atelierSuggestions: [], adoptionRecords: [], collectionItems: [], collectionDrafts: [], collectionRevisions: [],
    collectionExportReceipts: [], connectionProposals: [], proposalSuppressions: [], aiRequestReceipts: [], outbox: [],
  };
}

export function upgradeV2(store: GardenStoreV2, dismissed: readonly string[], at: string): GardenStoreV3 | undefined {
  const pairs = new Map<string, [string, string]>();
  for (const key of dismissed) {
    let value: unknown;
    try {
      value = JSON.parse(key);
    } catch {
      return undefined;
    }
    if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => typeof item === 'string' && item) || value[0] === value[1]) return undefined;
    const pair = normalizePair(value[0], value[1]);
    pairs.set(JSON.stringify(pair), pair);
  }
  return {
    ...emptyStoreV3(), revision: store.revision, lastMutationId: store.lastMutationId,
    seeds: store.seeds, connections: store.connections, drafts: store.drafts,
    permissions: store.seeds.map(({ id }) => ({ seedId: id, externalAi: 'unasked', discovery: 'include', epoch: 0, changedAt: at })),
    proposalSuppressions: [...pairs.values()].map((pair) => ({ pair, reason: 'dismissed', createdAt: at })),
  };
}
