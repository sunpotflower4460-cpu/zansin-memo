import { StatusBar } from 'expo-status-bar';
// 和紙の質感。内容の上にごく薄く重ねるだけで、操作は妨げない。
import paperTexture from './assets/paper.png';
import * as React from 'react';
import { AppState, Image, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppLaunchIntro } from './src/components/AppLaunchIntro';
import { AppTabBar } from './src/components/AppTabBar';
import { SaveToast } from './src/components/SaveToast';
import { useGarden } from './src/data/useGarden';
import {
  addTransformOutput,
  bloomSeed,
  captureAndConnect,
  captureSeed,
  connectFromCenter,
  connectSeeds,
  disconnectSeeds,
  promoteToSprout,
  reconsiderSynthesis,
  restoreSeed,
  returnToSprout,
  setArchived,
  setConnectionNote,
  softDeleteSeed,
  touchResurfacing,
  undoPromotion,
  updateSeedFields,
} from './src/domain/gardenCommands';
import type { CommitResult } from './src/data/gardenWriter';
import type { Draft, GrowthState, ResurfacedSeed, Seed, SeedCreateInput, SeedSynthesis, SeedUpdateInput, TransformType, WriteDraft } from './src/domain/types';
import { SeedPickerModal } from './src/components/SeedPickerModal';
import { UndoBar } from './src/components/UndoBar';
import { SynthesisScreen, type SynthesisSaveInput } from './src/screens/SynthesisScreen';
import type { ConnectionsViewMode } from './src/components/ConnectionsPanel';
import { GardenScreen } from './src/screens/GardenScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { SeedDetailScreen } from './src/screens/SeedDetailScreen';
import { SeedsScreen, type SeedsView } from './src/screens/SeedsScreen';
import { WriteScreen } from './src/screens/WriteScreen';
import { theme } from './src/styles/theme';
import { showConfirm } from './src/utils/confirm';
import { motion } from './src/utils/motion';
import { tabLabels } from './src/utils/displayLabels';
import { triggerSuccessFeedback, triggerWarningFeedback } from './src/utils/feedback';
import { exportGarden } from './src/utils/exportUtils';
import { createId } from './src/utils/ids';
import { PRIVACY_POLICY_URL, SUPPORT_URL } from './src/config/appInfo';
import { buildTransformOutput, getLocalDateKey, pickTodaySeed, syncResurfacedSeed } from './src/utils/seedUtils';
import { buildAdjacency, dismissKey } from './src/utils/links';
import { dismissedKeysFor, loadDismissed, saveDismissed } from './src/data/suggestionPrefs';

type MainTab = 'home' | 'write' | 'seeds' | 'garden';

type ScreenState =
  | { kind: MainTab }
  | {
      kind: 'detail';
      seedId: string;
      from: MainTab;
    }
  | {
      kind: 'synthesis';
      centerId: string;
      from: MainTab;
      mode: 'new' | 'review';
      initialMaterialIds?: string[];
    };

/** 芽を保存した直後の「元に戻す」に必要な情報。 */
type UndoInfo = {
  seedId: string;
  savedSynthesisId: string;
  savedSynthesisUpdatedAt: string;
  savedGrowthState: Seed['growthState'];
  previous: { growthState: Seed['growthState']; synthesis?: SeedSynthesis };
  statement: string;
  materials: Array<{ seedId: string; sourcePart: 'body' | 'synthesis' }>;
  materialsChanged: boolean;
};

const TRANSFORM_DOUBLE_TAP_GUARD_MS = 700;
const BLOCKED_MESSAGE = '保存データを読み込めないため、変更を停止しています。データは消していません。';
const SAVE_FAILED_MESSAGE = '保存できませんでした。入力は残っています。もう一度お試しください。';
const CLEAR_ALL_DATA_ALERT_TITLE = 'すべてのデータを削除しますか？';
const CLEAR_ALL_DATA_ALERT_MESSAGE =
  '保存されたすべてのメモ・つながり・芽・下書きと、復元用のコピーが端末から削除されます。この操作は元に戻せません。';
const DRAFT_SAVE_FAILED_MESSAGE = '書きかけを端末に保存できていません。入力は残っています。アプリを閉じずに、もう一度試してください。';
const EXPORT_JSON_ALERT_TITLE = 'JSONで全データを書き出します';
const EXPORT_JSON_ALERT_MESSAGE =
  '削除済みのメモ、つながり、芽と花、参考にしたメモ、下書きもすべて含まれます。この書き出しからアプリへ復元する機能は、現時点ではありません。';

const initialWriteDraft: WriteDraft = {
  title: '',
  body: '',
  tags: '',
  mood: undefined,
  growthState: 'seed',
  importance: 3,
};

/** 書く画面の一回分の操作ID。復元・再試行で作り直さない。 */
type WriteSession = { draftId: string; seedId: string; commandId: string };
const newWriteSession = (): WriteSession => ({ draftId: createId(), seedId: createId(), commandId: createId() });

const isBlankDraft = (draft: WriteDraft) => draft.body.trim() === '' && draft.title.trim() === '' && draft.tags.trim() === '';

/** 同じ対象の下書きが複数あれば、最後に書いたものを使う。 */
const latestDraft = (drafts: Draft[], kind: Draft['kind'], targetSeedId: string): Draft | undefined =>
  drafts
    .filter((draft) => draft.kind === kind && draft.targetSeedId === targetSeedId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

export default function App() {
  const garden = useGarden();
  const { store } = garden;
  const seeds = store.seeds;
  const isReady = garden.phase.kind !== 'loading';
  const isBlocked = garden.phase.kind === 'blocked';
  const [showLaunchIntro, setShowLaunchIntro] = React.useState(true);
  const [practiceOpen, setPracticeOpen] = React.useState(false);
  const [screen, setScreen] = React.useState<ScreenState>({ kind: 'home' });
  const [writeDraft, setWriteDraft] = React.useState(initialWriteDraft);
  /** 「メモを足す」の接続先（中心）。 */
  const [writeTargetId, setWriteTargetId] = React.useState<string | undefined>();
  const [writeStandalone, setWriteStandalone] = React.useState(false);
  const [writeSaving, setWriteSaving] = React.useState(false);
  const [todaySeed, setTodaySeed] = React.useState<ResurfacedSeed | undefined>();
  const [todayKey, setTodayKey] = React.useState('');
  const [seedsSearch, setSeedsSearch] = React.useState('');
  const [seedsView, setSeedsView] = React.useState<SeedsView>('all');
  const [selecting, setSelecting] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const seedsScrollRef = React.useRef(0);
  /** これまでに中心にして見てきたメモ（古い順）。詳細から一覧へ戻ると空にする。 */
  const [trail, setTrail] = React.useState<string[]>([]);
  const [connectionsViewMode, setConnectionsViewMode] = React.useState<ConnectionsViewMode>('map');
  const [savedMemoId, setSavedMemoId] = React.useState<string | undefined>();
  const [savedPickerOpen, setSavedPickerOpen] = React.useState(false);
  const [synthesisSaving, setSynthesisSaving] = React.useState(false);
  const [synthesisError, setSynthesisError] = React.useState('');
  const [undo, setUndo] = React.useState<UndoInfo | undefined>();
  /** 「今回は見送る」にした候補のペア（画面設定。次回起動後も残る）。 */
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = React.useState<GrowthState | 'all'>('all');
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [sortType, setSortType] = React.useState<'updated' | 'importance'>('updated');
  const [toastKey, setToastKey] = React.useState(0);
  const [toastMsg, setToastMsg] = React.useState('');
  /** 消えないエラー（保存失敗など）。成功するか、本人が閉じるまで残す。 */
  const [persistentError, setPersistentError] = React.useState('');
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchedAtRef = React.useRef(Date.now());
  const transformTapMapRef = React.useRef<Record<string, number>>({});
  const writeSessionRef = React.useRef<WriteSession | null>(null);
  /** 書きかけの復元が終わるまで、空の入力欄を下書きへ反映しない（復元前の下書きを消さない）。 */
  const [draftsRestored, setDraftsRestored] = React.useState(false);
  const didStartupChecksRef = React.useRef(false);

  const showToast = React.useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastKey((k) => k + 1);
    toastTimer.current = setTimeout(() => setToastMsg(''), 3400);
  }, []);

  const blockIfLocked = React.useCallback((): boolean => {
    if (!isBlocked) {
      return false;
    }
    setPersistentError(BLOCKED_MESSAGE);
    return true;
  }, [isBlocked]);

  /** 確定した結果だけを成功として扱う。失敗は消えない表示にして、入力を残す。 */
  const reportFailure = React.useCallback((result: Extract<CommitResult, { ok: false }>) => {
    setPersistentError(
      result.reason === 'rejected' && result.detail === 'conflict'
        ? '別の更新が先に保存されました。入力は残っています。内容を確かめてからもう一度保存してください。'
        : result.reason === 'locked'
          ? BLOCKED_MESSAGE
          : SAVE_FAILED_MESSAGE,
    );
  }, []);

  const afterCommit = React.useCallback(
    (result: CommitResult, successMessage?: string): boolean => {
      if (!result.ok) {
        reportFailure(result);
        return false;
      }
      setPersistentError('');
      triggerSuccessFeedback();
      if (successMessage) {
        showToast(result.backupOk ? successMessage : `${successMessage}（バックアップの更新だけ失敗しました）`);
      }
      return true;
    },
    [reportFailure, showToast],
  );

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (launchTimer.current) clearTimeout(launchTimer.current);
    };
  }, []);

  // 起動の演出は、読込が終わったら待たせずに閉じる（入力を遅らせない）。
  React.useEffect(() => {
    if (!isReady) {
      return;
    }
    const elapsed = Date.now() - launchedAtRef.current;
    launchTimer.current = setTimeout(() => setShowLaunchIntro(false), Math.max(0, motion.launchMinVisibleMs - elapsed));
    return () => {
      if (launchTimer.current) clearTimeout(launchTimer.current);
    };
  }, [isReady]);

  // 読込が終わったときに一度だけ: 復元の通知、初回案内、書きかけの復元。
  React.useEffect(() => {
    if (garden.phase.kind === 'loading' || didStartupChecksRef.current) {
      return;
    }
    didStartupChecksRef.current = true;

    if (garden.phase.kind === 'blocked') {
      setPersistentError(BLOCKED_MESSAGE);
      return;
    }
    if (garden.phase.recoveredFromBackup) {
      showToast('バックアップからメモを復元しました。');
    }

    setDraftsRestored(true);
    const restorable = store.drafts.find((draft) => draft.kind === 'new' || draft.kind === 'add-memo');
    if (restorable) {
      writeSessionRef.current = {
        draftId: restorable.id,
        seedId: restorable.plannedId ?? createId(),
        commandId: createId(),
      };
      setWriteDraft({
        title: restorable.title ?? '',
        body: restorable.body,
        tags: restorable.tags ?? '',
        mood: restorable.mood,
        growthState: 'seed',
        importance: restorable.importance ?? 3,
      });
      setWriteTargetId(restorable.kind === 'add-memo' ? restorable.targetSeedId : undefined);
      setWriteStandalone(Boolean(restorable.standalone));
    }

  }, [garden.phase, showToast, store.drafts, store.seeds.length]);

  const activeSeeds = React.useMemo(() => seeds.filter((seed) => !seed.deletedAt), [seeds]);
  const deletedSeeds = React.useMemo(
    () => seeds.filter((seed) => seed.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [seeds],
  );
  /** 表示するつながり。両端が削除されていないものだけ（削除済みへの線は復元まで見せない）。 */
  const activeConnections = React.useMemo(() => {
    const ids = new Set(activeSeeds.map((seed) => seed.id));
    return store.connections.filter((connection) => ids.has(connection.aSeedId) && ids.has(connection.bSeedId));
  }, [activeSeeds, store.connections]);

  // ---- 書きかけ（入力は即座に画面へ、保存は間を置いて writer へ） ----

  const writeTargetSeed = React.useMemo(
    () => (writeTargetId ? activeSeeds.find((seed) => seed.id === writeTargetId) : undefined),
    [activeSeeds, writeTargetId],
  );

  React.useEffect(() => {
    if (!isReady || isBlocked || !draftsRestored) {
      return;
    }
    if (isBlankDraft(writeDraft)) {
      if (writeSessionRef.current) {
        garden.saveDraft(null, writeSessionRef.current.draftId);
        writeSessionRef.current = null;
      }
      return;
    }
    const session = (writeSessionRef.current ??= newWriteSession());
    const draft: Draft = {
      id: session.draftId,
      kind: writeTargetSeed && !writeStandalone ? 'add-memo' : 'new',
      targetSeedId: writeTargetSeed?.id,
      plannedId: session.seedId,
      body: writeDraft.body,
      title: writeDraft.title,
      tags: writeDraft.tags,
      mood: writeDraft.mood,
      growthState: writeDraft.growthState,
      importance: writeDraft.importance,
      standalone: writeStandalone || undefined,
      updatedAt: new Date().toISOString(),
    };
    garden.saveDraft(draft);
  }, [writeDraft, writeTargetSeed, writeStandalone, isReady, isBlocked, draftsRestored]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void garden.flushDrafts();
      }
    });
    return () => subscription.remove();
  }, [garden]);

  // ---- 今日の種（再浮上の記録も writer を通す） ----

  const refreshTodaySeed = React.useCallback(() => {
    const picked = pickTodaySeed(activeSeeds, activeConnections);
    setTodaySeed(picked);
    setTodayKey(getLocalDateKey());
    if (!picked || isBlocked) {
      return;
    }
    void garden.run(
      touchResurfacing({
        commandId: createId(),
        seedId: picked.seed.id,
        resurfacedAt: new Date().toISOString(),
        score: picked.seed.resurfacingScore,
      }),
    );
  }, [activeSeeds, activeConnections, garden, isBlocked]);

  const displayedTodaySeed = React.useMemo(() => syncResurfacedSeed(todaySeed, activeSeeds), [todaySeed, activeSeeds]);

  React.useEffect(() => {
    if (!isReady || isBlocked) {
      return;
    }
    if (todayKey !== getLocalDateKey() || !displayedTodaySeed) {
      refreshTodaySeed();
    }
  }, [displayedTodaySeed, isReady, isBlocked, todayKey, refreshTodaySeed]);

  // ---- 操作（確定してから成功を表示する） ----

  const resetWrite = () => {
    writeSessionRef.current = null;
    setWriteDraft(initialWriteDraft);
    setWriteTargetId(undefined);
    setWriteStandalone(false);
  };

  const handleCreateSeed = async (input: SeedCreateInput) => {
    if (!input.body.trim() || blockIfLocked() || writeSaving) {
      return;
    }
    const session = (writeSessionRef.current ??= newWriteSession());
    const center = writeTargetSeed && !writeStandalone ? writeTargetSeed : undefined;
    const now = new Date().toISOString();

    setWriteSaving(true);
    // 確定操作の前に、待機中の下書き保存を優先して流す。
    await garden.flushDrafts();
    const result = await garden.run(
      center
        ? captureAndConnect({ commandId: session.commandId, seedId: session.seedId, input, centerId: center.id, now, draftId: session.draftId })
        : captureSeed({ commandId: session.commandId, seedId: session.seedId, input, now, draftId: session.draftId }),
    );
    setWriteSaving(false);

    if (!afterCommit(result, center ? '保存して、つなぎました。線で結ばれたメモを見られます' : undefined)) {
      return; // 失敗: 入力・接続先・操作IDを残す（もう一度押すと同じ操作を再試行する）
    }
    const savedId = session.seedId;
    resetWrite();
    if (center) {
      // 「メモを足す」は、元のメモへ戻って、加わったメモと線を見せる。
      openDetail(center.id, 'seeds', true);
      return;
    }
    // 通常の保存は、書く画面にとどまり「保存しました」のカードを見せる（任意で、すぐ別のメモとつなげられる）。
    setSavedMemoId(savedId);
  };

  const openDetail = (seedId: string, from: MainTab, resetTrail: boolean) => {
    if (resetTrail) {
      setTrail([]);
    }
    setScreen({ kind: 'detail', seedId, from });
  };

  const handleAddMemo = (seedId: string) => {
    if (!activeSeeds.some((seed) => seed.id === seedId)) {
      return;
    }
    // 書きかけがあれば消さずに、その接続先だけを切り替える。
    setWriteTargetId(seedId);
    setWriteStandalone(false);
    setScreen({ kind: 'write' });
  };

  const handleUpdateSeed = async (seedId: string, payload: SeedUpdateInput, expectedUpdatedAt: string, draftId: string): Promise<boolean> => {
    if ((payload.body !== undefined && !payload.body.trim()) || blockIfLocked()) {
      return false;
    }
    await garden.flushDrafts();
    const result = await garden.run(
      updateSeedFields({ commandId: createId(), seedId, patch: payload, now: new Date().toISOString(), expectedUpdatedAt, draftId }),
    );
    return afterCommit(result, '更新しました ✨');
  };

  const handleDeleteSeed = async (seedId: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(softDeleteSeed({ commandId: createId(), seedId, now: new Date().toISOString() }));
    if (!afterCommit(result)) {
      return;
    }
    triggerWarningFeedback();
    setTodaySeed((current) => (current?.seed.id === seedId ? undefined : current));
    setScreen({ kind: 'seeds' });
    showToast('削除しました。「種一覧」の一番下から元に戻せます');
  };

  const handleRestoreSeed = React.useCallback(
    async (seedId: string) => {
      if (blockIfLocked()) {
        return;
      }
      const result = await garden.run(restoreSeed({ commandId: createId(), seedId, now: new Date().toISOString() }));
      afterCommit(result, '復元しました 🌱');
    },
    [afterCommit, blockIfLocked, garden],
  );

  const handleLinkSeeds = async (seedId: string, otherId: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(connectSeeds({ commandId: createId(), a: seedId, b: otherId, now: new Date().toISOString() }));
    afterCommit(result, 'つなぎました 🌿');
  };

  const handleSetConnectionNote = async (seedId: string, otherId: string, note: string): Promise<boolean> => {
    if (blockIfLocked()) {
      return false;
    }
    const result = await garden.run(setConnectionNote({ commandId: createId(), a: seedId, b: otherId, note }));
    return afterCommit(result, note.trim() ? '一言を保存しました' : '一言を消しました');
  };

  /** 一覧で選んだメモは、つなげられたときだけ選択を解除する（失敗したら選び直さずに再試行できる）。 */
  const clearSelection = () => {
    setSelecting(false);
    setSelectedIds([]);
  };

  const handleConnectPair = async (aId: string, bId: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(connectSeeds({ commandId: createId(), a: aId, b: bId, now: new Date().toISOString() }));
    if (afterCommit(result, 'つなぎました。線で結ばれた2つのメモを見られます')) {
      clearSelection();
      openDetail(aId, 'seeds', true);
    }
  };

  const handleConnectFromCenter = async (centerId: string, targetIds: string[]) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(connectFromCenter({ commandId: createId(), centerId, targetIds, now: new Date().toISOString() }));
    if (afterCommit(result, 'つなぎました。選んだ線だけを追加しています')) {
      clearSelection();
      openDetail(centerId, 'seeds', true);
    }
  };

  const handleUnlinkSeeds = async (seedId: string, otherId: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(disconnectSeeds({ commandId: createId(), a: seedId, b: otherId }));
    afterCommit(result, 'つながりを外しました。メモは両方とも残っています');
  };

  const handleCreateTransform = async (seedId: string, type: TransformType) => {
    if (blockIfLocked()) {
      return;
    }
    const key = `${seedId}:${type}`;
    const now = Date.now();
    if (now - (transformTapMapRef.current[key] ?? 0) < TRANSFORM_DOUBLE_TAP_GUARD_MS) {
      return;
    }
    transformTapMapRef.current[key] = now;

    const seed = seeds.find((item) => item.id === seedId);
    if (!seed) {
      return;
    }
    const result = await garden.run(
      addTransformOutput({ commandId: createId(), seedId, output: buildTransformOutput(seed, type), now: new Date().toISOString() }),
    );
    afterCommit(result, '候補を追加しました');
  };

  const handleExportJson = React.useCallback(() => {
    // 削除済み・下書きも含む全データであることを、実行の前に伝える。
    showConfirm(EXPORT_JSON_ALERT_TITLE, EXPORT_JSON_ALERT_MESSAGE, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '書き出す',
        onPress: () => {
          void (async () => {
            // 直前に書いた下書きも含められるよう、先に書き込む。
            await garden.flushDrafts();
            const result = await exportGarden(garden.getStore(), 'json');
            if (!result.ok) {
              showToast(result.message);
            }
          })();
        },
      },
    ]);
  }, [garden, showToast]);

  const handleExportText = React.useCallback(async () => {
    const result = await exportGarden(store, 'text');
    if (!result.ok) {
      showToast(result.message);
    }
  }, [store, showToast]);

  const openExternalUrl = React.useCallback(
    async (url: string, failureMessage: string) => {
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) {
          showToast(failureMessage);
          return;
        }
        await Linking.openURL(url);
      } catch {
        showToast(failureMessage);
      }
    },
    [showToast],
  );

  const handleOpenPrivacyPolicy = React.useCallback(() => {
    void openExternalUrl(PRIVACY_POLICY_URL, 'プライバシーポリシーを開けませんでした。');
  }, [openExternalUrl]);

  const handleOpenSupport = React.useCallback(() => {
    void openExternalUrl(SUPPORT_URL, 'サポート連絡先を開けませんでした。');
  }, [openExternalUrl]);

  const handleClearAllData = React.useCallback(() => {
    showConfirm(CLEAR_ALL_DATA_ALERT_TITLE, CLEAR_ALL_DATA_ALERT_MESSAGE, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'すべて削除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            // 削除は専用の手順。すべてのキーの消去と空データの確定を確認できるまで、完了と表示しない。
            const retry = garden.status.deleting;
            const result = retry ? await garden.retryDeleteAll() : await garden.deleteAll();
            if (!result.ok) {
              setPersistentError('削除を完了できませんでした。もう一度「すべてのデータを削除」を押してください。アプリを開き直すと、削除の続きから再開します。');
              return;
            }
            triggerWarningFeedback();
            setPersistentError('');
            setTodaySeed(undefined);
            setDismissed(new Set());
            resetWrite();
            setSeedsSearch('');
            setStateFilter('all');
            setTagFilter(null);
            setScreen({ kind: 'home' });
            showToast('すべてのデータを削除しました。');
          })();
        },
      },
    ]);
  }, [garden, showToast]);

  const selectedSeed = screen.kind === 'detail' ? activeSeeds.find((seed) => seed.id === screen.seedId) : undefined;
  const synthesisCenter = screen.kind === 'synthesis' ? activeSeeds.find((seed) => seed.id === screen.centerId) : undefined;

  React.useEffect(() => {
    if ((screen.kind === 'detail' && !selectedSeed) || (screen.kind === 'synthesis' && !synthesisCenter)) {
      setScreen({ kind: screen.from });
    }
  }, [screen, selectedSeed, synthesisCenter]);

  // ---- 芽 ----

  const openSynthesis = (centerId: string, mode: 'new' | 'review', from: MainTab, initialMaterialIds?: string[]) => {
    setSynthesisError('');
    // 同じ芽を開き直したら、直前の「元に戻す」は閉じる（開いている画面の下で芽を消さない）。
    setUndo((current) => (current?.seedId === centerId ? undefined : current));
    setScreen({ kind: 'synthesis', centerId, from, mode, initialMaterialIds });
  };

  const synthesisErrorMessage = (detail?: string): string => {
    if (detail?.startsWith('source_changed')) {
      return '参考にしたメモが、読んだあとに変わりました。内容を確かめて、もう一度保存してください。入力は残っています。';
    }
    if (detail?.startsWith('source_missing')) {
      return '参考にしたメモが、削除されたか見つかりません。選び直してください。入力は残っています。';
    }
    if (detail === 'center_has_synthesis') {
      return 'このメモにはすでに芽があります。「いまの芽を書き直す」から保存してください。入力は残っています。';
    }
    return SAVE_FAILED_MESSAGE;
  };

  const handleSaveSynthesis = async (input: SynthesisSaveInput): Promise<boolean> => {
    if (screen.kind !== 'synthesis' || !synthesisCenter || synthesisSaving || blockIfLocked()) {
      return false;
    }
    const center = synthesisCenter;
    const previous = { growthState: center.growthState, synthesis: center.synthesis };
    const mode = screen.mode;
    setSynthesisSaving(true);
    setSynthesisError('');
    await garden.flushDrafts();
    const result = await garden.run(
      promoteToSprout({
        commandId: `promote:${input.draftId}`,
        centerId: center.id,
        synthesisId: input.synthesisId,
        statement: input.statement,
        centerBodyText: input.centerBodyText,
        materials: input.materials,
        keepExistingSources: input.keepExistingSources,
        review: mode === 'review',
        now: new Date().toISOString(),
        draftId: input.draftId,
      }),
    );
    setSynthesisSaving(false);
    if (!result.ok) {
      setSynthesisError(synthesisErrorMessage(result.reason === 'rejected' ? result.detail : undefined));
      return false;
    }
    setPersistentError('');
    triggerSuccessFeedback();
    const saved = garden.getStore().seeds.find((seed) => seed.id === center.id)?.synthesis;
    if (saved) {
      setUndo({
        seedId: center.id,
        savedSynthesisId: saved.id,
        savedSynthesisUpdatedAt: saved.updatedAt,
        savedGrowthState: garden.getStore().seeds.find((seed) => seed.id === center.id)?.growthState ?? 'sprout',
        previous,
        statement: saved.statement,
        materials: saved.sources.filter((s) => !(s.seedId === center.id && s.sourcePart === 'body')).map((s) => ({ seedId: s.seedId, sourcePart: s.sourcePart })),
        materialsChanged: JSON.stringify(saved.sources) !== JSON.stringify(previous.synthesis?.sources ?? []),
      });
    }
    // 成功は「元に戻す」の帯で伝える。通知を重ねて出さない。
    if (!result.backupOk || !saved) {
      showToast(result.backupOk ? '芽として保存しました 🌱 元のメモは変わっていません' : '芽として保存しました（バックアップの更新だけ失敗しました）');
    }
    openDetail(center.id, screen.from, true);
    return true;
  };

  const handleUndoPromotion = async () => {
    if (!undo) {
      return;
    }
    const info = undo;
    setUndo(undefined);
    const keepDraft: Draft = {
      id: createId(),
      kind: 'synthesis',
      targetSeedId: info.seedId,
      plannedId: info.previous.synthesis?.id ?? createId(),
      body: info.statement,
      materials: info.materials,
      // 材料を変えた見直しを戻すときは、選んだ材料から書き直せるようにする。
      reselect: info.previous.synthesis && info.materialsChanged ? true : undefined,
      updatedAt: new Date().toISOString(),
    };
    // 書き込み待ちの下書きも「保存のあとの変更」として確かめられるようにする。
    await garden.flushDrafts();
    if (garden.getDrafts().some((draft) => draft.kind === 'synthesis' && draft.targetSeedId === info.seedId)) {
      showToast('保存のあとに別の変更があったため、巻き戻せませんでした。「書き直す」から直せます');
      return;
    }
    const result = await garden.run(
      undoPromotion({
        commandId: createId(),
        seedId: info.seedId,
        savedSynthesisId: info.savedSynthesisId,
        savedSynthesisUpdatedAt: info.savedSynthesisUpdatedAt,
        savedGrowthState: info.savedGrowthState,
        previous: info.previous,
        keepDraft,
      }),
    );
    if (result.ok) {
      showToast('元に戻しました。書いた文章は下書きに残しています');
    } else if (result.reason === 'rejected' && result.detail === 'changed_since_save') {
      showToast('保存のあとに別の変更があったため、巻き戻せませんでした。「書き直す」から直せます');
    } else {
      reportFailure(result);
    }
  };

  React.useEffect(() => {
    let active = true;
    void loadDismissed().then((loaded) => {
      if (active) setDismissed(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleDismissSuggestion = (seedId: string, otherId: string) => {
    const next = new Set(dismissed).add(dismissKey(seedId, otherId));
    setDismissed(next);
    void saveDismissed(next);
    showToast('今回は見送りました。同じ組合せは出しません');
  };

  const handleRestoreDismissed = (seedId: string) => {
    const next = new Set(dismissed);
    for (const key of dismissedKeysFor(dismissed, seedId)) next.delete(key);
    setDismissed(next);
    void saveDismissed(next);
    showToast('見送った候補を戻しました');
  };

  // 帯の表示時間が、画面の描き直しのたびに延びないようにする。
  const dismissUndo = React.useCallback(() => setUndo(undefined), []);

  const handleReconsider = async (seedId: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(reconsiderSynthesis({ commandId: createId(), seedId }));
    afterCommit(result, '種に戻しました。書いた考えは残っています');
  };

  const handleBloom = async (seedId: string, note: string): Promise<boolean> => {
    if (blockIfLocked()) {
      return false;
    }
    const result = await garden.run(bloomSeed({ commandId: createId(), seedId, note, now: new Date().toISOString() }));
    const ok = afterCommit(result, '花が咲きました 🌸');
    if (ok) setUndo((current) => (current?.seedId === seedId ? undefined : current));
    return ok;
  };

  const handleReturnToSprout = async (seedId: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(returnToSprout({ commandId: createId(), seedId }));
    afterCommit(result, '芽に戻しました');
  };

  const handleSetArchived = async (seedId: string, archived: boolean) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(setArchived({ commandId: createId(), seedId, archived }));
    afterCommit(result, archived ? '保管しました' : '保管から戻しました');
  };

  // 書く画面を離れたら、「保存しました」のカードは閉じる。入力を始めたときも閉じる。
  React.useEffect(() => {
    if (screen.kind !== 'write' || !isBlankDraft(writeDraft)) {
      setSavedMemoId(undefined);
    }
  }, [screen.kind, writeDraft]);

  const savedMemo = savedMemoId ? activeSeeds.find((seed) => seed.id === savedMemoId) : undefined;
  const savedNeighborIds = React.useMemo(
    () => (savedMemo ? (buildAdjacency(activeSeeds, activeConnections).get(savedMemo.id) ?? new Set<string>()) : new Set<string>()),
    [savedMemo, activeSeeds, activeConnections],
  );

  const renderMainScreen = () => {
    if (!isReady) {
      return null;
    }

    if (screen.kind === 'detail' && selectedSeed) {
      const drafts = garden.getDrafts();
      const editDraft = latestDraft(drafts, 'edit-body', selectedSeed.id);
      const trailSeeds = trail.map((id) => activeSeeds.find((seed) => seed.id === id)).filter((seed): seed is NonNullable<typeof seed> => Boolean(seed));
      return (
        <SeedDetailScreen
          key={selectedSeed.id}
          seed={selectedSeed}
          allSeeds={activeSeeds}
          deletedSeeds={deletedSeeds}
          connections={activeConnections}
          onBack={() => {
            setTrail([]);
            setScreen({ kind: screen.from });
          }}
          backLabel={tabLabels[screen.from]}
          trail={trailSeeds}
          onBackOneCenter={() => {
            const previous = trail[trail.length - 1];
            setTrail(trail.slice(0, -1));
            if (previous) setScreen({ kind: 'detail', seedId: previous, from: screen.from });
          }}
          onBackToFirst={() => {
            const first = trail[0];
            setTrail([]);
            if (first) setScreen({ kind: 'detail', seedId: first, from: screen.from });
          }}
          connectionsViewMode={connectionsViewMode}
          onChangeConnectionsViewMode={setConnectionsViewMode}
          editDraft={editDraft}
          onEditDraftChange={(draft, draftId) => garden.saveDraft(draft, draftId)}
          onFlushDrafts={async () => {
            const result = await garden.flushDrafts();
            return !result || result.ok;
          }}
          onNotify={showToast}
          onSave={handleUpdateSeed}
          onDelete={handleDeleteSeed}
          onOpenSeed={(seedId) => {
            // 中心を移す。戻れるよう、いまのメモを経路に積む（親子ではなく、見てきた順）。
            setTrail((current) => [...current, selectedSeed.id]);
            setScreen({ kind: 'detail', seedId, from: screen.from });
          }}
          onLinkSeeds={handleLinkSeeds}
          onUnlinkSeeds={handleUnlinkSeeds}
          onSetConnectionNote={handleSetConnectionNote}
          onAddMemo={handleAddMemo}
          onCreateTransform={handleCreateTransform}
          onOpenSynthesis={(seedId, mode) => openSynthesis(seedId, mode, screen.from)}
          onReconsiderSynthesis={handleReconsider}
          synthesisDraftText={latestDraft(drafts, 'synthesis', selectedSeed.id)?.body}
          onBloom={handleBloom}
          onReturnToSprout={handleReturnToSprout}
          onSetArchived={handleSetArchived}
          dismissedSuggestions={dismissed}
          dismissedCount={dismissedKeysFor(dismissed, selectedSeed.id).length}
          onDismissSuggestion={handleDismissSuggestion}
          onRestoreDismissed={handleRestoreDismissed}
        />
      );
    }

    if (screen.kind === 'synthesis' && synthesisCenter) {
      const synthesisDraft = latestDraft(garden.getDrafts(), 'synthesis', synthesisCenter.id);
      return (
        <SynthesisScreen
          key={`${screen.mode}`}
          mode={screen.mode}
          center={synthesisCenter}
          seeds={activeSeeds}
          deletedSeeds={deletedSeeds}
          connections={activeConnections}
          initialMaterialIds={screen.initialMaterialIds}
          draft={synthesisDraft}
          saving={synthesisSaving}
          errorMessage={synthesisError}
          onDraftChange={(draft, draftId) => garden.saveDraft(draft, draftId)}
          onSave={handleSaveSynthesis}
          onChangeCenter={(seedId) => setScreen({ ...screen, centerId: seedId, mode: 'new', initialMaterialIds: undefined })}
          onSwitchToReview={() => {
            void (async () => {
              await garden.flushDrafts();
              setScreen({ ...screen, mode: 'review', initialMaterialIds: undefined });
            })();
          }}
          onPostpone={() => {
            void garden.flushDrafts();
            showToast('下書きに残しました。メモの詳細から、続きを書けます');
            openDetail(synthesisCenter.id, screen.from, true);
          }}
          onBack={() => {
            void garden.flushDrafts();
            openDetail(synthesisCenter.id, screen.from, true);
          }}
          onOpenSeed={(seedId) => openDetail(seedId, screen.from, true)}
        />
      );
    }

    if (screen.kind === 'write') {
      return (
        <WriteScreen
          draft={writeDraft}
          addTo={writeTargetSeed}
          standalone={writeStandalone}
          saving={writeSaving}
          onChange={(next) => {
            // 保存の確定を待つ間の入力は、確定後の消去に巻き込まれるので受け付けない。
            if (!writeSaving) setWriteDraft((current) => ({ ...current, ...next }));
          }}
          onToggleStandalone={() => setWriteStandalone((value) => !value)}
          onClearTarget={() => {
            setWriteTargetId(undefined);
            setWriteStandalone(false);
          }}
          savedMemo={savedMemo}
          savedLinkCount={savedNeighborIds.size}
          onWriteSprout={() => savedMemo && openSynthesis(savedMemo.id, savedMemo.synthesis ? 'review' : 'new', 'write')}
          isFirstSave={activeSeeds.length <= 1}
          onConnectSaved={() => setSavedPickerOpen(true)}
          onDismissSaved={() => setSavedMemoId(undefined)}
          onOpenSaved={() => savedMemo && openDetail(savedMemo.id, 'write', true)}
          onSave={handleCreateSeed}
        />
      );
    }

    if (screen.kind === 'seeds') {
      return (
        <SeedsScreen
          seeds={activeSeeds}
          connections={activeConnections}
          deletedSeeds={deletedSeeds}
          search={seedsSearch}
          view={seedsView}
          stateFilter={stateFilter}
          tagFilter={tagFilter}
          sortType={sortType}
          selecting={selecting}
          selectedIds={selectedIds}
          scrollOffset={seedsScrollRef.current}
          onChangeSearch={setSeedsSearch}
          onChangeView={setSeedsView}
          onChangeFilter={setStateFilter}
          onChangeTagFilter={setTagFilter}
          onChangeSort={setSortType}
          onChangeSelecting={setSelecting}
          onChangeSelectedIds={setSelectedIds}
          onScrollOffsetChange={(offset) => {
            seedsScrollRef.current = offset;
          }}
          onRestoreSeed={handleRestoreSeed}
          onOpenSeed={(seedId) => openDetail(seedId, 'seeds', true)}
          onOpenWrite={() => setScreen({ kind: 'write' })}
          onConnectPair={handleConnectPair}
          onConnectFromCenter={handleConnectFromCenter}
          onStartSynthesis={(ids) => {
            if (ids.length > 0) openSynthesis(ids[0], 'new', 'seeds', ids.slice(1));
          }}
        />
      );
    }

    if (screen.kind === 'garden') {
      return (
        <GardenScreen
          seeds={activeSeeds}
          connections={activeConnections}
          onOpenSeed={(seedId) => openDetail(seedId, 'garden', true)}
          onOpenSeedsByState={(state) => {
            setSeedsSearch('');
            setSeedsView('all');
            setTagFilter(null);
            setStateFilter(state);
            seedsScrollRef.current = 0;
            setScreen({ kind: 'seeds' });
          }}
          onSearchWord={(word) => {
            setSeedsSearch(word);
            setSeedsView('all');
            setTagFilter(null);
            setStateFilter('all');
            seedsScrollRef.current = 0;
            setScreen({ kind: 'seeds' });
          }}
          onOpenConnectedList={() => {
            setSeedsSearch('');
            setSeedsView('connected');
            setTagFilter(null);
            setStateFilter('all');
            seedsScrollRef.current = 0;
            setScreen({ kind: 'seeds' });
          }}
        />
      );
    }

    return (
      <HomeScreen
        seeds={activeSeeds}
        connections={activeConnections}
        todaySeed={displayedTodaySeed}
        onRefreshToday={refreshTodaySeed}
        onOpenWrite={() => setScreen({ kind: 'write' })}
        onOpenGarden={() => setScreen({ kind: 'garden' })}
        onAddMemo={handleAddMemo}
        onOpenSynthesis={(seedId, mode) => openSynthesis(seedId, mode, 'home')}
        onShowPractice={() => setPracticeOpen(true)}
        onOpenSeed={(seedId) => openDetail(seedId, 'home', true)}
        onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
        onOpenSupport={handleOpenSupport}
        onClearAllData={handleClearAllData}
        onExportJson={handleExportJson}
        onExportText={handleExportText}
      />
    );
  };

  const activeTab: MainTab = screen.kind === 'detail' || screen.kind === 'synthesis' ? screen.from : screen.kind;
  // 成功の通知は時間で消える。失敗・読込停止は、解決するまで消えない。
  const draftSaveFailed = Boolean(garden.status.lastFailure?.commandId.startsWith('draft-'));
  const statusToastMessage = toastMsg || persistentError || (draftSaveFailed ? DRAFT_SAVE_FAILED_MESSAGE : '');
  const tabBarVisible = screen.kind !== 'detail' && screen.kind !== 'synthesis' && isReady && !practiceOpen;

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={styles.app}>
          {renderMainScreen()}
          {statusToastMessage ? (
            <SaveToast
              key={toastKey}
              message={statusToastMessage}
              tone={toastMsg && !persistentError ? 'default' : 'error'}
              aboveTabBar={tabBarVisible}
            />
          ) : null}
          {undo ? (
            <UndoBar
              message="芽として保存しました"
              actionLabel="元に戻す"
              onAction={() => void handleUndoPromotion()}
              onDismiss={dismissUndo}
              aboveTabBar={tabBarVisible}
            />
          ) : null}
          {savedMemo ? (
            <SeedPickerModal
              visible={savedPickerOpen}
              candidates={activeSeeds.filter((seed) => seed.id !== savedMemo.id)}
              linkedIds={savedNeighborIds}
              onToggle={(otherId) => (savedNeighborIds.has(otherId) ? void handleUnlinkSeeds(savedMemo.id, otherId) : void handleLinkSeeds(savedMemo.id, otherId))}
              onClose={() => setSavedPickerOpen(false)}
            />
          ) : null}
          {practiceOpen && isReady ? (
            <View style={styles.practice}>
              <PracticeScreen
                onClose={() => setPracticeOpen(false)}
                onStartWriting={() => {
                  setPracticeOpen(false);
                  setScreen({ kind: 'write' });
                }}
              />
            </View>
          ) : null}
          <AppLaunchIntro visible={!isReady || showLaunchIntro} />
        </View>
        {tabBarVisible ? <AppTabBar activeTab={activeTab} onChangeTab={(tab) => setScreen({ kind: tab })} /> : null}
      </SafeAreaView>
      <View style={styles.paper} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
        <Image source={paperTexture} resizeMode="repeat" style={styles.paperImage} />
      </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  paper: {
    ...StyleSheet.absoluteFillObject,
  },
  paperImage: {
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  app: {
    flex: 1,
  },
  practice: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: theme.colors.background,
  },
});
