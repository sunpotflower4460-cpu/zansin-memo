import { saveAtelierText } from '../domain/plus/atelier';
import type { StorageLike } from './gardenStorage';
import { serializeStoreV3 } from './gardenV3Model';
import { loadGardenV3, PLUS_KEYS } from './gardenV3Storage';
import { GardenV3Writer } from './gardenV3Writer';
import { plusStorageFixture } from './plusStorageFixture';

const rounded = (ms: number) => Math.round(ms * 10) / 10;
function percentiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction: number) => rounded(sorted[Math.ceil(sorted.length * fraction) - 1]);
  return sorted.length ? { p50: at(0.5), p95: at(0.95) } : null;
}

function utf8Size(text: string) {
  let bytes = 0;
  for (const char of text) {
    const point = char.codePointAt(0)!;
    bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
  }
  return bytes;
}

export type PlusStorageCondition = 'light' | 'heavy';
export const storageMeasureInputs = 120;
const inputIntervalMs = 500;

export async function reopenMeasuredStore(storage: StorageLike) {
  const start = performance.now();
  if ((await storage.getItem(PLUS_KEYS.main)) === null && (await storage.getItem(PLUS_KEYS.lastGood)) === null) {
    return { status: 'no_measurement' } as const;
  }
  const loaded = await loadGardenV3(storage);
  const readMs = rounded(performance.now() - start);
  if (loaded.status !== 'ready') return { status: loaded.status, reason: loaded.reason, readMs } as const;
  return { status: 'ready', source: loaded.source, revision: loaded.store.revision, seeds: loaded.store.seeds.length,
    draftEditRevision: loaded.store.atelierDrafts[0]?.editRevision, readMs } as const;
}

/** Synthetic input through the actual v3 writer, including its backup writes. */
export async function measurePlusStorage(storage: StorageLike, condition: PlusStorageCondition, progress: (input: number) => void) {
  const initial = condition === 'light' ? plusStorageFixture(50, 1) : plusStorageFixture(5000, 100);
  const info = { condition, seeds: initial.seeds.length, connections: initial.connections.length, atelierRevisions: initial.atelierRevisions.length,
    works: initial.collectionItems.length, envelopeBytes: utf8Size(serializeStoreV3(initial)), inputIntervalMs, targetInputs: storageMeasureInputs };
  const mainWrite: number[] = [];
  const serialize: number[] = [];
  let measuring = false;
  let storageError: string | undefined;
  const writer = new GardenV3Writer({ ...storage, setItem: async (key, raw) => {
    const start = performance.now();
    try { await storage.setItem(key, raw); }
    catch (error) { storageError ??= error instanceof Error ? error.name : 'write_error'; throw error; }
    if (measuring && key === PLUS_KEYS.main) mainWrite.push(performance.now() - start);
  } }, initial, { needsInitialPersist: true, observeSerialization: (ms) => { if (measuring) serialize.push(ms); } });

  const first = await writer.run({ id: 'measure:initial', apply: (store) => store });
  if (!first.ok || !first.backupOk) return { ...info, stage: 'initial', failure: first.ok ? 'last_good_write_failed' : first.reason, storageError };

  measuring = true;
  let peakPending = 0;
  let saved = 0;
  let failure: string | undefined;
  const commit: number[] = [];
  const timerDelay: number[] = [];
  const scheduled = new Map<number, number>();
  const jobs: Promise<void>[] = [];
  const { projectId, branchId, text } = initial.atelierDrafts[0];
  const unsubscribe = writer.subscribe(() => {
    const revision = writer.getSnapshot().revision;
    const inputAt = scheduled.get(revision);
    if (inputAt !== undefined) { commit.push(performance.now() - inputAt); scheduled.delete(revision); }
  });

  let flushAt: number;
  try {
    const start = performance.now();
    for (let input = 1; input <= storageMeasureInputs; input++) {
      const due = start + input * inputIntervalMs;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, due - performance.now())));
      if (failure) break;
      const inputAt = performance.now();
      timerDelay.push(Math.max(0, inputAt - due));
      scheduled.set(first.revision + input, inputAt);
      const command = saveAtelierText({ projectId, branchId, expected: input - 1 }, `${text} 入力${input}`, `measure:input:${input}`, new Date().toISOString());
      jobs.push(writer.run(command).then((result) => {
        if (result.ok) saved++;
        if (!result.ok || !result.backupOk) failure ??= result.ok ? 'last_good_write_failed' : result.reason;
      }));
      peakPending = Math.max(peakPending, writer.getStatus().pending);
      if (input % 20 === 0) progress(input);
    }
  } finally {
    flushAt = performance.now();
    try { await Promise.all(jobs); }
    finally { unsubscribe(); }
  }

  const flush = rounded(performance.now() - flushAt);
  const reopenAt = performance.now();
  const reopened = await loadGardenV3(storage);
  const reopenMs = rounded(performance.now() - reopenAt);
  const raw = await storage.getItem(PLUS_KEYS.main);
  const snapshot = writer.getSnapshot();
  const restoredExactly = raw === serializeStoreV3(snapshot) && reopened.status === 'ready' && reopened.source === 'v3' &&
    reopened.store.atelierDrafts[0]?.text === snapshot.atelierDrafts[0]?.text;
  const backupMatches = raw !== null && await storage.getItem(PLUS_KEYS.lastGood) === raw;
  return { ...info, stage: 'updates', failure, storageError, saved, peakPending, restoredExactly, backupMatches, finalBytes: raw === null ? null : utf8Size(raw),
    ms: { serialize: percentiles(serialize), mainWrite: percentiles(mainWrite), inputToCommit: percentiles(commit),
      timerDelay: percentiles(timerDelay), flush, reopen: reopenMs } };
}
