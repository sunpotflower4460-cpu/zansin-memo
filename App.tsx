import { StatusBar } from 'expo-status-bar';
// 和紙の質感。内容の上にごく薄く重ねるだけで、操作は妨げない。
import paperTexture from './assets/paper.png';
import * as React from 'react';
import { Alert, AppState, Image, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppLaunchIntro } from './src/components/AppLaunchIntro';
import { AppTabBar } from './src/components/AppTabBar';
import { SaveToast } from './src/components/SaveToast';
import { seedRepository } from './src/data/asyncStorageSeedRepository';
import { EMPTY_WRITE_DRAFT, loadDraft, saveDraft } from './src/data/draftStorage';
import { hasSeenOnboarding, markOnboardingSeen } from './src/data/onboardingStorage';
import type {
  GrowthState,
  ResurfacedSeed,
  Seed,
  SeedCreateInput,
  SeedUpdateInput,
  TransformType,
  WriteDraft,
} from './src/domain/types';
import { GardenScreen } from './src/screens/GardenScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { SeedDetailScreen } from './src/screens/SeedDetailScreen';
import { SeedsScreen } from './src/screens/SeedsScreen';
import { WriteScreen } from './src/screens/WriteScreen';
import { theme } from './src/styles/theme';
import { motion } from './src/utils/motion';
import { triggerSuccessFeedback, triggerWarningFeedback } from './src/utils/feedback';
import { beginSave, finishSave, getSaveStateMessage, settleSaved, type SaveProgress, type SaveState } from './src/utils/saveState';
import { exportSeeds } from './src/utils/exportUtils';
import { PRIVACY_POLICY_URL, SUPPORT_URL } from './src/config/appInfo';
import {
  buildTransformOutput,
  createSeed,
  getLocalDateKey,
  pickTodaySeed,
  restoreSeed,
  softDeleteSeed,
  isSoftDeletedSeed,
  syncResurfacedSeed,
  updateSeed,
  updateSeedResurfacingMeta,
} from './src/utils/seedUtils';

type MainTab = 'home' | 'write' | 'seeds' | 'garden';

type ScreenState =
  | { kind: MainTab }
  | {
      kind: 'detail';
      seedId: string;
      from: MainTab;
    };

const TRANSFORM_DOUBLE_TAP_GUARD_MS = 700;
const STORAGE_LOCKED_MESSAGE = '保存データの読み込みに問題があるため、変更を停止しています。';
const CLEAR_ALL_DATA_ALERT_TITLE = 'すべてのデータを削除しますか？';
const CLEAR_ALL_DATA_ALERT_MESSAGE = '保存されたすべての種（メモ）が削除されます。この操作は元に戻せません。';

const initialWriteDraft: WriteDraft = EMPTY_WRITE_DRAFT;

export default function App() {
  const [seeds, setSeeds] = React.useState<Seed[]>([]);
  const [isReady, setIsReady] = React.useState(false);
  const [canPersistSeeds, setCanPersistSeeds] = React.useState(false);
  const [showLaunchIntro, setShowLaunchIntro] = React.useState(true);
  const [onboardingVisible, setOnboardingVisible] = React.useState(false);
  const [screen, setScreen] = React.useState<ScreenState>({ kind: 'home' });
  const [writeDraft, setWriteDraft] = React.useState(initialWriteDraft);
  const [todaySeed, setTodaySeed] = React.useState<ResurfacedSeed | undefined>();
  const [todayKey, setTodayKey] = React.useState('');
  const [seedsSearch, setSeedsSearch] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState<GrowthState | 'all'>('all');
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [sortType, setSortType] = React.useState<'updated' | 'importance'>('updated');
  const [toastKey, setToastKey] = React.useState(0);
  const [toastMsg, setToastMsg] = React.useState('');
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchedAtRef = React.useRef(Date.now());
  const transformTapMapRef = React.useRef<Record<string, number>>({});
  const saveProgressRef = React.useRef<SaveProgress>({ requestId: 0, state: 'idle' });
  const didHydrateSeedsRef = React.useRef(false);
  const didHydrateDraftRef = React.useRef(false);
  const latestDraftRef = React.useRef<WriteDraft>(initialWriteDraft);

  const showToast = React.useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastKey((k) => k + 1);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2500);
  }, []);

  const blockIfStorageLocked = React.useCallback((): boolean => {
    if (canPersistSeeds) {
      return false;
    }

    showToast(STORAGE_LOCKED_MESSAGE);
    return true;
  }, [canPersistSeeds, showToast]);

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
      if (launchTimer.current) clearTimeout(launchTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    const elapsed = Date.now() - launchedAtRef.current;
    const waitMs = Math.max(0, motion.launchMinVisibleMs - elapsed);

    launchTimer.current = setTimeout(() => {
      setShowLaunchIntro(false);
    }, waitMs);

    return () => {
      if (launchTimer.current) {
        clearTimeout(launchTimer.current);
      }
    };
  }, [isReady]);

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      const [loadResult, savedDraft, seenOnboarding] = await Promise.all([
        seedRepository.getAll(),
        loadDraft(),
        hasSeenOnboarding(),
      ]);
      if (!active) {
        return;
      }

      // 書きかけの種があれば、そのまま続きから書けるようにする。
      if (savedDraft) {
        setWriteDraft(savedDraft);
      }
      didHydrateDraftRef.current = true;

      if (!loadResult.ok) {
        setCanPersistSeeds(false);
        setIsReady(true);
        showToast('保存データを読み込めませんでした。自動保存を停止しています。');
        return;
      }

      // はじめて使う人にだけ、短い案内を見せる。すでに種がある人（更新前から使っている人）には出さない。
      if (!seenOnboarding) {
        if (loadResult.seeds.length === 0) {
          setOnboardingVisible(true);
        } else {
          void markOnboardingSeen();
        }
      }

      setSeeds(loadResult.seeds);
      setCanPersistSeeds(true);
      setIsReady(true);
      didHydrateSeedsRef.current = true;

      if (loadResult.recoveredFromBackup) {
        showToast('バックアップから種を復元しました。');
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [showToast]);

  React.useEffect(() => {
    if (!isReady || !canPersistSeeds) {
      return;
    }

    if (!didHydrateSeedsRef.current) {
      return;
    }

    const persist = async () => {
      if (saveStateTimer.current) {
        clearTimeout(saveStateTimer.current);
      }

      const started = beginSave(saveProgressRef.current.requestId);
      saveProgressRef.current = started;
      setSaveState(started.state);

      const saveResult = await seedRepository.saveAll(seeds);
      const finished = finishSave(saveProgressRef.current, started.requestId, saveResult);
      if (finished.requestId !== saveProgressRef.current.requestId || finished.state === saveProgressRef.current.state) {
        return;
      }

      saveProgressRef.current = finished;
      setSaveState(finished.state);

      if (finished.state === 'saved') {
        saveStateTimer.current = setTimeout(() => {
          const settled = settleSaved(saveProgressRef.current, started.requestId);
          if (settled.state === saveProgressRef.current.state) {
            return;
          }

          saveProgressRef.current = settled;
          setSaveState(settled.state);
        }, 1400);
      }
    };

    void persist();
  }, [canPersistSeeds, isReady, seeds]);

  // 書きかけは少し間を置いて端末に退避する。アプリが裏に回るときは即座に退避する。
  React.useEffect(() => {
    latestDraftRef.current = writeDraft;
    if (!didHydrateDraftRef.current) {
      return;
    }
    const timer = setTimeout(() => void saveDraft(writeDraft), 400);
    return () => clearTimeout(timer);
  }, [writeDraft]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && didHydrateDraftRef.current) {
        void saveDraft(latestDraftRef.current);
      }
    });
    return () => subscription.remove();
  }, []);

  const activeSeeds = React.useMemo(() => seeds.filter((seed) => !isSoftDeletedSeed(seed)), [seeds]);
  const deletedSeeds = React.useMemo(
    () =>
      seeds
        .filter((seed) => isSoftDeletedSeed(seed))
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [seeds],
  );

  const refreshTodaySeed = React.useCallback(() => {
    const picked = pickTodaySeed(activeSeeds);
    setTodaySeed(picked);
    setTodayKey(getLocalDateKey());

    if (!picked) {
      return;
    }

    setSeeds((current) =>
      current.map((seed) =>
        seed.id === picked.seed.id
          ? updateSeedResurfacingMeta(seed, {
              lastResurfacedAt: new Date().toISOString(),
              resurfacingScore: picked.seed.resurfacingScore,
            })
          : seed,
      ),
    );
  }, [activeSeeds]);

  const displayedTodaySeed = React.useMemo(() => syncResurfacedSeed(todaySeed, activeSeeds), [todaySeed, activeSeeds]);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    // 表示中の今日の種が消えた・アーカイブされた場合も選び直す。表示と同じ判定を使う。
    if (todayKey !== getLocalDateKey() || !displayedTodaySeed) {
      refreshTodaySeed();
    }
  }, [displayedTodaySeed, isReady, todayKey, refreshTodaySeed]);

  const handleCreateSeed = (input: SeedCreateInput) => {
    if (!input.body.trim() || blockIfStorageLocked()) {
      return;
    }

    const nextSeed = createSeed(input);
    triggerSuccessFeedback();
    setSeeds((current) => [nextSeed, ...current]);
    setWriteDraft(initialWriteDraft);
    setScreen({ kind: 'home' });
    showToast('種をまきました 🌱');
  };

  const handleUpdateSeed = (seedId: string, payload: SeedUpdateInput) => {
    if ((payload.body !== undefined && !payload.body.trim()) || blockIfStorageLocked()) {
      return;
    }

    triggerSuccessFeedback();
    setSeeds((current) => current.map((seed) => (seed.id === seedId ? updateSeed(seed, payload) : seed)));
    showToast('種を更新しました ✨');
  };

  const handleDeleteSeed = (seedId: string) => {
    if (blockIfStorageLocked()) {
      return;
    }

    triggerWarningFeedback();
    setSeeds((current) => current.map((seed) => (seed.id === seedId ? softDeleteSeed(seed) : seed)));
    setTodaySeed((current) => (current?.seed.id === seedId ? undefined : current));
    setScreen({ kind: 'seeds' });
    showToast('種を削除しました（あとで復元できます）');
  };

  const handleRestoreSeed = React.useCallback(
    (seedId: string) => {
      if (blockIfStorageLocked()) {
        return;
      }

      triggerSuccessFeedback();
      setSeeds((current) => current.map((seed) => (seed.id === seedId ? restoreSeed(seed) : seed)));
      showToast('種を復元しました 🌱');
    },
    [blockIfStorageLocked, showToast],
  );

  const handleCreateTransform = (seedId: string, type: TransformType) => {
    if (blockIfStorageLocked()) {
      return;
    }

    const key = `${seedId}:${type}`;
    const now = Date.now();
    const lastTapAt = transformTapMapRef.current[key] ?? 0;
    if (now - lastTapAt < TRANSFORM_DOUBLE_TAP_GUARD_MS) {
      return;
    }
    transformTapMapRef.current[key] = now;

    triggerSuccessFeedback();
    showToast('水をあげました 💧 候補を追加しました');
    setSeeds((current) =>
      current.map((seed) => {
        if (seed.id !== seedId) {
          return seed;
        }

        const nextOutput = buildTransformOutput(seed, type);
        return updateSeed(seed, {
          transformOutputs: [...(seed.transformOutputs ?? []), nextOutput],
        });
      }),
    );
  };

  const handleExportJson = React.useCallback(async () => {
    const result = await exportSeeds(seeds, 'json');
    if (!result.ok) {
      showToast(result.message);
    }
  }, [seeds, showToast]);

  const handleExportText = React.useCallback(async () => {
    const result = await exportSeeds(seeds, 'text');
    if (!result.ok) {
      showToast(result.message);
    }
  }, [seeds, showToast]);

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
    if (blockIfStorageLocked()) {
      return;
    }

    Alert.alert(CLEAR_ALL_DATA_ALERT_TITLE, CLEAR_ALL_DATA_ALERT_MESSAGE, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'すべて削除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            // 復元用・破損退避用のコピーも含めて端末から消す。失敗したら画面上のデータは残す。
            const result = await seedRepository.clearAll();
            if (!result.ok) {
              showToast('データを削除できませんでした。もう一度お試しください。');
              return;
            }

            triggerWarningFeedback();
            setSeeds([]);
            setTodaySeed(undefined);
            setWriteDraft(initialWriteDraft);
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
  }, [blockIfStorageLocked, showToast]);

  const selectedSeed = screen.kind === 'detail' ? activeSeeds.find((seed) => seed.id === screen.seedId) : undefined;

  React.useEffect(() => {
    if (screen.kind === 'detail' && !selectedSeed) {
      setScreen({ kind: screen.from });
    }
  }, [screen, selectedSeed]);

  const renderMainScreen = () => {
    if (!isReady) {
      return null;
    }

    if (screen.kind === 'detail' && selectedSeed) {
      return (
        <SeedDetailScreen
          seed={selectedSeed}
          allSeeds={activeSeeds}
          onBack={() => setScreen({ kind: screen.from })}
          onSave={handleUpdateSeed}
          onDelete={handleDeleteSeed}
          onCreateTransform={handleCreateTransform}
        />
      );
    }

    if (screen.kind === 'write') {
      return (
        <WriteScreen
          draft={writeDraft}
          onChange={(next) => setWriteDraft((current) => ({ ...current, ...next }))}
          onSave={handleCreateSeed}
        />
      );
    }

    if (screen.kind === 'seeds') {
      return (
        <SeedsScreen
          seeds={activeSeeds}
          deletedSeeds={deletedSeeds}
          search={seedsSearch}
          stateFilter={stateFilter}
          tagFilter={tagFilter}
          sortType={sortType}
          onChangeSearch={setSeedsSearch}
          onChangeFilter={setStateFilter}
          onChangeTagFilter={setTagFilter}
          onChangeSort={setSortType}
          onRestoreSeed={handleRestoreSeed}
          onOpenSeed={(seedId) => setScreen({ kind: 'detail', seedId, from: 'seeds' })}
          onOpenWrite={() => setScreen({ kind: 'write' })}
        />
      );
    }

    if (screen.kind === 'garden') {
      return <GardenScreen seeds={activeSeeds} onOpenSeed={(seedId) => setScreen({ kind: 'detail', seedId, from: 'garden' })} />;
    }

    return (
      <HomeScreen
        seeds={activeSeeds}
        todaySeed={displayedTodaySeed}
        onRefreshToday={refreshTodaySeed}
        onOpenWrite={() => setScreen({ kind: 'write' })}
        onOpenGarden={() => setScreen({ kind: 'garden' })}
        onShowIntro={() => setOnboardingVisible(true)}
        onOpenSeed={(seedId) => setScreen({ kind: 'detail', seedId, from: 'home' })}
        onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
        onOpenSupport={handleOpenSupport}
        onClearAllData={handleClearAllData}
        onExportJson={handleExportJson}
        onExportText={handleExportText}
      />
    );
  };

  const activeTab: MainTab = screen.kind === 'detail' ? screen.from : screen.kind;
  // 保存の「保存中…」「保存しました」は頻繁に出て気が散るため表示しない。失敗したときだけ知らせる。
  const saveStateMessage = saveState === 'error' ? getSaveStateMessage(saveState) : '';
  const statusToastMessage = toastMsg || saveStateMessage;
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
              tone={toastMsg ? 'default' : 'error'}
              aboveTabBar={tabBarVisible}
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
