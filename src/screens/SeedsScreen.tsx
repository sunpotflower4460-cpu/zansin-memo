import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipSelector } from '../components/ChipSelector';
import { EmptyState } from '../components/EmptyState';
import { IOSChip } from '../components/IOSChip';
import { SectionCard } from '../components/SectionCard';
import { GROWTH_STATE_OPTIONS, type GrowthState, type Seed } from '../domain/types';
import { pressedOpacity, theme } from '../styles/theme';
import { allLabel, growthStateLabels, sortLabels } from '../utils/displayLabels';
import { formatDate } from '../utils/seedUtils';

type SortType = 'updated' | 'importance';

type SeedsScreenProps = {
  seeds: Seed[];
  search: string;
  stateFilter: GrowthState | 'all';
  tagFilter: string;
  sortType: SortType;
  onChangeSearch: (value: string) => void;
  onChangeFilter: (value: GrowthState | 'all') => void;
  onChangeTagFilter: (value: string) => void;
  onChangeSort: (value: SortType) => void;
  onOpenSeed: (seedId: string) => void;
};

export function SeedsScreen({
  seeds,
  search,
  stateFilter,
  tagFilter,
  sortType,
  onChangeSearch,
  onChangeFilter,
  onChangeTagFilter,
  onChangeSort,
  onOpenSeed,
}: SeedsScreenProps) {
  const tagOptions = Array.from(new Set(seeds.flatMap((seed) => seed.tags))).sort((a, b) => a.localeCompare(b));

  const filteredSeeds = seeds
    .filter((seed) => {
      if (stateFilter !== 'all' && seed.growthState !== stateFilter) {
        return false;
      }
      if (tagFilter !== 'all' && !seed.tags.includes(tagFilter)) {
        return false;
      }
      if (!search.trim()) {
        return true;
      }
      const target = `${seed.title ?? ''} ${seed.body} ${seed.tags.join(' ')}`.toLowerCase();
      return target.includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sortType === 'importance') {
        return b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        />
      </View>

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

      <View style={styles.listWrap}>
        {filteredSeeds.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="条件に合う種はありません"
            description="検索やフィルターを少しゆるめると、見つかるかもしれません。"
          />
        ) : (
          filteredSeeds.map((seed) => (
            <Pressable key={seed.id} onPress={() => onOpenSeed(seed.id)} style={({ pressed }) => [styles.seedCard, pressedOpacity({ pressed })]}>
              {seed.title ? <Text style={styles.title}>{seed.title}</Text> : null}
              <Text numberOfLines={3} style={styles.body}>
                {seed.body}
              </Text>
              <Text style={styles.meta}>
                {growthStateLabels[seed.growthState]} ・ 大切度{seed.importance} ・ {formatDate(seed.updatedAt)}
              </Text>
              {seed.tags.length > 0 ? <Text style={styles.tags}>カテゴリ: {seed.tags.join(', ')}</Text> : null}
            </Pressable>
          ))
        )}
      </View>
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
  heading: {
    fontSize: theme.typography.title,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subheading: {
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  searchWrap: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    minHeight: 44,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.subbody,
  },
  row: {
    gap: 8,
    paddingRight: 12,
  },
  listWrap: {
    gap: 10,
  },
  seedCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: 6,
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
