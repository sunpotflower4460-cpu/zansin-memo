import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GrowthState, Seed } from '../domain/types';

type GardenScreenProps = {
  seeds: Seed[];
  onOpenSeed: (seedId: string) => void;
};

const orderedStates: GrowthState[] = ['seed', 'sprout', 'tree', 'archived'];
const untaggedLabel = '未分類';

export function GardenScreen({ seeds, onOpenSeed }: GardenScreenProps) {
  const groupedByTag = seeds.reduce<Record<string, Seed[]>>((acc, seed) => {
    if (seed.tags.length === 0) {
      acc[untaggedLabel] = [...(acc[untaggedLabel] ?? []), seed];
      return acc;
    }

    seed.tags.forEach((tag) => {
      acc[tag] = [...(acc[tag] ?? []), seed];
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
      <Text style={styles.heading}>Garden</Text>
      <Text style={styles.subheading}>種・芽・木を軽く眺めて、育ちの流れを見渡します。</Text>

      {orderedStates.map((state) => {
        const bucket = seeds.filter((seed) => seed.growthState === state);

        return (
          <View key={state} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {state} ({bucket.length})
            </Text>
            {bucket.length === 0 ? (
              <Text style={styles.emptyText}>この状態の種はまだありません。</Text>
            ) : (
              <View style={styles.grid}>
                {bucket.map((seed) => (
                  <Pressable key={seed.id} onPress={() => onOpenSeed(seed.id)} style={styles.card}>
                    <Text numberOfLines={3} style={styles.body}>
                      {seed.body}
                    </Text>
                    <Text style={styles.meta}>重要度{seed.importance}</Text>
                    {seed.relatedSeedIds.length > 0 ? (
                      <Text style={styles.meta}>関連 {seed.relatedSeedIds.length}件</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>カテゴリのまとまり</Text>
        {orderedTags.length === 0 ? (
          <Text style={styles.emptyText}>まだカテゴリ付きの種はありません。</Text>
        ) : (
          <View style={styles.grid}>
            {orderedTags.map((tag) => {
              const bucket = groupedByTag[tag];
              return (
                <View key={tag} style={styles.tagCard}>
                  <Text style={styles.tagTitle}>
                    {tag} ({bucket.length})
                  </Text>
                  {bucket.slice(0, 3).map((seed) => (
                    <Pressable key={seed.id} onPress={() => onOpenSeed(seed.id)} style={styles.tagItem}>
                      <Text numberOfLines={2} style={styles.metaBody}>
                        {seed.body}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 120,
    gap: 16,
  },
  heading: {
    fontSize: 27,
    fontWeight: '700',
    color: '#0f172a',
  },
  subheading: {
    color: '#64748b',
    lineHeight: 22,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  grid: {
    gap: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  tagCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  tagTitle: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
  },
  tagItem: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  metaBody: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    color: '#0f172a',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
});
