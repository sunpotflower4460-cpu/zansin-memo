import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { StudioPreferences } from '../domain/plus/contracts';
import type { MapIndex } from '../domain/plus/map';
import { studioGroupPreview, topicConstellations } from '../domain/plus/studioAtlas';
import { constellationFigure, constellationGroups, type ConstellationFigure, type ConstellationGroup } from '../domain/plus/studioGraph';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { buildMatchExcerpt, normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusInput, focusControl } from './PlusUI';
import { StudioMaterialAction, type StudioMaterials } from './StudioMaterials';
import { IconButton, StudioAction, StudioSegments, studioColors, studioStyles } from './StudioUI';

export const constellationPalettes = {
  paper: { space: '#162a39', ink: '#fbf7ed', dim: '#c4d1d6', light: '#c7dadd', focus: '#f2d39a', rule: '#395260' },
  indigo: { space: '#1e2e51', ink: '#f1f6ff', dim: '#c9d7ef', light: '#b9d5ff', focus: '#e4f1ff', rule: '#425a84' },
  night: { space: '#2a233b', ink: '#f9f4fd', dim: '#d7cce7', light: '#d8c6f5', focus: '#f6d9a0', rule: '#564669' },
};
type SkyColors = typeof constellationPalettes[StudioPreferences['palette']];
const directoryPage = 18;
const notePage = 12;
const diagramPage = 6;

function groupBasis(group: ConstellationGroup) {
  if (group.basis === 'category') return '共通のカテゴリ';
  if (group.basis === 'word') return '本文の共通語';
  return group.linked ? '保存したつながり' : '個別のメモ';
}

function groupReason(group: ConstellationGroup) {
  if (group.basis === 'category') return `「${group.label}」をカテゴリに選んだメモが集まっています。`;
  if (group.basis === 'word') return `どのメモの本文にも「${group.label}」が出てきます。`;
  if (group.basis === 'ungrouped') return 'それぞれの話題を持つメモを集めています。';
  if (group.linked) return `「${group.label}」から保存したつながりをたどれるメモです。`;
  return '保存したつながりがまだないメモです。';
}

function NoteRow({ note, excerpt, onPress }: { note: Seed; excerpt?: string; onPress: () => void }) {
  const title = toSeedSnippet(note, 64);
  const text = excerpt ?? (note.title?.trim() ? toSeedSnippet({ body: note.body }, 82) : undefined);
  return <Pressable accessibilityRole="button" accessibilityLabel={`星「${title}」を選ぶ`} accessibilityHint={text}
    onPress={onPress} testID={`studio-constellation-note-${note.id}`}
    style={({ pressed }) => [styles.noteRow, pressed && styles.pressed]}>
    <View style={styles.starMark}><Ionicons name="star" size={12} color="#627a86" /></View>
    <View style={studioStyles.grow}>
      <Text numberOfLines={2} style={styles.rowTitle}>{title}</Text>
      {!!text && <Text numberOfLines={2} style={styles.excerpt}>{text}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={15} color={studioColors.muted} />
  </Pressable>;
}

function StarDiagram({ figure, colors, index, onPick }: {
  figure: ConstellationFigure; colors: SkyColors; index: MapIndex; onPick: (id: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const nodeHeight = Math.round(58 * Math.max(1, Math.min(1.5, fontScale)));
  const rowHeight = nodeHeight + 20;
  const height = Math.ceil(figure.stars.length / 2) * rowHeight + 16;
  const points = new Map(figure.stars.map(({ id }, i) => {
    const alone = i % 2 === 0 && i === figure.stars.length - 1;
    const x = alone ? 50 : i % 2 === 1 ? 75 : 25;
    const y = 16 + nodeHeight / 2 + Math.floor(i / 2) * rowHeight + (i % 2 === 1 ? 6 : 0);
    return [id, { x, y }];
  }));
  return <View testID="studio-constellation-figure" style={[styles.figure, { height, backgroundColor: colors.space }]}>
    <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
      <Svg width="100%" height={height}>
        {figure.lines.map(({ id, a, b }) => {
          const from = points.get(a.id)!;
          const to = points.get(b.id)!;
          return <Line key={id} testID="studio-constellation-line" x1={`${from.x}%`} y1={from.y} x2={`${to.x}%`} y2={to.y}
            stroke={colors.light} strokeWidth={1.5} opacity={0.66} />;
        })}
      </Svg>
    </View>
    {figure.stars.map(({ id }) => {
      const { x, y } = points.get(id)!;
      const title = toSeedSnippet(index.byId.get(id)!, 64);
      return <Pressable key={id} testID={`studio-constellation-star-${id}`} accessibilityRole="button" accessibilityLabel={`星「${title}」を選ぶ`}
        onPress={() => onPick(id)} style={({ pressed }) => [styles.starTarget, { left: `${x - 21.5}%`, top: y - nodeHeight / 2, height: nodeHeight,
          backgroundColor: colors.rule, borderColor: colors.light }, pressed && studioStyles.quiet]}>
        <Ionicons name="star" size={11} color={colors.focus} />
        <Text numberOfLines={2} maxFontSizeMultiplier={1.5} style={[styles.starTitle, { color: colors.ink }]}>{title}</Text>
      </Pressable>;
    })}
  </View>;
}

export function StudioConstellations({ index, centerId, palette, fullScreen, onRead, onMindMap, materials }: {
  index: MapIndex; centerId: string; palette: StudioPreferences['palette'];
  fullScreen: { active: boolean; label: string; onPress: () => void };
  onRead: (id: string, onReturn: () => void, backLabel?: string) => void; onMindMap: (id: string) => void; materials?: StudioMaterials;
}) {
  const colors = constellationPalettes[palette];
  const [lens, setLens] = React.useState<'topics' | 'links'>('topics');
  const topics = lens === 'topics';
  const groups = React.useMemo(() => topics ? topicConstellations(index) : constellationGroups(index), [index, topics]);
  const [groupId, setGroupId] = React.useState<string>();
  const [seedId, setSeedId] = React.useState<string>();
  const [query, setQuery] = React.useState('');
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [groupLimit, setGroupLimit] = React.useState(directoryPage);
  const [noteLimit, setNoteLimit] = React.useState(notePage);
  const [plot, setPlot] = React.useState<number>();
  const scroll = React.useRef<ScrollView>(null);
  const back = React.useRef<View>(null);
  const original = React.useRef<View>(null);
  const returnTo = React.useRef<View>(null);
  const jump = React.useRef<number>(undefined);
  const offset = React.useRef(0);
  const directoryOffset = React.useRef(0);
  const groupOffset = React.useRef(0);
  const group = groups.find(({ id }) => id === groupId);
  const selected = seedId && group?.seedIds.includes(seedId) ? index.byId.get(seedId) : undefined;
  const directoryMatches = React.useMemo(() => {
    const q = normalizeSearchText(query.trim());
    if (!q) return groups.map((entry) => ({ entry, hits: undefined }));
    const ids = new Set(index.live.filter((note) => searchableText(note).includes(q)).map(({ id }) => id));
    return groups.flatMap<{ entry: ConstellationGroup; hits?: string[] }>((entry) => {
      if (normalizeSearchText(entry.label).includes(q)) return [{ entry }];
      const hits = entry.seedIds.filter((id) => ids.has(id));
      return hits.length ? [{ entry, hits }] : [];
    });
  }, [groups, index.live, query]);
  const noteQuery = normalizeSearchText(filter.trim());
  const notes = React.useMemo(() => (group?.seedIds ?? []).flatMap((id) => {
    const note = index.byId.get(id);
    return note && (!noteQuery || searchableText(note).includes(noteQuery)) ? [note] : [];
  }), [group, index.byId, noteQuery]);
  const plotIndex = plot === undefined ? undefined : Math.min(plot, Math.max(0, Math.ceil(notes.length / diagramPage) - 1));
  const plotted = React.useMemo(() => {
    if (!group || plotIndex === undefined) return undefined;
    const seedIds = notes.slice(plotIndex * diagramPage, (plotIndex + 1) * diagramPage).map(({ id }) => id);
    return constellationFigure(index, { ...group, seedIds, linked: false }, diagramPage);
  }, [group, index, notes, plotIndex]);
  const related = React.useMemo(() => {
    if (!group || !selected) return [];
    const members = new Set(group.seedIds);
    return index.edges.flatMap((edge) => {
      const other = edge.aSeedId === selected.id ? edge.bSeedId : edge.bSeedId === selected.id ? edge.aSeedId : undefined;
      return other && members.has(other) ? [{ note: index.byId.get(other)!, reason: edge.note }] : [];
    }).slice(0, 4);
  }, [group, index, selected]);

  React.useEffect(() => {
    const y = jump.current;
    if (y === undefined) return;
    jump.current = undefined;
    const frame = requestAnimationFrame(() => {
      scroll.current?.scrollTo({ y, animated: false });
      if (y === 0) focusControl(back.current ?? returnTo.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [groupId, seedId]);

  function enter(next: ConstellationGroup, initialFilter = '') {
    Keyboard.dismiss();
    directoryOffset.current = offset.current;
    jump.current = 0; setGroupId(next.id); setSeedId(undefined);
    setFilterOpen(Boolean(initialFilter)); setFilter(initialFilter); setNoteLimit(notePage); setPlot(undefined);
  }
  function pick(id: string) {
    Keyboard.dismiss();
    if (!selected) groupOffset.current = offset.current;
    jump.current = 0; setSeedId(id);
  }
  function goBack() {
    Keyboard.dismiss();
    jump.current = selected ? groupOffset.current : directoryOffset.current;
    if (selected) setSeedId(undefined);
    else setGroupId(undefined);
  }
  const screenTitle = selected ? toSeedSnippet(selected, 80) : group?.label ?? (topics ? '話題の星座' : 'つながりの星座');
  const context = selected ? group?.label : group ? groupReason(group) : topics
    ? '同じ話題のメモを見つける' : '保存した線でたどれるメモ';
  const selectedBody = selected ? buildMatchExcerpt(selected, noteQuery || (group?.basis === 'word' ? group.label : '')) : undefined;

  return <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets scrollEventThrottle={48}
    onScroll={({ nativeEvent }) => { offset.current = nativeEvent.contentOffset.y; }}>
    <View testID="studio-constellation-sky" style={[styles.hero, { backgroundColor: colors.space }]}>
      <View style={styles.heroRow}>
        {group ? <IconButton label={selected ? '星座のメモへ戻る' : '星座の全体へ戻る'} icon="chevron-back" focusRef={back}
          color={colors.ink} background={colors.rule} onPress={goBack} /> :
          <View style={[styles.heroMark, { backgroundColor: colors.rule }]}><Ionicons name="sparkles-outline" size={21} color={colors.focus} /></View>}
        <View style={studioStyles.grow}>
          {selected && <Text style={[styles.caption, { color: colors.dim }]}>{context}</Text>}
          <Text accessibilityRole="header" style={[styles.heroTitle, { color: colors.ink }]}>{screenTitle}</Text>
        </View>
        {!selected && <IconButton label={fullScreen.label} icon={fullScreen.active ? 'contract-outline' : 'expand-outline'} focusRef={returnTo}
          color={colors.ink} background={colors.rule} onPress={fullScreen.onPress} />}
      </View>
      {!selected && <Text style={[styles.heroSub, { color: colors.dim }]}>{context}</Text>}
      {group && !selected && <Text style={[styles.caption, { color: colors.focus }]}>
        {noteQuery ? `${group.seedIds.length}件のうち ${notes.length}件が一致` : `${group.seedIds.length}件のメモ`}
      </Text>}
    </View>
    {!group && <>
      <StudioSegments value={lens} label="星座の集め方"
        items={[{ id: 'topics', label: '話題', accessibilityLabel: '話題で集める' }, { id: 'links', label: '保存した線', accessibilityLabel: 'つながりで集める' }]}
        onChange={(next) => { setLens(next); setGroupLimit(directoryPage); }} />
      <PlusInput accessibilityLabel="メモから星座を探す" placeholder="話題・メモから探す" value={query} returnKeyType="search"
        onChangeText={(value) => { setQuery(value); setGroupLimit(directoryPage); }} />
      <View style={styles.list}>
        {directoryMatches.slice(0, groupLimit).map(({ entry, hits }) => {
          const sample = studioGroupPreview(index, hits ?? entry.seedIds, hits ? undefined : entry.label);
          const current = entry.seedIds.includes(centerId);
          const label = !topics && !entry.linked ? 'つながりのないメモを見る' : `「${entry.label}」の星座を開く`;
          return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={label}
            accessibilityHint={`${hits?.length ?? entry.seedIds.length}件。 ${groupBasis(entry)}。 ${sample}`} onPress={() => enter(entry, hits ? query : '')}
            style={({ pressed }) => [styles.topicRow, pressed && styles.pressed]}>
            <View style={styles.topicMark}><Ionicons name={entry.linked ? 'git-branch-outline' : 'star-outline'} size={19} color="#37576b" /></View>
            <View style={studioStyles.grow}>
              <Text numberOfLines={2} style={styles.rowTitle}>{entry.label}</Text>
              <Text style={styles.topicBasis}>{groupBasis(entry)}{!topics && current ? ' · 今の中心を含む' : ''}</Text>
              {!!sample && <Text numberOfLines={2} style={styles.excerpt}>{sample}</Text>}
            </View>
            <Text style={styles.count}>{hits ? `一致 ${hits.length}件` : `${entry.seedIds.length}件`}</Text>
            <Ionicons name="chevron-forward" size={15} color={studioColors.muted} />
          </Pressable>;
        })}
      </View>
      {directoryMatches.length > groupLimit && <StudioAction label="さらに星座を表示" onPress={() => setGroupLimit(groupLimit + directoryPage)} />}
      {directoryMatches.length === 0 && <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>一致する星座はありません。</Text>}
    </>}
    {group && !selected && <>
      <View style={studioStyles.row}>
        <StudioAction label={plot === undefined ? '星の図を見る' : 'メモで読む'} icon={plot === undefined ? 'sparkles-outline' : 'list-outline'}
          onPress={() => setPlot(plot === undefined ? 0 : undefined)} />
        <IconButton label={filterOpen ? '星座の検索を閉じる' : 'この星座のメモを探す'} icon={filterOpen ? 'close' : 'search-outline'}
          onPress={() => { setFilterOpen(!filterOpen); if (filterOpen) { setFilter(''); setPlot(plot === undefined ? undefined : 0); } }} />
      </View>
      {filterOpen && <PlusInput accessibilityLabel="この星座のメモを検索" placeholder="題名・本文から探す" value={filter} returnKeyType="search"
        onChangeText={(value) => { setFilter(value); setNoteLimit(notePage); setPlot(plot === undefined ? undefined : 0); }} />}
      {plotted && plotIndex !== undefined && notes.length > 0 ? <>
        <StarDiagram figure={plotted} colors={colors} index={index} onPick={pick} />
        <Text style={studioStyles.muted}>星を選ぶとメモが開きます。線は保存したつながりです。</Text>
        {notes.length > diagramPage && <View style={styles.pageNav}>
          <IconButton label="前の星を表示" icon="chevron-back" disabled={plotIndex === 0} onPress={() => setPlot(plotIndex - 1)} />
          <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>{plotIndex * diagramPage + 1}〜{plotIndex * diagramPage + plotted.stars.length}件目</Text>
          <IconButton label="次の星を表示" icon="chevron-forward" disabled={(plotIndex + 1) * diagramPage >= notes.length} onPress={() => setPlot(plotIndex + 1)} />
        </View>}
      </> : <View style={styles.list}>
        {notes.slice(0, noteLimit).map((note) => {
          const word = noteQuery || (group.basis === 'word' ? group.label : '');
          const match = buildMatchExcerpt(note, word);
          return <NoteRow key={note.id} note={note} excerpt={match?.field === 'title' ? undefined : match?.text} onPress={() => pick(note.id)} />;
        })}
      </View>}
      {plot === undefined && notes.length > noteLimit && <StudioAction label="さらにメモを表示" onPress={() => setNoteLimit(noteLimit + notePage)} />}
      {notes.length === 0 && <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>一致するメモはありません。</Text>}
    </>}
    {selected && <View testID="studio-constellation-selection" style={styles.noteDetail}>
      <Text style={styles.noteBody} selectable>{selectedBody?.field === 'body' ? selectedBody.text : toSeedSnippet({ body: selected.body }, 240)}</Text>
      <View style={studioStyles.wrap}>
        <StudioAction label="星のメモの原文を開く" title="原文を読む" icon="document-text-outline" primary focusRef={original}
          onPress={() => onRead(selected.id, () => focusControl(original.current), '星座に戻る')} />
        <StudioAction label="このメモをマインドマップで開く" title="マップで開く" icon="git-network-outline" onPress={() => onMindMap(selected.id)} />
        {materials && selected.body.trim() && <StudioMaterialAction materials={materials} id={selected.id} />}
      </View>
      {related.length > 0 && <>
        <Text accessibilityRole="header" style={styles.relatedTitle}>この星座でつないだメモ</Text>
        <View style={styles.list}>{related.map(({ note, reason }) => <NoteRow key={note.id} note={note} excerpt={reason || undefined} onPress={() => pick(note.id)} />)}</View>
      </>}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  content: { gap: 9, paddingBottom: 12 },
  hero: { borderRadius: 16, padding: 11, gap: 5 },
  heroRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  heroMark: { width: 37, height: 37, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: theme.fonts.serif, fontSize: 23, lineHeight: 29, fontWeight: '700' },
  heroSub: { fontSize: 14, lineHeight: 20, paddingHorizontal: 2 },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '600', paddingHorizontal: 2 },
  list: { borderWidth: 1, borderBottomWidth: 0, borderColor: studioColors.rule, borderRadius: 13, overflow: 'hidden' },
  topicRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 11, paddingHorizontal: 9, minHeight: 58,
    backgroundColor: studioColors.surface, borderBottomWidth: 1, borderBottomColor: studioColors.rule },
  rowTitle: { color: studioColors.text, fontWeight: '700', fontSize: 16, lineHeight: 22 },
  topicBasis: { color: '#3d5968', fontWeight: '600', fontSize: 12, lineHeight: 18 },
  excerpt: { color: studioColors.muted, fontSize: 13, lineHeight: 19 },
  count: { color: '#3d5968', fontSize: 13, lineHeight: 22, fontWeight: '700' },
  pressed: { backgroundColor: studioColors.soft },
  topicMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#e6edf0', alignItems: 'center', justifyContent: 'center' },
  starMark: { width: 25, height: 25, borderRadius: 9, backgroundColor: '#e6edf0', alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, minHeight: 53, padding: 9,
    backgroundColor: studioColors.surface, borderBottomWidth: 1, borderBottomColor: studioColors.rule },
  noteDetail: { gap: 12, paddingTop: 4 },
  noteBody: { color: studioColors.text, backgroundColor: studioColors.surface, padding: 13, borderRadius: 12, fontSize: 16, lineHeight: 25 },
  relatedTitle: { color: studioColors.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  figure: { position: 'relative', borderRadius: 13 },
  starTarget: { position: 'absolute', width: '43%', borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, gap: 2 },
  starTitle: { fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  pageNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
});
