import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { makeConnection } from '../src/data/gardenModel';
import { buildSeed } from '../src/domain/gardenCommands';

// Fictional data for the whole-JSON candidate in Plus data contracts §8.1.
const at = '2026-01-01T00:00:00.000Z';
const passage = '朝の散歩で見かけた景色を手がかりに、写真を並べる順番を考える。';
const lineage = (rootSeedIds: string[]) => ({ rootSeedIds, status: 'known' });

function fixture(seedCount: number, projectCount: number) {
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
      source: { ref: { seedId: seed.id, part: 'body' }, textDigest: `synthetic-${seed.id}`, updatedAt: at },
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
      project: { id: projectId, status: 'drafting', branches: [{ id: branchId, headRevisionId: revisionId(19) }], activeBranchId: branchId, createdAt: at, updatedAt: at },
      draft: { projectId, branchId, baseRevisionId: revisionId(19), text: revisions[19].text, materials: materialSnapshotIds.map((snapshotId) => ({ snapshotId, versionMode: 'current' })), pinnedExcerpts: [], insertedSuggestionIds: [], lineage: revisions[19].lineage, editRevision: 0, updatedAt: at },
      revisions,
      item: { id: itemId, currentRevisionId, order: p, createdAt: at, updatedAt: at },
      work: {
        id: currentRevisionId, itemId, kind: 'map_and_text_page', templateId: 'map_text_v1', styleVersion: 1, outputSpecVersion: 1,
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

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const ms = (value: number) => Math.round(value * 10) / 10;
const percentile = (samples: number[], fraction: number) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return ms(sorted[Math.ceil(fraction * sorted.length) - 1]);
};
const stats = (samples: number[]) => ({ p50: percentile(samples, 0.50), p95: percentile(samples, 0.95) });

async function measure(seedCount: number, projectCount: number) {
  let store = fixture(seedCount, projectCount);
  const initialBytes = bytes(store);
  const historyBytes = bytes(store.atelierRevisions) + bytes(store.collectionRevisions) + bytes(store.sourceSnapshots);
  const directory = await mkdtemp(join(tmpdir(), 'kizashi-plus-measure-'));
  const main = join(directory, 'main.json');
  const staged = join(directory, 'next.json');
  const serialize: number[] = [];
  const mainWrite: number[] = [];
  const save: number[] = [];
  const eventLoopDelay: number[] = [];
  let tail = Promise.resolve();
  let pending = 0;
  let peakPending = 0;
  let peakHeap = process.memoryUsage().heapUsed;
  let failure: unknown;
  try {
    const start = performance.now();
    for (let i = 1; i <= 120; i++) {
      const due = start + 500 * i;
      await wait(Math.max(0, due - performance.now()));
      if (failure) throw failure;
      const inputAt = performance.now();
      eventLoopDelay.push(Math.max(0, inputAt - due));
      pending++;
      peakPending = Math.max(pending, pending);
      tail = tail.then(async () => {
        if (failure) return;
        const draft = store.atelierDrafts[0];
        store = { ...store, revision: i, atelierDrafts: [{ ...draft, editRevision: i, text: `${draft.text.slice(0, 2000)} 入力${i}` }, ...store.atelierDrafts.slice(1)] };
        const stringifyAt = performance.now();
        const json = JSON.stringify(store);
        const writeAt = performance.now();
        serialize.push(writeAt - stringifyAt);
        peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
        await writeFile(staged, json, 'utf8');
        await rename(staged, main);
        const savedAt = performance.now();
        mainWrite.push(savedAt - writeAt);
        save.push(savedAt - inputAt);
      }).catch((error: unknown) => { failure = error; }).finally(() => { pending--; });
    }
    const flushAt = performance.now();
    await tail;
    const flush = ms(performance.now() - flushAt);
    if (failure) throw failure;
    const processHighWaterRssKiB = process.resourceUsage().maxRSS;
    const reopenAt = performance.now();
    const raw = await readFile(main, 'utf8');
    const readBack: typeof store = JSON.parse(raw);
    const reopen = ms(performance.now() - reopenAt);
    assert.equal(readBack.revision, 120);
    assert.equal(readBack.atelierDrafts[0].text, store.atelierDrafts[0].text);
    assert.ok(raw === JSON.stringify(store), 'reopened envelope differs from the last committed envelope');
    console.log(JSON.stringify({
      seeds: seedCount, projects: projectCount, revisions: store.atelierRevisions.length, works: store.collectionItems.length,
      totalBytes: initialBytes, historyBytes, saves: save.length, peakPending,
      ms: { serialize: stats(serialize), mainWrite: stats(mainWrite), inputToSaved: stats(save), inputTimerDelay: stats(eventLoopDelay), flush, reopen },
      memory: { sampledHeapBytes: peakHeap, processHighWaterRssKiB },
      lastDraftRestored: true,
    }, null, 2));
  } finally {
    await tail;
    await rm(directory, { recursive: true, force: true });
  }
}

console.log(`Node ${process.version} / ${process.platform}-${process.arch}. Local filesystem and event loop measurements.`);
const mode = process.argv[2];
if (mode === 'sizes') {
  for (const seeds of [50, 500, 2000, 5000]) {
    for (const projects of [1, 100]) {
      const store = fixture(seeds, projects);
      console.log(JSON.stringify({ seeds, projects, connections: store.connections.length, snapshots: store.sourceSnapshots.length, bytes: bytes(store) }));
    }
  }
} else if (mode === 'light' || mode === 'heavy') {
  void measure(mode === 'light' ? 50 : 5000, mode === 'light' ? 1 : 100).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  console.error('Usage: npm run measure:plus-storage -- sizes|light|heavy');
  process.exitCode = 1;
}
