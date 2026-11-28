import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { StudioPlacement, StudioPreferences } from '../domain/plus/contracts';
import type { Suggestion } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import { radialNeighbors } from '../domain/plus/studioGraph';
import type { Seed } from '../domain/types';
import { showConfirm } from '../utils/confirm';
import { triggerSuccessFeedback } from '../utils/feedback';
import { toSeedSnippet } from '../utils/seedText';
import { buttonSelectionProps, focusControl } from './PlusUI';
import { StudioConstellations, constellationPalettes } from './StudioConstellations';
import { StudioMapCanvas, mapPalettes } from './StudioMapCanvas';
import { StudioNoteList } from './StudioNoteList';
import { IconButton, StudioAction, StudioSegments, StudioTitle, studioColors, studioStyles, type StudioIcon } from './StudioUI';

const layouts = [
  { id: 'radial', label: 'マインドマップ', icon: 'git-network-outline' },
  { id: 'constellation', label: '星座', icon: 'sparkles-outline' },
  { id: 'list', label: '一覧', accessibilityLabel: 'つながり一覧', icon: 'list-outline' },
] as const;
const compactLayouts = [{ ...layouts[0], label: 'マップ', accessibilityLabel: layouts[0].label }, layouts[1], layouts[2]] as const;
const noPlacements: readonly StudioPlacement[] = [];

function DockButton({ label, text, icon, onPress, primary, focusRef }: {
  label: string; text: string; icon: StudioIcon; onPress: () => void; primary?: boolean; focusRef?: React.Ref<View>;
}) {
  return <Pressable ref={focusRef} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.dockButton, primary && styles.dockPrimary, pressed && studioStyles.quiet]}>
    <Ionicons name={icon} size={16} color={primary ? '#fffdf7' : studioColors.green} />
    <Text maxFontSizeMultiplier={1.4} style={[styles.dockText, primary && studioStyles.onPrimary]}>{text}</Text>
  </Pressable>;
}

type Drawer = 'nearby' | 'relations' | 'path' | 'actions';
type Arrangement = {
  centerId: string; selectedId: string; expanded: boolean; wasFullScreen: boolean;
  initial: readonly StudioPlacement[]; points: StudioPlacement[]; history: StudioPlacement[][];
};

function savedRelations(edges: MapIndex['edges'], seedId: string) {
  return new Map(edges.flatMap((edge) => {
    if (edge.note && edge.aSeedId === seedId) return [[edge.bSeedId, edge.note] as const];
    if (edge.note && edge.bSeedId === seedId) return [[edge.aSeedId, edge.note] as const];
    return [];
  }));
}

export function StudioMapPanel({ index, center, selected: mapSelection, settings, hints, preview, immersive, back, onImmersive,
  onSearch, onSettings, onSelect, onFocus, onRead, onAI, onReview, onWrite, onAtelier, canArrange, editRequest, placement, onSavePlacement }: {
  index: MapIndex; center: Seed; selected: Seed; settings: StudioPreferences; hints: readonly Suggestion[];
  preview?: { kind: 'suggestions' | 'connection'; label: string; emphasisId?: string; onClose: () => void };
  immersive: boolean; back?: { title: string; onPress: () => void }; onImmersive: (next: boolean) => void;
  onSearch: (onReturn: () => void) => void; onSettings: (patch: Partial<StudioPreferences>) => void;
  onSelect: (id: string) => void; onFocus: (id: string) => void; onRead: (id: string, onReturn?: () => void) => void; onAI: (id: string) => void;
  onReview: (suggestion: Suggestion) => void; onWrite: (id: string) => void; onAtelier?: (id: string) => void;
  canArrange: boolean; editRequest: number; placement?: readonly StudioPlacement[];
  onSavePlacement: (id: string, next: StudioPlacement[], expected: readonly StudioPlacement[]) => Promise<string | undefined>;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const compact = width <= 350 || height < 620;
  const preferList = fontScale > (compact ? 1.3 : 1.45) || height < 520;
  const canEditMap = canArrange && !preview && height >= 520;
  const [arrangement, setArrangement] = React.useState<Arrangement>();
  const [arrangeNotice, setArrangeNotice] = React.useState<string>();
  const [saving, setSaving] = React.useState(false);
  const saveLock = React.useRef(false);
  const requestHandled = React.useRef(editRequest);
  const editing = Boolean(arrangement && arrangement.centerId === center.id && canEditMap);
  const layout = editing ? 'radial' : preferList ? 'list' : preview ? 'radial' : settings.layout;
  const selected = editing && arrangement ? index.byId.get(arrangement.selectedId) ?? center : mapSelection;
  const [expandedViews, setExpandedViews] = React.useState<string[]>([]);
  const viewKey = preview?.kind ?? 'garden';
  const depthKey = JSON.stringify([viewKey, center.id]);
  const expandedInMap = expandedViews.includes(depthKey);
  const expanded = editing && arrangement ? arrangement.expanded : expandedInMap;
  const [drawer, setDrawer] = React.useState<Drawer>();
  const [visibleNotes, setVisibleNotes] = React.useState<ReadonlySet<string>>(() => new Set());
  const [nearbyFilter, setNearbyFilter] = React.useState<'hidden' | 'all'>('hidden');
  const [fitRequest, setFitRequest] = React.useState(0);
  const [appearance, setAppearance] = React.useState(false);
  const closeButton = React.useRef<View>(null);
  const readButton = React.useRef<View>(null);
  const colorButton = React.useRef<View>(null);
  const activeColor = React.useRef<View>(null);
  const relationButton = React.useRef<View>(null);
  const menuButton = React.useRef<View>(null);
  const pathButton = React.useRef<View>(null);
  const searchButton = React.useRef<View>(null);
  const arrangeButton = React.useRef<View>(null);
  const moreButton = React.useRef<View>(null);
  const endArrangeButton = React.useRef<View>(null);
  const wasEditing = React.useRef(false);
  const restoreFocus = React.useRef<View>(null);
  const atCenter = center.id === selected.id;
  const neighbors = React.useMemo(() => [...index.adjacent.get(selected.id) ?? []], [index.adjacent, selected.id]);
  const neighborhood = React.useMemo(() => radialNeighbors(index, center), [center, index]);
  const secondary = React.useMemo(() => new Map(neighborhood.second.map(({ id, via }) => [id, via])), [neighborhood.second]);
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
  const hiddenNotes = React.useMemo(() => nearby.ids.filter((id) => !visibleNotes.has(id)), [nearby.ids, visibleNotes]);
  const pending = hints.find(({ to }) => to.id === selected.id);
  const viaId = (expanded || layout !== 'radial') ? secondary.get(selected.id) : undefined;
  const via = viaId ? index.byId.get(viaId) : undefined;
  const directlyLinked = index.adjacent.get(center.id)?.has(selected.id);
  const path = !pending && !atCenter && (directlyLinked || via) ? [center, ...(via ? [via] : []), selected] : undefined;
  const relation = edgeNotes.get(center.id);
  const status = pending ? 'AIの候補' : atCenter ? '中心のメモ' : via
    ? `「${toSeedSnippet(via, 19)}」を経由` : directlyLinked ? '中心と直接つながるメモ' : '選んだメモ';

  const startArrangement = React.useCallback(() => {
    if (!canEditMap || editing) return;
    const initial = placement ?? noPlacements;
    setArrangement({ centerId: center.id, selectedId: mapSelection.id, expanded: expandedInMap, wasFullScreen: immersive,
      initial, points: [...initial], history: [] });
    setArrangeNotice(undefined);
    setAppearance(false); setDrawer(undefined); onImmersive(true);
  }, [canEditMap, center.id, editing, expandedInMap, immersive, mapSelection.id, onImmersive, placement]);

  React.useEffect(() => {
    if (requestHandled.current === editRequest) return;
    requestHandled.current = editRequest;
    startArrangement();
  }, [editRequest, startArrangement]);

  React.useEffect(() => {
    if (wasEditing.current === editing) return;
    wasEditing.current = editing;
    const frame = requestAnimationFrame(() => focusControl(editing ? endArrangeButton.current : arrangeButton.current));
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  function endArrangement() {
    if (arrangement) onImmersive(arrangement.wasFullScreen);
    setArrangement(undefined);
    setArrangeNotice(undefined);
  }

  function requestEndArrangement() {
    if (saveLock.current) return;
    if (!arrangement?.history.length) { endArrangement(); return; }
    showConfirm('配置の変更を破棄しますか？', '最後に保存した配置に戻ります。', [
      { text: '編集を続ける', style: 'cancel' },
      { text: '破棄する', style: 'destructive', onPress: endArrangement },
    ]);
  }

  function changePlacement(change: (before: StudioPlacement[]) => StudioPlacement[]) {
    if (saveLock.current) return;
    setArrangeNotice(undefined);
    setArrangement((before) => before && { ...before, points: change(before.points), history: [...before.history.slice(-19), before.points] });
  }

  function undoPlacement() {
    setArrangeNotice(undefined);
    setArrangement((before) => {
      const points = before?.history.at(-1);
      return before && points ? { ...before, points, history: before.history.slice(0, -1) } : before;
    });
  }

  async function saveArrangement() {
    if (!editing || !arrangement || saveLock.current) return;
    saveLock.current = true; setSaving(true);
    try {
      const failure = await onSavePlacement(arrangement.centerId, arrangement.points, arrangement.initial);
      if (failure) setArrangeNotice(failure);
      else { endArrangement(); triggerSuccessFeedback(); }
    } finally { saveLock.current = false; setSaving(false); }
  }

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
    setDrawer(next);
  }

  function chooseNode(id: string) {
    if (editing) {
      setArrangement((before) => before && before.selectedId !== id ? { ...before, selectedId: id } : before);
      return;
    }
    onSelect(id);
    const suggestion = hints.find(({ to }) => to.id === id);
    if (suggestion) onReview(suggestion);
  }

  function centersOnPick(id: string) {
    if (drawer !== 'relations' || layout === 'list' || id === center.id) return false;
    return !index.adjacent.get(center.id)?.has(id) && !secondary.has(id);
  }

  function setDepth(next: boolean) {
    if (editing) {
      setArrangement((before) => before && { ...before, expanded: next });
      return;
    }
    setExpandedViews((before) => next ? [...before.filter((key) => key !== depthKey).slice(-31), depthKey] : before.filter((key) => key !== depthKey));
  }

  function chooseFromDrawer(id: string) {
    setDrawer(undefined);
    restoreFocus.current = readButton.current ?? moreButton.current;
    if (centersOnPick(id)) { onFocus(id); return; }
    if (layout === 'radial' && !expanded && secondary.has(id)) setDepth(true);
    setFitRequest((before) => before + 1);
    chooseNode(id);
  }

  function toggleDepth() {
    if (expanded && via && !pending) chooseNode(center.id);
    setDepth(!expanded);
  }

  const connection = { label: 'このメモのつながり', text: `つながり ${neighbors.length}件`, icon: 'git-network-outline' as const,
    onPress: () => open('relations', relationButton.current) };
  const primary = pending ? { label: '候補の理由を開く', text: '理由を見る', icon: 'sparkles-outline' as const, onPress: () => onReview(pending) }
    : !atCenter ? { label: 'ここを中心にする', text: '中心にする', icon: 'locate-outline' as const, onPress: () => onFocus(selected.id) }
      : neighbors.length ? connection : { label: 'つながるメモを書く', text: 'つなげて書く', icon: 'add' as const, onPress: () => onWrite(selected.id) };
  const ai = { label: 'このメモからAIで探す', text: 'AIで探す', icon: 'sparkles-outline' as const, onPress: () => onAI(selected.id) };
  const showConnection = !atCenter && neighbors.length > 0 && !pending;
  const drawerTitle = drawer === 'relations' ? 'メモのつながり' : drawer === 'path' ? 'つながりの経路' : drawer === 'actions' ? 'メモの操作' : 'つながるメモ';
  const fullScreenLabel = immersive ? '全画面を閉じる' : '地図を全画面で開く';
  function toggleFullScreen() {
    setAppearance(false); onImmersive(!immersive);
  }

  return <View style={studioStyles.root}>
    <View style={[styles.workspace, drawer && styles.hidden]} onAccessibilityEscape={editing ? requestEndArrangement : undefined}>
      <StudioTitle title={editing ? '配置を編集' : '考えの地図'} compact={!editing && canEditMap && width <= 350}
        back={editing ? { label: '配置の編集をやめる', onPress: requestEndArrangement, disabled: saving, focusRef: endArrangeButton } : undefined}>
        {!editing && <IconButton label="地図を検索" icon="search-outline" focusRef={searchButton} onPress={() => onSearch(() => focusControl(searchButton.current))} />}
        {!editing && canEditMap && <StudioAction label="マインドマップの配置を編集" title="配置を編集" icon="move-outline" primary
          focusRef={arrangeButton} onPress={startArrangement} />}
        {!editing && immersive && layout === 'list' && <IconButton label={fullScreenLabel} icon="contract-outline" onPress={toggleFullScreen} />}
      </StudioTitle>
      {preview && <View style={styles.previewBar}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[studioStyles.text, studioStyles.grow]}>{preview.label}</Text>
        <StudioAction label="元の画面に戻る" onPress={preview.onClose} />
      </View>}
      {!preview && !editing && !immersive && !preferList && <View style={studioStyles.row}>
        <StudioSegments label="つながりの見方" items={width <= 350 ? compactLayouts : layouts} value={settings.layout} onChange={(value) => onSettings({ layout: value })} compact />
        <IconButton label={appearance ? '表示スタイルを閉じる' : '表示スタイル'} icon="color-palette-outline" focusRef={colorButton}
          color={appearance ? '#fffdf7' : undefined} background={appearance ? studioColors.green : undefined} onPress={() => {
            setAppearance(!appearance);
            if (appearance) focusControl(colorButton.current);
          }} />
      </View>}
      {layout !== 'list' && <View style={[styles.diagram, layout !== 'radial' && styles.hidden]}><StudioMapCanvas
        index={index} center={center} selected={selected.id} emphasisId={preview?.emphasisId} palette={settings.palette}
        viewKey={editing ? 'arrangement' : viewKey} neighborhood={neighborhood} fitRequest={fitRequest}
        back={editing ? undefined : back} onDepth={neighborhood.second.length ? toggleDepth : undefined} moreButton={moreButton}
        fullScreen={editing ? undefined : { active: immersive, label: fullScreenLabel, onPress: toggleFullScreen }}
        placement={editing && arrangement ? arrangement.points : placement}
        arrange={editing ? { onPlace: (point) => changePlacement((before) => [
          ...before.filter(({ seedId }) => seedId !== point.seedId), ...(point.x || point.y ? [point] : []),
        ]), onReject: () => setArrangeNotice('空いている場所へ移動できます。') } : undefined}
        onMore={(visibleIds) => {
          setVisibleNotes(new Set(visibleIds));
          setNearbyFilter('hidden');
          open('nearby', moreButton.current);
        }} suggestions={hints} expanded={expanded} onSelect={chooseNode} />
      </View>}
      {(settings.layout === 'constellation' || layout === 'constellation') && <View style={[styles.diagram, layout !== 'constellation' && styles.hidden]}>
        <StudioConstellations index={index} centerId={center.id} palette={settings.palette} compact={compact} showDetails={!appearance}
          fullScreen={{ active: immersive, label: fullScreenLabel, onPress: toggleFullScreen }} onRead={onRead}
          onMindMap={(id) => { setAppearance(false); onFocus(id); onSettings({ layout: 'radial' }); }} />
      </View>}
      {layout === 'list' && back && !editing && <View style={studioStyles.wrap}><StudioAction label="前の中心へ戻る" icon="arrow-back-outline" onPress={back.onPress} /></View>}
      {(layout === 'list' || settings.layout === 'list') && <ScrollView style={[styles.noteList, layout !== 'list' && styles.hidden]}
        contentContainerStyle={styles.listContent} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        <StudioNoteList index={index} selected={selected.id} onPick={chooseNode} />
      </ScrollView>}
      {editing && arrangement ? <View style={styles.dock}>
        <Text accessibilityLiveRegion="polite" style={[studioStyles.muted, arrangeNotice && styles.placementError]}>
          {arrangeNotice ?? (arrangement.history.length ? '未保存の変更があります' : 'カードをドラッグ')}
        </Text>
        <View style={studioStyles.wrap}>
          <StudioAction label="配置を保存" icon="checkmark" primary disabled={saving || !arrangement.history.length} onPress={() => void saveArrangement()} />
          <IconButton label="移動を元に戻す" icon="arrow-undo-outline" disabled={saving || !arrangement.history.length} onPress={undoPlacement} />
          <StudioAction label="自動配置に戻す" title="自動配置" icon="refresh-outline" disabled={saving || !arrangement.points.length} onPress={() => changePlacement(() => [])} />
        </View>
      </View> : appearance ? <View style={[styles.dock, styles.appearance, compact && styles.compactAppearance]}>
        <Text accessibilityRole="header" style={styles.appearanceTitle}>{layout === 'constellation' ? '星空の配色' : '地図のデザイン'}</Text>
        <View style={styles.palettes}>{(Object.keys(mapPalettes) as StudioPreferences['palette'][]).map((key) => {
          const preset = mapPalettes[key];
          const sky = layout === 'constellation' ? constellationPalettes[key] : undefined;
          const ink = sky?.ink ?? preset.ink;
          const glow = sky?.light ?? preset.highlight;
          const active = key === settings.palette;
          return <Pressable key={key} ref={active ? activeColor : undefined} accessibilityRole="button" {...buttonSelectionProps(active)} accessibilityLabel={preset.label}
            onPress={() => onSettings({ palette: key })}
            style={({ pressed }) => [styles.palette, { backgroundColor: sky?.space ?? preset.art, borderColor: active ? glow : sky?.rule ?? preset.border },
              active && styles.activePalette, pressed && studioStyles.quiet]}>
            <Svg width={66} height={31} viewBox="0 0 80 38" pointerEvents="none" aria-hidden>
              {sky ? <>
                <Path d="M12 11 L35 23 L53 9 L68 24" stroke={sky.light} strokeWidth="1" fill="none" />
                <Circle cx="12" cy="11" r="2.2" fill={sky.light} /><Circle cx="35" cy="23" r="3.5" fill={sky.focus} />
                <Circle cx="53" cy="9" r="2.4" fill={sky.light} /><Circle cx="68" cy="24" r="2" fill={sky.light} />
              </> : <>
                <Path d="M7 12 C17 12 25 19 39 19 C53 19 60 10 72 10 M39 19 C53 19 61 28 72 28" stroke={preset.line} strokeWidth="2" fill="none" />
                <Circle cx="7" cy="12" r="4" fill={preset.node} stroke={preset.highlight} /><Circle cx="72" cy="10" r="4" fill={preset.node} stroke={preset.highlight} />
                <Circle cx="72" cy="28" r="4" fill={preset.candidate} />
                <Rect x="30" y="12" rx="4" width="19" height="14" fill={preset.center} />
              </>}
            </Svg>
            <Text style={[styles.paletteLabel, { color: ink }]}>{preset.label}</Text>
            {active && <Ionicons style={styles.paletteCheck} name="checkmark-circle" size={17} color={glow} />}
          </Pressable>;
        })}</View>
      </View> : layout !== 'constellation' && <View style={styles.dock} testID="studio-map-selection">
        <View style={studioStyles.row}>
          {path ? <Pressable ref={pathButton} accessibilityRole="button" accessibilityLabel="つながりの経路を開く" onPress={() => open('path', pathButton.current)}
            style={({ pressed }) => [styles.pathButton, pressed && studioStyles.quiet]}>
            <Ionicons name="git-branch-outline" size={16} color={studioColors.green} />
            <Text style={styles.dockText}>経路</Text>
          </Pressable> : <View style={styles.marker} aria-hidden>
            <Ionicons name={pending ? 'sparkles-outline' : atCenter ? 'leaf-outline' : 'git-network-outline'} size={19} color={studioColors.green} />
          </View>}
          <View style={studioStyles.grow}>
            <Text numberOfLines={1} style={styles.selectionStatus}>{compact && relation ? relation : status}</Text>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.selectionTitle}>{toSeedSnippet(selected, 70)}</Text>
          </View>
          <IconButton label="メモの操作" icon="ellipsis-horizontal" focusRef={menuButton} onPress={() => open('actions', menuButton.current)} />
        </View>
        {!compact && relation && <View style={styles.previewLine}>
          {relation && <Ionicons name="link-outline" size={15} color={studioColors.green} />}
          <Text style={[studioStyles.muted, studioStyles.grow]} numberOfLines={1}>{relation}</Text>
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
        <IconButton label="地図の操作画面を閉じる" icon="close" focusRef={closeButton} onPress={() => setDrawer(undefined)} />
      </StudioTitle></View>
      <ScrollView key={drawer} style={styles.noteList} contentContainerStyle={styles.drawerContent}
        automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        {drawer === 'nearby' && <>
          <View style={[studioStyles.card, styles.nearbySummary]}>
            <View style={studioStyles.emblem} aria-hidden><Ionicons name="locate-outline" size={20} color={studioColors.green} /></View>
            <View style={studioStyles.grow}>
              <Text style={studioStyles.subtitle} numberOfLines={2}>{toSeedSnippet(center, 45)}</Text>
              <Text style={studioStyles.muted}>選ぶと、今の地図に表示します</Text>
            </View>
          </View>
          <StudioSegments label="つながるメモの表示範囲" value={nearbyFilter} onChange={setNearbyFilter} items={[
            { id: 'hidden', label: `図にない ${hiddenNotes.length}件` }, { id: 'all', label: `すべて ${nearby.ids.length}件` },
          ]} />
          <StudioNoteList index={index} selected={selected.id} scope={nearbyFilter === 'hidden' ? hiddenNotes : nearby.ids}
            details={nearby.details} onPick={chooseFromDrawer} hint="今の中心を保ったまま、このメモを地図に表示します" mapLabel="地図に表示" />
        </>}
        {drawer === 'relations' && <>
          <Text style={studioStyles.text}>{toSeedSnippet(selected, 55)}</Text>
          <StudioNoteList index={index} selected={selected.id} scope={neighbors} details={edgeNotes} onPick={chooseFromDrawer}
            centersOnPick={centersOnPick} hint="地図で選びます" />
        </>}
        {drawer === 'path' && <View style={styles.path}>{path?.map((seed, i) => {
          const role = i === 0 ? '中心' : seed.id === selected.id ? '選択中' : '経由';
          const annotation = i === 0 ? undefined : seed.id === selected.id ? edgeNotes.get(path[i - 1].id) : nearby.details.get(seed.id);
          return <View key={seed.id}>
            {i > 0 && <View style={styles.pathLink}>
              {!!annotation && <Text style={studioStyles.muted}>{annotation}</Text>}
            </View>}
            <Pressable accessibilityRole="button" accessibilityLabel={`地図で「${toSeedSnippet(seed, 55)}」を選ぶ`}
              onPress={() => chooseFromDrawer(seed.id)} style={({ pressed }) => [styles.pathStep, seed.id === selected.id && styles.activeRow, pressed && studioStyles.quiet]}>
              <View style={styles.pathDot}><Ionicons name={i === 0 ? 'leaf-outline' : seed.id === selected.id ? 'checkmark' : 'ellipse-outline'} size={19} color={studioColors.green} /></View>
              <View style={studioStyles.grow}>
                <Text style={styles.selectionStatus}>{role}</Text>
                <Text style={studioStyles.text}>{toSeedSnippet(seed, 70)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={studioColors.green} />
            </Pressable>
          </View>;
        })}</View>}
        {drawer === 'actions' && <View style={studioStyles.card}>
          <Text accessibilityRole="header" style={studioStyles.subtitle}>{toSeedSnippet(selected, 60)}</Text>
          <StudioAction label="つながるメモを書く" icon="add" onPress={() => { setDrawer(undefined); onWrite(selected.id); }} />
          {onAtelier && <StudioAction label="このメモをアトリエで使う" icon="create-outline" onPress={() => { setDrawer(undefined); onAtelier(selected.id); }} />}
          <StudioAction label="このメモからAIで探す" icon="sparkles-outline" onPress={() => { setDrawer(undefined); onAI(selected.id); }} />
        </View>}
      </ScrollView>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  diagram: { flex: 1, minHeight: 0 },
  placementError: { color: studioColors.orange },
  workspace: { flex: 1, minHeight: 0, width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: 12,
    paddingTop: 6, paddingBottom: 7, gap: 7 },
  drawer: { flex: 1, minHeight: 0, width: '100%', maxWidth: 840, alignSelf: 'center' },
  drawerHeader: { paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 },
  drawerContent: { paddingHorizontal: 14, paddingBottom: 18, gap: 9 },
  nearbySummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: studioColors.soft },
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
  activeRow: { backgroundColor: studioColors.soft, borderColor: '#b8c8b4' },
  pathButton: { flexDirection: 'row', minHeight: 44, minWidth: 54, justifyContent: 'center', alignItems: 'center', gap: 4,
    paddingHorizontal: 5, borderWidth: 1, borderColor: '#c7d6c9', borderRadius: 11, backgroundColor: studioColors.soft },
  path: { paddingVertical: 2 },
  pathStep: { flexDirection: 'row', alignItems: 'center', minHeight: 60, gap: 10, padding: 8, borderWidth: 1, borderColor: studioColors.rule,
    borderRadius: 12, backgroundColor: studioColors.surface },
  pathDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: studioColors.soft },
  pathLink: { minHeight: 21, borderLeftWidth: 2, borderLeftColor: '#9cb19e', marginLeft: 25, paddingLeft: 13, justifyContent: 'center', paddingVertical: 6 },
  appearance: { minHeight: 129, padding: 8, gap: 5 },
  compactAppearance: { minHeight: 106 },
  appearanceTitle: { color: studioColors.text, fontSize: 14, fontWeight: '700', lineHeight: 20, paddingHorizontal: 2 },
  palettes: { flexDirection: 'row', flex: 1, gap: 6 },
  palette: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60, padding: 4, borderRadius: 11, gap: 2, borderWidth: 1 },
  activePalette: { borderWidth: 2 },
  paletteCheck: { position: 'absolute', top: 4, right: 5 },
  paletteLabel: { fontWeight: '700', fontSize: 13 },
});
