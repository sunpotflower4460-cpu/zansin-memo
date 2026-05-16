import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

  const showToast = React.useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastKey((k) => k + 1);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2500);
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      const loadedSeeds = await seedRepository.getAll();
      if (!active) {
        return;
      }
      setSeeds(loadedSeeds);
      setIsReady(true);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    void seedRepository.saveAll(seeds);
  }, [isReady, seeds]);

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
    const nextSeed = createSeed(input);
    triggerSuccessFeedback();
    setSeeds((current) => [nextSeed, ...current]);
    setWriteDraft(initialWriteDraft);
    setScreen({ kind: 'home' });
    showToast('種を保存しました 🌱');
  };

  const handleUpdateSeed = (seedId: string, payload: SeedUpdateInput) => {
    triggerSuccessFeedback();
    setSeeds((current) => current.map((seed) => (seed.id === seedId ? updateSeed(seed, payload) : seed)));
    showToast('種を育てました ✨');
  };

  const handleDeleteSeed = (seedId: string) => {
    triggerWarningFeedback();
    setSeeds((current) => current.filter((seed) => seed.id !== seedId));
    setScreen({ kind: 'seeds' });
  };

  const handleCreateTransform = (seedId: string, type: TransformType) => {
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

  const selectedSeed = screen.kind === 'detail' ? seeds.find((seed) => seed.id === screen.seedId) : undefined;

  const renderMainScreen = () => {
    if (!isReady) {
      return (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>種を読み込み中...</Text>
        </View>
      );
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
        </View>
        {screen.kind !== 'detail' ? <AppTabBar activeTab={activeTab} onChangeTab={(tab) => setScreen({ kind: tab })} /> : null}
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
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
});
