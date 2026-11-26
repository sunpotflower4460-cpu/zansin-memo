import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChipSelector } from '../components/ChipSelector';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { GrowthBadge } from '../components/GrowthBadge';
import { ImportanceDots } from '../components/ImportanceDots';
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

  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={styles.heading} accessibilityRole="header">
        種一覧
      </Text>
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

      <FadeInView delayMs={40}>
        <SectionCard muted>
          <Text style={styles.label}>状態</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            <IOSChip label={allLabel} selected={stateFilter === 'all'} onPress={() => onChangeFilter('all')} />
            {GROWTH_STATE_OPTIONS.map((state) => (
              <IOSChip
                key={state}
                label={growthStateLabels[state]}
                selected={stateFilter === state}
                onPress={() => onChangeFilter(state)}
              />
            ))}
          </ScrollView>

          <Text style={styles.label}>カテゴリ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            <IOSChip label={allLabel} selected={activeTagFilter === null} onPress={() => onChangeTagFilter(null)} />
            {tagOptions.map((tag) => (
              <IOSChip key={tag} label={tag} selected={activeTagFilter === tag} onPress={() => onChangeTagFilter(tag)} />
            ))}
          </ScrollView>

          <ChipSelector<SortType>
            label="並び替え"
            options={['updated', 'importance']}
            selectedValue={sortType}
            onChange={(value) => onChangeSort(value ?? 'updated')}
            getLabel={(value) => sortLabels[value]}
          />
        </SectionCard>
      </FadeInView>
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
            <View style={styles.metaSpacer} />
            <ImportanceDots value={seed.importance} />
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
