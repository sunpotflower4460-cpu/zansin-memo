import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { connectionId } from '../data/gardenModel';
import type { MapIndex } from '../domain/plus/map';
import { studioAtlas, studioGroupPreview, studioRoute, type AtlasGroup } from '../domain/plus/studioAtlas';
import { buildMatchExcerpt, toSeedSnippet } from '../utils/seedText';
import { focusControl } from './PlusUI';
import { StudioMaterialAction, type StudioMaterials } from './StudioMaterials';
import { StudioNoteList } from './StudioNoteList';
import { IconButton, StudioAction, studioColors, studioStyles, type StudioIcon } from './StudioUI';

const batch = 8;
const groupIcons: Record<AtlasGroup['kind'], StudioIcon> = {
  branch: 'git-branch-outline', reason: 'link-outline', category: 'pricetag-outline', word: 'text-outline',
  direct: 'link-outline', component: 'git-network-outline', isolated: 'document-text-outline',
};

function GroupRow({ group, index, atlas, onPress }: {
  group: AtlasGroup; index: MapIndex; atlas: ReturnType<typeof studioAtlas>; onPress: () => void;
}) {
  const route = group.furthestId ? studioRoute(atlas, group.furthestId) : [];
  const noteTitle = (id: string) => toSeedSnippet(index.byId.get(id)!, 21);
  const path = route.length > 4 ? [noteTitle(route[2]), '…', noteTitle(route.at(-1)!)] : route.slice(2).map(noteTitle);
  const subtitle = group.kind === 'reason' ? 'つながりに添えた理由が同じ'
    : group.kind === 'category' ? '直接つながる、同じカテゴリのメモ'
      : group.kind === 'word' ? '本文に共通の言葉があるメモ'
        : group.kind === 'branch' ? `このメモを経由 · 最長 ${route.length - 1}つ先` : undefined;
  const preview = path.length ? path.join(' → ') : studioGroupPreview(index, group.seedIds, group.title);
  return <Pressable accessibilityRole="button" accessibilityLabel={`「${group.title}」のまとまりを開く`}
    accessibilityHint={[`${group.seedIds.length}件`, subtitle, preview].filter(Boolean).join('。')} onPress={onPress}
    style={({ pressed }) => [styles.group, pressed && styles.pressed]}>
    <View style={styles.groupLead}>
      <Ionicons name={groupIcons[group.kind]} size={17} color={studioColors.green} />
    </View>
    <View style={studioStyles.grow}>
      <Text numberOfLines={2} style={styles.groupTitle}>{group.title}</Text>
      {subtitle && <Text style={styles.groupLabel}>{subtitle}</Text>}
      {preview && <Text numberOfLines={2} style={styles.groupPreview}>{preview}</Text>}
    </View>
    <Text style={styles.count}>{group.seedIds.length}件</Text>
    <Ionicons name="chevron-forward" size={14} color={studioColors.muted} />
  </Pressable>;
}

type ReadFromAtlas = (id: string, onReturn?: () => void, backLabel?: string) => void;

function RouteStep({ id, title, reason, last, onRead }: {
  id: string; title: string; reason?: string; last: boolean; onRead: ReadFromAtlas;
}) {
  const button = React.useRef<View>(null);
  return <View style={styles.step}>
    {!!reason && <Text style={styles.stepReason}>{reason}</Text>}
    {last ? <Text style={[styles.stepTitle, styles.stepEnd]}>{title}</Text> :
      <Pressable ref={button} accessibilityRole="button" accessibilityLabel={`「${title}」の原文を開く`}
        style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
        onPress={() => onRead(id, () => focusControl(button.current), '経路に戻る')}>
        <Text style={[styles.stepTitle, studioStyles.grow]}>{title}</Text>
        <Ionicons name="document-text-outline" size={16} color={studioColors.green} />
      </Pressable>}
  </View>;
}

export function StudioAtlas({ index, centerId, onFocus, onRead, materials }: {
  index: MapIndex; centerId: string; onFocus: (id: string) => void; onRead: ReadFromAtlas; materials?: StudioMaterials;
}) {
  const atlas = React.useMemo(() => studioAtlas(index, centerId), [index, centerId]);
  const [scope, setScope] = React.useState<'all' | 'apart' | AtlasGroup>();
  const [picked, setPicked] = React.useState<string>();
  const [limit, setLimit] = React.useState(batch);
  const [routeLimit, setRouteLimit] = React.useState(8);
  const scroll = React.useRef<ScrollView>(null);
  const back = React.useRef<View>(null);
  const read = React.useRef<View>(null);
  const center = index.byId.get(centerId)!;
  const selected = picked && index.byId.get(picked);
  const group = typeof scope === 'object' ? atlas.nearby.find(({ id }) => id === scope.id) ?? atlas.apart.find(({ id }) => id === scope.id) : undefined;
  const otherCount = index.live.length - atlas.depth.size;
  const route = selected ? studioRoute(atlas, selected.id) : [];
  const ids = group?.seedIds;
  const details = React.useMemo(() => {
    const descriptions = new Map<string, string>();
    for (const id of group?.seedIds ?? []) {
      const via = atlas.parent.get(id);
      if (!via) continue;
      const reason = atlas.edgeNotes.get(connectionId(via, id));
      if (via !== centerId) {
        descriptions.set(id, `${atlas.depth.get(id)}つ先 · 「${toSeedSnippet(index.byId.get(via)!, 25)}」を経由`);
      } else if (group?.kind === 'word') {
        const excerpt = buildMatchExcerpt(index.byId.get(id)!, group.title);
        if (excerpt?.field === 'body') descriptions.set(id, excerpt.text);
      } else if (reason && group?.kind !== 'reason') {
        descriptions.set(id, reason);
      }
    }
    return descriptions;
  }, [atlas, centerId, group, index]);
  const root = scope !== 'all' && scope !== 'apart' && !group && !selected;
  const fromApart = group?.kind === 'component' || group?.kind === 'isolated';
  const groups = scope === 'apart' ? atlas.apart : atlas.nearby;
  const jump = React.useRef<number>(undefined);
  const scrollOffset = React.useRef(0);
  const listOffset = React.useRef(0);

  React.useEffect(() => {
    const y = jump.current;
    if (y === undefined) return;
    jump.current = undefined;
    const frame = requestAnimationFrame(() => {
      scroll.current?.scrollTo({ y, animated: false });
      if (!root && y === 0) focusControl(back.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [group, picked, root, scope]);

  function open(next: typeof scope) {
    jump.current = 0;
    setScope(next); setPicked(undefined); setLimit(batch);
  }

  function pick(id: string) {
    listOffset.current = scrollOffset.current;
    jump.current = 0;
    setRouteLimit(8); setPicked(id);
  }

  function goBack() {
    if (selected) {
      jump.current = listOffset.current; setPicked(undefined);
      return;
    }
    open(fromApart ? 'apart' : undefined);
  }

  return <ScrollView ref={scroll} style={studioStyles.root} contentContainerStyle={styles.content}
    automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" scrollEventThrottle={48}
    onScroll={({ nativeEvent }) => { scrollOffset.current = nativeEvent.contentOffset.y; }}>
    {root ? <View style={styles.origin}>
      <View style={styles.originMark}><Ionicons name="locate-outline" size={22} color="#e0eadc" /></View>
      <View style={studioStyles.grow}>
        <Text style={styles.originLabel}>中心のメモ</Text>
        <Text accessibilityRole="header" style={styles.originTitle}>{toSeedSnippet(center, 64)}</Text>
        <Text style={styles.originLabel}>庭のメモ {index.live.length}件</Text>
      </View>
      <IconButton label="全体図からメモを探す" icon="search-outline" background="#416352" color="#fffdf7" onPress={() => open('all')} />
    </View> : <Pressable ref={back} accessibilityRole="button" accessibilityLabel={selected ? 'メモを選び直す' : fromApart ? '別のまとまりへ戻る' : '全体図のはじめへ戻る'}
      onPress={goBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
      <Ionicons name="arrow-back" size={17} color={studioColors.green} />
      <Text style={styles.backText}>{selected ? group ? group.title : 'メモを探す' : fromApart ? '別のまとまり' : '全体図'}</Text>
    </Pressable>}
    {!selected && (root || scope === 'apart') && <>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{root ? '中心からたどれるメモ' : '別のまとまり'}</Text>
        <Text style={styles.sectionCount}>{root ? Math.max(0, atlas.depth.size - 1) : otherCount}件</Text>
      </View>
      {root && !groups.length && <Text style={studioStyles.muted}>保存したつながりがここに並びます。</Text>}
      <View style={root ? styles.branches : styles.rows} testID={root ? 'studio-atlas-branches' : undefined}>
        {groups.slice(0, limit).map((entry) => <View key={entry.id} style={root && styles.branch}>
          {root && <View aria-hidden style={styles.branchLine} />}
          <GroupRow group={entry} index={index} atlas={atlas} onPress={() => open(entry)} />
        </View>)}
      </View>
      {groups.length > limit && <StudioAction label="ほかのまとまりを表示" onPress={() => setLimit(limit + batch)} />}
      {root && otherCount > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`別のまとまり ${otherCount}件を見る`}
        onPress={() => open('apart')} style={({ pressed }) => [styles.apart, pressed && styles.pressed]}>
        <Ionicons name="albums-outline" size={21} color={studioColors.green} />
        <View style={studioStyles.grow}>
          <Text style={styles.groupTitle}>別のまとまり</Text>
          <Text style={styles.groupPreview}>中心から線が続いていないメモ</Text>
        </View>
        <Text style={styles.count}>{otherCount}件</Text><Ionicons name="chevron-forward" size={14} color={studioColors.muted} />
      </Pressable>}
    </>}
    {(group || scope === 'all') && <View style={[styles.rows, selected && styles.hidden]}>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{group?.title ?? '庭のメモを探す'}</Text>
        <Text style={styles.sectionCount}>{ids?.length ?? index.live.length}件</Text>
      </View>
      {group?.furthestId && group.seedIds.length > 12 && <StudioAction
        label={`「${toSeedSnippet(index.byId.get(group.furthestId)!, 30)}」までの経路を見る`} icon="git-branch-outline"
        onPress={() => pick(group.furthestId!)} />}
      <StudioNoteList key={group?.id ?? 'all'} index={index} selected={picked ?? ''} scope={ids} details={details} onPick={pick}
        hint={fromApart ? 'メモの内容を確認します' : 'メモの内容と経路を確認します'} mapLabel="メモを開く" />
    </View>}
    {selected && <>
      <View style={styles.selection}>
        <Text accessibilityRole="header" style={styles.noteTitle}>{toSeedSnippet(selected, 64)}</Text>
        <Text style={studioStyles.muted}>{route.length === 1 ? '中心のメモ' : route.length > 1 ? `中心から ${route.length - 1}つ先` : '別のまとまりのメモ'}</Text>
        {selected.title && <Text numberOfLines={2} style={studioStyles.text}>{selected.body}</Text>}
        <View style={studioStyles.wrap}>
          <StudioAction label="この場所を中心に開く" title="中心にする" icon="locate-outline" primary onPress={() => onFocus(selected.id)} />
          <StudioAction label="この場所の原文を読む" title="原文を読む" icon="document-text-outline" focusRef={read}
            onPress={() => onRead(selected.id, () => focusControl(read.current))} />
          {materials && selected.body.trim() && <StudioMaterialAction materials={materials} id={selected.id} />}
        </View>
      </View>
      {route.length > 1 && <View style={styles.route} testID="studio-atlas-route">
        <Text accessibilityRole="header" style={styles.sectionTitle}>保存したつながりをたどる</Text>
        {route.slice(0, routeLimit).map((id, position) => {
          const reason = position ? atlas.edgeNotes.get(connectionId(route[position - 1], id)) : undefined;
          return <RouteStep key={id} id={id} title={toSeedSnippet(index.byId.get(id)!, 60)} last={id === picked} onRead={onRead}
            reason={position > 0 ? reason || '保存したつながり' : undefined} />;
        })}
        {route.length > routeLimit && <StudioAction label="経路の続きを表示" onPress={() => setRouteLimit(routeLimit + 20)} />}
      </View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 14, paddingBottom: 18, gap: 12 },
  hidden: { display: 'none' },
  origin: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 16, padding: 14, backgroundColor: '#254936' },
  originMark: { alignItems: 'center', justifyContent: 'center', height: 36, width: 36, borderRadius: 18, backgroundColor: '#416352' },
  originTitle: { color: '#fffdf7', fontSize: 20, fontWeight: '700' },
  originLabel: { color: '#d3e1d4', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  section: { flexDirection: 'row', gap: 8, alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { flexShrink: 1, color: studioColors.text, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  sectionCount: { color: studioColors.muted, fontSize: 13 },
  branches: { marginLeft: 12, borderLeftWidth: 2, borderLeftColor: '#b5c7b5', paddingLeft: 14, gap: 7 },
  branch: { position: 'relative' },
  branchLine: { position: 'absolute', left: -14, top: 24, width: 14, height: 2, backgroundColor: '#b5c7b5' },
  rows: { gap: 7 },
  group: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', padding: 10, minHeight: 54,
    borderRadius: 12, borderWidth: 1, borderColor: '#dce1d4', backgroundColor: studioColors.surface },
  groupLead: { paddingTop: 2 },
  groupTitle: { color: studioColors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  groupLabel: { color: studioColors.green, fontSize: 12, lineHeight: 18 },
  groupPreview: { color: studioColors.muted, fontSize: 13, lineHeight: 19 },
  count: { color: studioColors.green, fontSize: 13, lineHeight: 21, fontWeight: '700' },
  pressed: { backgroundColor: studioColors.soft },
  apart: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 12, minHeight: 59,
    borderRadius: 12, backgroundColor: '#edf0e6' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 8, borderRadius: 9 },
  backText: { flexShrink: 1, color: studioColors.green, fontSize: 14, fontWeight: '600' },
  selection: { padding: 14, borderRadius: 14, backgroundColor: '#edf0e6', gap: 5 },
  noteTitle: { color: studioColors.text, fontSize: 22, lineHeight: 29, fontWeight: '700' },
  route: { gap: 5, padding: 14, borderColor: studioColors.rule, borderWidth: 1, borderRadius: 14, backgroundColor: studioColors.surface },
  step: { borderLeftWidth: 2, borderLeftColor: '#b5c7b5', paddingLeft: 13, gap: 4, marginLeft: 4 },
  stepButton: { minHeight: 44, paddingRight: 7, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 8 },
  stepTitle: { color: studioColors.text, fontSize: 15, fontWeight: '600', lineHeight: 21, paddingVertical: 4 },
  stepEnd: { color: studioColors.green },
  stepReason: { color: studioColors.muted, fontSize: 13, lineHeight: 19 },
});
