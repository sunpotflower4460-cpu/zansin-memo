import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { SectionCard } from '../components/SectionCard';
import type { GrowthState, Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateHints, growthStateLabels } from '../utils/displayLabels';
import { getTagGroupKey, getTagGroupLabel, groupSeedsByTag } from '../utils/seedUtils';

type GardenScreenProps = {
  seeds: Seed[];
  onOpenSeed: (seedId: string) => void;
};

const orderedStates: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
const GARDEN_CARD_WIDTH_RATIO = 0.72;
const GARDEN_CARD_MIN_WIDTH = 210;
const GARDEN_CARD_MAX_WIDTH = 280;

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

export function GardenScreen({ seeds, onOpenSeed }: GardenScreenProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(Math.max(width * GARDEN_CARD_WIDTH_RATIO, GARDEN_CARD_MIN_WIDTH), GARDEN_CARD_MAX_WIDTH);

  const stateBuckets = useMemo(() => {
    const buckets: Record<GrowthState, Seed[]> = { seed: [], sprout: [], tree: [], archived: [] };
    for (const seed of seeds) {
      buckets[seed.growthState].push(seed);
    }
    return buckets;
  }, [seeds]);

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
      <Text style={styles.heading} accessibilityRole="header">
        庭
      </Text>
      <Text style={styles.subheading}>種から芽へ、芽から木へ。育ちの流れを、静かに見渡せる場所です。</Text>

      {seeds.length === 0 ? (
        <EmptyState icon="flower-outline" title="この場所は、これから育っていきます。" description="書いた種が増えると、庭に少しずつ並びます。" />
      ) : null}

      {orderedStates.map((state) => {
        const bucket = stateBuckets[state];

        return (
          <FadeInView key={state} delayMs={40}>
            <SectionCard muted style={{ borderTopWidth: 2, borderTopColor: stateAccents[state] }}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons name={stateIcons[state]} size={18} color={stateAccents[state]} />
                <Text style={styles.sectionTitle}>{growthStateLabels[state]}</Text>
                <Text style={styles.sectionHint}>{growthStateHints[state]}</Text>
              </View>
              <Text style={styles.countText} accessibilityLabel={`${growthStateLabels[state]} ${bucket.length}件`}>{bucket.length}</Text>
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
                    <Text style={styles.meta}>大切度{seed.importance}</Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            )}
            </SectionCard>
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
    flex: 1,
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
