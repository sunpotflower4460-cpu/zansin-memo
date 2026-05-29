import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
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
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchedAtRef = React.useRef(performance.now());
  const transformTapMapRef = React.useRef<Record<string, number>>({});

  const showToast = React.useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastKey((k) => k + 1);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2500);
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (launchTimer.current) clearTimeout(launchTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    const elapsed = performance.now() - launchedAtRef.current;
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

    const persist = async () => {
      const saveResult = await seedRepository.saveAll(seeds);
      if (!saveResult.ok) {
        showToast('保存できませんでした。端末の空き容量などを確認してください。');
      }
    };

    void persist();
  }, [canPersistSeeds, isReady, seeds, showToast]);

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
    if (!input.body.trim()) {
      return;
    }

    const nextSeed = createSeed(input);
    triggerSuccessFeedback();
    setCanPersistSeeds(true);
    setSeeds((current) => [nextSeed, ...current]);
    setWriteDraft(initialWriteDraft);
    setScreen({ kind: 'home' });
    showToast('種を保存しました 🌱');
  };

  const handleUpdateSeed = (seedId: string, payload: SeedUpdateInput) => {
    if (payload.body !== undefined && !payload.body.trim()) {
      return;
    }

    triggerSuccessFeedback();
    setCanPersistSeeds(true);
    setSeeds((current) => current.map((seed) => (seed.id === seedId ? updateSeed(seed, payload) : seed)));
    showToast('種を育てました ✨');
  };

  const handleDeleteSeed = (seedId: string) => {
    triggerWarningFeedback();
    setCanPersistSeeds(true);
    setSeeds((current) => current.filter((seed) => seed.id !== seedId));
    setTodaySeed((current) => (current?.seed.id === seedId ? undefined : current));
    setScreen({ kind: 'seeds' });
  };

  const handleCreateTransform = (seedId: string, type: TransformType) => {
    const key = `${seedId}:${type}`;
    const now = Date.now();
    const lastTapAt = transformTapMapRef.current[key] ?? 0;
    if (now - lastTapAt < TRANSFORM_DOUBLE_TAP_GUARD_MS) {
      return;
    }
    transformTapMapRef.current[key] = now;

    triggerSuccessFeedback();
    setCanPersistSeeds(true);
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
      />
    );
  };

  const activeTab: MainTab = screen.kind === 'detail' ? screen.from : screen.kind;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.app}>
          {renderMainScreen()}
          {toastMsg ? <SaveToast key={toastKey} message={toastMsg} /> : null}
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
