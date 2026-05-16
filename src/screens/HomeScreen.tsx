import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import type { ResurfacedSeed, Seed } from '../domain/types';
import { theme, pressedOpacity } from '../styles/theme';
import { formatDate } from '../utils/seedUtils';
import { toGrowthLabel } from '../utils/displayLabels';

type HomeScreenProps = {
  seeds: Seed[];
  todaySeed?: ResurfacedSeed;
  onRefreshToday: () => void;
  onOpenSeed: (seedId: string) => void;
  onOpenWrite: () => void;
};

export function HomeScreen({ seeds, todaySeed, onRefreshToday, onOpenSeed, onOpenWrite }: HomeScreenProps) {
  const recent = [...seeds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.todayMeta}>今日の種 · {dateLabel}</Text>
      <Text style={styles.heading}>Kizashi Notes</Text>
      <Text style={styles.subheading}>ひとことを置いて、あとでゆっくり育てるためのノートです。</Text>

      <SectionCard>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>今日の種</Text>
          <Pressable onPress={onRefreshToday} style={({ pressed }) => [styles.secondaryButton, pressedOpacity({ pressed })]}>
            <Text style={styles.secondaryButtonText}>別の種を見る</Text>
          </Pressable>
        </View>

        {todaySeed ? (
          <Pressable onPress={() => onOpenSeed(todaySeed.seed.id)} style={({ pressed }) => [styles.seedCard, pressedOpacity({ pressed })]}>
            <Text style={styles.seedBody}>{todaySeed.seed.body}</Text>
            <Text style={styles.seedMeta}>理由: {todaySeed.reason}</Text>
            <Text style={styles.seedMeta}>更新: {formatDate(todaySeed.seed.updatedAt)}</Text>
          </Pressable>
        ) : (
          <EmptyState
            icon="leaf-outline"
            title="まだ種はありません"
            description="ひとことだけ、ここに置いてみましょう。"
            actionLabel="最初の種を書く"
            onAction={onOpenWrite}
          />
        )}
      </SectionCard>

      <SectionCard muted>
        <Text style={styles.cardTitle}>最近の種</Text>
        {recent.length > 0 ? (
          recent.map((seed) => (
            <Pressable key={seed.id} onPress={() => onOpenSeed(seed.id)} style={({ pressed }) => [styles.listItem, pressedOpacity({ pressed })]}>
              <Text style={styles.listBody} numberOfLines={2}>
                {seed.body}
              </Text>
              <View style={styles.listMetaRow}>
                <Ionicons name="leaf-outline" size={14} color={theme.colors.textSoft} />
                <Text style={styles.listMeta}>
                  {toGrowthLabel(seed.growthState)} ・ 大切度{seed.importance}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <EmptyState icon="sparkles-outline" title="種の記録はこれからです" description="書いた種はここに静かに並んでいきます。" />
        )}
      </SectionCard>

      <PrimaryButton label="新しい種を書く" onPress={onOpenWrite} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: 110,
    gap: theme.spacing.sm,
  },
  todayMeta: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSoft,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  heading: {
    fontSize: theme.typography.largeTitle,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subheading: {
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
    lineHeight: 21,
    marginBottom: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cardTitle: {
    fontSize: theme.typography.sectionTitle,
    fontWeight: '600',
    color: theme.colors.text,
  },
  secondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: '#dceee1',
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  seedCard: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
  seedBody: {
    fontSize: 17,
    color: theme.colors.text,
    lineHeight: 24,
  },
  seedMeta: {
    fontSize: theme.typography.caption,
    color: theme.colors.textMuted,
  },
  listItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#dfe8e0',
    gap: 4,
  },
  listBody: {
    fontSize: theme.typography.body,
    color: theme.colors.text,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listMeta: {
    fontSize: theme.typography.caption,
    color: theme.colors.textMuted,
  },
});
