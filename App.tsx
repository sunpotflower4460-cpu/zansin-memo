import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { seedRepository } from './src/data/asyncStorageSeedRepository';
import type {
  GrowthState,
  Importance,
  Mood,
  ResurfacedSeed,
  Seed,
  SeedCreateInput,
  TransformType,
} from './src/domain/types';
import { GardenScreen } from './src/screens/GardenScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SeedDetailScreen } from './src/screens/SeedDetailScreen';
import { SeedsScreen } from './src/screens/SeedsScreen';
import { WriteScreen } from './src/screens/WriteScreen';
import { buildTransformOutput, createSeed, pickTodaySeed, updateSeed } from './src/utils/seedUtils';

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

const getTodayKey = (): string => new Date().toISOString().slice(0, 10);

export default function App() {
  const [seeds, setSeeds] = React.useState<Seed[]>([]);
  const [isReady, setIsReady] = React.useState(false);
  const [screen, setScreen] = React.useState<ScreenState>({ kind: 'home' });
  const [writeDraft, setWriteDraft] = React.useState(initialWriteDraft);
  const [todaySeed, setTodaySeed] = React.useState<ResurfacedSeed | undefined>();
  const [todayKey, setTodayKey] = React.useState('');
  const [seedsSearch, setSeedsSearch] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState<GrowthState | 'all'>('all');
  const [sortType, setSortType] = React.useState<'updated' | 'importance'>('updated');

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
    setTodayKey(getTodayKey());

    if (!picked) {
      return;
    }

    setSeeds((current) =>
      current.map((seed) =>
        seed.id === picked.seed.id
          ? updateSeed(seed, {
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

    if (todayKey !== getTodayKey() || !todaySeed || !seeds.some((seed) => seed.id === todaySeed.seed.id)) {
      refreshTodaySeed();
    }
  }, [isReady, seeds, todayKey, todaySeed, refreshTodaySeed]);

  const handleCreateSeed = (input: SeedCreateInput) => {
    const nextSeed = createSeed(input);
    setSeeds((current) => [nextSeed, ...current]);
    setWriteDraft(initialWriteDraft);
    setScreen({ kind: 'seeds' });
    Alert.alert('保存しました', '種をやさしく保管しました。');
  };

  const handleUpdateSeed = (seedId: string, payload: Partial<Seed>) => {
    setSeeds((current) => current.map((seed) => (seed.id === seedId ? updateSeed(seed, payload) : seed)));
    Alert.alert('更新しました', '種を育てました。');
  };

  const handleDeleteSeed = (seedId: string) => {
    setSeeds((current) => current.filter((seed) => seed.id !== seedId));
    setScreen({ kind: 'seeds' });
  };

  const handleCreateTransform = (seedId: string, type: TransformType) => {
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
          sortType={sortType}
          onChangeSearch={setSeedsSearch}
          onChangeFilter={setStateFilter}
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>{renderMainScreen()}</View>
      {screen.kind !== 'detail' ? (
        <View style={styles.tabBar}>
          {(
            [
              { id: 'home', label: 'Home' },
              { id: 'write', label: 'Write' },
              { id: 'seeds', label: 'Seeds' },
              { id: 'garden', label: 'Garden' },
            ] as const
          ).map((tab) => {
            const selected = activeTab === tab.id;

            return (
              <Pressable
                key={tab.id}
                style={[styles.tabButton, selected && styles.tabButtonSelected]}
                onPress={() => setScreen({ kind: tab.id })}
                accessibilityRole="button"
                accessibilityLabel={`${tab.label} タブ`}
              >
                <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  app: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#dbe3ed',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonSelected: {
    backgroundColor: '#d9efe6',
  },
  tabLabel: {
    color: '#475569',
    fontSize: 14,
  },
  tabLabelSelected: {
    color: '#164e38',
    fontWeight: '600',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
  },
});
