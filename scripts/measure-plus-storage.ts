import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { plusStorageFixture } from '../src/data/plusStorageFixture';

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const ms = (value: number) => Math.round(value * 10) / 10;
const percentile = (samples: number[], fraction: number) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return ms(sorted[Math.ceil(fraction * sorted.length) - 1]);
};
const stats = (samples: number[]) => ({ p50: percentile(samples, 0.50), p95: percentile(samples, 0.95) });

async function measure(seedCount: number, projectCount: number) {
  let store = plusStorageFixture(seedCount, projectCount);
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
      const store = plusStorageFixture(seeds, projects);
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
