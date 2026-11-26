import type { Draft, GardenStoreV2 } from '../domain/types';
import { emptyStore, parseStoreV2, serializeStore } from './gardenModel';
import { type StorageLike, KEYS, beginDeletion, finishDeletion } from './gardenStorage';
import { createId } from '../utils/ids';

// 単一writer。Seed・つながり・芽・下書きの v2 を、一つずつ順番に保存する。
// - コマンドは「最新の確定状態」に適用する（古いUIのスナップショットを丸ごと書き戻さない）
// - 確定点は主保存への書込み。lastGood は補助で、失敗しても操作全体はやり直さない
// - 主保存が確定するまで、確定済みの状態（と成功の通知）は進めない
// 契約: docs/core-growth-data.md §4〜§5

export type Rejection = { rejected: string };

export type GardenCommand = {
  /** 操作の開始時に一度だけ作る。再試行は同じIDで行い、二重に作らない。 */
  id: string;
  /** この操作が確定と同時に消す下書き。 */
  clearsDraftIds?: string[];
  /** 下書きだけの更新など、復元用コピー(lastGood)を更新しなくてよい操作。入力中の書込み量を半分にする。 */
  skipBackup?: boolean;
  apply: (store: GardenStoreV2) => GardenStoreV2 | Rejection;
};

export type CommitResult =
  | { ok: true; revision: number; backupOk: boolean; noop?: boolean; alreadyApplied?: boolean }
  | { ok: false; reason: 'rejected' | 'main_write_failed' | 'locked' | 'cancelled'; detail?: string };

export type WriterStatus = {
  /** 実行待ち・実行中の保存の数。0 なら「保存済み」。 */
  pending: number;
  /** 直近で主保存に失敗した操作。成功すると消える。 */
  lastFailure?: { commandId: string; detail?: string };
  /** lastGood の更新に失敗している（本保存は成功）。 */
  backupStale: boolean;
  deleting: boolean;
};

type Scheduler = (fn: () => void, ms: number) => unknown;
type Canceller = (handle: unknown) => void;

export type WriterOptions = {
  schedule?: Scheduler;
  cancel?: Canceller;
  draftDebounceMs?: number;
  /** 保存直前にストアが「もう空に書き換わった」場合などの確認用。通常は不要。 */
};

/** まだ保存先に書けたと確認できていない下書き。value が null なら「消す」。 */
type UnsavedDraft = { value: Draft | null; seq: number; inFlight: boolean };

/** 書込みの応答が失敗だったとき、実際に反映されたか。unknown は読み直しもできなかった状態。 */
type Confirmation = 'committed' | 'not_committed' | 'unknown';

const isRejection = (value: GardenStoreV2 | Rejection): value is Rejection => 'rejected' in value;

const sameDraft = (a: Draft, b: Draft): boolean => JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });

export class GardenWriter {
  private committed: GardenStoreV2;
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private deleting = false;
  private needsInitialPersist: boolean;
  private unsavedDrafts = new Map<string, UnsavedDraft>();
  private draftSeq = 0;
  private lastDraftJob?: Promise<CommitResult>;
  /** 確定を待っている操作が消す予定の下書き（ID → その操作の数）。 */
  private heldDraftIds = new Map<string, number>();
  private clearedDraftIds = new Set<string>();
  /** 反映されたか分からない書込み。解消するまで次の操作を確定しない。 */
  private uncertain?: GardenStoreV2;
  private draftTimer: unknown;
  private pending = 0;
  private lastFailure: WriterStatus['lastFailure'];
  private backupStale = false;
  private listeners = new Set<() => void>();
  private statusSnapshot: WriterStatus;
  private readonly schedule: Scheduler;
  private readonly cancel: Canceller;
  private readonly draftDebounceMs: number;

  constructor(
    private readonly storage: StorageLike,
    initial: GardenStoreV2,
    options: WriterOptions & { needsInitialPersist?: boolean } = {},
  ) {
    this.committed = initial;
    this.needsInitialPersist = options.needsInitialPersist ?? false;
    this.schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.draftDebounceMs = options.draftDebounceMs ?? 500;
    this.statusSnapshot = this.computeStatus();
  }

  // ---- 購読（useSyncExternalStore 用） ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): GardenStoreV2 => this.committed;
  getStatus = (): WriterStatus => this.statusSnapshot;

  /** 確定済みの下書きに、まだ書き込み中・書込み待ちの入力を重ねた「いまの下書き」。画面を開くときに使う。 */
  getDrafts = (): Draft[] => {
    const drafts = new Map(this.committed.drafts.map((draft) => [draft.id, draft]));
    for (const [id, entry] of this.unsavedDrafts) {
      if (entry.value) drafts.set(id, entry.value);
      else drafts.delete(id);
    }
    return Array.from(drafts.values());
  };

  private computeStatus(): WriterStatus {
    return { pending: this.pending, lastFailure: this.lastFailure, backupStale: this.backupStale, deleting: this.deleting };
  }
  private emit() {
    this.statusSnapshot = this.computeStatus();
    for (const listener of this.listeners) {
      listener();
    }
  }

  // ---- コマンド ----

  run(command: GardenCommand): Promise<CommitResult> {
    if (this.deleting) {
      return Promise.resolve({ ok: false, reason: 'locked' });
    }
    // この操作が確定するまで、消す予定の下書きは自動保存を止めておく（入力は捨てない）。
    const clears = command.clearsDraftIds ?? [];
    for (const id of clears) {
      this.heldDraftIds.set(id, (this.heldDraftIds.get(id) ?? 0) + 1);
    }
    const generation = this.generation;
    this.pending += 1;
    this.emit();
    const job = this.tail.then(async () => {
      let committed = false;
      try {
        const result = await this.execute(command, generation);
        committed = result.ok;
        return result;
      } finally {
        this.releaseDrafts(clears, committed, generation);
      }
    });
    this.tail = job.catch(() => undefined);
    return job.finally(() => {
      this.pending -= 1;
      this.emit();
    });
  }

  /** 確定したら下書きを捨てる。失敗したら入力を残し、自動保存を再開する。 */
  private releaseDrafts(ids: string[], committed: boolean, generation: number): void {
    for (const id of ids) {
      const held = (this.heldDraftIds.get(id) ?? 1) - 1;
      if (held > 0) this.heldDraftIds.set(id, held);
      else this.heldDraftIds.delete(id);
      if (generation !== this.generation) continue;
      if (committed) {
        this.unsavedDrafts.delete(id);
        this.clearedDraftIds.add(id);
      } else if (this.unsavedDrafts.has(id)) {
        this.scheduleDraftFlush();
      }
    }
  }

  private async execute(command: GardenCommand, generation: number): Promise<CommitResult> {
    if (generation !== this.generation) {
      return { ok: false, reason: 'cancelled' };
    }
    if (this.uncertain) {
      // 前の書込みの結果が分かるまで、古い状態を元に書き重ねない。
      const state = await this.confirmCommitted(this.uncertain);
      if (state === 'unknown') {
        this.lastFailure = { commandId: command.id };
        return { ok: false, reason: 'main_write_failed' };
      }
      if (state === 'committed') {
        this.committed = this.uncertain;
        this.needsInitialPersist = false;
      }
      this.uncertain = undefined;
      this.emit();
    }
    const base = this.committed;
    if (base.lastMutationId === command.id) {
      this.lastFailure = undefined;
      return { ok: true, revision: base.revision, backupOk: !this.backupStale, alreadyApplied: true };
    }

    const result = command.apply(base);
    if (isRejection(result)) {
      return { ok: false, reason: 'rejected', detail: result.rejected };
    }
    if (result === base && !this.needsInitialPersist) {
      // 書き直す必要がなくなった下書き（失敗後に消した等）は、未保存の警告も解消する。
      if (command.id.startsWith('draft-')) this.lastFailure = undefined;
      return { ok: true, revision: base.revision, backupOk: !this.backupStale, noop: true };
    }

    const next: GardenStoreV2 = { ...result, revision: base.revision + 1, lastMutationId: command.id };
    const json = serializeStore(next);
    try {
      await this.storage.setItem(KEYS.main, json);
    } catch (error) {
      // 応答不明の可能性がある。読み直して、この操作が確定していたかを確かめる。
      const state = await this.confirmCommitted(next);
      if (state !== 'committed') {
        if (state === 'unknown') this.uncertain = next;
        this.lastFailure = { commandId: command.id, detail: error instanceof Error ? error.message : undefined };
        return { ok: false, reason: 'main_write_failed', detail: this.lastFailure.detail };
      }
    }

    // ここが確定点。
    this.committed = next;
    this.needsInitialPersist = false;
    this.lastFailure = undefined;
    this.emit();

    if (command.skipBackup) {
      return { ok: true, revision: next.revision, backupOk: !this.backupStale };
    }

    let backupOk = true;
    try {
      await this.storage.setItem(KEYS.lastGood, json);
      this.backupStale = false;
    } catch {
      backupOk = false;
      this.backupStale = true;
    }
    this.emit();
    return { ok: true, revision: next.revision, backupOk };
  }

  private async confirmCommitted(expected: GardenStoreV2): Promise<Confirmation> {
    try {
      const raw = await this.storage.getItem(KEYS.main);
      const parsed = raw === null ? undefined : parseStoreV2(raw);
      return parsed?.ok && parsed.store.revision === expected.revision && parsed.store.lastMutationId === expected.lastMutationId
        ? 'committed'
        : 'not_committed';
    } catch {
      return 'unknown';
    }
  }

  // ---- 下書き（入力を重くしない） ----

  /** 待機中の同じ下書きは最新の内容にまとめる。null を渡すと明示的な破棄。 */
  saveDraft(draft: Draft | null, draftId?: string): void {
    const id = draft?.id ?? draftId;
    if (!id || this.deleting || (draft && this.clearedDraftIds.has(id))) {
      return;
    }
    this.draftSeq += 1;
    this.unsavedDrafts.set(id, { value: draft, seq: this.draftSeq, inFlight: false });
    this.scheduleDraftFlush();
  }

  private scheduleDraftFlush(): void {
    if (this.draftTimer === undefined) {
      this.draftTimer = this.schedule(() => {
        this.draftTimer = undefined;
        void this.flushDrafts();
      }, this.draftDebounceMs);
    }
  }

  /**
   * 画面離脱・バックグラウンド移行・確定操作の前に呼ぶ。
   * 書込みに失敗した下書きは捨てずに残し、次の入力や次の flush で書き直す。
   */
  flushDrafts(): Promise<CommitResult | undefined> {
    if (this.draftTimer !== undefined) {
      this.cancel(this.draftTimer);
      this.draftTimer = undefined;
    }
    if (this.deleting) {
      return Promise.resolve(undefined);
    }
    const batch = Array.from(this.unsavedDrafts).filter(([id, entry]) => !entry.inFlight && !this.heldDraftIds.has(id));
    if (batch.length === 0) {
      // 書込み中のものがあれば、その結果を返す。
      const waiting = Array.from(this.unsavedDrafts.values()).some((entry) => entry.inFlight);
      return waiting && this.lastDraftJob ? this.lastDraftJob : Promise.resolve(undefined);
    }
    for (const [, entry] of batch) {
      entry.inFlight = true;
    }
    const job = this.run({
      id: `draft-${createId()}`,
      skipBackup: true,
      apply: (store) => {
        let drafts = store.drafts;
        let changed = false;
        for (const [id, { value: draft }] of batch) {
          const existing = drafts.find((item) => item.id === id);
          if (draft === null) {
            if (existing) {
              drafts = drafts.filter((item) => item.id !== id);
              changed = true;
            }
          } else if (!existing || !sameDraft(existing, draft)) {
            drafts = existing ? drafts.map((item) => (item.id === id ? draft : item)) : [...drafts, draft];
            changed = true;
          }
        }
        return changed ? { ...store, drafts } : store;
      },
    }).then((result) => {
      for (const [id, sent] of batch) {
        // 書込み中に新しい入力が来ていたら、そちらを残す。
        if (this.unsavedDrafts.get(id)?.seq !== sent.seq) continue;
        if (result.ok) this.unsavedDrafts.delete(id);
        else sent.inFlight = false;
      }
      return result;
    });
    this.lastDraftJob = job;
    return job;
  }

  // ---- 全データ削除 ----

  /**
   * 保存中のwriterやキューが旧内容を復活させないよう、専用手順で削除する。
   * 失敗時は markerを残し、次回起動が削除を再開する。
   */
  async deleteAll(): Promise<{ ok: true } | { ok: false; detail?: string }> {
    if (this.deleting) {
      return { ok: false, detail: '削除を実行中です' };
    }
    this.deleting = true; // 新しい保存コマンドの受付を止める
    this.generation += 1; // 旧世代のキューを無効にする
    this.unsavedDrafts.clear();
    if (this.draftTimer !== undefined) {
      this.cancel(this.draftTimer);
      this.draftTimer = undefined;
    }
    this.emit();

    const marker = await beginDeletion(this.storage, createId());
    if (!marker.ok) {
      this.deleting = false;
      this.emit();
      return marker;
    }
    await this.tail; // 進行中の書込みが終わるのを待つ
    const finished = await finishDeletion(this.storage);
    if (!finished.ok) {
      // marker は残す。deleting も維持し、再試行か再起動での再開を待つ。
      this.emit();
      return finished;
    }
    this.committed = emptyStore();
    this.clearedDraftIds.clear();
    this.uncertain = undefined;
    this.lastFailure = undefined;
    this.backupStale = false;
    this.needsInitialPersist = false;
    this.deleting = false;
    this.emit();
    return { ok: true };
  }

  /** 削除の再試行（markerが残っているとき）。 */
  async retryDeleteAll(): Promise<{ ok: true } | { ok: false; detail?: string }> {
    this.deleting = false;
    return this.deleteAll();
  }
}
