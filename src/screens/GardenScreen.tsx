import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import banner from '../../assets/banner-field.png';
import soilTexture from '../../assets/soil.png';
import { stageImages } from '../utils/stageImages';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { ClusterCard } from '../components/ClusterCard';
import { HelpButton } from '../components/HelpButton';
import { LinkCount } from '../components/LinkCount';
import { buildClusters, findRecurringWords, getLinkCounts } from '../utils/links';
import { SectionCard } from '../components/SectionCard';
import { helpTexts } from '../utils/helpTexts';
import type { GrowthState, Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateHints, growthStateLabels } from '../utils/displayLabels';
import { getTagGroupKey, getTagGroupLabel, groupSeedsByTag } from '../utils/seedUtils';

type GardenScreenProps = {
  seeds: Seed[];
  onOpenSeed: (seedId: string) => void;
  /** 指定した育ち方だけの種一覧へ移る。 */
  onOpenSeedsByState: (state: GrowthState) => void;
  /** 繰り返し出てくる言葉から、その言葉を含む種を探す。 */
  onSearchWord: (word: string) => void;
};

const orderedStates: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
const GARDEN_CARD_WIDTH_RATIO = 0.72;
const GARDEN_CARD_MIN_WIDTH = 210;
const GARDEN_CARD_MAX_WIDTH = 280;

// 育ちごとに、土の色から若草・深緑へと畝の色を変える。
const bedTints: Record<GrowthState, string> = {
  seed: '#efe3cb',
  sprout: '#e8eed6',
  tree: '#dde9d4',
  archived: '#ece7db',
};

const stateIcons: Record<GrowthState, keyof typeof Ionicons.glyphMap> = {
  seed: 'leaf-outline',
  sprout: 'nutrition-outline',
  tree: 'flower-outline',
  archived: 'archive-outline',
};

const stateAccents: Record<GrowthState, string> = {
  seed: '#b9a67b', // 土の色
  sprout: '#7fae6a', // 若草
  tree: theme.colors.primary,
  archived: '#a39d90', // 古紙の灰
};

export function GardenScreen({ seeds, onOpenSeed, onOpenSeedsByState, onSearchWord }: GardenScreenProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(Math.max(width * GARDEN_CARD_WIDTH_RATIO, GARDEN_CARD_MIN_WIDTH), GARDEN_CARD_MAX_WIDTH);

  const stateBuckets = useMemo(() => {
    const buckets: Record<GrowthState, Seed[]> = { seed: [], sprout: [], tree: [], archived: [] };
    for (const seed of seeds) {
      buckets[seed.growthState].push(seed);
    }
    return buckets;
  }, [seeds]);

  const clusters = useMemo(() => buildClusters(seeds), [seeds]);
  const recurringWords = useMemo(() => findRecurringWords(seeds), [seeds]);
  const linkCounts = useMemo(() => getLinkCounts(seeds), [seeds]);

  const groupedByTag = useMemo(() => groupSeedsByTag(seeds), [seeds]);

  const orderedTags = useMemo(
    () =>
      Array.from(groupedByTag.keys()).sort((a, b) => {
        if (a === undefined) {
          return 1;
        }
        if (b === undefined) {
          return -1;
        }
        return a.localeCompare(b);
      }),
    [groupedByTag],
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.banner} accessible accessibilityRole="header" accessibilityLabel="庭">
        <Image source={banner} style={styles.bannerImage} resizeMode="cover" accessibilityIgnoresInvertColors />
        <Text style={styles.heading}>庭</Text>
      </View>
      <View style={styles.subheadingRow}>
        <Text style={[styles.subheading, styles.subheadingText]}>種から芽へ、芽から木へ。育ちの流れを、静かに見渡せる場所です。</Text>
        <HelpButton content={helpTexts.garden} />
      </View>

      {seeds.length === 0 ? (
        <EmptyState image={stageImages.seed} title="この場所は、これから育っていきます。" description="書いた種が増えると、土の上に少しずつ並びます。" />
      ) : null}

      {seeds.length >= 2 ? (
        <FadeInView delayMs={30}>
          <View style={styles.linkSection}>
            <View style={styles.linkTitleRow}>
              <Ionicons name="git-network-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>つながりのまとまり</Text>
            </View>
            {clusters.length > 0 ? (
              clusters.slice(0, 5).map((members) => <ClusterCard key={members[0].id} members={members} onOpenSeed={onOpenSeed} />)
            ) : (
              <Text style={styles.emptyText}>
                種どうしをつなぐと、ここに「まとまり」ができます。種の詳細の「つながり」から、続きを書いたり、関係のある種をつなげたりできます。
              </Text>
            )}
          </View>
        </FadeInView>
      ) : null}

      {recurringWords.length > 0 ? (
        <FadeInView delayMs={50}>
          <View style={styles.linkSection}>
            <View style={styles.linkTitleRow}>
              <Ionicons name="water-outline" size={20} color="#4f7f93" />
              <Text style={styles.sectionTitle}>くり返し出てくる言葉</Text>
            </View>
            <Text style={styles.emptyText}>複数の種に現れる言葉です。タップすると、その言葉を含む種を探せます。</Text>
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
          </View>
        </FadeInView>
      ) : null}

      {orderedStates.map((state) => {
        const bucket = stateBuckets[state];

        return (
          <FadeInView key={state} delayMs={40}>
            <View style={[styles.bed, { backgroundColor: bedTints[state] }]}>
            <View style={styles.furrow}>
              <Image source={soilTexture} resizeMode="repeat" style={styles.soilImage} />
            </View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleWrap}>
                <Image source={stageImages[state]} style={styles.stageIcon} accessibilityIgnoresInvertColors />
                <View style={styles.sectionTitleText}>
                  <Text style={styles.sectionTitle}>{growthStateLabels[state]}</Text>
                  <Text style={styles.sectionHint}>{growthStateHints[state]}</Text>
                </View>
              </View>
              <View style={styles.sectionRight}>
                <Text style={styles.countText} accessibilityLabel={`${growthStateLabels[state]} ${bucket.length}件`}>
                  {bucket.length}
                </Text>
                {bucket.length > 0 ? (
                  <AnimatedPressable
                    onPress={() => onOpenSeedsByState(state)}
                    style={styles.listLink}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`${growthStateLabels[state]}の種を一覧で見る`}
                  >
                    <Text style={styles.listLinkText}>一覧で見る</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
                  </AnimatedPressable>
                ) : null}
              </View>
            </View>

            {bucket.length === 0 ? (
              <Text style={styles.emptyText}>まだこの状態の種はありません。</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                {bucket.map((seed) => (
                  <AnimatedPressable
                    key={seed.id}
                    onPress={() => onOpenSeed(seed.id)}
                    style={[styles.card, { width: cardWidth, borderLeftColor: stateAccents[state], borderLeftWidth: 3 }]}
                    pressedStyle={styles.cardPressed}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`${growthStateLabels[state]}の種を開く。${seed.body.length > 40 ? `${seed.body.slice(0, 40)}…` : seed.body}`}
                  >
                    <Text numberOfLines={4} style={styles.body}>
                      {seed.body}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Ionicons name={stateIcons[state]} size={14} color={stateAccents[state]} />
                      <Text style={styles.meta}>大切度{seed.importance}</Text>
                      <LinkCount count={linkCounts.get(seed.id) ?? 0} />
                    </View>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            )}
            </View>
          </FadeInView>
        );
      })}

      <FadeInView delayMs={80}>
        <SectionCard>
        <Text style={styles.sectionTitle}>カテゴリのまとまり</Text>
        {orderedTags.length === 0 ? (
          <Text style={styles.emptyText}>まだカテゴリ付きの種はありません。</Text>
        ) : (
          <View style={styles.tagList}>
            {orderedTags.map((tag) => {
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
                      accessibilityLabel={`種を開く。${seed.body.length > 40 ? `${seed.body.slice(0, 40)}…` : seed.body}`}
                    >
                      <Text numberOfLines={2} style={styles.metaBody}>
                        {seed.body}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              );
            })}
          </View>
        )}
        </SectionCard>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  soilImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: 124,
    gap: theme.spacing.md,
  },
  heading: {
    fontSize: theme.typography.title,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  subheading: {
    color: theme.colors.textMuted,
    lineHeight: 22,
    marginBottom: 2,
  },
  banner: {
    height: 150,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#f1e4c3',
    borderWidth: 1,
    borderColor: theme.colors.rule,
    padding: 18,
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  bed: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    padding: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  furrow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#80603f',
    overflow: 'hidden',
  },
  linkSection: {
    gap: theme.spacing.sm,
  },
  linkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: '#e6eef0',
    borderWidth: 1,
    borderColor: '#c5d6db',
  },
  wordText: {
    fontSize: theme.typography.subbody,
    fontWeight: '600',
    color: theme.colors.text,
  },
  wordCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f7f93',
  },
  subheadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  subheadingText: {
    flex: 1,
  },
  sectionRight: {
    alignItems: 'flex-end',
  },
  listLink: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    gap: 2,
  },
  listLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  stageIcon: {
    width: 52,
    height: 52,
    marginVertical: -8,
  },
  sectionTitleText: {
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHint: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  countText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'right',
  },
  horizontalRow: {
    gap: 10,
    paddingRight: 14,
    paddingBottom: 2,
  },
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 8,
  },
  cardPressed: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  body: {
    color: theme.colors.text,
    fontFamily: theme.fonts.serif,
    fontSize: 15,
    lineHeight: 23,
    paddingBottom: 2,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  tagList: {
    gap: 8,
  },
  tagCard: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 12,
    gap: 8,
  },
  tagTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  tagItem: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.rule,
    paddingTop: 8,
  },
  metaBody: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
