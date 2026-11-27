import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import type { CommitResult } from '../data/gardenWriter';
import type { PlusCommand } from '../data/gardenV3Writer';
import type { GardenStoreV3, MapReturnContext, MapView } from '../domain/plus/contracts';
import { allNotes, captureMapReturn, focusMap, indexMap, mapCell, mapGroups, mapInScope, newMapView,
  outsideMap, placeMap, restoreMapReturn, saveMapView } from '../domain/plus/map';
import type { Seed } from '../domain/types';
import { createId } from '../utils/ids';
import { buildMatchExcerpt, normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusMapPlot } from './PlusMapPlot';
import { Actions, focusControl, Heading, PlusButton, PlusInput, plusStyles } from './PlusUI';

const now = () => new Date().toISOString();
const pageSize = 20;

function SeedRows({ seeds, onPick, inside, search, details, action = '選ぶ' }: {
  seeds: Seed[]; onPick: (id: string) => void; inside?: Set<string>; search?: string; details?: Map<string, string>; action?: string;
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
        <PlusButton label={`${snippet} · ${out ? '地図の外で周辺を開く' : action}`} onPress={() => onPick(seed.id)} />
      </View>;
    })}
    {last > 0 && <Actions>
      <PlusButton label="前の結果" disabled={visiblePage === 0} onPress={() => setPage(visiblePage - 1)} />
      <Text style={plusStyles.meta}>{start + 1}〜{Math.min(start + pageSize, seeds.length)}件目 / {seeds.length}件</Text>
      <PlusButton label="次の結果" disabled={visiblePage >= last} onPress={() => setPage(visiblePage + 1)} />
    </Actions>}
  </View>;
}

type MapProps = {
  store: GardenStoreV3; commit: (command: PlusCommand) => Promise<CommitResult>; initialGroups: MapView['displayGroups'];
  onOpenSeed: (seedId: string, onReturn: () => void) => void; canArrange?: boolean;
};

export function PlusMapScreen({ store, commit, initialGroups, onOpenSeed, canArrange = true }: MapProps) {
  const [view, setView] = React.useState<MapView>(() => ({ ...newMapView(createId(), now()), displayGroups: initialGroups }));
  const [scopeMenu, setScopeMenu] = React.useState(false);
  const [layoutMenu, setLayoutMenu] = React.useState(false);
  const [name, setName] = React.useState('');
  const [groupName, setGroupName] = React.useState('');
  const [marked, setMarked] = React.useState<string[]>([]);
  const [temporary, setTemporary] = React.useState<MapReturnContext>();
  const [notice, setNotice] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [groupPage, setGroupPage] = React.useState(0);
  const [preview, setPreview] = React.useState<{ layout: MapView['positions']; scope: MapView['scope']; original: MapView['positions']; revision: number }>();
  const [undo, setUndo] = React.useState<MapView['positions']>();
  const savingRef = React.useRef(false);
  const saveAttempt = React.useRef<{ fingerprint: string; id: string; at: string }>(undefined);
  const scroller = React.useRef<ScrollView>(null);
  const readControl = React.useRef<View>(null);
  const scroll = React.useRef(0);
  const { fontScale } = useWindowDimensions();

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
  const scopedIds = React.useMemo(() => new Set(graph.byId.keys()), [graph]);
  const expandedId = view.expandedGroupIds?.[0];
  const expanded = view.viewMode === 'overview' ? groups.find((group) => group.id === expandedId) : undefined;
  const plotIds = React.useMemo(() => expanded ? new Set(expanded.seedIds) : focus, [expanded, focus]);
  const plotSeeds = React.useMemo(() => graph.seeds.filter(({ id }) => plotIds.has(id)), [graph.seeds, plotIds]);
  const plotLines = React.useMemo(() => graph.edges.filter((edge) => plotIds.has(edge.aSeedId) && plotIds.has(edge.bSeedId)), [graph.edges, plotIds]);
  const related = selected ? [...graph.adjacent.get(selected.id) ?? []].flatMap((id) => graph.byId.get(id) ?? []) : [];
  const outside = selected ? outsideMap(index, graph, selected.id) : [];
  const selectedEdges = selected ? graph.edges.filter((edge) => edge.aSeedId === selected.id || edge.bSeedId === selected.id) : [];
  const connectionNotes = new Map(selectedEdges.flatMap((edge) => edge.note ? [[edge.aSeedId === selected?.id ? edge.bSeedId : edge.aSeedId, edge.note] as const] : []));
  const otherGroups = new Set(groups.filter((group) => group.kind === 'manual' && group.id !== expanded?.id).flatMap((group) => group.seedIds));
  const crosses = expanded?.kind === 'manual' ? graph.edges.filter((edge) => plotIds.has(edge.aSeedId) !== plotIds.has(edge.bSeedId)) : [];
  const crossGroup = crosses.filter((edge) => otherGroups.has(plotIds.has(edge.aSeedId) ? edge.bSeedId : edge.aSeedId));
  const scopeLabel = view.scope.kind === 'selection' ? '選んだ種を保存' : 'この条件で見る';
  const overview = view.viewMode === 'overview';
  const showPlot = view.presentation !== 'list' && view.viewport.scale > 0.8 && fontScale <= 1.3 && plotSeeds.length > 0;
  const currentGroupPage = Math.min(groupPage, Math.max(0, Math.ceil(groups.length / 8) - 1));

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
    setView((before) => ({ ...before, scope }));
    setGroupPage(0);
    setNotice('');
  }

  async function persistView() {
    if (savingRef.current || !canArrange) return;
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
      if (before.viewMode === 'overview') return { ...before, viewport: { ...before.viewport, scale: 0.75 } };
      const { centerSeedId: _center, expandedHop: _hop, ...rest } = before;
      return { ...rest, viewMode: 'overview', viewport: { ...rest.viewport, scale: 0.75 } };
    });
  }

  function toggleGroup(id: string, firstSeedId: string) {
    setView((before) => {
      const open = before.expandedGroupIds?.includes(id);
      const pos = positions[firstSeedId];
      return { ...before, expandedGroupIds: open ? [] : [id], viewport: open ? { ...before.viewport, scale: 0.75 }
        : { x: pos.x, y: pos.y, scale: 1 } };
    });
  }

  function acceptLayout() {
    if (!preview || !canArrange) return;
    if (preview.scope !== view.scope || preview.original !== view.positions || preview.revision !== store.revision) {
      setNotice('表示する内容が変わりました。配置を考え直せます。');
    } else {
      setUndo(positions);
      setView((before) => ({ ...before, positions: preview.layout }));
      setNotice('配置を更新しました。見方を保存すると次回も開けます。');
    }
    setPreview(undefined);
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
    setPreview({ layout: moved, scope: view.scope, original: view.positions, revision: store.revision });
    setView((before) => ({ ...before, viewport: { ...before.viewport, x: to.x, y: to.y, scale: 1 } }));
  }

  function addGroup() {
    if (!canArrange || !groupName.trim() || !marked.length) return;
    const group = { id: createId(), label: groupName.trim(), seedIds: [...marked], collapsed: true };
    setView((before) => ({ ...before, displayGroups: [...before.displayGroups, group] }));
    setGroupName(''); setMarked([]); setNotice('まとまりを追加しました。見方と一緒に保存できます。');
  }

  const pickSeed = (id: string) => scopedIds.has(id) ? select(id, !focus.has(id)) : openTemporary(id);
  const pan = (dx: number, dy: number) => setView((before) => ({ ...before, viewport: { ...before.viewport, x: before.viewport.x + dx, y: before.viewport.y + dy } }));
  const scopeQuery = view.scope.kind === 'query' ? view.scope.query : allNotes.query;

  return <ScrollView ref={scroller} contentContainerStyle={plusStyles.page} keyboardShouldPersistTaps="handled"
    onScroll={({ nativeEvent }) => { scroll.current = nativeEvent.contentOffset.y; }} scrollEventThrottle={48}>
    <Heading title>考えの地図</Heading>
    <Text style={plusStyles.meta}>{view.name ? `${view.name} · ` : ''}{scopeLabel} · {graph.seeds.length}件{graph.missing ? ` · 表示できない種 ${graph.missing}件` : ''}</Text>
    {temporary && <SectionCard muted><Text style={plusStyles.text}>元の範囲の外を一時表示しています</Text><PlusButton label="元の範囲に戻る" onPress={returnToMap} /></SectionCard>}
    <Actions>
      <PlusButton label="全体" selected={overview} onPress={toggleOverview} />
      <PlusButton label="周辺" selected={!overview} disabled={!selected} onPress={() => selected && select(selected.id, true)} />
      <PlusButton label="図" selected={view.presentation !== 'list'} onPress={() => setView((before) => ({ ...before, presentation: 'plot' }))} />
      <PlusButton label="リスト" selected={view.presentation === 'list'} onPress={() => setView((before) => ({ ...before, presentation: 'list' }))} />
      <PlusButton label="範囲と保存した見方" selected={scopeMenu} onPress={() => setScopeMenu(!scopeMenu)} />
    </Actions>
    <PlusInput accessibilityLabel="地図と全件を探す" placeholder="地図と全件を探す" value={search} onChangeText={(searchText) => setView((before) => ({ ...before, searchText }))} />
    {query && <SectionCard>
      <Heading>検索結果 {results.length}件</Heading>
      {results.length ? <SeedRows key={query} seeds={results} onPick={pickSeed} inside={scopedIds} search={search} /> : <Text style={plusStyles.meta}>一致する種はありません</Text>}
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
        <PlusButton label={saving ? '保存中' : 'この見方を保存'} disabled={saving} primary onPress={() => void persistView()} />
      </>}
      {store.mapViews.map((saved) => <PlusButton key={saved.id} label={`${saved.name || '名前のない見方'}を開く`} onPress={() => {
        setView(saved); setName(saved.name ?? ''); setTemporary(undefined); setPreview(undefined); setUndo(undefined); setNotice('');
      }} />)}
    </SectionCard>}
    {notice !== '' && <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{notice}</Text>}

    {overview && view.presentation !== 'list' && groups.length > 0 && <SectionCard muted>
      <Heading>まとまり</Heading>
      {groups.slice(currentGroupPage * 8, (currentGroupPage + 1) * 8).map((group) => <PlusButton key={group.id}
        label={`${group.label} · ${group.seedIds.length}件${group.kind === 'manual' ? ' · 自分のまとまり' : ''}`}
        selected={expandedId === group.id} onPress={() => toggleGroup(group.id, group.seedIds[0])} />)}
      {groups.length > 8 && <Actions>
        <PlusButton label="前のまとまり" disabled={currentGroupPage === 0} onPress={() => setGroupPage(currentGroupPage - 1)} />
        <PlusButton label="次のまとまり" disabled={(currentGroupPage + 1) * 8 >= groups.length} onPress={() => setGroupPage(currentGroupPage + 1)} />
      </Actions>}
    </SectionCard>}
    {plotSeeds.length === 0 && <Text style={plusStyles.text}>{graph.seeds.length ? '周辺に表示する種を選んでください' : 'この範囲に表示する種はありません'}</Text>}
    {showPlot && <>
      <PlusMapPlot seeds={plotSeeds} connections={plotLines} positions={preview?.layout ?? positions} viewport={view.viewport} selectedId={selected?.id} onSelect={select} />
      <Actions>
        <PlusButton label="左へ" onPress={() => pan(-mapCell.x, 0)} /><PlusButton label="右へ" onPress={() => pan(mapCell.x, 0)} />
        <PlusButton label="上へ" onPress={() => pan(0, -mapCell.y)} /><PlusButton label="下へ" onPress={() => pan(0, mapCell.y)} />
      </Actions>
    </>}
    {view.presentation !== 'list' && plotSeeds.length > 0 && <Actions>
      <PlusButton label="広く見る" onPress={toggleOverview} />
      <PlusButton label="近く見る" disabled={fontScale > 1.3} onPress={() => setView((before) => ({ ...before, viewport: { ...before.viewport, scale: before.viewport.scale > 1 ? 1 : 1.18 } }))} />
    </Actions>}
    {view.viewMode === 'neighborhood' && <Actions><PlusButton label="もう一段見る" disabled={focus.size >= graph.seeds.length ||
      !plotSeeds.some(({ id }) => [...graph.adjacent.get(id) ?? []].some((other) => !focus.has(other)))}
      onPress={() => setView((before) => before.viewMode === 'neighborhood' ? { ...before, expandedHop: before.expandedHop + 1 } : before)} /></Actions>}
    {selected && <SectionCard>
      <Heading>{toSeedSnippet(selected, 60)}</Heading>
      <Text numberOfLines={3} style={plusStyles.original}>{selected.body}</Text>
      <Text style={plusStyles.meta}>選択中 · 範囲内の確定接続 {related.length}件{positions[selected.id]?.pinned ? ' · 位置固定' : ''}</Text>
      <Actions>
        <PlusButton label="全文を読む" primary focusRef={readControl} onPress={() => onOpenSeed(selected.id, () => focusControl(readControl.current))} />
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
      {selectedEdges.length > 0 && <><Heading>つないだ関係</Heading>
        <SeedRows key={selected.id} seeds={related} details={connectionNotes} onPick={(id) => select(id)} /></>}
      {outside.length > 0 && <><Heading>この範囲の外につながる種 {outside.length}件</Heading><SeedRows key={`outside-${selected.id}`} seeds={outside} onPick={openTemporary} action="周辺を開く" /></>}
    </SectionCard>}
    {crosses.length > 0 && <SectionCard><Heading>まとまりをまたぐ確定接続 {crossGroup.length}件</Heading>
      {crossGroup.slice(0, 8).map((edge) => <View key={edge.id} style={plusStyles.rule}>
        <Text style={plusStyles.text}>{toSeedSnippet(graph.byId.get(edge.aSeedId)!, 38)} ↔ {toSeedSnippet(graph.byId.get(edge.bSeedId)!, 38)}</Text>
        {edge.note && <Text style={plusStyles.meta}>{edge.note}</Text>}
      </View>)}{crossGroup.length > 8 && <Text style={plusStyles.meta}>ほか{crossGroup.length - 8}件は各メモの関係から読めます。</Text>}
      {crosses.length > crossGroup.length && <Text style={plusStyles.meta}>まとまりに入っていない種への接続 {crosses.length - crossGroup.length}件</Text>}
    </SectionCard>}
    {(view.presentation === 'list' || expanded || !overview || fontScale > 1.3) && plotSeeds.length > 0 && <SectionCard>
      <Heading>{expanded?.label ?? (overview ? '範囲内の種' : '周辺の種')} · {plotSeeds.length}件</Heading>
      <SeedRows key={`${expandedId}-${view.viewMode}-${view.viewMode === 'neighborhood' ? view.centerSeedId : ''}`} seeds={plotSeeds} onPick={(id) => select(id)} />
    </SectionCard>}
    {canArrange && graph.seeds.length > 0 && <SectionCard>
      <Actions>
        <PlusButton label="地図を整える" onPress={() => setPreview({ layout: placeMap(graph, positions, groups, true), scope: view.scope, original: view.positions, revision: store.revision })} />
        {undo && <PlusButton label="前の配置に戻す" onPress={() => { setView((before) => ({ ...before, positions: undo })); setUndo(undefined); }} />}
      </Actions>
      {preview && <><Text style={plusStyles.meta}>配置のプレビュー</Text><Actions>
        <PlusButton label="この配置にする" primary onPress={acceptLayout} />
        <PlusButton label="配置の変更をやめる" onPress={() => setPreview(undefined)} />
      </Actions></>}
      {marked.length > 0 && <><PlusInput accessibilityLabel="まとまりの名前" placeholder="まとまりの名前" value={groupName} onChangeText={setGroupName} />
        <PlusButton label={`選んだ${marked.length}件でまとまりを作る`} disabled={!groupName.trim()} onPress={addGroup} /></>}
      {saving && <ActivityIndicator accessibilityLabel="見方を保存中" />}
    </SectionCard>}
  </ScrollView>;
}
