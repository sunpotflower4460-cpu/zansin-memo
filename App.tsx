import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { Alert, Linking, SafeAreaView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLaunchIntro } from './src/components/AppLaunchIntro';
import { AppTabBar } from './src/components/AppTabBar';
import { SaveToast } from './src/components/SaveToast';
import { seedRepository } from './src/data/asyncStorageSeedRepository';
import type {
  GrowthState,
  Importance,
  Mood,
  ResurfacedSeed,
  Seed,
  SeedCreateInput,
  SeedUpdateInput,
  TransformType,
} from './src/domain/types';
import { GardenScreen } from './src/screens/GardenScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SeedDetailScreen } from './src/screens/SeedDetailScreen';
import { SeedsScreen } from './src/screens/SeedsScreen';
import { WriteScreen } from './src/screens/WriteScreen';
import { theme } from './src/styles/theme';
import { motion } from './src/utils/motion';
import { triggerSuccessFeedback, triggerWarningFeedback } from './src/utils/feedback';
import { beginSave, finishSave, getSaveStateMessage, settleSaved, type SaveProgress, type SaveState } from './src/utils/saveState';
import {
  buildTransformOutput,
  createSeed,
  getLocalDateKey,
  pickTodaySeed,
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
const PRIVACY_POLICY_URL = 'https://github.com/sunpotflower4460-cpu/zansin-memo/blob/main/docs/privacy-policy.md';
const SUPPORT_URL = 'https://github.com/sunpotflower4460-cpu/zansin-memo/issues/new';
const CLEAR_ALL_DATA_ALERT_TITLE = 'すべてのデータを削除しますか？';
const CLEAR_ALL_DATA_ALERT_MESSAGE = '保存されたすべての種（メモ）が削除されます。この操作は元に戻せません。';

const initialWriteDraft: {
  title: string;
  body: string;
  tags: string;
  mood?: Mood;
  growthState: GrowthState;
  importance: Importance;
} = {
  title: '',
  body: '',
  tags: '',
  mood: undefined,
  growthState: 'seed',
  importance: 3,
};

export default function App() {
  const [seeds, setSeeds] = React.useState<Seed[]>([]);
  const [isReady, setIsReady] = React.useState(false);
  const [canPersistSeeds, setCanPersistSeeds] = React.useState(false);
  const [showLaunchIntro, setShowLaunchIntro] = React.useState(true);
  const [screen, setScreen] = React.useState<ScreenState>({ kind: 'home' });
  const [writeDraft, setWriteDraft] = React.useState(initialWriteDraft);
  const [todaySeed, setTodaySeed] = React.useState<ResurfacedSeed | undefined>();
  const [todayKey, setTodayKey] = React.useState('');
  const [seedsSearch, setSeedsSearch] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState<GrowthState | 'all'>('all');
  const [tagFilter, setTagFilter] = React.useState<string>('all');
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
      const loadResult = await seedRepository.getAll();
      if (!active) {
        return;
      }

      if (!loadResult.ok) {
        setCanPersistSeeds(false);
        setIsReady(true);
        showToast('保存データを読み込めませんでした。自動保存を停止しています。');
        return;
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

  const refreshTodaySeed = React.useCallback(() => {
    const picked = pickTodaySeed(seeds);
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
  }, [seeds]);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    if (todayKey !== getLocalDateKey() || !todaySeed || !seeds.some((seed) => seed.id === todaySeed.seed.id)) {
      refreshTodaySeed();
    }
  }, [isReady, seeds, todayKey, todaySeed, refreshTodaySeed]);

  const handleCreateSeed = (input: SeedCreateInput) => {
    if (!input.body.trim() || blockIfStorageLocked()) {
      return;
    }

    const nextSeed = createSeed(input);
    triggerSuccessFeedback();
    setSeeds((current) => [nextSeed, ...current]);
    setWriteDraft(initialWriteDraft);
    setScreen({ kind: 'home' });
    showToast('種を追加しました 🌱');
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
    setSeeds((current) => current.filter((seed) => seed.id !== seedId));
    setTodaySeed((current) => (current?.seed.id === seedId ? undefined : current));
    setScreen({ kind: 'seeds' });
  };

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
    if (blockIfStorageLocked()) {
      return;
    }

    Alert.alert(CLEAR_ALL_DATA_ALERT_TITLE, CLEAR_ALL_DATA_ALERT_MESSAGE, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'すべて削除',
        style: 'destructive',
        onPress: () => {
          triggerWarningFeedback();
          setSeeds([]);
          setTodaySeed(undefined);
          setScreen({ kind: 'home' });
          showToast('すべてのデータを削除しました。');
        },
      },
    ]);
  }, [blockIfStorageLocked, showToast]);

  const selectedSeed = screen.kind === 'detail' ? seeds.find((seed) => seed.id === screen.seedId) : undefined;

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
          allSeeds={seeds}
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
          seeds={seeds}
          search={seedsSearch}
          stateFilter={stateFilter}
          tagFilter={tagFilter}
          sortType={sortType}
          onChangeSearch={setSeedsSearch}
          onChangeFilter={setStateFilter}
          onChangeTagFilter={setTagFilter}
          onChangeSort={setSortType}
          onOpenSeed={(seedId) => setScreen({ kind: 'detail', seedId, from: 'seeds' })}
        />
      );
    }

    if (screen.kind === 'garden') {
      return <GardenScreen seeds={seeds} onOpenSeed={(seedId) => setScreen({ kind: 'detail', seedId, from: 'garden' })} />;
    }

    return (
      <HomeScreen
        seeds={seeds}
        todaySeed={todaySeed}
        onRefreshToday={refreshTodaySeed}
        onOpenWrite={() => setScreen({ kind: 'write' })}
        onOpenSeed={(seedId) => setScreen({ kind: 'detail', seedId, from: 'home' })}
        onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
        onOpenSupport={handleOpenSupport}
        onClearAllData={handleClearAllData}
      />
    );
  };

  const activeTab: MainTab = screen.kind === 'detail' ? screen.from : screen.kind;
  const saveStateMessage = getSaveStateMessage(saveState);
  const statusToastMessage = toastMsg || saveStateMessage;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.app}>
          {renderMainScreen()}
          {statusToastMessage ? (
            <SaveToast
              key={toastKey}
              message={statusToastMessage}
              tone={toastMsg ? 'default' : saveState === 'error' ? 'error' : 'default'}
            />
          ) : null}
          <AppLaunchIntro visible={!isReady || showLaunchIntro} />
        </View>
        {screen.kind !== 'detail' && isReady ? <AppTabBar activeTab={activeTab} onChangeTab={(tab) => setScreen({ kind: tab })} /> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  app: {
    flex: 1,
  },
});
