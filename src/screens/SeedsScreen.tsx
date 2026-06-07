import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChipSelector } from '../components/ChipSelector';
import { EmptyState } from '../components/EmptyState';
import { FadeInView } from '../components/FadeInView';
import { IOSChip } from '../components/IOSChip';
import { SectionCard } from '../components/SectionCard';
import { GROWTH_STATE_OPTIONS, type GrowthState, type Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { allLabel, growthStateLabels, sortLabels } from '../utils/displayLabels';
import { formatDate } from '../utils/seedUtils';

type SortType = 'updated' | 'importance';
const MAX_RECENTLY_DELETED_SEEDS = 10;

type SeedsScreenProps = {
  seeds: Seed[];
  deletedSeeds: Seed[];
  search: string;
  stateFilter: GrowthState | 'all';
  tagFilter: string;
  sortType: SortType;
  onChangeSearch: (value: string) => void;
  onChangeFilter: (value: GrowthState | 'all') => void;
  onChangeTagFilter: (value: string) => void;
  onChangeSort: (value: SortType) => void;
  onRestoreSeed: (seedId: string) => void;
  onOpenSeed: (seedId: string) => void;
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
}: SeedsScreenProps) {
  const tagOptions = useMemo(
    () => Array.from(new Set(seeds.flatMap((seed) => seed.tags))).sort((a, b) => a.localeCompare(b)),
    [seeds],
  );

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredSeeds = useMemo(
    () =>
      seeds
        .filter((seed) => {
          if (stateFilter !== 'all' && seed.growthState !== stateFilter) {
            return false;
          }
          if (tagFilter !== 'all' && !seed.tags.includes(tagFilter)) {
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
    [seeds, stateFilter, tagFilter, normalizedSearch, sortType],
  );

  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={styles.heading}>種一覧</Text>
      <Text style={styles.subheading}>検索や絞り込みで、いま見返したい種を見つけます。</Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
        <TextInput
          value={search}
          onChangeText={onChangeSearch}
          style={styles.searchInput}
          placeholder="本文・タイトル・カテゴリで検索"
          placeholderTextColor="#96a3ae"
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
            <IOSChip label={allLabel} selected={tagFilter === 'all'} onPress={() => onChangeTagFilter('all')} />
            {tagOptions.map((tag) => (
              <IOSChip key={tag} label={tag} selected={tagFilter === tag} onPress={() => onChangeTagFilter(tag)} />
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
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <EmptyState
          icon="search-outline"
          title="条件に合う種はありません"
          description="検索やフィルターを少しゆるめると、見つかるかもしれません。"
        />
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListFooterComponent={listFooter}
      renderItem={({ item: seed }) => (
        <AnimatedPressable
          onPress={() => onOpenSeed(seed.id)}
          style={styles.seedCard}
          pressedStyle={styles.seedCardPressed}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="種の詳細を開く"
        >
          {seed.title ? <Text style={styles.title}>{seed.title}</Text> : null}
          <Text numberOfLines={3} style={styles.body}>
            {seed.body}
          </Text>
          <Text style={styles.meta}>
            {growthStateLabels[seed.growthState]} ・ 大切度{seed.importance} ・ {formatDate(seed.updatedAt)}
          </Text>
          {seed.tags.length > 0 ? <Text style={styles.tags}>カテゴリ: {seed.tags.join(', ')}</Text> : null}
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
    height: 12,
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
    borderTopColor: '#dfe8e0',
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
    fontSize: 12,
    color: theme.colors.textSoft,
    lineHeight: 17,
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
    backgroundColor: '#f4f8f3',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  body: {
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 23,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  tags: {
    fontSize: 12,
    color: theme.colors.textSoft,
  },
});
