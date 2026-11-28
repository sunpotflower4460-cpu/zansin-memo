import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { StudioPreferences } from '../domain/plus/contracts';
import type { MapIndex } from '../domain/plus/map';
import { topicConstellations } from '../domain/plus/studioAtlas';
import { constellationFigure, constellationGroups, type ConstellationFigure, type ConstellationGroup } from '../domain/plus/studioGraph';
import { theme } from '../styles/theme';
import { normalizeSearchText, searchableText, toSeedSnippet } from '../utils/seedText';
import { PlusInput, buttonSelectionProps, focusControl } from './PlusUI';
import { StudioNoteList } from './StudioNoteList';
import { IconButton, StudioAction, StudioSegments, StudioRow, StudioTitle, studioColors, studioStyles, type StudioIcon } from './StudioUI';

export const constellationPalettes = {
  paper: { space: '#091624', glow: '#233e51', mist: '#326071', ink: '#f4f5ec', dim: '#bdced7', light: '#d7efe6', focus: '#ffe4a7', rule: '#476077' },
  indigo: { space: '#0b142a', glow: '#243b66', mist: '#2b628e', ink: '#f2f7ff', dim: '#bfd1ee', light: '#aedaff', focus: '#e7f8ff', rule: '#4a6489' },
  night: { space: '#100f24', glow: '#352f52', mist: '#5d447b', ink: '#f6f1ff', dim: '#cbbfe0', light: '#e0cbff', focus: '#ffe4a7', rule: '#62587e' },
};
type SkyColors = typeof constellationPalettes[StudioPreferences['palette']];
type Visit = { groupId: string; anchorId: string; selectedId: string };
type Frame = { width: number; height: number };
const starTarget = 46;
const directoryPageSize = 24;

function makeSky() {
  let seed = 5479;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  return Array.from({ length: 124 }, () => ({
    x: random() * 420, y: random() * 460, radius: 0.36 + random() * 0.7, opacity: 0.14 + random() * 0.56,
  }));
}
const skyDots = makeSky();

function sparkle(x: number, y: number, size: number) {
  const inside = size * 0.24;
  return `M${x} ${y - size} Q${x + inside} ${y - inside} ${x + size} ${y}
    Q${x + inside} ${y + inside} ${x} ${y + size} Q${x - inside} ${y + inside} ${x - size} ${y}
    Q${x - inside} ${y - inside} ${x} ${y - size}Z`;
}

const SkyBackdrop = React.memo(function SkyBackdrop({ colors }: { colors: SkyColors }) {
  const id = React.useId().replace(/[^\w-]/g, '');
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
    <Svg width="100%" height="100%" viewBox="0 0 420 460" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={`${id}-sky`} cx="48%" cy="34%" rx="77%" ry="75%">
          <Stop offset="0" stopColor={colors.glow} /><Stop offset="1" stopColor={colors.space} />
        </RadialGradient>
        <RadialGradient id={`${id}-mist`} cx="91%" cy="7%" rx="67%" ry="58%">
          <Stop offset="0" stopColor={colors.mist} stopOpacity={0.53} /><Stop offset="1" stopColor={colors.mist} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={420} height={460} fill={`url(#${id}-sky)`} />
      <Rect width={420} height={460} fill={`url(#${id}-mist)`} />
      <Path d="M-58 302 C41 78 267 8 473 116 M-61 395 C73 144 272 80 473 167" fill="none" stroke={colors.light} strokeWidth={0.7} opacity={0.13} />
      {skyDots.map(({ x, y, radius, opacity }, i) => <Circle key={i} cx={x} cy={y} r={radius} opacity={opacity} fill={i % 8 === 0 ? colors.focus : colors.light} />)}
      {[[23, 115], [363, 77], [279, 356], [114, 389]].map(([x, y]) =>
        <Path key={x} d={sparkle(x, y, 2.4)} fill={colors.light} opacity={0.46} />)}
    </Svg>
  </View>;
});

function starPoint(star: ConstellationFigure['stars'][number], frame: Frame, inset: number) {
  return { x: inset + star.x * (frame.width - 2 * inset), y: inset + star.y * (frame.height - 2 * inset) };
}

function TracedStars({ figure, frame, colors, selected, miniature = false }: {
  figure: ConstellationFigure; frame: Frame; colors: SkyColors; selected?: string; miniature?: boolean;
}) {
  const inset = miniature ? 5 : starTarget / 2;
  const point = (star: ConstellationFigure['stars'][number]) => starPoint(star, frame, inset);
  return <>
    {figure.lines.map(({ id, a, b }) => {
      const start = point(a);
      const end = point(b);
      const active = selected === a.id || selected === b.id;
      return <Line key={id} testID={miniature ? undefined : 'studio-constellation-line'} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
        stroke={active ? colors.focus : colors.light} strokeWidth={active ? 1.4 : 0.9} opacity={active ? 0.91 : 0.55} strokeLinecap="round" />;
    })}
    {figure.stars.map((star) => {
      const { x, y } = point(star);
      const active = selected === star.id;
      const bright = star.anchor || active;
      const ink = active || star.anchor ? colors.focus : colors.light;
      return <React.Fragment key={star.id}>
        <Circle cx={x} cy={y} r={active ? 16 : bright ? 10 : 6} fill={ink} opacity={active ? 0.14 : 0.1} />
        {active && <Circle cx={x} cy={y} r={14} fill="none" stroke={ink} strokeWidth={1} strokeDasharray="2.5 3" />}
        {bright && <Path d={sparkle(x, y, active ? 10 : 7)} fill={ink} opacity={0.92} />}
        <Circle cx={x} cy={y} r={bright ? 2.65 : 2.35} fill="#fffdf5" />
      </React.Fragment>;
    })}
  </>;
}

function SkyControl({ label, title, icon, colors, onPress, focusRef, disabled = false }: {
  label: string; title?: string; icon: StudioIcon; colors: SkyColors; onPress: () => void; focusRef?: React.Ref<View>; disabled?: boolean;
}) {
  return <Pressable ref={focusRef} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} accessibilityState={{ disabled }}
    style={({ pressed }) => [styles.skyControl, { borderColor: colors.rule, backgroundColor: colors.space }, (pressed || disabled) && studioStyles.quiet]}>
    <Ionicons name={icon} size={17} color={colors.ink} />
    {title && <Text maxFontSizeMultiplier={1.2} style={[styles.controlText, { color: colors.ink }]}>{title}</Text>}
  </Pressable>;
}

function AtlasTile({ group, index, colors, onPress }: {
  group: ConstellationGroup; index: MapIndex; colors: SkyColors; onPress: () => void;
}) {
  const frame = { width: 136, height: 85 };
  const figure = React.useMemo(() => constellationFigure(index, group, 6), [group, index]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`「${group.label}」の星座を開く`} accessibilityHint={`${group.seedIds.length}件のメモ`}
    onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.glow }]}>
    <View style={styles.miniature} aria-hidden pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 136 85">
        <TracedStars figure={figure} frame={frame} colors={colors} miniature />
      </Svg>
    </View>
    <View style={styles.tileText}>
      <Text numberOfLines={1} style={[styles.tileTitle, { color: colors.ink }]}>{group.label}</Text>
      <Text style={[styles.tileCount, { color: colors.dim }]}>{group.seedIds.length}件のメモ</Text>
      <Text numberOfLines={1} style={[styles.tileExample, { color: colors.dim }]}>{toSeedSnippet(index.byId.get(group.seedIds[0])!, 30)}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.light} style={styles.tileArrow} />
    </View>
  </Pressable>;
}

function StarDiagram({ figure, frame, selected, index, colors, onLayout, onSelect }: {
  figure: ConstellationFigure; frame: Frame; selected: string; index: MapIndex; colors: SkyColors;
  onLayout: (frame: Frame) => void; onSelect: (id: string) => void;
}) {
  const labelWidth = Math.max(starTarget, Math.min(148, frame.width / 2 - 8));
  const rows = Math.ceil(figure.stars.length / 2);
  const layoutStars = figure.stars.map((star, i) => {
    const row = Math.floor(i / 2);
    const alone = i + 1 === figure.stars.length && i % 2 === 0;
    return { ...star, x: alone ? 0.5 : i % 2 ? 0.77 : 0.23,
      y: (row + (i % 2 ? 0.58 : 0.42)) / rows };
  });
  const byId = new Map(layoutStars.map((star) => [star.id, star]));
  const diagram = { stars: layoutStars, lines: figure.lines.map((line) => ({ ...line, a: byId.get(line.a.id)!, b: byId.get(line.b.id)! })) };
  return <View style={styles.figure} testID="studio-constellation-figure"
    onLayout={({ nativeEvent }) => onLayout(nativeEvent.layout)}>
    {frame.width > 0 && frame.height > 0 && <>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
        <Svg width={frame.width} height={frame.height}>
          <TracedStars figure={diagram} frame={frame} colors={colors} selected={selected} />
        </Svg>
      </View>
      {layoutStars.map((star) => {
        const note = index.byId.get(star.id);
        if (!note) return null;
        const { x, y } = starPoint(star, frame, starTarget / 2);
        return <Pressable key={star.id} testID={`studio-constellation-star-${star.id}`} accessibilityRole="button"
          accessibilityLabel={`星「${toSeedSnippet(note, 50)}」を選ぶ`} {...buttonSelectionProps(star.id === selected)} onPress={() => onSelect(star.id)}
          style={({ pressed }) => [styles.starTarget, { width: labelWidth, left: Math.max(0, Math.min(frame.width - labelWidth, x - labelWidth / 2)), top: y - starTarget / 2 },
            pressed && { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
          <Text numberOfLines={1} style={[styles.starLabel, { color: star.id === selected ? colors.focus : colors.ink, backgroundColor: colors.space }]}>
            {toSeedSnippet(note, 36)}
          </Text>
        </Pressable>;
      })}
    </>}
  </View>;
}

export function StudioConstellations({ index, centerId, palette, compact, showDetails, fullScreen, onRead, onMindMap, onCraft }: {
  index: MapIndex; centerId: string; palette: StudioPreferences['palette']; compact: boolean; showDetails: boolean;
  fullScreen: { active: boolean; label: string; onPress: () => void };
  onRead: (id: string, onReturn: () => void) => void; onMindMap: (id: string) => void; onCraft?: (ids: string[]) => void;
}) {
  const colors = constellationPalettes[palette];
  const [lens, setLens] = React.useState<'topics' | 'links'>('topics');
  const topics = lens === 'topics';
  const groups = React.useMemo(() => topics ? topicConstellations(index) : constellationGroups(index), [index, topics]);
  const connected = React.useMemo(() => groups.filter(({ linked }) => topics || linked), [groups, topics]);
  const isolated = !topics && groups.find(({ linked }) => !linked);
  const centerGroup = connected.find(({ seedIds }) => seedIds.includes(centerId));
  const atlas = (centerGroup ? [centerGroup, ...connected.filter((group) => group !== centerGroup)] : connected)
    .slice(0, compact ? 2 : 4);
  const [ingredient, setIngredient] = React.useState<string>();
  const pinned = ingredient && index.byId.get(ingredient);
  const [visit, setVisit] = React.useState<Visit>();
  const [list, setList] = React.useState<'groups' | 'notes'>();
  const [term, setTerm] = React.useState('');
  const [limit, setLimit] = React.useState(directoryPageSize);
  const [frame, setFrame] = React.useState<Frame>({ width: 0, height: 0 });
  const centerSeen = React.useRef(centerId);
  const moveFocus = React.useRef(false);
  const closeListButton = React.useRef<View>(null);
  const atlasButton = React.useRef<View>(null);
  const directoryButton = React.useRef<View>(null);
  const originalButton = React.useRef<View>(null);
  const group = groups.find(({ id }) => id === visit?.groupId);
  const selected = group && index.byId.get(visit && group.seedIds.includes(visit.selectedId) ? visit.selectedId : group.seedIds[0]);
  const starLimit = frame.height > 0 && frame.height < 108 ? 2 : frame.height > 0 && frame.height < 166 ? 4 : 6;
  const pageStart = topics && selected && group ? Math.floor(group.seedIds.indexOf(selected.id) / starLimit) * starLimit : 0;
  const figure = React.useMemo(() => {
    if (!group) return undefined;
    if (topics) return constellationFigure(index, { ...group, seedIds: group.seedIds.slice(pageStart, pageStart + starLimit) }, starLimit);
    const drawn = constellationFigure(index, group, starLimit, visit?.anchorId);
    return selected && !drawn.stars.some((star) => star.id === selected.id)
      ? constellationFigure(index, group, starLimit, selected.id) : drawn;
  }, [group, index, pageStart, selected, starLimit, topics, visit?.anchorId]);
  const query = normalizeSearchText(term.trim());
  const found = React.useMemo(() => query ? groups.filter(({ label, seedIds }) => normalizeSearchText(label).includes(query)
    || seedIds.some((id) => { const memo = index.byId.get(id); return memo && searchableText(memo).includes(query); })) : groups,
  [groups, index.byId, query]);

  React.useEffect(() => {
    if (centerSeen.current === centerId) return;
    centerSeen.current = centerId;
    const next = groups.find(({ seedIds }) => seedIds.includes(centerId));
    setVisit(next ? { groupId: next.id, anchorId: centerId, selectedId: centerId } : undefined);
    setList(undefined);
  }, [centerId, groups]);

  React.useEffect(() => {
    if (!moveFocus.current) return;
    const frame = requestAnimationFrame(() => {
      moveFocus.current = false;
      focusControl(list ? closeListButton.current : group ? atlasButton.current : directoryButton.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [group, list]);

  function openGroup(next: ConstellationGroup) {
    moveFocus.current = true;
    setVisit({ groupId: next.id, anchorId: next.seedIds[0], selectedId: next.seedIds[0] });
    setList(undefined);
  }

  function openList(next: 'groups' | 'notes') {
    moveFocus.current = true;
    setTerm(''); setLimit(directoryPageSize); setList(next);
  }

  function closeList() {
    moveFocus.current = true;
    setList(undefined);
  }

  function chooseStar(id: string, fromList = false) {
    if (fromList) closeList();
    setVisit((before) => before && { ...before, selectedId: id, anchorId: fromList && !figure?.stars.some((star) => star.id === id) ? id : before.anchorId });
  }

  return <View style={styles.root}>
    <View style={[styles.root, list && styles.hidden]}>
      <View testID="studio-constellation-sky" style={[styles.sky, { backgroundColor: colors.space, borderColor: colors.rule }]}>
        <SkyBackdrop colors={colors} />
        <View style={styles.skyHeader}>
          {group && <SkyControl label="星座の全体へ戻る" icon="chevron-back" colors={colors} focusRef={atlasButton}
            onPress={() => { moveFocus.current = true; setVisit(undefined); }} />}
          <View style={studioStyles.grow}>
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.skyTitle, { color: colors.ink }]}>{group?.label ?? (topics ? '話題の星座' : 'つながりの星座')}</Text>
            <Text style={[styles.skyDetail, { color: colors.dim }]}>{group ? `${group.seedIds.length}件のうち ${figure?.stars.length ?? 0}件を表示` : `庭のメモ ${index.live.length}件 · ${connected.length}組`}</Text>
          </View>
          {!group && <SkyControl label="星座一覧を開く" title="星座一覧" icon="list-outline" colors={colors} focusRef={directoryButton} onPress={() => openList('groups')} />}
          <SkyControl label={fullScreen.label} icon={fullScreen.active ? 'contract-outline' : 'expand-outline'} colors={colors} onPress={fullScreen.onPress} />
        </View>
        {!group && <View style={styles.lenses}><StudioSegments label="星座の集め方" value={lens}
          items={[{ id: 'topics', label: '話題で集める' }, { id: 'links', label: 'つながりで集める' }]}
          onChange={(next) => { setLens(next); setVisit(undefined); setList(undefined); }} /></View>}
        {group && figure && selected ? <>
          <StarDiagram figure={figure} frame={frame} selected={selected.id} index={index} colors={colors}
            onLayout={({ width, height }) => setFrame((before) => width === before.width && height === before.height ? before : { width, height })}
            onSelect={chooseStar} />
          {topics && group.seedIds.length > starLimit ? <View style={styles.pageNav}>
            <SkyControl colors={colors} icon="chevron-back" label="前の星を表示" disabled={pageStart === 0}
              onPress={() => chooseStar(group.seedIds[pageStart - starLimit])} />
            <Text accessibilityLiveRegion="polite" style={[styles.pageInfo, { color: colors.dim }]}>{group.basis === 'category' ? '同じカテゴリ' : group.basis === 'word' ? '本文の共通語' : '個別のメモ'} · {pageStart + 1}〜{pageStart + figure.stars.length}件目</Text>
            <SkyControl colors={colors} icon="chevron-forward" label="次の星を表示" disabled={pageStart + starLimit >= group.seedIds.length}
              onPress={() => chooseStar(group.seedIds[pageStart + starLimit])} />
          </View> : <Text style={[styles.skyCaption, { color: colors.dim }]}>{group.basis === 'category' ? `カテゴリ「${group.label}」のメモ` : group.basis === 'word' ? `本文に「${group.label}」があるメモ` :
            group.basis === 'ungrouped' ? '個別に読み返せるメモ' : group.linked ? '星はメモ、線は保存したつながり' : 'つながりのないメモから選ぶ'}</Text>}
        </> : atlas.length > 0 ? <View style={styles.atlas}>
          {Array.from({ length: Math.ceil(atlas.length / 2) }, (_, row) => <View key={row} style={styles.atlasRow}>
            {atlas.slice(2 * row, 2 * row + 2).map((entry) =>
              <AtlasTile key={entry.id} group={entry} index={index} colors={colors} onPress={() => openGroup(entry)} />)}
          </View>)}
        </View> : <View style={styles.empty}>
          <Ionicons name="sparkles-outline" color={colors.light} size={31} />
          <Text style={[styles.emptyText, { color: colors.ink }]}>メモをつなぐと星座ができます</Text>
          {isolated && <SkyControl label="つながりのないメモを見る" title="単独のメモを見る" icon="star-outline" colors={colors} onPress={() => openGroup(isolated)} />}
        </View>}
      </View>
      {showDetails && (group && selected ? <View style={[studioStyles.card, styles.selection]} testID="studio-constellation-selection">
        <View style={studioStyles.row}>
          <View style={[studioStyles.emblem, styles.selectionIcon]} aria-hidden><Ionicons name="star-outline" size={19} color={studioColors.green} /></View>
          <View style={studioStyles.grow}>
            <Text style={studioStyles.muted} numberOfLines={1}>{pinned ? `素材「${toSeedSnippet(pinned, 18)}」と組む星` : '選んだメモ'}</Text>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.selectionTitle}>{toSeedSnippet(selected, 58)}</Text>
          </View>
          <StudioAction label="星のメモの原文を開く" title="原文" icon="document-text-outline" primary focusRef={originalButton}
            onPress={() => onRead(selected.id, () => focusControl(originalButton.current))} />
        </View>
        <View style={styles.selectionActions}>
          <StudioAction label="星座のメモ一覧を開く" title={`メモ一覧 ${group.seedIds.length}件`} icon="list-outline" onPress={() => openList('notes')} />
          {onCraft && <StudioAction label={pinned && pinned.id !== selected.id ? '選んだ星2枚でアイデアをつくる' :
            pinned ? '星を素材から外す' : 'この星を最初の素材にする'} title={pinned && pinned.id !== selected.id ? '2枚で作る' : pinned ? '素材を外す' : '素材にする'}
            icon="construct-outline" onPress={() => {
              if (pinned && pinned.id !== selected.id) onCraft([pinned.id, selected.id]);
              else setIngredient(pinned ? undefined : selected.id);
            }} />}
          <StudioAction label="このメモをマインドマップで開く" title="マップへ" icon="git-network-outline" onPress={() => onMindMap(selected.id)} />
        </View>
      </View> : <View style={[studioStyles.card, styles.legend]}>
        <View style={[studioStyles.emblem, styles.selectionIcon]} aria-hidden><Ionicons name="sparkles-outline" size={18} color={studioColors.green} /></View>
        <View style={studioStyles.grow}>
          <Text style={styles.legendTitle}>{pinned ? `「${toSeedSnippet(pinned, 24)}」と組む星を選ぶ` : topics ? '別々に書いたメモを話題から探す' : '星座をタップしてメモをたどる'}</Text>
          <Text style={studioStyles.muted}>{topics ? 'カテゴリと、カテゴリのないメモに共通する言葉で集めます。' : '星はメモ、線はつながり'}</Text>
        </View>
      </View>)}
    </View>
    {list && <View style={styles.root} accessibilityViewIsModal onAccessibilityEscape={closeList}>
      <StudioTitle title={list === 'groups' ? '星座一覧' : '星座のメモ一覧'}>
        <IconButton label="星の一覧を閉じる" icon="close" focusRef={closeListButton} onPress={closeList} />
      </StudioTitle>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.directory}>
        {list === 'groups' ? <>
          <PlusInput accessibilityLabel="メモから星座を探す" placeholder="メモの題名・本文から探す" value={term} returnKeyType="search"
            onChangeText={(text) => { setLimit(directoryPageSize); setTerm(text); }} />
          {found.slice(0, limit).map((entry) => <StudioRow key={entry.id}
            label={topics || entry.linked ? `「${entry.label}」の星座を開く` : 'つながりのないメモを見る'} title={entry.label}
            detail={`${entry.seedIds.length}件のメモ`} icon={entry.linked ? 'sparkles-outline' : 'star-outline'} onPress={() => openGroup(entry)} />)}
          {found.length > limit && <StudioAction label="さらに星座を表示" onPress={() => setLimit(limit + directoryPageSize)} />}
          {!found.length && <Text accessibilityLiveRegion="polite" style={studioStyles.muted}>一致する星座はありません。</Text>}
        </> : group && <>
          <Text accessibilityRole="header" style={studioStyles.subtitle}>{group.label}</Text>
          <StudioNoteList index={index} selected={selected?.id ?? ''} scope={group.seedIds} onPick={(id) => chooseStar(id, true)}
            hint="選んだメモを星空に表示します" mapLabel="星を表示" />
        </>}
      </ScrollView>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, gap: 7 },
  hidden: { display: 'none' },
  sky: { flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 21, borderWidth: 1 },
  skyHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingHorizontal: 9, gap: 6 },
  skyTitle: { fontFamily: theme.fonts.serif, fontSize: 18, lineHeight: 25, fontWeight: '600' },
  skyDetail: { fontSize: 11, lineHeight: 16 },
  skyControl: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5,
    paddingHorizontal: 8, borderRadius: 11, borderWidth: 1 },
  controlText: { fontSize: 12, fontWeight: '700' },
  atlas: { flex: 1, minHeight: 0, paddingHorizontal: 9, paddingTop: 5, paddingBottom: 10, gap: 7 },
  atlasRow: { flex: 1, minHeight: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tile: { flex: 1, minWidth: 0, maxWidth: 256, alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 5,
    borderRadius: 15, backgroundColor: 'rgba(225,237,255,0.035)' },
  miniature: { flexShrink: 1, width: '100%', maxWidth: 178, height: '65%', minHeight: 34 },
  tileText: { width: '100%', alignItems: 'center', paddingHorizontal: 13, paddingBottom: 4 },
  tileTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  tileExample: { fontSize: 11, lineHeight: 15 },
  lenses: { marginHorizontal: 9, marginTop: 4 },
  tileCount: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  tileArrow: { position: 'absolute', right: 0, top: 3 },
  figure: { flex: 1, minHeight: 0, marginHorizontal: 9, marginTop: 5 },
  skyCaption: { fontSize: 12, lineHeight: 18, paddingHorizontal: 12, paddingBottom: 9, textAlign: 'center' },
  pageNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingHorizontal: 9, paddingBottom: 6 },
  pageInfo: { flex: 1, textAlign: 'center', fontSize: 13 },
  starLabel: { fontSize: 12, lineHeight: 16, paddingHorizontal: 4, borderRadius: 4, maxWidth: '100%' },
  starTarget: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-end', width: starTarget, height: starTarget, borderRadius: starTarget / 2 },
  empty: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 8 },
  emptyText: { textAlign: 'center', fontSize: 15 },
  legend: { flexDirection: 'row', alignItems: 'center', padding: 9, gap: 9 },
  legendTitle: { color: studioColors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  selection: { padding: 8, gap: 5 },
  selectionIcon: { width: 32, height: 32, borderRadius: 9 },
  selectionTitle: { color: studioColors.text, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  directory: { gap: 7, paddingBottom: 16 },
});
