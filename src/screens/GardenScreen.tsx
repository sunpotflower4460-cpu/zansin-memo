import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { SectionCard } from '../components/SectionCard';
import type { GrowthState, Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { growthStateLabels } from '../utils/displayLabels';

type GardenScreenProps = {
  seeds: Seed[];
  onOpenSeed: (seedId: string) => void;
};

const orderedStates: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
const untaggedLabel = '未分類';
const GARDEN_CARD_WIDTH = 210;

const stateIcons: Record<GrowthState, keyof typeof Ionicons.glyphMap> = {
  seed: 'leaf-outline',
  sprout: 'nutrition-outline',
  tree: 'flower-outline',
  archived: 'archive-outline',
};

const stateAccents: Record<GrowthState, string> = {
  seed: '#a3c4a8',
  sprout: '#5da36b',
  tree: '#1f6b49',
  archived: '#9aabb6',
};

export function GardenScreen({ seeds, onOpenSeed }: GardenScreenProps) {
  const groupedByTag = seeds.reduce<Record<string, Seed[]>>((acc, seed) => {
    if (seed.tags.length === 0) {
      if (!acc[untaggedLabel]) {
        acc[untaggedLabel] = [];
      }
      acc[untaggedLabel].push(seed);
      return acc;
    }

    seed.tags.forEach((tag) => {
      if (!acc[tag]) {
        acc[tag] = [];
      }
      acc[tag].push(seed);
    });
    return acc;
  }, {});
  const orderedTags = Object.keys(groupedByTag).sort((a, b) => {
    if (a === untaggedLabel) {
      return 1;
    }
    if (b === untaggedLabel) {
      return -1;
    }
    return a.localeCompare(b);
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>庭</Text>
      <Text style={styles.subheading}>種の流れを、静かに見渡せる場所です。</Text>

      {seeds.length === 0 ? (
        <EmptyState icon="flower-outline" title="この場所は、これから育っていきます。" description="書いた種が増えると、庭に少しずつ並びます。" />
      ) : null}

      {orderedStates.map((state) => {
        const bucket = seeds.filter((seed) => seed.growthState === state);

        return (
          <FadeInView key={state} delayMs={40}>
            <SectionCard muted style={{ borderTopWidth: 3, borderTopColor: stateAccents[state] }}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons name={stateIcons[state]} size={18} color={stateAccents[state]} />
                <Text style={styles.sectionTitle}>{growthStateLabels[state]}</Text>
              </View>
              <Text style={[styles.countText, { color: stateAccents[state] }]}>{bucket.length}</Text>
            </View>

            {bucket.length === 0 ? (
              <Text style={styles.emptyText}>まだこの状態の種はありません。</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                {bucket.map((seed) => (
                  <AnimatedPressable
                    key={seed.id}
                    onPress={() => onOpenSeed(seed.id)}
                    style={[styles.card, { borderLeftColor: stateAccents[state], borderLeftWidth: 3 }]}
                    pressedStyle={styles.cardPressed}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={`${growthStateLabels[state]}の種の詳細を開く`}
                  >
                    <Text numberOfLines={3} style={styles.body}>
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
              const bucket = groupedByTag[tag];
              return (
                <View key={tag} style={styles.tagCard}>
                  <Text style={styles.tagTitle}>
                    {tag} ({bucket.length})
                  </Text>
                  {bucket.slice(0, 2).map((seed) => (
                    <AnimatedPressable
                      key={seed.id}
                      onPress={() => onOpenSeed(seed.id)}
                      style={styles.tagItem}
                      haptic="light"
                      accessibilityRole="button"
                      accessibilityLabel="カテゴリ内の種の詳細を開く"
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  countText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'right',
  },
  horizontalRow: {
    gap: 10,
    paddingRight: 14,
  },
  card: {
    width: GARDEN_CARD_WIDTH,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 8,
  },
  cardPressed: {
    backgroundColor: '#f4f8f3',
  },
  body: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 64,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 12,
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
    borderTopColor: '#dbe4dd',
    paddingTop: 8,
  },
  metaBody: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
