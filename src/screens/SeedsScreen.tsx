import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipSelector } from '../components/ChipSelector';
import { GROWTH_STATE_OPTIONS, type GrowthState, type Seed } from '../domain/types';
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
      <Text style={styles.heading}>Seeds</Text>
      <Text style={styles.subheading}>見返しながら、必要な種をやさしく育てる。</Text>

      <TextInput
        value={search}
        onChangeText={onChangeSearch}
        style={styles.searchInput}
        placeholder="種を検索（本文 / タイトル / カテゴリ）"
        placeholderTextColor="#94a3b8"
      />

      <View style={styles.section}>
        <Text style={styles.label}>状態フィルタ</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => onChangeFilter('all')}
            style={[styles.filterChip, stateFilter === 'all' && styles.filterChipSelected]}
          >
            <Text style={[styles.filterChipText, stateFilter === 'all' && styles.filterChipTextSelected]}>all</Text>
          </Pressable>
          {GROWTH_STATE_OPTIONS.map((state) => (
            <Pressable
              key={state}
              onPress={() => onChangeFilter(state)}
              style={[styles.filterChip, stateFilter === state && styles.filterChipSelected]}
            >
              <Text style={[styles.filterChipText, stateFilter === state && styles.filterChipTextSelected]}>{state}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>カテゴリ</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => onChangeTagFilter('all')}
            style={[styles.filterChip, tagFilter === 'all' && styles.filterChipSelected]}
          >
            <Text style={[styles.filterChipText, tagFilter === 'all' && styles.filterChipTextSelected]}>all</Text>
          </Pressable>
          {tagOptions.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => onChangeTagFilter(tag)}
              style={[styles.filterChip, tagFilter === tag && styles.filterChipSelected]}
            >
              <Text style={[styles.filterChipText, tagFilter === tag && styles.filterChipTextSelected]}>{tag}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ChipSelector<SortType>
        label="並び替え"
        options={['updated', 'importance']}
        selectedValue={sortType}
        onChange={(value) => onChangeSort(value ?? 'updated')}
      />

      <View style={styles.listWrap}>
        {filteredSeeds.length === 0 ? (
          <Text style={styles.emptyText}>条件に合う種が見つかりませんでした。</Text>
        ) : (
          filteredSeeds.map((seed) => (
            <Pressable key={seed.id} onPress={() => onOpenSeed(seed.id)} style={styles.seedCard}>
              {seed.title ? <Text style={styles.title}>{seed.title}</Text> : null}
              <Text numberOfLines={3} style={styles.body}>
                {seed.body}
              </Text>
              <Text style={styles.meta}>
                {seed.growthState} ・ 重要度{seed.importance} ・ {formatDate(seed.updatedAt)}
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
    padding: 16,
    paddingBottom: 120,
    gap: 12,
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
  searchInput: {
    borderWidth: 1,
    borderColor: '#dbe3ed',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    minHeight: 44,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  section: {
    gap: 8,
  },
  label: {
    color: '#334155',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe3ed',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipSelected: {
    backgroundColor: '#d9efe6',
    borderColor: '#8bc7af',
  },
  filterChipText: {
    color: '#334155',
    fontSize: 13,
  },
  filterChipTextSelected: {
    color: '#163c2e',
    fontWeight: '600',
  },
  listWrap: {
    gap: 10,
  },
  seedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  body: {
    fontSize: 16,
    color: '#0f172a',
    lineHeight: 23,
  },
  meta: {
    fontSize: 12,
    color: '#64748b',
  },
  tags: {
    fontSize: 12,
    color: '#475569',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 21,
  },
});
