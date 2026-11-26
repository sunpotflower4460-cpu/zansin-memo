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
import { hasSeenOnboarding, markOnboardingSeen } from './src/data/onboardingStorage';
import {
  addTransformOutput,
  captureAndConnect,
  captureSeed,
  connectFromCenter,
  connectSeeds,
  disconnectSeeds,
  restoreSeed,
  setConnectionNote,
  softDeleteSeed,
  touchResurfacing,
  updateSeedFields,
} from './src/domain/gardenCommands';
import type { CommitResult } from './src/data/gardenWriter';
import type { Draft, GrowthState, ResurfacedSeed, SeedCreateInput, SeedUpdateInput, TransformType, WriteDraft } from './src/domain/types';
import { SeedPickerModal } from './src/components/SeedPickerModal';
import type { ConnectionsViewMode } from './src/components/ConnectionsPanel';
import { GardenScreen } from './src/screens/GardenScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
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
import { buildAdjacency } from './src/utils/links';

type MainTab = 'home' | 'write' | 'seeds' | 'garden';

type ScreenState =
  | { kind: MainTab }
  | {
      kind: 'detail';
      seedId: string;
      from: MainTab;
    };

const TRANSFORM_DOUBLE_TAP_GUARD_MS = 700;
const BLOCKED_MESSAGE = '保存データを読み込めないため、変更を停止しています。データは消していません。';
const SAVE_FAILED_MESSAGE = '保存できませんでした。入力は残っています。もう一度お試しください。';
const CLEAR_ALL_DATA_ALERT_TITLE = 'すべてのデータを削除しますか？';
const CLEAR_ALL_DATA_ALERT_MESSAGE =
  '保存されたすべてのメモ・つながり・芽・下書きと、復元用のコピーが端末から削除されます。この操作は元に戻せません。';
const EXPORT_JSON_ALERT_TITLE = 'JSONで全データを書き出します';
const EXPORT_JSON_ALERT_MESSAGE =
  '削除済みのメモ、つながり、芽と材料、下書きもすべて含まれます。この書き出しからアプリへ復元する機能は、現時点ではありません。';

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

export default function App() {
  const garden = useGarden();
  const { store } = garden;
  const seeds = store.seeds;
  const isReady = garden.phase.kind !== 'loading';
  const isBlocked = garden.phase.kind === 'blocked';
  const [showLaunchIntro, setShowLaunchIntro] = React.useState(true);
  const [onboardingVisible, setOnboardingVisible] = React.useState(false);
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
  const didRestoreDraftRef = React.useRef(false);
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

    const restorable = store.drafts.find((draft) => draft.kind === 'new' || draft.kind === 'add-memo');
    if (restorable && !didRestoreDraftRef.current) {
      didRestoreDraftRef.current = true;
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
        growthState: restorable.growthState ?? 'seed',
        importance: restorable.importance ?? 3,
      });
      setWriteTargetId(restorable.kind === 'add-memo' ? restorable.targetSeedId : undefined);
      setWriteStandalone(Boolean(restorable.standalone));
    }

    void (async () => {
      const seen = await hasSeenOnboarding();
      if (!seen) {
        if (store.seeds.length === 0) {
          setOnboardingVisible(true);
        } else {
          void markOnboardingSeen();
        }
      }
    })();
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
    if (!isReady || isBlocked) {
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
  }, [writeDraft, writeTargetSeed, writeStandalone, isReady, isBlocked]);

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

  const handleSetConnectionNote = async (seedId: string, otherId: string, note: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(setConnectionNote({ commandId: createId(), a: seedId, b: otherId, note }));
    afterCommit(result, note.trim() ? '一言を保存しました' : '一言を消しました');
  };

  const handleConnectPair = async (aId: string, bId: string) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(connectSeeds({ commandId: createId(), a: aId, b: bId, now: new Date().toISOString() }));
    if (afterCommit(result, 'つなぎました。線で結ばれた2つのメモを見られます')) {
      openDetail(aId, 'seeds', true);
    }
  };

  const handleConnectFromCenter = async (centerId: string, targetIds: string[]) => {
    if (blockIfLocked()) {
      return;
    }
    const result = await garden.run(connectFromCenter({ commandId: createId(), centerId, targetIds, now: new Date().toISOString() }));
    if (afterCommit(result, 'つなぎました。選んだ線だけを追加しています')) {
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
            const result = await exportGarden(store, 'json');
            if (!result.ok) {
              showToast(result.message);
            }
          })();
        },
      },
    ]);
  }, [store, showToast]);

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

  const handleFinishOnboarding = React.useCallback((destination: 'write' | 'home') => {
    void markOnboardingSeen();
    setOnboardingVisible(false);
    setScreen({ kind: destination });
  }, []);

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
            resetWrite();
            setSeedsSearch('');
            setStateFilter('all');
            setTagFilter(null);
            setScreen({ kind: 'home' });
            // 経験者が削除のたびに最初の案内を見ないよう、案内済みの印だけは残す。
            void markOnboardingSeen();
            showToast('すべてのデータを削除しました。');
          })();
        },
      },
    ]);
  }, [garden, showToast]);

  const selectedSeed = screen.kind === 'detail' ? activeSeeds.find((seed) => seed.id === screen.seedId) : undefined;

  React.useEffect(() => {
    if (screen.kind === 'detail' && !selectedSeed) {
      setScreen({ kind: screen.from });
    }
  }, [screen, selectedSeed]);

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
      const editDraft = store.drafts.find((draft) => draft.kind === 'edit-body' && draft.targetSeedId === selectedSeed.id);
      const trailSeeds = trail.map((id) => activeSeeds.find((seed) => seed.id === id)).filter((seed): seed is NonNullable<typeof seed> => Boolean(seed));
      return (
        <SeedDetailScreen
          key={selectedSeed.id}
          seed={selectedSeed}
          allSeeds={activeSeeds}
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
          onFlushDrafts={() => void garden.flushDrafts()}
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
          onChange={(next) => setWriteDraft((current) => ({ ...current, ...next }))}
          onToggleStandalone={() => setWriteStandalone((value) => !value)}
          onClearTarget={() => {
            setWriteTargetId(undefined);
            setWriteStandalone(false);
          }}
          savedMemo={savedMemo}
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
        onShowIntro={() => setOnboardingVisible(true)}
        onOpenSeed={(seedId) => openDetail(seedId, 'home', true)}
        onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
        onOpenSupport={handleOpenSupport}
        onClearAllData={handleClearAllData}
        onExportJson={handleExportJson}
        onExportText={handleExportText}
      />
    );
  };

  const activeTab: MainTab = screen.kind === 'detail' ? screen.from : screen.kind;
  // 成功の通知は時間で消える。失敗・読込停止は、解決するまで消えない。
  const statusToastMessage = toastMsg || persistentError;
  const tabBarVisible = screen.kind !== 'detail' && isReady && !onboardingVisible;

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
          {savedMemo ? (
            <SeedPickerModal
              visible={savedPickerOpen}
              candidates={activeSeeds.filter((seed) => seed.id !== savedMemo.id)}
              linkedIds={savedNeighborIds}
              onToggle={(otherId) => (savedNeighborIds.has(otherId) ? void handleUnlinkSeeds(savedMemo.id, otherId) : void handleLinkSeeds(savedMemo.id, otherId))}
              onClose={() => setSavedPickerOpen(false)}
            />
          ) : null}
          {onboardingVisible && isReady ? <OnboardingScreen onFinish={handleFinishOnboarding} /> : null}
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
});
