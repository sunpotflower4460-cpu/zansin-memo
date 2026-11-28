import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { StudioPreferences } from '../domain/plus/contracts';
import type { Suggestion } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import { constellationGroups } from '../domain/plus/studioGraph';
import type { Seed } from '../domain/types';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusInput, buttonSelectionProps, focusControl } from './PlusUI';
import { StudioMapCanvas, mapPalettes } from './StudioMapCanvas';
import { IconButton, StudioAction, StudioSegments, StudioTitle, studioColors, studioStyles } from './StudioUI';

const layouts = [{ id: 'radial', label: 'マインドマップ' }, { id: 'constellation', label: '星座' }, { id: 'list', label: 'つながり一覧' }] as const;
const noHints: Suggestion[] = [];
const pageSize = 20;

export function StudioNoteList({ index, selected, onPick, scope }: {
  index: MapIndex; selected: string; onPick: (id: string) => void; scope?: readonly string[];
}) {
  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(0);
  const query = normalizeSearchText(term.trim());
  const list = React.useMemo(() => {
    const notes = scope ? scope.flatMap((id) => index.byId.get(id) ?? []) : index.live;
    return query ? notes.filter((seed) => searchableText(seed).includes(query)) : notes;
  }, [index, query, scope]);
  const shown = Math.min(page, Math.max(0, Math.ceil(list.length / pageSize) - 1));
  return <View style={styles.list}>
    <PlusInput accessibilityLabel="地図のメモを探す" placeholder="題名・本文・カテゴリで検索"
      value={term} onChangeText={(value) => { setPage(0); setTerm(value); }} />
    {!list.length && <Text style={studioStyles.muted}>一致するメモがありません。</Text>}
    {list.slice(shown * pageSize, (shown + 1) * pageSize).map((seed) => <Pressable key={seed.id} onPress={() => onPick(seed.id)}
      accessibilityRole="button" accessibilityState={{ selected: selected === seed.id }}
      accessibilityLabel={`${toSeedSnippet(seed, 55)}、つながり${index.adjacent.get(seed.id)?.size ?? 0}件`}
      style={({ pressed }) => [styles.noteRow, selected === seed.id && styles.activeRow, pressed && studioStyles.quiet]}>
      <View style={studioStyles.grow}>
        <Text style={studioStyles.text} numberOfLines={2}>{toSeedSnippet(seed, 70)}</Text>
        {seed.title && <Text numberOfLines={2} style={studioStyles.muted}>{seed.body}</Text>}
      </View>
      <Ionicons name="git-network-outline" color={studioColors.green} size={15} />
      <Text style={studioStyles.muted}>{index.adjacent.get(seed.id)?.size ?? 0}</Text>
    </Pressable>)}
    {list.length > pageSize && <View style={studioStyles.wrap}>
      <IconButton label="前のメモ" icon="chevron-back" disabled={shown === 0} onPress={() => setPage(shown - 1)} />
      <Text style={studioStyles.muted}>{shown * pageSize + 1}〜{Math.min((shown + 1) * pageSize, list.length)} / {list.length}件</Text>
      <IconButton label="次のメモ" icon="chevron-forward" disabled={(shown + 1) * pageSize >= list.length} onPress={() => setPage(shown + 1)} />
    </View>}
  </View>;
}

export function StudioMapPanel({ index, center, selected, settings, hints, preview, immersive, back, onImmersive,
  onSearch, onSettings, onSelect, onFocus, onRead, onAI, onReview, onWrite }: {
  index: MapIndex; center: Seed; selected: Seed; settings: StudioPreferences; hints: readonly Suggestion[];
  preview?: { kind: 'suggestions' | 'connection'; label: string; emphasisId?: string; onClose: () => void };
  immersive: boolean; back?: () => void; onImmersive: () => void; onSearch: () => void; onSettings: (patch: Partial<StudioPreferences>) => void;
  onSelect: (id: string) => void; onFocus: (id: string) => void; onRead: (id: string, onReturn?: () => void) => void; onAI: (id: string) => void;
  onReview: (suggestion: Suggestion) => void; onWrite: (id: string) => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const [expanded, setExpanded] = React.useState(false);
  const [appearance, setAppearance] = React.useState(false);
  const [relatedLimit, setRelatedLimit] = React.useState(8);
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [groupId, setGroupId] = React.useState<string>();
  const [groupLimit, setGroupLimit] = React.useState(pageSize);
  const scroll = React.useRef<ScrollView>(null);
  const offset = React.useRef(0);
  const returnOffset = React.useRef<number>(undefined);
  const readButton = React.useRef<View>(null);
  const reveal = React.useRef(false);
  const neighbors = [...index.adjacent.get(selected.id) ?? []];
  const layout = fontScale > 1.45 ? 'list' : preview ? 'radial' : settings.layout;
  const groups = React.useMemo(() => layout === 'constellation' ? constellationGroups(index) : undefined, [index, layout]);
  const group = groupId && groups?.find(({ id }) => id === groupId);
  const [links, setLinks] = React.useState(false);
  React.useEffect(() => { setExpanded(false); }, [center.id]);
  React.useEffect(() => { setLinks(false); setRelatedLimit(8); }, [selected.id]);
  const showingPreview = Boolean(preview);
  React.useEffect(() => {
    if (showingPreview) {
      returnOffset.current = offset.current;
      scroll.current?.scrollTo({ y: 0, animated: false });
    } else if (returnOffset.current !== undefined) {
      const y = returnOffset.current;
      returnOffset.current = undefined;
      const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y, animated: false }));
      return () => cancelAnimationFrame(frame);
    }
  }, [showingPreview]);
  const mapHeight = immersive ? Math.min(650, Math.max(285, height - 197)) : width > 550 ? 410 : Math.max(250, Math.min(350, (width - 28) * 0.82));
  const pending = hints.find(({ to }) => to.id === selected.id);
  const edgeNotes = React.useMemo(() => new Map(index.edges.flatMap((edge) => {
    if (edge.aSeedId === selected.id) return [[edge.bSeedId, edge.note] as const];
    if (edge.bSeedId === selected.id) return [[edge.aSeedId, edge.note] as const];
    return [];
  })), [index.edges, selected.id]);
  const relatedToCenter = edgeNotes.has(center.id);
  const centerNote = edgeNotes.get(center.id);

  function chooseNode(id: string) {
    onSelect(id);
    const suggestion = hints.find(({ to }) => to.id === id);
    if (suggestion) onReview(suggestion);
  }

  function openGroups() {
    if (groupOpen) { setGroupOpen(false); return; }
    setGroupId(undefined);
    setGroupLimit(pageSize);
    reveal.current = true;
    setGroupOpen(true);
  }

  return <ScrollView ref={scroll} style={studioStyles.root} contentContainerStyle={studioStyles.content} keyboardShouldPersistTaps="handled"
    scrollEventThrottle={64} onScroll={({ nativeEvent }) => { offset.current = nativeEvent.contentOffset.y; }}>
    <StudioTitle title="考えの地図" subtitle={immersive ? undefined : `${index.live.length}件のメモ · ${index.edges.length}本のつながり`}>
      {!immersive && <><IconButton label="地図を検索" icon="search-outline" onPress={onSearch} />
        <IconButton label={appearance ? '表示スタイルを閉じる' : '表示スタイル'} icon="color-palette-outline" onPress={() => setAppearance(!appearance)} /></>}
      {layout !== 'list' && <IconButton label={immersive ? '全画面を閉じる' : '地図を全画面で開く'}
        icon={immersive ? 'contract-outline' : 'expand-outline'} onPress={onImmersive} />}
    </StudioTitle>
    {appearance && !immersive && <View style={[studioStyles.card, styles.palettePanel]}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>地図のデザイン</Text>
      <View style={styles.palettes}>{(Object.keys(mapPalettes) as StudioPreferences['palette'][]).map((key) => {
        const preset = mapPalettes[key];
        const active = key === settings.palette;
        return <Pressable key={key} accessibilityRole="button" {...buttonSelectionProps(active)} accessibilityLabel={preset.label} onPress={() => onSettings({ palette: key })}
          style={[styles.palette, { backgroundColor: preset.art, borderColor: active ? preset.highlight : preset.border, borderWidth: active ? 2 : 1 }]}>
          <Svg width={60} height={26} viewBox="0 0 60 26" pointerEvents="none">
            <Path d="M6 7 C18 7 16 13 30 13 C44 13 41 6 53 6 M30 13 C44 13 45 21 53 21" stroke={preset.line} strokeWidth="1.7" fill="none" />
            <Circle cx="6" cy="7" r="3" fill={preset.node} stroke={preset.highlight} /><Circle cx="53" cy="6" r="3" fill={preset.node} stroke={preset.highlight} />
            <Circle cx="53" cy="21" r="3" fill={preset.candidate} />
            <Rect x="23" y="8" rx="2.8" width="13" height="10" fill={preset.center} />
          </Svg>
          <Text style={[styles.paletteLabel, { color: preset.ink }]}>{preset.label}</Text>
        </Pressable>;
      })}</View>
    </View>}
    {preview && <View style={styles.previewBar}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[studioStyles.text, studioStyles.grow]}>{preview.label}</Text>
      <StudioAction label="元の画面に戻る" onPress={preview.onClose} /></View>}
    {!preview && !immersive && fontScale <= 1.45 && <StudioSegments label="つながりの見方" items={layouts} value={settings.layout} onChange={(value) => onSettings({ layout: value })} />}
    {layout !== 'list' && <StudioMapCanvas index={index} center={center} selected={selected.id} emphasisId={preview?.emphasisId}
      mode={layout} palette={settings.palette} height={mapHeight} groups={groups} immersive={immersive} viewKey={preview?.kind ?? 'garden'}
      suggestions={layout === 'radial' ? hints : noHints} expanded={expanded} onSelect={chooseNode} />}
    <View style={[studioStyles.card, styles.inspector]}>
      <View style={studioStyles.row}>
        {back && <IconButton label="前の中心へ戻る" icon="arrow-back-outline" onPress={back} />}
        <View style={studioStyles.grow}>
          <Text style={studioStyles.muted}>{pending ? 'AIの候補' : relatedToCenter ? '中心とつながるメモ' : `${selected.id === center.id && layout === 'radial' ? '中心 · ' : ''}つながり${neighbors.length}件`}</Text>
          <Text accessibilityRole="header" style={studioStyles.subtitle} numberOfLines={2}>{toSeedSnippet(selected, 70)}</Text>
        </View>
        <IconButton label="原文を開く" icon="document-text-outline" focusRef={readButton}
          onPress={() => onRead(selected.id, () => focusControl(readButton.current))} />
        <IconButton label={pending ? '候補の理由を開く' : 'このメモからAIで探す'} icon="sparkles-outline" onPress={() => pending ? onReview(pending) : onAI(selected.id)} />
      </View>
      {centerNote && <View style={styles.edgeReason}><Ionicons name="link-outline" size={16} color={studioColors.green} />
        <Text style={[studioStyles.text, studioStyles.grow]}>{centerNote}</Text></View>}
      {layout === 'list' && <Text style={studioStyles.muted} numberOfLines={2}>{selected.body}</Text>}
      <View style={studioStyles.wrap}>
        {selected.id !== center.id && <StudioAction label="ここを中心にする" icon="locate-outline" primary={!pending} onPress={() => onFocus(selected.id)} />}
        {selected.id === center.id && layout === 'radial' && neighbors.length > 0 && <StudioAction
          label={expanded ? '直接のつながりに戻す' : 'もう一段たどる'} icon="git-branch-outline" onPress={() => setExpanded(!expanded)} />}
        {neighbors.length > 0 && <StudioAction label={links ? '関係リストを閉じる' : 'このメモのつながり'} onPress={() => setLinks(!links)} />}
        {groups && <StudioAction label={groupOpen ? 'まとまりを閉じる' : 'まとまりを探す'} icon="layers-outline" onPress={openGroups} />}
        <StudioAction label="つながるメモを書く" icon="add" onPress={() => onWrite(selected.id)} />
      </View>
      {links && <View style={styles.list}>
        {neighbors.slice(0, relatedLimit).map((id) => {
          const peer = index.byId.get(id)!;
          return <Pressable key={id} accessibilityRole="button" onPress={() => onFocus(id)} style={styles.noteRow}>
            <View style={studioStyles.grow}><Text numberOfLines={2} style={studioStyles.text}>{toSeedSnippet(peer, 60)}</Text>
              {!!edgeNotes.get(id) && <Text style={studioStyles.muted} numberOfLines={2}>{edgeNotes.get(id)}</Text>}</View>
            <Ionicons name="chevron-forward" size={15} color={studioColors.muted} />
          </Pressable>;
        })}
        {neighbors.length > relatedLimit && <StudioAction label="さらに表示" onPress={() => setRelatedLimit(relatedLimit + pageSize)} />}
      </View>}
    </View>
    {groupOpen && groups && <View style={studioStyles.card} onLayout={({ nativeEvent }) => {
      if (reveal.current) {
        reveal.current = false;
        scroll.current?.scrollTo({ y: Math.max(0, nativeEvent.layout.y - 12), animated: false });
      }
    }}>
      <View style={studioStyles.row}>
        <Text accessibilityRole="header" style={[studioStyles.subtitle, studioStyles.grow]}>{group ? group.label : '星座のまとまり'}</Text>
        {group && <IconButton label="まとまりの一覧に戻る" icon="arrow-back-outline" onPress={() => setGroupId(undefined)} />}
      </View>
      {group ? <StudioNoteList key={group.id} index={index} selected={selected.id} scope={group.seedIds} onPick={(id) => {
        onFocus(id); setGroupOpen(false); scroll.current?.scrollTo({ y: 0, animated: false });
      }} /> : <>
        {groups.slice(0, groupLimit).map((entry) => <Pressable key={entry.id} accessibilityRole="button" onPress={() => setGroupId(entry.id)} style={styles.noteRow}>
          <Ionicons name={entry.linked ? 'git-network-outline' : 'ellipse-outline'} color={studioColors.green} size={17} />
          <Text style={[studioStyles.text, studioStyles.grow]}>{entry.label}</Text><Text style={studioStyles.muted}>{entry.seedIds.length}件</Text>
        </Pressable>)}
        {groups.length > groupLimit && <StudioAction label="さらに表示" onPress={() => setGroupLimit(groupLimit + pageSize)} />}
      </>}
    </View>}
    {(layout === 'list' || settings.layout === 'list') && <View style={layout === 'list' ? undefined : styles.hidden}>
      <StudioNoteList index={index} selected={selected.id} onPick={(id) => {
        chooseNode(id); scroll.current?.scrollTo({ y: 0, animated: false });
      }} />
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  inspector: { paddingTop: 9, paddingBottom: 9 },
  previewBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 10,
    backgroundColor: studioColors.soft, borderRadius: 12 },
  edgeReason: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 9,
    backgroundColor: studioColors.soft, borderRadius: 9 },
  list: { gap: 6 },
  noteRow: { flexDirection: 'row', alignItems: 'center', minHeight: 49, gap: 6, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: studioColors.surface, borderRadius: 10, borderWidth: 1, borderColor: studioColors.rule },
  activeRow: { backgroundColor: studioColors.soft, borderColor: '#b8c8b4' },
  palettes: { flexDirection: 'row', gap: 8 },
  palettePanel: { padding: 10, gap: 6 },
  palette: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 57, padding: 4, borderRadius: 11, gap: 2 },
  paletteLabel: { fontWeight: '700', fontSize: 13 },
});
