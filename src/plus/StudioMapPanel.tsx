import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { StudioPreferences } from '../domain/plus/contracts';
import type { Suggestion } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import type { Seed } from '../domain/types';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusInput, buttonSelectionProps } from './PlusUI';
import { StudioMapCanvas, mapPalettes } from './StudioMapCanvas';
import { IconButton, StudioAction, StudioSegments, StudioTitle, studioColors, studioStyles } from './StudioUI';

const layouts = [{ id: 'radial', label: 'マインドマップ' }, { id: 'constellation', label: '星座' }, { id: 'list', label: 'つながり一覧' }] as const;
const noHints: Suggestion[] = [];
const pageSize = 20;

export function StudioNoteList({ index, selected, onPick, search = true }: {
  index: MapIndex; selected: string; onPick: (id: string) => void; search?: boolean;
}) {
  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(0);
  const query = normalizeSearchText(term.trim());
  const list = React.useMemo(() => query ? index.live.filter((seed) => searchableText(seed).includes(query)) : index.live, [index, query]);
  const shown = Math.min(page, Math.max(0, Math.ceil(list.length / pageSize) - 1));
  return <View style={styles.list}>
    {search && <PlusInput accessibilityLabel="地図のメモを探す" placeholder="題名・本文・カテゴリで検索"
      value={term} onChangeText={(value) => { setPage(0); setTerm(value); }} />}
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

export function StudioMapPanel({ index, center, selected, settings, hints, back, onSearch, onSettings, onSelect, onFocus, onRead, onAI, onWrite }: {
  index: MapIndex; center: Seed; selected: Seed; settings: StudioPreferences; hints: Suggestion[];
  back?: () => void; onSearch: () => void; onSettings: (patch: Partial<StudioPreferences>) => void;
  onSelect: (id: string) => void; onFocus: (id: string) => void; onRead: (id: string) => void; onAI: (id: string) => void; onWrite: (id: string) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [expanded, setExpanded] = React.useState(false);
  const [appearance, setAppearance] = React.useState(false);
  const [relatedLimit, setRelatedLimit] = React.useState(8);
  const scroll = React.useRef<ScrollView>(null);
  const neighbors = [...index.adjacent.get(selected.id) ?? []];
  const layout = fontScale > 1.45 ? 'list' : settings.layout;
  const [links, setLinks] = React.useState(false);
  React.useEffect(() => { setExpanded(false); }, [center.id]);
  React.useEffect(() => { setLinks(false); setRelatedLimit(8); }, [selected.id]);
  const largeMap = width > 550;
  const mapHeight = largeMap ? 410 : Math.max(263, Math.min(350, (width - 28) * 0.82));
  const pending = hints.some(({ to }) => to.id === selected.id);

  return <ScrollView ref={scroll} style={studioStyles.root} contentContainerStyle={studioStyles.content} keyboardShouldPersistTaps="handled">
    <StudioTitle title="考えの地図" subtitle={`${index.live.length}件のメモ · ${index.edges.length}本のつながり`}>
      <IconButton label="地図を検索" icon="search-outline" onPress={onSearch} />
      <IconButton label={appearance ? '表示スタイルを閉じる' : '表示スタイル'} icon="color-palette-outline" onPress={() => setAppearance(!appearance)} />
    </StudioTitle>
    {appearance && <View style={studioStyles.card}>
      <Text style={studioStyles.subtitle}>地図のデザイン</Text>
      <View style={styles.palettes}>{(Object.keys(mapPalettes) as StudioPreferences['palette'][]).map((key) => {
        const preset = mapPalettes[key];
        const active = key === settings.palette;
        return <Pressable key={key} accessibilityRole="button" {...buttonSelectionProps(active)} accessibilityLabel={preset.label} onPress={() => onSettings({ palette: key })}
          style={[styles.palette, { backgroundColor: preset.art, borderColor: active ? preset.highlight : preset.border, borderWidth: active ? 2 : 1 }]}>
          <View style={[styles.swatches, { borderColor: preset.center }]}>
            <View style={[styles.swatch, { backgroundColor: preset.center }]} /><View style={[styles.swatch, { backgroundColor: preset.candidate }]} />
            <View style={[styles.swatch, { backgroundColor: preset.node }]} />
          </View><Text style={{ color: preset.ink, fontWeight: '600' }}>{preset.label}</Text>
        </Pressable>;
      })}</View>
    </View>}
    {fontScale <= 1.45 && <StudioSegments label="つながりの見方" items={layouts} value={settings.layout} onChange={(value) => onSettings({ layout: value })} />}
    {layout !== 'list' && <StudioMapCanvas index={index} center={center} selected={selected.id} mode={layout} palette={settings.palette} height={mapHeight}
      suggestions={layout === 'radial' ? hints : noHints} expanded={expanded} onSelect={onSelect} />}
    <View style={[studioStyles.card, styles.inspector]}>
      <View style={studioStyles.row}>
        {back && <IconButton label="前の中心へ戻る" icon="arrow-back-outline" onPress={back} />}
        <View style={studioStyles.grow}>
          <Text style={studioStyles.muted}>{pending ? 'AIの候補' : `${selected.id === center.id && layout === 'radial' ? '中心 · ' : ''}つながり${neighbors.length}件`}</Text>
          <Text accessibilityRole="header" style={studioStyles.subtitle} numberOfLines={2}>{toSeedSnippet(selected, 70)}</Text>
        </View>
        <IconButton label="原文を開く" icon="document-text-outline" onPress={() => onRead(selected.id)} />
        <IconButton label={pending ? '候補の理由を開く' : 'このメモからAIで探す'} icon="sparkles-outline" onPress={() => onAI(pending ? center.id : selected.id)} />
      </View>
      {layout === 'list' && <Text style={studioStyles.muted} numberOfLines={2}>{selected.body}</Text>}
      <View style={studioStyles.wrap}>
        {selected.id !== center.id && <StudioAction label="ここを中心にする" icon="locate-outline" onPress={() => onFocus(selected.id)} />}
        {selected.id === center.id && layout === 'radial' && neighbors.length > 0 && <StudioAction
          label={expanded ? '直接のつながりに戻す' : 'もう一段たどる'} icon="git-branch-outline" onPress={() => setExpanded(!expanded)} />}
        {neighbors.length > 0 && <StudioAction label={links ? '関係リストを閉じる' : 'このメモのつながり'} onPress={() => setLinks(!links)} />}
        <StudioAction label="つながるメモを書く" icon="add" onPress={() => onWrite(selected.id)} />
      </View>
      {links && <View style={styles.list}>
        {neighbors.slice(0, relatedLimit).map((id) => {
          const peer = index.byId.get(id)!;
          return <Pressable key={id} accessibilityRole="button" onPress={() => onFocus(id)} style={styles.noteRow}>
            <Text numberOfLines={2} style={[studioStyles.text, studioStyles.grow]}>{toSeedSnippet(peer, 60)}</Text>
            <Ionicons name="chevron-forward" size={15} color={studioColors.muted} />
          </Pressable>;
        })}
        {neighbors.length > relatedLimit && <StudioAction label="さらに表示" onPress={() => setRelatedLimit(relatedLimit + pageSize)} />}
      </View>}
    </View>
    {layout === 'list' && <StudioNoteList index={index} selected={selected.id} onPick={(id) => {
      onSelect(id); scroll.current?.scrollTo({ y: 0, animated: false });
    }} />}
  </ScrollView>;
}

const styles = StyleSheet.create({
  inspector: { paddingTop: 9, paddingBottom: 9 },
  list: { gap: 6 },
  noteRow: { flexDirection: 'row', alignItems: 'center', minHeight: 49, gap: 6, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: studioColors.surface, borderRadius: 10, borderWidth: 1, borderColor: studioColors.rule },
  activeRow: { backgroundColor: studioColors.soft, borderColor: '#b8c8b4' },
  palettes: { flexDirection: 'row', gap: 8 },
  palette: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60, padding: 5, borderRadius: 11, gap: 3 },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
});
