import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChipSelector } from '../components/ChipSelector';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { GrowthBadge } from '../components/GrowthBadge';
import { HelpButton } from '../components/HelpButton';
import { helpTexts } from '../utils/helpTexts';
import { ImportanceDots } from '../components/ImportanceDots';
import { LinkCount } from '../components/LinkCount';
import { getLinkCounts } from '../utils/links';
import { IOSChip } from '../components/IOSChip';
import { SectionCard } from '../components/SectionCard';
import { GROWTH_STATE_OPTIONS, type GrowthState, type Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { allLabel, growthStateLabels, sortLabels } from '../utils/displayLabels';
import { formatDate, formatRelativeDay, matchesTagFilter, resolveTagFilter } from '../utils/seedUtils';

type SortType = 'updated' | 'importance';
const MAX_RECENTLY_DELETED_SEEDS = 10;

function SeedSeparator() {
  return <View style={styles.separator} />;
}

type SeedsScreenProps = {
  seeds: Seed[];
  deletedSeeds: Seed[];
  search: string;
  stateFilter: GrowthState | 'all';
  tagFilter: string | null;
  sortType: SortType;
  onChangeSearch: (value: string) => void;
  onChangeFilter: (value: GrowthState | 'all') => void;
  onChangeTagFilter: (value: string | null) => void;
  onChangeSort: (value: SortType) => void;
  onRestoreSeed: (seedId: string) => void;
  onOpenSeed: (seedId: string) => void;
  onOpenWrite?: () => void;
};

export function SeedsScreen({
  seeds,
  deletedSeeds,
  search,
  stateFilter,
  tagFilter,
  sortType,
  onChangeSearch,
  onChangeFilter,
  onChangeTagFilter,
  onChangeSort,
  onRestoreSeed,
  onOpenSeed,
  onOpenWrite,
}: SeedsScreenProps) {
  const tagOptions = useMemo(
    () => Array.from(new Set(seeds.flatMap((seed) => seed.tags))).sort((a, b) => a.localeCompare(b)),
    [seeds],
  );

  const activeTagFilter = useMemo(() => resolveTagFilter(tagFilter, tagOptions), [tagFilter, tagOptions]);

  // 選択中のタグが消えたら絞り込みを解除し、見えないフィルタが残らないようにする。
  useEffect(() => {
    if (activeTagFilter !== tagFilter) {
      onChangeTagFilter(activeTagFilter);
    }
  }, [activeTagFilter, tagFilter, onChangeTagFilter]);

  const [moreOpen, setMoreOpen] = useState(false);
  const linkCounts = useMemo(() => getLinkCounts(seeds), [seeds]);
  const stateCounts = useMemo(() => {
    const counts: Record<GrowthState, number> = { seed: 0, sprout: 0, tree: 0, archived: 0 };
    for (const seed of seeds) {
      counts[seed.growthState] += 1;
    }
    return counts;
  }, [seeds]);

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredSeeds = useMemo(
    () =>
      seeds
        .filter((seed) => {
          if (stateFilter !== 'all' && seed.growthState !== stateFilter) {
            return false;
          }
          if (!matchesTagFilter(seed, activeTagFilter)) {
            return false;
          }
          if (!normalizedSearch) {
            return true;
          }
          const target = `${seed.title ?? ''} ${seed.body} ${seed.tags.join(' ')}`.toLowerCase();
          return target.includes(normalizedSearch);
        })
        .sort((a, b) => {
          if (sortType === 'importance') {
            return b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt);
          }
          return b.updatedAt.localeCompare(a.updatedAt);
        }),
    [seeds, stateFilter, activeTagFilter, normalizedSearch, sortType],
  );

  const hasActiveFilter = search.trim() !== '' || stateFilter !== 'all' || activeTagFilter !== null;
  const resetFilters = () => {
    onChangeSearch('');
    onChangeFilter('all');
    onChangeTagFilter(null);
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.headingRow}>
        <Text style={styles.heading} accessibilityRole="header">
          種一覧
        </Text>
        <HelpButton content={helpTexts.seeds} />
      </View>
      <Text style={styles.subheading}>
        {seeds.length === 0 ? '書いた種がここに並びます。' : `${seeds.length}件の種。検索や絞り込みで、見返したい種を見つけます。`}
      </Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
        <TextInput
          value={search}
          onChangeText={onChangeSearch}
          style={styles.searchInput}
          placeholder="本文・タイトル・カテゴリで検索"
          placeholderTextColor={theme.colors.placeholder}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          accessibilityLabel="種の検索"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel="育ち方で絞り込む">
        <IOSChip
          label={`${allLabel} ${seeds.length}`}
          accessibilityLabel={`すべて、${seeds.length}件`}
          selected={stateFilter === 'all'}
          onPress={() => onChangeFilter('all')}
        />
        {GROWTH_STATE_OPTIONS.map((state) => (
          <IOSChip
            key={state}
            label={`${growthStateLabels[state]} ${stateCounts[state]}`}
            accessibilityLabel={`${growthStateLabels[state]}、${stateCounts[state]}件`}
            selected={stateFilter === state}
            onPress={() => onChangeFilter(state)}
          />
        ))}
      </ScrollView>

      <AnimatedPressable
        onPress={() => setMoreOpen((value) => !value)}
        style={styles.moreToggle}
        haptic="light"
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        accessibilityLabel="カテゴリと並び替え"
        accessibilityHint={moreOpen ? 'タップして閉じます' : 'タップして開きます'}
      >
        <Ionicons name="options-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.moreToggleTitle}>カテゴリ・並び替え</Text>
        <Text style={styles.moreToggleSummary} numberOfLines={1}>
          {activeTagFilter ?? 'すべて'}・{sortLabels[sortType]}順
        </Text>
        <Ionicons name={moreOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={theme.colors.textMuted} />
      </AnimatedPressable>

      {moreOpen ? (
        <SectionCard muted>
          <Text style={styles.label}>カテゴリ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            <IOSChip label={allLabel} selected={activeTagFilter === null} onPress={() => onChangeTagFilter(null)} />
            {tagOptions.map((tag) => (
              <IOSChip key={tag} label={tag} selected={activeTagFilter === tag} onPress={() => onChangeTagFilter(tag)} />
            ))}
          </ScrollView>
          {tagOptions.length === 0 ? <Text style={styles.deletedHint}>種にカテゴリを付けると、ここで絞り込めます。</Text> : null}

          <ChipSelector<SortType>
            label="並び替え"
            options={['updated', 'importance']}
            selectedValue={sortType}
            onChange={(value) => onChangeSort(value ?? 'updated')}
            getLabel={(value) => sortLabels[value]}
          />
        </SectionCard>
      ) : null}

      {hasActiveFilter ? (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>{filteredSeeds.length}件が見つかりました</Text>
          <AnimatedPressable
            onPress={resetFilters}
            style={styles.resetButton}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="検索と絞り込みをすべて解除する"
          >
            <Text style={styles.resetText}>絞り込みを解除</Text>
          </AnimatedPressable>
        </View>
      ) : null}
    </View>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      <FadeInView delayMs={90}>
      <SectionCard muted>
        <Text style={styles.label}>最近削除した種</Text>
        {deletedSeeds.length === 0 ? (
          <Text style={styles.deletedHint}>削除した種はまだありません。</Text>
        ) : (
          <View style={styles.deletedList}>
            {deletedSeeds.slice(0, MAX_RECENTLY_DELETED_SEEDS).map((seed) => (
              <View key={seed.id} style={styles.deletedItem}>
                <Text numberOfLines={2} style={styles.deletedBody}>
                  {seed.body}
                </Text>
                <View style={styles.deletedMetaWrap}>
                  <Text style={styles.deletedMeta}>
                    削除: {seed.deletedAt ? formatDate(seed.deletedAt) : '日時不明'}
                  </Text>
                  <IOSChip label="復元する" onPress={() => onRestoreSeed(seed.id)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </FadeInView>
    </View>
  );

  return (
    <FlatList
      data={filteredSeeds}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        seeds.length === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title="まだ種はありません"
            description="ひとことだけ、置いてみましょう。書いた種はここに並びます。"
            actionLabel={onOpenWrite ? '種を書く' : undefined}
            onAction={onOpenWrite}
          />
        ) : (
          <EmptyState
            icon="search-outline"
            title="条件に合う種はありません"
            description="検索やフィルターを少しゆるめると、見つかるかもしれません。"
          />
        )
      }
      ItemSeparatorComponent={SeedSeparator}
      ListFooterComponent={listFooter}
      renderItem={({ item: seed }) => (
        <AnimatedPressable
          onPress={() => onOpenSeed(seed.id)}
          style={styles.seedCard}
          pressedStyle={styles.seedCardPressed}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={`種を開く。${seed.title ? `${seed.title}。` : ''}${seed.body.length > 40 ? `${seed.body.slice(0, 40)}…` : seed.body}`}
        >
          {seed.title ? <Text style={styles.title}>{seed.title}</Text> : null}
          <Text numberOfLines={3} style={styles.body}>
            {seed.body}
          </Text>
          <View style={styles.metaRow}>
            <GrowthBadge state={seed.growthState} />
            <Text style={styles.meta}>{formatRelativeDay(seed.updatedAt)}</Text>
            <LinkCount count={linkCounts.get(seed.id) ?? 0} />
            <View style={styles.metaSpacer} />
            <ImportanceDots value={seed.importance} />
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
          </View>
          {seed.tags.length > 0 ? (
            <View style={styles.tagRow}>
              {seed.tags.map((tag) => (
                <Text key={tag} style={styles.tagPill}>
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}
        </AnimatedPressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: 124,
  },
  listHeader: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  listFooter: {
    marginTop: theme.spacing.md,
  },
  separator: {
    height: theme.spacing.sm,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  searchWrap: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...theme.shadows.card,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    minHeight: 46,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.subbody,
  },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.rule,
  },
  moreToggleTitle: {
    fontSize: theme.typography.subbody,
    fontWeight: '700',
    color: theme.colors.text,
  },
  moreToggleSummary: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultText: {
    fontSize: theme.typography.subbody,
    color: theme.colors.textMuted,
  },
  resetButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  resetText: {
    fontSize: theme.typography.subbody,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  row: {
    gap: 8,
    paddingRight: 16,
  },
  deletedList: {
    gap: 10,
  },
  deletedItem: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.rule,
    paddingTop: 10,
    gap: 8,
  },
  deletedBody: {
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  deletedMetaWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  deletedMeta: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSoft,
    lineHeight: 18,
  },
  deletedHint: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  seedCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    gap: 7,
    ...theme.shadows.card,
  },
  seedCardPressed: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: theme.fonts.serif,
    color: theme.colors.text,
  },
  body: {
    fontFamily: theme.fonts.serif,
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 23,
  },
  meta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaSpacer: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    fontSize: 12,
    color: theme.colors.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
});
