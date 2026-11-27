import type { GardenStoreV3 } from '../domain/plus/contracts';
import { buildSeed } from '../domain/gardenCommands';
import { makeConnection } from './gardenModel';

// Fictional data for the whole-JSON candidate in Plus data contracts §8.1.
const at = '2026-01-01T00:00:00.000Z';
const passage = '朝の散歩で見かけた景色を手がかりに、写真を並べる順番を考える。';
const lineage = (rootSeedIds: string[]) => ({ rootSeedIds, status: 'known' as const });

export function plusStorageFixture(seedCount: number, projectCount: number): GardenStoreV3 {
  const seeds = Array.from({ length: seedCount }, (_, i) => buildSeed(`seed-${i}`, {
    body: `${i}番の架空メモ。${passage.repeat(i % 10 === 0 ? 65 : 2)}`,
    tags: i % 3 === 0 ? ['写真'] : [],
  }, at));
  const connections = new Map<string, ReturnType<typeof makeConnection>>();
  const connect = (a: number, b: number) => {
    const connection = makeConnection(seeds[a].id, seeds[b].id, 'manual', at, '散歩で見かけた光について');
    connections.set(connection.id, connection);
  };
  // Keep roughly a quarter of the seeds isolated. The first connected seed is a hub.
  const connected = Math.floor(seedCount * 3 / 4);
  for (let i = 1; i < connected; i++) {
    if (i <= 300) connect(0, i);
    for (let step = 1; step <= 3 && i + step < connected; step++) connect(i, i + step);
  }

  const sourceSnapshots = new Map<string, ReturnType<typeof snapshotSeed>>();
  function snapshotSeed(index: number) {
    const seed = seeds[index];
    return {
      id: `snapshot-${seed.id}`,
      source: { ref: { seedId: seed.id, part: 'body' as const }, textDigest: `synthetic-${seed.id}`, updatedAt: at },
      text: seed.body,
      capturedAt: at,
      lineage: lineage([seed.id]),
    };
  }

  const projects = Array.from({ length: projectCount }, (_, p) => {
    const projectId = `atelier-${p}`;
    const branchId = `branch-${p}`;
    const itemId = `work-${p}`;
    const currentRevisionId = `${itemId}-1`;
    const indices = [0, ...Array.from({ length: 24 }, (_, i) => 1 + ((p * 23 + i) % (connected - 1)))];
    const snapshots = indices.map((index) => {
      const snapshot = snapshotSeed(index);
      sourceSnapshots.set(snapshot.id, snapshot);
      return snapshot;
    });
    const seedIds = indices.map((index) => seeds[index].id);
    const mapSeedIds = new Set(seedIds);
    const materialSnapshotIds = snapshots.slice(0, 4).map(({ id }) => id);
    const revisionId = (i: number) => `${projectId}-${i}`;
    const revisions = Array.from({ length: 20 }, (_, i) => ({
      id: revisionId(i), projectId, branchId,
      parentRevisionId: i > 0 ? revisionId(i - 1) : undefined,
      text: `作品案${p}の第${i}版。${passage.repeat(80)}`.slice(0, 2000),
      materialSnapshotIds, pinnedExcerpts: [], insertedSuggestionIds: [],
      lineage: lineage(seedIds.slice(0, 4)), savedAt: at,
    }));
    const positions = Object.fromEntries(seedIds.map((id, i) => [id, { x: i % 5 * 220, y: Math.floor(i / 5) * 140, pinned: i === 0 }]));
    const confirmedConnections = Array.from(connections.values())
      .filter((edge) => mapSeedIds.has(edge.aSeedId) && mapSeedIds.has(edge.bSeedId))
      .map(({ id, aSeedId, bSeedId, note }) => ({ id, aSeedId, bSeedId, noteSnapshot: note }));
    return {
      project: { id: projectId, status: 'drafting' as const, branches: [{ id: branchId, headRevisionId: revisionId(19) }], activeBranchId: branchId, createdAt: at, updatedAt: at },
      draft: { projectId, branchId, baseRevisionId: revisionId(19), text: revisions[19].text, materials: materialSnapshotIds.map((snapshotId) => ({ snapshotId, versionMode: 'current' as const })), pinnedExcerpts: [], insertedSuggestionIds: [], lineage: revisions[19].lineage, editRevision: 0, updatedAt: at },
      revisions,
      item: { id: itemId, currentRevisionId, order: p, createdAt: at, updatedAt: at },
      work: {
        id: currentRevisionId, itemId, kind: 'map_and_text_page' as const, templateId: 'map_text_v1' as const, styleVersion: 1, outputSpecVersion: 1,
        textSnapshot: revisions[19].text, atelierRevisionId: revisionId(19), materialSnapshotIds,
        mapSnapshot: { positions, layoutVersion: 1, nodes: snapshots.map((snapshot) => ({ seedId: snapshot.source.ref.seedId, labelSnapshot: snapshot.text.slice(0, 28), sourceSnapshotId: snapshot.id })), confirmedConnections },
        lineage: lineage(seedIds), savedAt: at,
      },
    };
  });

  return {
    storeVersion: 3, revision: 0, seeds, connections: Array.from(connections.values()), drafts: [],
    permissions: seeds.map(({ id }) => ({ seedId: id, externalAi: 'unasked', discovery: 'include', epoch: 0, changedAt: at })),
    sourceSnapshots: [...sourceSnapshots.values()], mapViews: [],
    atelierProjects: projects.map(({ project }) => project), atelierDrafts: projects.map(({ draft }) => draft),
    atelierRevisions: projects.flatMap(({ revisions }) => revisions), atelierSuggestions: [], adoptionRecords: [],
    collectionItems: projects.map(({ item }) => item), collectionDrafts: [], collectionRevisions: projects.map(({ work }) => work), collectionExportReceipts: [],
    connectionProposals: [], proposalSuppressions: [], aiRequestReceipts: [], outbox: [],
  };
}
