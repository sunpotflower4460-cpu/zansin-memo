import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { StudioPreferences } from '../domain/plus/contracts';
import type { Suggestion } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import { constellationGroups, radialNeighbors } from '../domain/plus/studioGraph';
import type { Seed } from '../domain/types';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusInput, buttonSelectionProps, focusControl } from './PlusUI';
import { StudioMapCanvas, mapPalettes } from './StudioMapCanvas';
import { IconButton, StudioAction, StudioSegments, StudioTitle, studioColors, studioStyles, type StudioIcon } from './StudioUI';

const layouts = [{ id: 'radial', label: 'マインドマップ' }, { id: 'constellation', label: '星座' }, { id: 'list', label: 'つながり一覧' }] as const;
const noHints: Suggestion[] = [];
const pageSize = 20;

export function StudioNoteList({ index, selected, onPick, scope, details, hint }: {
  index: MapIndex; selected: string; onPick: (id: string) => void; scope?: readonly string[];
  details?: ReadonlyMap<string, string>; hint?: string;
}) {
  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(0);
  const query = normalizeSearchText(term.trim());
  const list = React.useMemo(() => {
    const notes = scope ? scope.flatMap((id) => index.byId.get(id) ?? []) : index.live;
    return query ? notes.filter((seed) => searchableText(seed).includes(query) || normalizeSearchText(details?.get(seed.id) ?? '').includes(query)) : notes;
  }, [details, index, query, scope]);
  const shown = Math.min(page, Math.max(0, Math.ceil(list.length / pageSize) - 1));
  return <View style={styles.list}>
    <PlusInput accessibilityLabel="地図のメモを探す" placeholder="題名・本文・カテゴリで検索"
      value={term} onChangeText={(value) => { setPage(0); setTerm(value); }} />
    {!list.length && <Text style={studioStyles.muted}>一致するメモがありません。</Text>}
    {list.slice(shown * pageSize, (shown + 1) * pageSize).map((seed) => <Pressable key={seed.id} onPress={() => onPick(seed.id)}
      accessibilityRole="button" accessibilityState={{ selected: selected === seed.id }}
      accessibilityHint={[details?.get(seed.id), hint].filter(Boolean).join('。') || undefined}
      accessibilityLabel={`${toSeedSnippet(seed, 55)}、つながり${index.adjacent.get(seed.id)?.size ?? 0}件`}
      style={({ pressed }) => [styles.noteRow, selected === seed.id && styles.activeRow, pressed && studioStyles.quiet]}>
      <View style={studioStyles.grow}>
        <Text style={studioStyles.text} numberOfLines={2}>{toSeedSnippet(seed, 70)}</Text>
        {(details?.has(seed.id) || seed.title) && <Text numberOfLines={2} style={studioStyles.muted}>{details?.get(seed.id) ?? seed.body}</Text>}
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

function DockButton({ label, text, icon, onPress, primary, focusRef }: {
  label: string; text: string; icon: StudioIcon; onPress: () => void; primary?: boolean; focusRef?: React.Ref<View>;
}) {
  return <Pressable ref={focusRef} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.dockButton, primary && styles.dockPrimary, pressed && studioStyles.quiet]}>
    <Ionicons name={icon} size={16} color={primary ? '#fffdf7' : studioColors.green} />
    <Text maxFontSizeMultiplier={1.4} style={[styles.dockText, primary && studioStyles.onPrimary]}>{text}</Text>
  </Pressable>;
}

type Drawer = 'nearby' | 'relations' | 'groups' | 'actions';

function savedRelations(edges: MapIndex['edges'], seedId: string) {
  return new Map(edges.flatMap((edge) => {
    if (edge.note && edge.aSeedId === seedId) return [[edge.bSeedId, edge.note] as const];
    if (edge.note && edge.bSeedId === seedId) return [[edge.aSeedId, edge.note] as const];
    return [];
  }));
}

export function StudioMapPanel({ index, center, selected, settings, hints, preview, immersive, back, onImmersive,
  onSearch, onSettings, onSelect, onFocus, onRead, onAI, onReview, onWrite }: {
  index: MapIndex; center: Seed; selected: Seed; settings: StudioPreferences; hints: readonly Suggestion[];
  preview?: { kind: 'suggestions' | 'connection'; label: string; emphasisId?: string; onClose: () => void };
  immersive: boolean; back?: { title: string; onPress: () => void }; onImmersive: () => void;
  onSearch: () => void; onSettings: (patch: Partial<StudioPreferences>) => void;
  onSelect: (id: string) => void; onFocus: (id: string) => void; onRead: (id: string, onReturn?: () => void) => void; onAI: (id: string) => void;
  onReview: (suggestion: Suggestion) => void; onWrite: (id: string) => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const compact = width <= 350 || height < 620;
  const preferList = fontScale > (compact ? 1.3 : 1.45) || height < 520;
  const layout = preferList ? 'list' : preview ? 'radial' : settings.layout;
  const [expandedViews, setExpandedViews] = React.useState<string[]>([]);
  const viewKey = preview?.kind ?? 'garden';
  const depthKey = JSON.stringify([viewKey, center.id]);
  const expanded = expandedViews.includes(depthKey);
  const [drawer, setDrawer] = React.useState<Drawer>();
  const [hiddenNotes, setHiddenNotes] = React.useState<string[]>([]);
  const [fitRequest, setFitRequest] = React.useState(0);
  const [appearance, setAppearance] = React.useState(false);
  const [groupId, setGroupId] = React.useState<string>();
  const [groupLimit, setGroupLimit] = React.useState(pageSize);
  const closeButton = React.useRef<View>(null);
  const readButton = React.useRef<View>(null);
  const colorButton = React.useRef<View>(null);
  const activeColor = React.useRef<View>(null);
  const relationButton = React.useRef<View>(null);
  const menuButton = React.useRef<View>(null);
  const restoreFocus = React.useRef<View>(null);
  const atCenter = center.id === selected.id;
  const neighbors = React.useMemo(() => [...index.adjacent.get(selected.id) ?? []], [index.adjacent, selected.id]);
  const neighborhood = React.useMemo(() => radialNeighbors(index, center), [center, index]);
  const groups = React.useMemo(() => layout === 'constellation' ? constellationGroups(index) : undefined, [index, layout]);
  const group = groups?.find(({ id }) => id === groupId);
  const edgeNotes = React.useMemo(() => savedRelations(index.edges, selected.id), [index.edges, selected.id]);
  const nearby = React.useMemo(() => {
    const ids = [...neighborhood.direct];
    const details = savedRelations(index.edges, center.id);
    for (const { id, via } of expanded ? neighborhood.second : []) {
      ids.push(id);
      const parent = via && index.byId.get(via);
      if (parent) details.set(id, `「${toSeedSnippet(parent, 32)}」を経由`);
    }
    for (const { to } of hints) {
      if (!ids.includes(to.id)) ids.push(to.id);
      details.set(to.id, 'AIの候補');
    }
    return { ids, details };
  }, [center.id, expanded, hints, index.byId, index.edges, neighborhood]);
  const pending = hints.find(({ to }) => to.id === selected.id);
  const route = expanded && neighborhood.second.find(({ id }) => id === selected.id);
  const via = route && route.via && index.byId.get(route.via);
  const relation = edgeNotes.get(center.id);
  const status = pending ? 'AIの候補' : atCenter ? '中心のメモ' : via
    ? `「${toSeedSnippet(via, 19)}」を経由` : neighborhood.direct.includes(selected.id) ? '中心と直接つながるメモ' : '選んだメモ';

  React.useEffect(() => {
    if (!drawer && !restoreFocus.current) return;
    const frame = requestAnimationFrame(() => {
      focusControl(drawer ? closeButton.current : restoreFocus.current);
      if (!drawer) restoreFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [drawer]);

  React.useEffect(() => {
    if (!appearance) return;
    const frame = requestAnimationFrame(() => focusControl(activeColor.current));
    return () => cancelAnimationFrame(frame);
  }, [appearance]);

  function open(next: Drawer, trigger = readButton.current) {
    restoreFocus.current = trigger;
    if (next === 'groups') { setGroupId(undefined); setGroupLimit(pageSize); }
    setDrawer(next);
  }

  function chooseNode(id: string) {
    onSelect(id);
    const suggestion = hints.find(({ to }) => to.id === id);
    if (suggestion) onReview(suggestion);
  }

  function chooseFromDrawer(id: string) {
    setDrawer(undefined);
    if (drawer === 'groups' || (drawer === 'relations' && !atCenter)) { onFocus(id); return; }
    setFitRequest((before) => before + 1);
    chooseNode(id);
  }

  function toggleDepth() {
    if (expanded && via && !pending) onSelect(center.id);
    setExpandedViews((before) => expanded ? before.filter((key) => key !== depthKey) : [...before.slice(-31), depthKey]);
  }

  const connection = { label: 'このメモのつながり', text: `つながり ${neighbors.length}件`, icon: 'git-network-outline' as const,
    onPress: () => open('relations', relationButton.current) };
  const primary = pending ? { label: '候補の理由を開く', text: '理由を見る', icon: 'sparkles-outline' as const, onPress: () => onReview(pending) }
    : !atCenter ? { label: 'ここを中心にする', text: '中心にする', icon: 'locate-outline' as const, onPress: () => onFocus(selected.id) }
      : neighbors.length ? connection : { label: 'つながるメモを書く', text: 'つなげて書く', icon: 'add' as const, onPress: () => onWrite(selected.id) };
  const ai = { label: 'このメモからAIで探す', text: 'AIで探す', icon: 'sparkles-outline' as const, onPress: () => onAI(selected.id) };
  const showConnection = !atCenter && neighbors.length > 0 && !pending;
  const drawerTitle = drawer === 'groups' ? group?.label ?? '星座のまとまり'
    : drawer === 'relations' ? 'メモのつながり' : drawer === 'actions' ? 'メモの操作' : '地図の続き';
  const closeLabel = drawer === 'groups' ? 'まとまりを閉じる' : '地図の操作画面を閉じる';

  return <View style={studioStyles.root}>
    <View style={[styles.workspace, drawer && styles.hidden]}>
      <StudioTitle title="考えの地図" subtitle={compact || immersive || preview ? undefined : `${index.live.length}件のメモ · ${index.edges.length}本のつながり`}>
        {!immersive && <><IconButton label="地図を検索" icon="search-outline" onPress={onSearch} />
          <IconButton label={appearance ? '表示スタイルを閉じる' : '表示スタイル'} icon="color-palette-outline" focusRef={colorButton}
            color={appearance ? '#fffdf7' : undefined} background={appearance ? studioColors.green : undefined} onPress={() => {
              setAppearance(!appearance);
              if (appearance) focusControl(colorButton.current);
            }} /></>}
        {(immersive || layout !== 'list') && <IconButton label={immersive ? '全画面を閉じる' : '地図を全画面で開く'}
          icon={immersive ? 'contract-outline' : 'expand-outline'} onPress={() => { setAppearance(false); onImmersive(); }} />}
      </StudioTitle>
      {preview && <View style={styles.previewBar}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[studioStyles.text, studioStyles.grow]}>{preview.label}</Text>
        <StudioAction label="元の画面に戻る" onPress={preview.onClose} />
      </View>}
      {!preview && !immersive && !preferList && <StudioSegments label="つながりの見方" items={layouts} value={settings.layout} onChange={(value) => onSettings({ layout: value })} />}
      {layout !== 'list' && <StudioMapCanvas index={index} center={center} selected={selected.id} emphasisId={preview?.emphasisId}
        mode={layout} palette={settings.palette} groups={groups} viewKey={viewKey} neighborhood={neighborhood} fitRequest={fitRequest}
        back={back} onDepth={layout === 'radial' && neighborhood.second.length ? toggleDepth : undefined}
        onMore={(visibleIds) => {
          const visible = new Set(visibleIds);
          setHiddenNotes(nearby.ids.filter((id) => !visible.has(id)));
          open('nearby');
        }} onGroups={groups ? () => open('groups') : undefined}
        suggestions={layout === 'radial' ? hints : noHints} expanded={expanded} onSelect={chooseNode} />}
      {layout === 'list' && back && <View style={studioStyles.wrap}><StudioAction label="前の中心へ戻る" icon="arrow-back-outline" onPress={back.onPress} /></View>}
      {(layout === 'list' || settings.layout === 'list') && <ScrollView style={[styles.noteList, layout !== 'list' && styles.hidden]}
        contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <StudioNoteList index={index} selected={selected.id} onPick={chooseNode} />
      </ScrollView>}
      {appearance ? <View style={[styles.dock, styles.appearance, compact && styles.compactAppearance]}>
        <Text accessibilityRole="header" style={styles.appearanceTitle}>地図のデザイン</Text>
        <View style={styles.palettes}>{(Object.keys(mapPalettes) as StudioPreferences['palette'][]).map((key) => {
          const preset = mapPalettes[key];
          const active = key === settings.palette;
          return <Pressable key={key} ref={active ? activeColor : undefined} accessibilityRole="button" {...buttonSelectionProps(active)} accessibilityLabel={preset.label}
            onPress={() => onSettings({ palette: key })}
            style={({ pressed }) => [styles.palette, { backgroundColor: preset.art, borderColor: active ? preset.highlight : preset.border },
              active && styles.activePalette, pressed && studioStyles.quiet]}>
            <Svg width={66} height={31} viewBox="0 0 80 38" pointerEvents="none" aria-hidden>
              <Path d="M7 12 C17 12 25 19 39 19 C53 19 60 10 72 10 M39 19 C53 19 61 28 72 28" stroke={preset.line} strokeWidth="2" fill="none" />
              <Circle cx="7" cy="12" r="4" fill={preset.node} stroke={preset.highlight} /><Circle cx="72" cy="10" r="4" fill={preset.node} stroke={preset.highlight} />
              <Circle cx="72" cy="28" r="4" fill={preset.candidate} />
              <Rect x="30" y="12" rx="4" width="19" height="14" fill={preset.center} />
            </Svg>
            <Text style={[styles.paletteLabel, { color: preset.ink }]}>{preset.label}</Text>
            {active && <Ionicons style={styles.paletteCheck} name="checkmark-circle" size={17} color={preset.highlight} />}
          </Pressable>;
        })}</View>
      </View> : <View style={styles.dock} testID="studio-map-selection">
        <View style={studioStyles.row}>
          <View style={styles.marker} aria-hidden>
            <Ionicons name={pending ? 'sparkles-outline' : atCenter ? 'leaf-outline' : 'git-network-outline'} size={19} color={studioColors.green} />
          </View>
          <View style={studioStyles.grow}>
            <Text numberOfLines={1} style={styles.selectionStatus}>{compact && relation ? relation : status}</Text>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.selectionTitle}>{toSeedSnippet(selected, 70)}</Text>
          </View>
          <IconButton label="メモの操作" icon="ellipsis-horizontal" focusRef={menuButton} onPress={() => open('actions', menuButton.current)} />
        </View>
        {!compact && <View style={styles.previewLine}>
          {relation && <Ionicons name="link-outline" size={15} color={studioColors.green} />}
          <Text style={[studioStyles.muted, studioStyles.grow]} numberOfLines={1}>{relation ?? selected.body}</Text>
        </View>}
        <View style={styles.dockActions}>
          <DockButton {...primary} primary focusRef={atCenter && neighbors.length ? relationButton : undefined} />
          <DockButton label="原文を開く" text="原文" icon="document-text-outline" focusRef={readButton}
            onPress={() => onRead(selected.id, () => focusControl(readButton.current))} />
          <DockButton {...(showConnection ? connection : ai)} focusRef={showConnection ? relationButton : undefined} />
        </View>
      </View>}
    </View>
    {drawer && <View style={styles.drawer} accessibilityViewIsModal onAccessibilityEscape={() => setDrawer(undefined)}>
      <View style={styles.drawerHeader}><StudioTitle title={drawerTitle}>
        {group && <IconButton label="まとまりの一覧に戻る" icon="arrow-back-outline" onPress={() => setGroupId(undefined)} />}
        <IconButton label={closeLabel} icon="close" focusRef={closeButton} onPress={() => setDrawer(undefined)} />
      </StudioTitle></View>
      <ScrollView key={group ? group.id : drawer} style={styles.noteList} contentContainerStyle={styles.drawerContent} keyboardShouldPersistTaps="handled">
        {(drawer === 'nearby' || drawer === 'relations') && <>
          <Text style={studioStyles.text}>{drawer === 'nearby' ? `${toSeedSnippet(center, 40)} · ${hiddenNotes.length}件` : toSeedSnippet(selected, 55)}</Text>
          <StudioNoteList index={index} selected={selected.id} scope={drawer === 'nearby' ? hiddenNotes : neighbors}
            details={drawer === 'nearby' ? nearby.details : edgeNotes} onPick={chooseFromDrawer}
            hint={drawer === 'relations' && !atCenter ? 'このメモを地図の中心にします' : '地図で選びます'} />
        </>}
        {drawer === 'groups' && (group ? <StudioNoteList index={index} selected={selected.id} scope={group.seedIds} onPick={chooseFromDrawer} /> : <>
          {groups?.slice(0, groupLimit).map((entry) => <Pressable key={entry.id} accessibilityRole="button" onPress={() => setGroupId(entry.id)} style={styles.noteRow}>
            <Ionicons name={entry.linked ? 'git-network-outline' : 'ellipse-outline'} color={studioColors.green} size={17} />
            <Text style={[studioStyles.text, studioStyles.grow]}>{entry.label}</Text><Text style={studioStyles.muted}>{entry.seedIds.length}件</Text>
          </Pressable>)}
          {(groups?.length ?? 0) > groupLimit && <StudioAction label="さらに表示" onPress={() => setGroupLimit(groupLimit + pageSize)} />}
        </>)}
        {drawer === 'actions' && <View style={studioStyles.card}>
          <Text accessibilityRole="header" style={studioStyles.subtitle}>{toSeedSnippet(selected, 60)}</Text>
          <StudioAction label="つながるメモを書く" icon="add" onPress={() => { setDrawer(undefined); onWrite(selected.id); }} />
          <StudioAction label="このメモからAIで探す" icon="sparkles-outline" onPress={() => { setDrawer(undefined); onAI(selected.id); }} />
        </View>}
      </ScrollView>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  workspace: { flex: 1, minHeight: 0, width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: 12,
    paddingTop: 6, paddingBottom: 7, gap: 7 },
  drawer: { flex: 1, minHeight: 0, width: '100%', maxWidth: 840, alignSelf: 'center' },
  drawerHeader: { paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 },
  drawerContent: { paddingHorizontal: 14, paddingBottom: 18, gap: 9 },
  noteList: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 4 },
  dock: { borderWidth: 1, borderColor: '#d0dacb', borderRadius: 17, paddingHorizontal: 8, paddingVertical: 6, gap: 4,
    backgroundColor: studioColors.surface, boxShadow: '0px 2px 9px rgba(37, 64, 47, 0.08)' },
  marker: { width: 34, height: 34, borderRadius: 11, backgroundColor: studioColors.soft, alignItems: 'center', justifyContent: 'center' },
  selectionStatus: { color: studioColors.green, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  selectionTitle: { color: studioColors.text, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 3 },
  dockActions: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  dockButton: { flex: 1, minWidth: 44, minHeight: 44, borderWidth: 1, borderColor: studioColors.rule, borderRadius: 10,
    backgroundColor: studioColors.surface, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 3, gap: 4 },
  dockPrimary: { flex: 1.28, backgroundColor: studioColors.green, borderColor: studioColors.green },
  dockText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '700', color: studioColors.green, textAlign: 'center' },
  previewBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 10,
    backgroundColor: studioColors.soft, borderRadius: 12 },
  list: { gap: 6 },
  noteRow: { flexDirection: 'row', alignItems: 'center', minHeight: 49, gap: 6, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: studioColors.surface, borderRadius: 10, borderWidth: 1, borderColor: studioColors.rule },
  activeRow: { backgroundColor: studioColors.soft, borderColor: '#b8c8b4' },
  appearance: { minHeight: 129, padding: 8, gap: 5 },
  compactAppearance: { minHeight: 106 },
  appearanceTitle: { color: studioColors.text, fontSize: 14, fontWeight: '700', lineHeight: 20, paddingHorizontal: 2 },
  palettes: { flexDirection: 'row', flex: 1, gap: 6 },
  palette: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60, padding: 4, borderRadius: 11, gap: 2, borderWidth: 1 },
  activePalette: { borderWidth: 2 },
  paletteCheck: { position: 'absolute', top: 4, right: 5 },
  paletteLabel: { fontWeight: '700', fontSize: 13 },
});
