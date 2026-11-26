import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import soilTexture from '../../assets/soil.png';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { FoldSection } from '../components/FoldSection';
import { HelpButton } from '../components/HelpButton';
import { LinkCount } from '../components/LinkCount';
import type { GrowthState, Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateHints, growthStateLabels } from '../utils/displayLabels';
import { helpTexts } from '../utils/helpTexts';
import { findRecurringWords, getLinkCounts, getLinkedSeeds } from '../utils/links';
import { toSeedSnippet } from '../utils/seedText';
import { getTagGroupKey, getTagGroupLabel, groupSeedsByTag } from '../utils/seedUtils';
import { stageImages } from '../utils/stageImages';

type GardenScreenProps = {
  seeds: Seed[];
  connections: SeedConnection[];
  onOpenSeed: (seedId: string) => void;
  /** 指定した育ち方だけの種一覧へ移る。 */
  onOpenSeedsByState: (state: GrowthState) => void;
  /** 繰り返し出てくる言葉から、その言葉を含む種を探す。 */
  onSearchWord: (word: string) => void;
  /** つながりのあるメモの全件を、種一覧のビューで見る。 */
  onOpenConnectedList: () => void;
};

/** 畑に大きく並べる育ち方。保管は別の小さな入口にする。 */
const PLOT_STATES = ['seed', 'sprout', 'tree'] as const;
type PlotState = (typeof PLOT_STATES)[number];
const PLANT_LIMIT = 6;
const LINK_CARD_LIMIT = 6;

// 育ちごとに、土の色から若草・花の色へと区画の色を変える。
const plotTints: Record<PlotState, string> = {
  seed: '#efe3cb',
  sprout: '#e8eed6',
  tree: '#f4e2da',
};

export function GardenScreen({ seeds, connections, onOpenSeed, onOpenSeedsByState, onSearchWord, onOpenConnectedList }: GardenScreenProps) {
  const [chosen, setChosen] = React.useState<PlotState | undefined>();

  const buckets = React.useMemo(() => {
    const grouped: Record<GrowthState, Seed[]> = { seed: [], sprout: [], tree: [], archived: [] };
    for (const seed of seeds) {
      grouped[seed.growthState].push(seed);
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return grouped;
  }, [seeds]);

  // 開いたときは、いちばん育っている区画を見せる。
  const selected: PlotState = chosen ?? (buckets.tree.length > 0 ? 'tree' : buckets.sprout.length > 0 ? 'sprout' : 'seed');
  const plants = buckets[selected];

  const linkCounts = React.useMemo(() => getLinkCounts(seeds, connections), [seeds, connections]);
  // つながりのあるメモ（中心にして見られるカード）。同じ集団を「同じテーマ」とまとめず、メモごとに直接のつながりだけを示す。
  const connectedCenters = React.useMemo(
    () =>
      seeds
        .filter((seed) => (linkCounts.get(seed.id) ?? 0) > 0)
        .sort((a, b) => (linkCounts.get(b.id) ?? 0) - (linkCounts.get(a.id) ?? 0) || b.updatedAt.localeCompare(a.updatedAt)),
    [seeds, linkCounts],
  );
  const recurringWords = React.useMemo(() => findRecurringWords(seeds), [seeds]);
  const groupedByTag = React.useMemo(() => groupSeedsByTag(seeds), [seeds]);
  const tags = React.useMemo(
    () =>
      Array.from(groupedByTag.keys())
        .filter((tag): tag is string => tag !== undefined)
        .sort((a, b) => a.localeCompare(b)),
    [groupedByTag],
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <Text style={styles.heading} accessibilityRole="header">
          庭
        </Text>
        <HelpButton content={helpTexts.garden} />
      </View>

      {seeds.length === 0 ? (
        <EmptyState image={stageImages.seed} title="この場所は、これから育っていきます。" description="書いた種が増えると、土の上に少しずつ並びます。" />
      ) : (
        <>
          {/* 畑: 種・芽・花の区画。押した区画の植物を下に並べる。 */}
          <FadeInView delayMs={30}>
            <View style={styles.plots}>
              {PLOT_STATES.map((state) => {
                const on = state === selected;
                return (
                  <AnimatedPressable
                    key={state}
                    onPress={() => setChosen(state)}
                    containerStyle={styles.plotContainer}
                    style={[styles.plot, { backgroundColor: plotTints[state] }, on && styles.plotOn]}
                    haptic="light"
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${growthStateLabels[state]} ${buckets[state].length}件。${growthStateHints[state]}`}
                  >
                    <Image source={stageImages[state]} style={styles.plotImage} accessibilityIgnoresInvertColors />
                    <View style={styles.plotSoil}>
                      <Image source={soilTexture} resizeMode="repeat" style={styles.soilImage} />
                    </View>
                    <Text style={styles.plotLabel}>
                      {growthStateLabels[state]} {buckets[state].length}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </FadeInView>

          <FadeInView delayMs={50}>
            <Text style={styles.plotHint}>{growthStateHints[selected]}</Text>
            {plants.length === 0 ? (
              <Text style={styles.emptyText}>まだありません。</Text>
            ) : (
              <View style={styles.plantGrid}>
                {plants.slice(0, PLANT_LIMIT).map((seed) => {
                  // 芽と花は、本人が書いた考えを前に出す。
                  const text = selected !== 'seed' && seed.synthesis ? seed.synthesis.statement : toSeedSnippet(seed, 60);
                  return (
                    <AnimatedPressable
                      key={seed.id}
                      onPress={() => onOpenSeed(seed.id)}
                      containerStyle={styles.plantContainer}
                      style={styles.plant}
                      haptic="light"
                      accessibilityRole="button"
                      accessibilityLabel={`${growthStateLabels[selected]}を開く。${toSeedSnippet({ body: text }, 40)}`}
                    >
                      <Image source={stageImages[selected]} style={styles.plantImage} accessibilityIgnoresInvertColors />
                      <Text style={styles.plantText} numberOfLines={3}>
                        {text}
                      </Text>
                      <LinkCount count={linkCounts.get(seed.id) ?? 0} />
                    </AnimatedPressable>
                  );
                })}
              </View>
            )}
            {plants.length > 0 ? (
              <AnimatedPressable
                onPress={() => onOpenSeedsByState(selected)}
                style={styles.moreLink}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`${growthStateLabels[selected]}を一覧で見る`}
              >
                <Text style={styles.moreLinkText}>{plants.length > PLANT_LIMIT ? `ほか${plants.length - PLANT_LIMIT}件も一覧で見る` : '一覧で見る'}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
              </AnimatedPressable>
            ) : null}
          </FadeInView>

          {connectedCenters.length > 0 ? (
            <FoldSection title="つながりのあるメモ" icon="git-network-outline" count={connectedCenters.length}>
              {connectedCenters.slice(0, LINK_CARD_LIMIT).map((center) => {
                const around = getLinkedSeeds(center, seeds, connections);
                return (
                  <AnimatedPressable
                    key={center.id}
                    onPress={() => onOpenSeed(center.id)}
                    style={styles.centerCard}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`つながりを見る。${toSeedSnippet(center, 30)}。つながり${around.length}件`}
                  >
                    <Text style={styles.centerText} numberOfLines={2}>
                      {toSeedSnippet(center, 60)}
                    </Text>
                    <Text style={styles.aroundText} numberOfLines={1}>
                      ─ {toSeedSnippet(around[0], 30)}
                      {around.length > 1 ? `（ほか${around.length - 1}件）` : ''}
                    </Text>
                  </AnimatedPressable>
                );
              })}
              {connectedCenters.length > LINK_CARD_LIMIT ? (
                <AnimatedPressable
                  onPress={onOpenConnectedList}
                  style={styles.moreLink}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={`ほか${connectedCenters.length - LINK_CARD_LIMIT}件を、一覧で見る`}
                >
                  <Text style={styles.moreLinkText}>ほか{connectedCenters.length - LINK_CARD_LIMIT}件を一覧で見る</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                </AnimatedPressable>
              ) : null}
            </FoldSection>
          ) : null}

          {recurringWords.length > 0 ? (
            <FoldSection title="くり返し出てくる言葉" icon="water-outline" count={recurringWords.length}>
              <View style={styles.wordRow}>
                {recurringWords.map(({ word, count }) => (
                  <AnimatedPressable
                    key={word}
                    onPress={() => onSearchWord(word)}
                    style={styles.wordChip}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`「${word}」を含む種を探す。${count}件の種に出てきます`}
                  >
                    <Text style={styles.wordText}>{word}</Text>
                    <Text style={styles.wordCount}>{count}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </FoldSection>
          ) : null}

          {tags.length > 0 ? (
            <FoldSection title="カテゴリ" icon="pricetags-outline" count={tags.length}>
              {tags.map((tag) => {
                const bucket = groupedByTag.get(tag) ?? [];
                return (
                  <View key={getTagGroupKey(tag)} style={styles.tagCard}>
                    <Text style={styles.tagTitle}>
                      {getTagGroupLabel(tag)} ({bucket.length})
                    </Text>
                    {bucket.slice(0, 2).map((seed) => (
                      <AnimatedPressable
                        key={seed.id}
                        onPress={() => onOpenSeed(seed.id)}
                        style={styles.tagItem}
                        haptic="light"
                        accessibilityRole="button"
                        accessibilityLabel={`種を開く。${toSeedSnippet(seed, 40)}`}
                      >
                        <Text numberOfLines={1} style={styles.aroundText}>
                          {toSeedSnippet(seed, 40)}
                        </Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                );
              })}
            </FoldSection>
          ) : null}

          {buckets.archived.length > 0 ? (
            <AnimatedPressable
              onPress={() => onOpenSeedsByState('archived')}
              style={styles.moreLink}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={`保管したメモ${buckets.archived.length}件を一覧で見る`}
            >
              <Ionicons name="archive-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.archiveText}>保管したメモ {buckets.archived.length}件</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </AnimatedPressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, paddingBottom: 124, gap: theme.spacing.md },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: theme.typography.title, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  plots: { flexDirection: 'row', gap: theme.spacing.xs },
  plotContainer: { flex: 1 },
  plot: { alignItems: 'center', borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.rule, overflow: 'hidden', paddingTop: 6 },
  plotOn: { borderWidth: 3, borderColor: theme.colors.primary },
  plotImage: { width: 96, height: 96, marginBottom: -14, zIndex: 1 },
  plotSoil: { alignSelf: 'stretch', height: 18, backgroundColor: '#80603f', overflow: 'hidden' },
  soilImage: { width: '100%', height: '100%' },
  plotLabel: { fontSize: 16, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text, paddingVertical: 8 },
  plotHint: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginBottom: theme.spacing.xs },
  plantGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  // 2列に並べる。1件だけでも横いっぱいには広げない。
  plantContainer: { width: '48.5%' },
  plant: { alignItems: 'center', gap: 6, padding: theme.spacing.sm, minHeight: 150, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.rule },
  plantImage: { width: 64, height: 64 },
  plantText: { fontSize: 14, lineHeight: 20, fontFamily: theme.fonts.serif, color: theme.colors.text, textAlign: 'center' },
  emptyText: { color: theme.colors.textMuted, fontSize: 14, textAlign: 'center' },
  moreLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  moreLinkText: { fontSize: theme.typography.subbody, fontWeight: '700', color: theme.colors.primary },
  archiveText: { fontSize: theme.typography.subbody, fontWeight: '600', color: theme.colors.textMuted },
  centerCard: { gap: 4, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.rule },
  centerText: { fontSize: 15, lineHeight: 22, fontWeight: '700', fontFamily: theme.fonts.serif, color: theme.colors.text },
  aroundText: { fontSize: 13, lineHeight: 19, fontFamily: theme.fonts.serif, color: theme.colors.textMuted },
  wordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: theme.radius.full, backgroundColor: '#e6eef0', borderWidth: 1, borderColor: '#c5d6db' },
  wordText: { fontSize: theme.typography.subbody, fontWeight: '600', color: theme.colors.text },
  wordCount: { fontSize: 12, fontWeight: '700', color: '#4f7f93' },
  tagCard: { borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, padding: 12, gap: 6 },
  tagTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  tagItem: { borderTopWidth: 1, borderTopColor: theme.colors.rule, paddingTop: 6, minHeight: 32, justifyContent: 'center' },
});
