import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapIndex } from '../domain/plus/map';
import type { Seed } from '../domain/types';
import { buildMatchExcerpt, matchesSearch, normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusInput, buttonSelectionProps, focusControl } from './PlusUI';
import { IconButton, studioColors, studioStyles } from './StudioUI';

const pageSize = 20;
const fieldLabel = { title: '題名', body: '本文', tag: 'カテゴリ', synthesis: '芽の文' };
type ReadResult = (id: string, onReturn: () => void) => void;

function SearchMatch({ text, query }: { text: string; query: string }) {
  const content = text.replace(/^…|…$/gu, '');
  const normalized = normalizeSearchText(content);
  const match = normalized.length === content.length ? normalized.indexOf(query) : -1;
  if (match < 0) return <>{text}</>;
  const start = Math.max(0, match - 7);
  return <>{(start > 0 || text.startsWith('…')) && '…'}{content.slice(start, match)}
    <Text style={styles.matched}>{content.slice(match, match + query.length)}</Text>
    {content.slice(match + query.length)}{text.endsWith('…') && '…'}</>;
}

function ResultOriginal({ seed, onRead }: { seed: Seed; onRead: ReadResult }) {
  const target = React.useRef<View>(null);
  return <Pressable ref={target} accessibilityRole="button" accessibilityLabel={`「${toSeedSnippet(seed, 55)}」の原文を開く`}
    onPress={() => onRead(seed.id, () => focusControl(target.current))}
    style={({ pressed }) => [styles.original, pressed && studioStyles.quiet]}>
    <Ionicons name="document-text-outline" size={16} color={studioColors.green} />
    <Text style={styles.resultAction}>原文</Text>
  </Pressable>;
}

export function StudioNoteList({ index, selected, onPick, scope, details, hint, centersOnPick, onRead, recent, mapLabel }: {
  index: MapIndex; selected: string; onPick: (id: string) => void; scope?: readonly string[];
  details?: ReadonlyMap<string, string>; hint?: string; centersOnPick?: (id: string) => boolean; onRead?: ReadResult; mapLabel?: string;
  recent?: readonly { seed: Seed; onPress: () => void }[];
}) {
  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(0);
  const query = normalizeSearchText(term.trim());
  const highlightMatches = Boolean(onRead || mapLabel);
  const candidates = React.useMemo(() => (scope ? scope.flatMap((id) => index.byId.get(id) ?? []) : index.live)
    .map((seed) => ({ seed, text: searchableText(seed) })), [index, scope]);
  const list = React.useMemo(() => {
    if (!query) return candidates;
    const found = candidates.filter(({ seed, text }) => text.includes(query) || matchesSearch(details?.get(seed.id) ?? '', query));
    if (!highlightMatches) return found;
    return found.sort(({ seed: a }, { seed: b }) => Number(matchesSearch(b.title ?? '', query)) -
      Number(matchesSearch(a.title ?? '', query)) || b.updatedAt.localeCompare(a.updatedAt));
  }, [candidates, details, highlightMatches, query]);
  const shown = Math.min(page, Math.max(0, Math.ceil(list.length / pageSize) - 1));
  function changeTerm(value: string) { setPage(0); setTerm(value); }

  return <View style={styles.list}>
    <View style={styles.searchRow}>
      <PlusInput accessibilityLabel="地図のメモを探す" placeholder="題名・本文・カテゴリで検索"
        value={term} onChangeText={changeTerm} returnKeyType="search" style={studioStyles.grow} />
      {!!term && <IconButton label="検索語を消す" icon="close-circle-outline" onPress={() => changeTerm('')} />}
    </View>
    {!query && !!recent?.length && <View style={styles.recent}>
      <Text accessibilityRole="header" style={styles.subtitle}>最近見た中心</Text>
      <View style={studioStyles.wrap}>
        {recent.map(({ seed, onPress }) => <Pressable key={seed.id} accessibilityRole="button"
          accessibilityLabel={`「${toSeedSnippet(seed, 55)}」の地図に戻る`} onPress={onPress}
          style={({ pressed }) => [styles.recentButton, pressed && studioStyles.quiet]}>
          <Ionicons name="time-outline" size={15} color={studioColors.green} />
          <Text numberOfLines={1} style={styles.recentLabel}>{toSeedSnippet(seed, 36)}</Text>
        </Pressable>)}
      </View>
    </View>}
    {highlightMatches && !!query && list.length > 0 && <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>{list.length}件の検索結果</Text>}
    {!list.length && <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>一致するメモがありません。</Text>}
    {list.slice(shown * pageSize, (shown + 1) * pageSize).map(({ seed }) => {
      const title = toSeedSnippet(seed, 55);
      const detail = details?.get(seed.id);
      const excerpt = highlightMatches && query ? buildMatchExcerpt(seed, query) : undefined;
      const description = excerpt && excerpt.field !== 'title' ? excerpt.text : detail ?? (seed.title ? seed.body : undefined);
      const relation = mapLabel && detail !== description ? detail : undefined;
      const jumps = centersOnPick?.(seed.id) ?? false;
      const action = jumps || onRead ? '地図の中心にします' : hint;
      return <View key={seed.id} style={[styles.noteRow, selected === seed.id && styles.activeRow]}>
        <Pressable accessibilityRole="button" {...buttonSelectionProps(selected === seed.id)} onPress={() => onPick(seed.id)}
          accessibilityHint={[excerpt?.text ?? detail, relation, action].filter(Boolean).join('。') || undefined}
          accessibilityLabel={`${title}、つながり${index.adjacent.get(seed.id)?.size ?? 0}件`}
          style={({ pressed }) => [styles.noteMain, pressed && studioStyles.quiet]}>
          <View style={studioStyles.grow}>
            <Text style={studioStyles.text} numberOfLines={2}>{excerpt?.field === 'title'
              ? <SearchMatch text={excerpt.text} query={query} /> : toSeedSnippet(seed, 70)}</Text>
            {description && <Text numberOfLines={2} style={studioStyles.muted}>
              {excerpt && excerpt.field !== 'title' ? <>
                <Text style={styles.matchField}>{fieldLabel[excerpt.field]}{'  '}</Text><SearchMatch text={description} query={query} />
              </> : description}
            </Text>}
            {relation && <Text numberOfLines={1} style={[studioStyles.muted, styles.matchField]}>{relation}</Text>}
          </View>
          <Ionicons name={jumps || onRead || mapLabel ? 'locate-outline' : 'git-network-outline'} color={studioColors.green} size={15} />
          <Text style={mapLabel ? styles.resultAction : studioStyles.muted}>{onRead ? '地図へ' : jumps ? '中心に' : mapLabel ?? index.adjacent.get(seed.id)?.size ?? 0}</Text>
        </Pressable>
        {onRead && <ResultOriginal seed={seed} onRead={onRead} />}
      </View>;
    })}
    {list.length > pageSize && <View style={studioStyles.wrap}>
      <IconButton label="前のメモ" icon="chevron-back" disabled={shown === 0} onPress={() => setPage(shown - 1)} />
      <Text style={studioStyles.muted}>{shown * pageSize + 1}〜{Math.min((shown + 1) * pageSize, list.length)} / {list.length}件</Text>
      <IconButton label="次のメモ" icon="chevron-forward" disabled={(shown + 1) * pageSize >= list.length} onPress={() => setPage(shown + 1)} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: 7 },
  searchRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  recent: { gap: 4, paddingVertical: 4 },
  subtitle: { color: studioColors.muted, fontSize: 13, fontWeight: '700' },
  recentButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, maxWidth: '100%', paddingHorizontal: 10,
    borderWidth: 1, borderColor: studioColors.rule, borderRadius: 11, backgroundColor: studioColors.soft },
  recentLabel: { color: studioColors.green, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  noteRow: { flexDirection: 'row', backgroundColor: studioColors.surface, borderRadius: 11, borderWidth: 1, borderColor: studioColors.rule },
  activeRow: { backgroundColor: studioColors.soft, borderColor: '#b8c8b4' },
  noteMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', minHeight: 49, gap: 6, paddingHorizontal: 9, paddingVertical: 5 },
  original: { minWidth: 47, minHeight: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 3,
    borderLeftWidth: 1, borderLeftColor: studioColors.rule },
  resultAction: { color: studioColors.green, fontSize: 11, fontWeight: '700' },
  matchField: { color: studioColors.green, fontWeight: '700' },
  matched: { color: studioColors.green, backgroundColor: '#e6edd9', fontWeight: '700' },
});
