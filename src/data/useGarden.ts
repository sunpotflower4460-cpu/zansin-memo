import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import type { Draft, GardenStoreV2 } from '../domain/types';
import { emptyStore } from './gardenModel';
import { type BlockedReason, type LoadResult, loadGarden } from './gardenStorage';
import { type CommitResult, type GardenCommand, GardenWriter, type WriterStatus } from './gardenWriter';

export type GardenPhase =
  | { kind: 'loading' }
  | { kind: 'ready'; source: Extract<LoadResult, { status: 'ready' }>['source']; recoveredFromBackup: boolean }
  | { kind: 'blocked'; reason: BlockedReason; detail?: string };

const IDLE_STATUS: WriterStatus = { pending: 0, backupStale: false, deleting: false };

/**
 * 画面と単一writerをつなぐ。画面が見るのは「保存が確定した状態」だけ。
 * 操作は run() の結果（成功/失敗）を待ってから、成功の表示や入力の消去を行う。
 */
export const useGarden = () => {
  const [phase, setPhase] = React.useState<GardenPhase>({ kind: 'loading' });
  const [store, setStore] = React.useState<GardenStoreV2>(emptyStore);
  const [status, setStatus] = React.useState<WriterStatus>(IDLE_STATUS);
  const writerRef = React.useRef<GardenWriter | null>(null);

  React.useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const result = await loadGarden(AsyncStorage);
      if (!active) {
        return;
      }
      if (result.status === 'blocked') {
        setPhase({ kind: 'blocked', reason: result.reason, detail: result.detail });
        return;
      }
      const writer = new GardenWriter(AsyncStorage, result.store, { needsInitialPersist: result.needsInitialPersist });
      writerRef.current = writer;
      unsubscribe = writer.subscribe(() => {
        setStore(writer.getSnapshot());
        setStatus(writer.getStatus());
      });
      setStore(result.store);
      setPhase({ kind: 'ready', source: result.source, recoveredFromBackup: Boolean(result.recoveredFromBackup) });
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const run = React.useCallback(
    (command: GardenCommand): Promise<CommitResult> =>
      writerRef.current ? writerRef.current.run(command) : Promise.resolve({ ok: false, reason: 'locked' as const }),
    [],
  );
  const getStore = React.useCallback((): GardenStoreV2 => writerRef.current?.getSnapshot() ?? emptyStore(), []);
  const saveDraft = React.useCallback((draft: Draft | null, draftId?: string) => writerRef.current?.saveDraft(draft, draftId), []);
  const flushDrafts = React.useCallback(() => writerRef.current?.flushDrafts() ?? Promise.resolve(undefined), []);
  const deleteAll = React.useCallback(
    () => writerRef.current?.deleteAll() ?? Promise.resolve({ ok: false as const, detail: '保存データを読み込めていません' }),
    [],
  );
  const retryDeleteAll = React.useCallback(
    () => writerRef.current?.retryDeleteAll() ?? Promise.resolve({ ok: false as const, detail: '保存データを読み込めていません' }),
    [],
  );

  return { phase, store, status, run, getStore, saveDraft, flushDrafts, deleteAll, retryDeleteAll };
};
