import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import type { CommitResult } from '../data/gardenWriter';
import type { PlusCommand } from '../data/gardenV3Writer';
import type { GardenStoreV3, MapReturnContext, MapView } from '../domain/plus/contracts';
import { allNotes, captureMapReturn, focusMap, indexMap, mapCell, mapGroupLinks, mapGroups, mapInScope, mapViewportBounds, newMapView,
  outsideMap, placeMap, restoreMapReturn, saveMapView, type MapGroup } from '../domain/plus/map';
import type { Seed, SeedConnection } from '../domain/types';
import { pairIsBlocked } from '../domain/plus/proposals';
import { createId } from '../utils/ids';
import { buildMatchExcerpt, normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusMapOverview } from './PlusMapOverview';
import { PlusMapPlot } from './PlusMapPlot';
import { Actions, focusControl, Heading, PlusButton, PlusInput, plusStyles } from './PlusUI';

const now = () => new Date().toISOString();
const pageSize = 20;
const groupPageSize = 6;
type OpenSeed = (id: string, onReturn: () => void) => void;

function ReadSeedButton({ seed, onRead }: { seed: Seed; onRead: OpenSeed }) {
  const control = React.useRef<View>(null);
  return <PlusButton label={`${toSeedSnippet(seed, 65)}の原文を開く`} focusRef={control}
    onPress={() => onRead(seed.id, () => focusControl(control.current))} />;
}

function SeedRows({ seeds, onPick, inside, search, details, onRead, action = '選ぶ' }: {
  seeds: Seed[]; onPick: (id: string) => void; inside?: Set<string>; search?: string; details?: Map<string, string>; action?: string;
  onRead?: OpenSeed;
}) {
  const [page, setPage] = React.useState(0);
  const last = Math.max(0, Math.ceil(seeds.length / pageSize) - 1);
  const visiblePage = Math.min(page, last);
  const start = visiblePage * pageSize;
  return <View style={plusStyles.row}>
    {seeds.slice(start, start + pageSize).map((seed) => {
      const out = inside && !inside.has(seed.id);
      const snippet = toSeedSnippet(seed, 65);
      const match = search && buildMatchExcerpt(seed, search);
      const detail = details?.get(seed.id);
      return <View key={seed.id} style={plusStyles.rule}>
        {match && <Text style={plusStyles.meta}>{match.text}</Text>}
        {detail && <Text style={plusStyles.meta}>{snippet} · {detail}</Text>}
        <Actions><PlusButton label={`${snippet} · ${out ? '地図の外で周辺を開く' : action}`} onPress={() => onPick(seed.id)} />
          {onRead && !out && <ReadSeedButton seed={seed} onRead={onRead} />}
        </Actions>
      </View>;
    })}
    {last > 0 && <Actions>
      <PlusButton label="前の結果" disabled={visiblePage === 0} onPress={() => setPage(visiblePage - 1)} />
      <Text style={plusStyles.meta}>{start + 1}〜{Math.min(start + pageSize, seeds.length)}件目 / {seeds.length}件</Text>
      <PlusButton label="次の結果" disabled={visiblePage >= last} onPress={() => setPage(visiblePage + 1)} />
    </Actions>}
  </View>;
}

function RelatedNotes({ seeds, notes, onPick, onRead }: {
  seeds: Seed[]; notes: Map<string, string>; onPick: (id: string) => void; onRead: OpenSeed;
}) {
  const [search, setSearch] = React.useState('');
  const query = normalizeSearchText(search.trim());
  const results = query ? seeds.filter((seed) => searchableText(seed).includes(query) || normalizeSearchText(notes.get(seed.id) ?? '').includes(query)) : seeds;
  return <View style={plusStyles.row}>
    <Heading>つないだ関係</Heading>
    {seeds.length > pageSize && <PlusInput accessibilityLabel="この種のつながりを探す" placeholder="この種のつながりを探す" value={search} onChangeText={setSearch} />}
    {query && <Text style={plusStyles.meta}>つながりの検索結果 {results.length}件</Text>}
    {results.length > 0 ? <SeedRows key={query} seeds={results} details={notes} search={search} onPick={onPick} onRead={onRead} /> :
      <Text style={plusStyles.meta}>一致するつながりはありません</Text>}
  </View>;
}

function GroupConnections({ edges, otherCount, seeds, onRead }: {
  edges: SeedConnection[]; otherCount: number; seeds: ReadonlyMap<string, Seed>; onRead: OpenSeed;
}) {
  const [shown, setShown] = React.useState(8);
  return <SectionCard><Heading>まとまりをまたぐ確定接続 {edges.length}件</Heading>
    {edges.slice(0, shown).map((edge) => {
      const a = seeds.get(edge.aSeedId)!;
      const b = seeds.get(edge.bSeedId)!;
      return <View key={edge.id} style={plusStyles.rule}>
        <Text style={plusStyles.text}>{toSeedSnippet(a, 38)} ↔ {toSeedSnippet(b, 38)}</Text>
        {edge.note && <Text style={plusStyles.meta}>{edge.note}</Text>}
        <Actions><ReadSeedButton seed={a} onRead={onRead} /><ReadSeedButton seed={b} onRead={onRead} /></Actions>
      </View>;
    })}
    {edges.length > shown && <PlusButton label={`さらに見る · 残り${edges.length - shown}件`} onPress={() => setShown(shown + 8)} />}
    {otherCount > 0 && <Text style={plusStyles.meta}>このまとまりの外の種との確定接続が、ほかに{otherCount}件あります。</Text>}
  </SectionCard>;
}

type MapProps = {
  store: GardenStoreV3; commit: (command: PlusCommand) => Promise<CommitResult>; initialGroups: MapView['displayGroups'];
  onOpenSeed: OpenSeed; canArrange?: boolean;
  onOpenCandidates?: (seedId: string, scope: string[], context: MapReturnContext) => void;
  onOpenAtelier?: (seedId: string, materials: string[], context: MapReturnContext) => void;
  restoreContext?: MapReturnContext;
};

export function PlusMapScreen({ store, commit, initialGroups, onOpenSeed, canArrange = true, onOpenCandidates, onOpenAtelier, restoreContext }: MapProps) {
  const [view, setView] = React.useState<MapView>(() => ({ ...newMapView(createId(), now()), displayGroups: initialGroups }));
  const [scopeMenu, setScopeMenu] = React.useState(false);
  const [layoutMenu, setLayoutMenu] = React.useState(false);
  const [name, setName] = React.useState('');
  const [groupName, setGroupName] = React.useState('');
  const [marked, setMarked] = React.useState<string[]>([]);
  const [materials, setMaterials] = React.useState<string[]>([]);
  const [temporary, setTemporary] = React.useState<MapReturnContext>();
  const [notice, setNotice] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [showCandidates, setShowCandidates] = React.useState(false);
  const [groupPage, setGroupPage] = React.useState(0);
  const [preview, setPreview] = React.useState<{
    layout: MapView['positions']; scope: MapView['scope']; original: MapView['positions']; revision: number; beforeViewport: MapView['viewport'];
  }>();
  const [undo, setUndo] = React.useState<Pick<MapView, 'positions' | 'viewport'>>();
  const savingRef = React.useRef(false);
  const saveAttempt = React.useRef<{ fingerprint: string; id: string; at: string }>(undefined);
  const scroller = React.useRef<ScrollView>(null);
  const readControl = React.useRef<View>(null);
  const scroll = React.useRef(0);
  const { fontScale } = useWindowDimensions();
  const restoredContext = React.useRef<MapReturnContext>(undefined);
  React.useEffect(() => {
    if (!restoreContext || restoredContext.current === restoreContext) return;
    restoredContext.current = restoreContext;
    const restored = restoreMapReturn(restoreContext, store.mapViews, createId(), now());
    setView(restored.view); setName(restored.view.name ?? ''); setMarked(restoreContext.rangeSeedIds ?? []);
    setTemporary(undefined); setPreview(undefined); setUndo(undefined);
    setNotice(restored.changed ? '元の見方に更新がありました。当時の配置を一時表示しています。' : '制作を始めた地図に戻りました');
    requestAnimationFrame(() => scroller.current?.scrollTo({ y: restored.scroll, animated: false }));
  }, [restoreContext, store.mapViews]);

  const index = React.useMemo(() => indexMap(store.seeds, store.connections), [store.seeds, store.connections]);
  const graph = React.useMemo(() => mapInScope(index, view.scope), [index, view.scope]);
  const groups = React.useMemo(() => mapGroups(graph, view.displayGroups), [graph, view.displayGroups]);
  const positions = React.useMemo(() => placeMap(graph, view.positions, groups), [graph, view.positions, groups]);
  React.useEffect(() => {
    if (Object.keys(positions).length === Object.keys(view.positions).length) return;
    setView((before) => before.id === view.id && before.positions === view.positions ? { ...before, positions } : before);
  }, [positions, view.id, view.positions]);
  const center = view.viewMode === 'neighborhood' ? view.centerSeedId : undefined;
  const hops = view.viewMode === 'neighborhood' ? view.expandedHop : 1;
  const focus = React.useMemo(() => focusMap(graph, center ? { viewMode: 'neighborhood', centerSeedId: center, expandedHop: hops } : { viewMode: 'overview' }), [graph, center, hops]);
  const selected = view.selectedSeedId && graph.byId.get(view.selectedSeedId) || undefined;
  const search = view.searchText ?? '';
  const query = normalizeSearchText(search.trim());
  const results = React.useMemo(() => query ? index.live.filter((seed) => searchableText(seed).includes(query)) : [], [index, query]);
  const searchDetails = new Map(center ? [...graph.adjacent.get(center) ?? []].map((id) =>
    [id, `${toSeedSnippet(graph.byId.get(center)!, 38)}につながる`] as const) : []);
  const scopedIds = React.useMemo(() => new Set(graph.byId.keys()), [graph]);
  const expandedId = view.expandedGroupIds?.[0];
  const expanded = view.viewMode === 'overview' ? groups.find((group) => group.id === expandedId) : undefined;
  const plotIds = React.useMemo(() => expanded ? new Set(expanded.seedIds) : focus, [expanded, focus]);
  const plotSeeds = React.useMemo(() => graph.seeds.filter(({ id }) => plotIds.has(id)), [graph.seeds, plotIds]);
  const plotLines = React.useMemo(() => graph.edges.filter((edge) => plotIds.has(edge.aSeedId) && plotIds.has(edge.bSeedId)), [graph.edges, plotIds]);
  const plotPositions = preview?.layout ?? positions;
  const bounds = React.useMemo(() => mapViewportBounds(plotIds, plotPositions), [plotIds, plotPositions]);
  const candidates = showCandidates && selected ? store.connectionProposals.filter((proposal) => proposal.decision === 'pending' && proposal.availability === 'ready' &&
    proposal.pair.includes(selected.id) && proposal.pair.every((id) => plotIds.has(id)) && !pairIsBlocked(store, ...proposal.pair)) : undefined;
  const related = selected ? [...graph.adjacent.get(selected.id) ?? []].flatMap((id) => graph.byId.get(id) ?? []) : [];
  const outside = selected ? outsideMap(index, graph, selected.id) : [];
  const selectedEdges = selected ? graph.edges.filter((edge) => edge.aSeedId === selected.id || edge.bSeedId === selected.id) : [];
  const connectionNotes = new Map(selectedEdges.flatMap((edge) => edge.note ? [[edge.aSeedId === selected?.id ? edge.bSeedId : edge.aSeedId, edge.note] as const] : []));
  const groupConnections = React.useMemo(() => {
    if (expanded?.kind !== 'manual') return { edges: [], otherCount: 0 };
    const shared = new Set(mapGroupLinks(graph.edges, groups, expanded.id).flatMap(({ edges }) => edges.map(({ id }) => id)));
    const crossing = graph.edges.filter(({ aSeedId, bSeedId }) => plotIds.has(aSeedId) !== plotIds.has(bSeedId));
    return { edges: crossing.filter(({ id }) => shared.has(id)), otherCount: crossing.length - shared.size };
  }, [expanded, graph.edges, groups, plotIds]);
  const scopeQuery = view.scope.kind === 'query' ? view.scope.query : allNotes.query;
  const filtered = scopeQuery.text.trim() || scopeQuery.tags.length > 0 || scopeQuery.growthStates.length > 0 ||
    scopeQuery.connection !== 'all' || scopeQuery.hasSynthesis !== undefined;
  const scopeLabel = view.scope.kind === 'selection' ? '選んだ種を保存' : filtered ? 'この条件で見る' : 'すべての種';
  const overview = view.viewMode === 'overview';
  const largeText = fontScale > 1.3;
  const listMode = view.presentation === 'list' || largeText;
  const showPlot = !listMode && plotSeeds.length > 0 && (view.viewport.scale > 0.8 || Boolean(expanded));
  const lastGroupPage = Math.max(0, Math.ceil(groups.length / groupPageSize) - 1);
  const currentGroupPage = Math.min(groupPage, lastGroupPage);
  const pageGroups = React.useMemo(() => groups.slice(currentGroupPage * groupPageSize, (currentGroupPage + 1) * groupPageSize), [currentGroupPage, groups]);
  const cameraAnchor = [selected?.id, center].find((id) => id && plotIds.has(id)) ?? plotSeeds[0]?.id;
  const anchorPosition = cameraAnchor && Object.hasOwn(plotPositions, cameraAnchor) ? plotPositions[cameraAnchor] : undefined;

  function readSeed(id: string, onReturn: () => void) {
    const offset = scroll.current;
    onOpenSeed(id, () => {
      scroller.current?.scrollTo({ y: offset, animated: false });
      onReturn();
    });
  }

  function select(id: string, center = false) {
    const { x, y } = positions[id] ?? { x: 0, y: 0 };
    setView((before) => {
      const next = { ...before, selectedSeedId: id, positions, viewport: { x, y, scale: Math.max(before.viewport.scale, 1) } };
      return center ? { ...next, viewMode: 'neighborhood', centerSeedId: id, expandedHop: 1 } : next;
    });
  }

  function openTemporary(id: string) {
    if (!temporary) {
      const context = captureMapReturn({ ...view, positions }, store.mapViews, scroll.current);
      setTemporary({ ...context, rangeSeedIds: marked });
    }
    const all = mapInScope(index, allNotes);
    const temporaryPositions = placeMap(all, positions, mapGroups(all, []));
    const position = temporaryPositions[id] ?? { x: 0, y: 0 };
    setView({ ...newMapView(createId(), now()), positions: temporaryPositions, viewport: { x: position.x, y: position.y, scale: 1 },
      viewMode: 'neighborhood', centerSeedId: id, expandedHop: 1, selectedSeedId: id });
    setName('');
    setPreview(undefined);
    setUndo(undefined);
    setNotice('');
  }

  function returnToMap() {
    if (!temporary) return;
    const restored = restoreMapReturn(temporary, store.mapViews, createId(), now());
    setView(restored.view);
    setMarked(temporary.rangeSeedIds ?? []);
    setName(restored.view.name ?? '');
    setTemporary(undefined);
    setPreview(undefined);
    setUndo(undefined);
    setNotice(restored.changed ? '元の見方に更新がありました。当時の配置を一時表示しています。' : '元の範囲に戻りました');
    requestAnimationFrame(() => scroller.current?.scrollTo({ y: restored.scroll, animated: false }));
  }

  function changeScope(scope: MapView['scope']) {
    setView((before) => ({ ...before, scope, viewport: preview?.beforeViewport ?? before.viewport }));
    setGroupPage(0);
    setPreview(undefined);
    setUndo(undefined);
    setNotice('');
  }

  async function persistView() {
    if (savingRef.current || !canArrange || preview) return;
    const draft = { ...view, positions, name: name.trim() || undefined };
    const fingerprint = JSON.stringify(draft);
    if (saveAttempt.current?.fingerprint !== fingerprint) saveAttempt.current = { fingerprint, id: createId(), at: now() };
    const operation = saveAttempt.current;
    savingRef.current = true;
    setSaving(true);
    setNotice('');
    try {
      const result = await commit(saveMapView(operation.id, { ...draft, updatedAt: operation.at }));
      if (!result.ok) { setNotice(result.detail ?? '見方を保存できませんでした。もう一度試せます。'); return; }
      setView((before) => before.id === draft.id && before.revision === draft.revision
        ? { ...before, positions: before.positions === view.positions ? positions : before.positions, revision: draft.revision + 1, name: draft.name, updatedAt: operation.at }
        : before);
      setNotice('見方を保存しました');
    } finally { savingRef.current = false; setSaving(false); }
  }

  function toggleOverview() {
    setView((before) => {
      const viewport = { ...before.viewport, scale: 0.75 };
      if (before.viewMode === 'overview') return { ...before, expandedGroupIds: [], viewport };
      const { centerSeedId: _center, expandedHop: _hop, ...rest } = before;
      return { ...rest, viewMode: 'overview', expandedGroupIds: [], viewport };
    });
  }

  function toggleGroup(group: MapGroup) {
    const { id, seedIds } = group;
    setView((before) => {
      const open = before.expandedGroupIds?.includes(id);
      const selection = before.selectedSeedId && seedIds.includes(before.selectedSeedId) ? before.selectedSeedId : undefined;
      const first = selection ?? seedIds[0];
      const pos = plotPositions[first] ?? positions[first];
      return { ...before, expandedGroupIds: open ? [] : [id], selectedSeedId: open ? before.selectedSeedId : selection, viewport: open || !pos ? { ...before.viewport, scale: 0.75 }
        : { x: pos.x, y: pos.y, scale: 1 } };
    });
  }

  function acceptLayout() {
    if (!preview || !canArrange) return;
    if (preview.scope !== view.scope || preview.original !== view.positions || preview.revision !== store.revision) {
      setNotice('表示する内容が変わりました。配置を考え直せます。');
      cancelLayout();
    } else {
      setUndo({ positions, viewport: preview.beforeViewport });
      setView((before) => ({ ...before, positions: preview.layout }));
      setNotice('配置を更新しました。見方を保存すると次回も開けます。');
      setPreview(undefined);
    }
  }

  function cancelLayout() {
    if (preview) setView((before) => ({ ...before, viewport: preview.beforeViewport }));
    setPreview(undefined);
  }

  function stageLayout(layout: MapView['positions'], anchorId = cameraAnchor) {
    if (!canArrange) return;
    setPreview({ layout, scope: view.scope, original: view.positions, revision: store.revision, beforeViewport: preview?.beforeViewport ?? view.viewport });
    const target = anchorId && Object.hasOwn(layout, anchorId) ? layout[anchorId] : undefined;
    if (target) setView((before) => ({ ...before, viewport: { x: target.x, y: target.y, scale: 1 } }));
  }

  function stageMove(dx: number, dy: number) {
    if (!selected || positions[selected.id]?.pinned) return;
    const from = positions[selected.id];
    if (!from) return;
    const to = { x: from.x + dx, y: from.y + dy, pinned: false };
    const occupied = Object.entries(positions).find(([, pos]) => pos.x === to.x && pos.y === to.y);
    if (occupied?.[1].pinned) { setNotice('その位置には固定した種があります'); return; }
    const moved = { ...positions, [selected.id]: to };
    if (occupied) moved[occupied[0]] = from;
    stageLayout(moved, selected.id);
  }

  function addGroup() {
    if (!canArrange || !groupName.trim() || !marked.length) return;
    const group = { id: createId(), label: groupName.trim(), seedIds: [...marked], collapsed: true };
    setView((before) => ({ ...before, displayGroups: [...before.displayGroups, group] }));
    setGroupName(''); setMarked([]); setNotice('まとまりを追加しました。見方と一緒に保存できます。');
  }

  const pickSeed = (id: string) => scopedIds.has(id) ? select(id, !plotIds.has(id)) : openTemporary(id);
  function pan(dx: number, dy: number) {
    if (!bounds) return;
    setView((before) => ({ ...before, viewport: { ...before.viewport,
      x: Math.max(bounds.left, Math.min(bounds.right, before.viewport.x + dx)),
      y: Math.max(bounds.top, Math.min(bounds.bottom, before.viewport.y + dy)),
    } }));
  }
  return <ScrollView ref={scroller} contentContainerStyle={plusStyles.page} keyboardShouldPersistTaps="handled"
    onScroll={({ nativeEvent }) => { scroll.current = nativeEvent.contentOffset.y; }} scrollEventThrottle={48}>
    <Heading title>考えの地図</Heading>
    <Text style={plusStyles.meta}>{view.name ? `${view.name} · ` : ''}{scopeLabel} · {graph.seeds.length}件{graph.missing ? ` · 表示できない種 ${graph.missing}件` : ''}</Text>
    {temporary && <SectionCard muted><Text style={plusStyles.text}>元の範囲の外を一時表示しています</Text><PlusButton label="元の範囲に戻る" onPress={returnToMap} /></SectionCard>}
    <Actions>
      <PlusButton label="全体" selected={overview} onPress={toggleOverview} />
      <PlusButton label="周辺" selected={!overview} disabled={!selected} onPress={() => selected && select(selected.id, true)} />
      <PlusButton label="図" selected={!listMode} disabled={largeText} onPress={() => setView((before) => ({ ...before, presentation: 'plot' }))} />
      <PlusButton label="リスト" selected={listMode} onPress={() => setView((before) => ({ ...before, presentation: 'list' }))} />
      <PlusButton label="範囲と保存した見方" selected={scopeMenu} onPress={() => setScopeMenu(!scopeMenu)} />
    </Actions>
    {largeText && <Text style={plusStyles.meta}>大きい文字ではリストで表示します。</Text>}
    <PlusInput accessibilityLabel="地図と全件を探す" placeholder="地図と全件を探す" value={search} onChangeText={(searchText) => setView((before) => ({ ...before, searchText }))} />
    {query && <SectionCard>
      <Heading>検索結果 {results.length}件</Heading>
      {results.length ? <SeedRows key={query} seeds={results} onPick={pickSeed} inside={scopedIds} search={search} details={searchDetails}
        onRead={readSeed} /> : <Text style={plusStyles.meta}>一致する種はありません</Text>}
      <PlusButton label="検索を閉じる" onPress={() => setView((before) => ({ ...before, searchText: '' }))} />
    </SectionCard>}
    {scopeMenu && <SectionCard>
      <Heading>表示する範囲</Heading>
      {canArrange && <>
        <PlusInput accessibilityLabel="範囲に使う検索語" placeholder="条件として残す検索語" value={view.scope.kind === 'query' ? scopeQuery.text : ''}
          onChangeText={(text) => changeScope({ kind: 'query', query: { ...scopeQuery, text } })} />
        <Actions>
          <PlusButton label="すべての種" onPress={() => changeScope(allNotes)} />
          <PlusButton label={marked.length ? `選んだ${marked.length}件を固定` : '表示中の種を固定'}
            onPress={() => changeScope({ kind: 'selection', seedIds: marked.length ? marked : graph.seeds.map(({ id }) => id) })} />
          <PlusButton label="つながりのない種だけ" selected={scopeQuery.connection === 'unlinked'}
            onPress={() => changeScope({ kind: 'query', query: { ...scopeQuery, connection: 'unlinked' } })} />
        </Actions>
        <Text style={plusStyles.meta}>条件で保存すると、あとで条件に合う種も表示されます。</Text>
        <PlusInput accessibilityLabel="見方の名前" placeholder="見方の名前（任意）" value={name} onChangeText={setName} />
        <PlusButton label={saving ? '保存中' : 'この見方を保存'} disabled={saving || Boolean(preview)} primary onPress={() => void persistView()} />
      </>}
      {store.mapViews.map((saved) => <PlusButton key={saved.id} label={`${saved.name || '名前のない見方'}を開く`} onPress={() => {
        setView(saved); setName(saved.name ?? ''); setTemporary(undefined); setPreview(undefined); setUndo(undefined); setNotice('');
        const activeGroup = saved.expandedGroupIds?.[0];
        const groupIndex = activeGroup ? mapGroups(mapInScope(index, saved.scope), saved.displayGroups).findIndex((group) => group.id === activeGroup) : 0;
        setGroupPage(Math.floor(Math.max(0, groupIndex) / groupPageSize));
      }} />)}
    </SectionCard>}
    {notice !== '' && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{notice}</Text>}

    {overview && groups.length > 0 && <View style={plusStyles.row}>
      <Heading>まとまり</Heading>
      <PlusMapOverview groups={pageGroups} edges={graph.edges} diagram={!listMode && !showPlot} expandedId={expanded?.id} onGroup={toggleGroup} />
      {!expanded && groups.reduce((sum, group) => sum + group.seedIds.length, 0) > graph.seeds.length &&
        <Text style={plusStyles.meta}>複数のまとまりにある種を含みます。</Text>}
      {lastGroupPage > 0 && <Actions>
        <PlusButton label="前のまとまり" disabled={currentGroupPage === 0} onPress={() => setGroupPage(currentGroupPage - 1)} />
        <Text style={plusStyles.meta}>{currentGroupPage * groupPageSize + 1}〜{Math.min((currentGroupPage + 1) * groupPageSize, groups.length)}組目 / {groups.length}組</Text>
        <PlusButton label="次のまとまり" disabled={currentGroupPage === lastGroupPage} onPress={() => setGroupPage(currentGroupPage + 1)} />
      </Actions>}
    </View>}
    {plotSeeds.length === 0 && <Text style={plusStyles.text}>{graph.seeds.length ? '周辺に表示する種を選んでください' : 'この範囲に表示する種はありません'}</Text>}
    {preview && <SectionCard muted><Heading>配置のプレビュー</Heading><Actions>
      <PlusButton label="この配置にする" primary disabled={!canArrange} onPress={acceptLayout} />
      <PlusButton label="配置の変更をやめる" onPress={cancelLayout} />
    </Actions></SectionCard>}
    {showPlot && <>
      <PlusMapPlot seeds={plotSeeds} connections={plotLines} candidates={candidates} positions={plotPositions} viewport={view.viewport} selectedId={selected?.id}
        onSelect={(id) => setView((before) => ({ ...before, selectedSeedId: id }))} />
      <Actions>
        <PlusButton label="左へ" disabled={!bounds || view.viewport.x <= bounds.left} onPress={() => pan(-mapCell.x, 0)} />
        <PlusButton label="右へ" disabled={!bounds || view.viewport.x >= bounds.right} onPress={() => pan(mapCell.x, 0)} />
        <PlusButton label="上へ" disabled={!bounds || view.viewport.y <= bounds.top} onPress={() => pan(0, -mapCell.y)} />
        <PlusButton label="下へ" disabled={!bounds || view.viewport.y >= bounds.bottom} onPress={() => pan(0, mapCell.y)} />
        {anchorPosition && <PlusButton label={selected?.id === cameraAnchor ? '選択中の種へ' : '種のある位置へ'}
          disabled={view.viewport.x === anchorPosition.x && view.viewport.y === anchorPosition.y}
          onPress={() => setView((before) => ({ ...before, viewport: { x: anchorPosition.x, y: anchorPosition.y, scale: before.viewport.scale } }))} />}
      </Actions>
    </>}
    {!listMode && plotSeeds.length > 0 && <Actions>
      {showPlot && <PlusButton label="広く見る" onPress={toggleOverview} />}
      <PlusButton label="近く見る" onPress={() => setView((before) => ({ ...before, viewport: {
        x: !showPlot && anchorPosition ? anchorPosition.x : before.viewport.x,
        y: !showPlot && anchorPosition ? anchorPosition.y : before.viewport.y,
        scale: before.viewport.scale > 1 ? 1 : showPlot ? 1.18 : 1,
      } }))} />
    </Actions>}
    {view.viewMode === 'neighborhood' && <Actions><PlusButton label="もう一段見る" disabled={focus.size >= graph.seeds.length ||
      !plotSeeds.some(({ id }) => [...graph.adjacent.get(id) ?? []].some((other) => !focus.has(other)))}
      onPress={() => setView((before) => before.viewMode === 'neighborhood' ? { ...before, expandedHop: before.expandedHop + 1 } : before)} /></Actions>}
    {(groupConnections.edges.length > 0 || groupConnections.otherCount > 0) && <GroupConnections key={expandedId} {...groupConnections} seeds={graph.byId} onRead={readSeed} />}
    {selected && <SectionCard>
      <Heading>{toSeedSnippet(selected, 60)}</Heading>
      <Text numberOfLines={3} style={plusStyles.original}>{selected.body}</Text>
      <Text style={plusStyles.meta}>選択中 · 範囲内の確定接続 {related.length}件{positions[selected.id]?.pinned ? ' · 位置固定' : ''}</Text>
      <Actions>
        <PlusButton label="全文を読む" primary focusRef={readControl} onPress={() => readSeed(selected.id, () => focusControl(readControl.current))} />
        {onOpenCandidates && <PlusButton label="候補を見る" onPress={() => {
          setShowCandidates(true);
          onOpenCandidates(selected.id, [...scopedIds], captureMapReturn({ ...view, positions }, store.mapViews, scroll.current));
        }} />}
        {onOpenAtelier && <>
          <PlusButton label={materials.includes(selected.id) ? '参考から外す' : '参考にする'} onPress={() => setMaterials((before) =>
            before.includes(selected.id) ? before.filter((id) => id !== selected.id) : [...before, selected.id])} />
          <PlusButton label={materials.length ? `アトリエで開く · 材料${materials.length}件` : 'アトリエで開く'} onPress={() =>
            onOpenAtelier(selected.id, materials.length ? materials : [selected.id], captureMapReturn({ ...view, positions }, store.mapViews, scroll.current))} />
        </>}
        {showCandidates && Boolean(candidates?.length) && <PlusButton label="点線を隠す" onPress={() => setShowCandidates(false)} />}
        {canArrange && <PlusButton label={marked.includes(selected.id) ? '範囲の選択から外す' : '範囲の選択に加える'} onPress={() => setMarked((before) =>
          before.includes(selected.id) ? before.filter((id) => id !== selected.id) : [...before, selected.id])} />}
        {canArrange && <PlusButton label="配置を変える" onPress={() => setLayoutMenu(!layoutMenu)} />}
      </Actions>
      {layoutMenu && canArrange && <View style={plusStyles.row}>
        <Actions>
          <PlusButton label={positions[selected.id]?.pinned ? '位置の固定を外す' : '位置を固定'} onPress={() => setView((before) => ({ ...before,
            positions: { ...positions, [selected.id]: { ...positions[selected.id], pinned: !positions[selected.id].pinned } } }))} />
          {!positions[selected.id]?.pinned && <>
            <PlusButton label="左に置く" onPress={() => stageMove(-mapCell.x, 0)} /><PlusButton label="右に置く" onPress={() => stageMove(mapCell.x, 0)} />
            <PlusButton label="上に置く" onPress={() => stageMove(0, -mapCell.y)} /><PlusButton label="下に置く" onPress={() => stageMove(0, mapCell.y)} />
          </>}
        </Actions>
      </View>}
      {selectedEdges.length > 0 && <RelatedNotes key={selected.id} seeds={related} notes={connectionNotes} onPick={(id) => select(id)} onRead={readSeed} />}
      {outside.length > 0 && <><Heading>この範囲の外につながる種 {outside.length}件</Heading><SeedRows key={`outside-${selected.id}`} seeds={outside} onPick={openTemporary} action="周辺を開く" /></>}
    </SectionCard>}
    {(listMode || expanded || !overview || showPlot) && plotSeeds.length > 0 && <SectionCard>
      <Heading>{expanded?.label ?? (overview ? '範囲内の種' : '周辺の種')} · {plotSeeds.length}件</Heading>
      <SeedRows key={`${expandedId}-${view.viewMode}-${view.viewMode === 'neighborhood' ? view.centerSeedId : ''}`} seeds={plotSeeds} onPick={(id) => select(id)} />
    </SectionCard>}
    {canArrange && graph.seeds.length > 0 && <SectionCard>
      <Actions>
        <PlusButton label="地図を整える" onPress={() => stageLayout(placeMap(graph, positions, groups, true))} />
        {undo && !preview && <PlusButton label="前の配置に戻す" onPress={() => { setView((before) => ({ ...before, ...undo })); setUndo(undefined); }} />}
      </Actions>
      {marked.length > 0 && <><PlusInput accessibilityLabel="まとまりの名前" placeholder="まとまりの名前" value={groupName} onChangeText={setGroupName} />
        <PlusButton label={`選んだ${marked.length}件でまとまりを作る`} disabled={!groupName.trim()} onPress={addGroup} /></>}
      {saving && <ActivityIndicator accessibilityLabel="見方を保存中" />}
    </SectionCard>}
  </ScrollView>;
}
