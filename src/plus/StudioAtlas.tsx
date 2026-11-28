import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { connectionId } from '../data/gardenModel';
import { distanceBand, distanceBands, studioAtlas, studioRoute, type DistanceBand } from '../domain/plus/studioAtlas';
import type { MapIndex } from '../domain/plus/map';
import { toSeedSnippet } from '../utils/seedText';
import { StudioNoteList } from './StudioNoteList';
import { StudioAction, studioColors, studioStyles } from './StudioUI';

function GardenDiagram({ index, center, atlas, route, selected, onPick }: {
  index: MapIndex; center: string; atlas: ReturnType<typeof studioAtlas>; route: string[]; selected?: string; onPick: (id: string) => void;
}) {
  const points = React.useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const divided = atlas.bands.apart.length > 0;
    const x = divided ? 108 : 160;
    positions.set(center, { x, y: 92 });
    const rings = ['direct', 'second', 'far'] as const;
    const occupied = rings.filter((band) => atlas.bands[band].length);
    function ring(ids: string[], cx: number, cy: number, rx: number, ry: number) {
      ids.forEach((id, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / ids.length;
        positions.set(id, { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
      });
    }
    let assigned = 0;
    occupied.forEach((band, i) => {
      assigned += atlas.bands[band].length;
      const fraction = (i + 1) / occupied.length * 0.55 + Math.sqrt(assigned / (atlas.depth.size - 1)) * 0.45;
      ring(atlas.bands[band], x, 92, fraction * (divided ? 93 : 142), fraction * 76);
    });
    if (divided) ring(atlas.bands.apart, 264, 92, 43, 63);
    return positions;
  }, [atlas, center]);
  const path = new Set(route.slice(1).map((id, i) => connectionId(route[i], id)));
  const divided = atlas.bands.apart.length > 0;
  const dots = [...points];
  return <View style={styles.diagram} testID="studio-atlas-diagram" aria-hidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height={146} viewBox="0 0 320 184">
      {divided && <Line x1={210} x2={210} y1={9} y2={175} stroke="#abbaa8" strokeDasharray="2 5" />}
      {[...index.edges].sort((a, b) => Number(path.has(a.id)) - Number(path.has(b.id))).map((edge) => {
        const a = points.get(edge.aSeedId)!; const b = points.get(edge.bSeedId)!;
        return <Line key={edge.id} x1={a.x} x2={b.x} y1={a.y} y2={b.y} stroke={path.has(edge.id) ? '#99562e' : '#78937a'}
          strokeWidth={path.has(edge.id) ? 2.6 : 1} opacity={path.has(edge.id) ? 1 : 0.65} />;
      })}
      {dots.map(([id, { x, y }]) => <Rect key={id} x={x - 10} y={y - 10} width={20} height={20} fill="transparent" onPress={() => onPick(id)} />)}
      {dots.map(([id, point]) => <Circle key={id} cx={point.x} cy={point.y} r={id === center || id === selected ? 5 : 2.7}
        fill={id === selected ? '#a35429' : id === center ? '#1f553b' : '#66816a'} stroke="#f6f8ed" strokeWidth={1} onPress={() => onPick(id)} />)}
    </Svg>
    <Text style={styles.diagramLegend}>{divided ? `中心からたどれる ${atlas.depth.size}件  ｜  別のまとまり ${atlas.bands.apart.length}件` : '点はメモ、線は保存したつながり'}</Text>
  </View>;
}

export function StudioAtlas({ index, centerId, onFocus, onRead }: {
  index: MapIndex; centerId: string; onFocus: (id: string) => void; onRead: (id: string) => void;
}) {
  const atlas = React.useMemo(() => studioAtlas(index, centerId), [index, centerId]);
  const [band, setBand] = React.useState<DistanceBand>();
  const [picked, setPicked] = React.useState<string>();
  const [routeLimit, setRouteLimit] = React.useState(8);
  const center = index.byId.get(centerId)!;
  const selected = picked && index.byId.get(picked);
  const route = selected ? studioRoute(atlas, selected.id) : [];
  const showDots = index.live.length <= 180 && index.edges.length <= 480;
  const details = React.useMemo(() => new Map((band ? atlas.bands[band] : []).map((id) => {
    const distance = atlas.depth.get(id);
    const via = atlas.parent.get(id);
    const tail = via && via !== centerId ? ` · 「${toSeedSnippet(index.byId.get(via)!, 30)}」を経由` : '';
    return [id, distance ? `${distance}つ先${tail}` : 'この中心から続く線はありません'];
  })), [atlas, band, centerId, index]);
  return <View style={styles.stack}>
    <View style={[studioStyles.card, styles.origin]}>
      <Text style={styles.kicker}>中心のメモ</Text>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>{toSeedSnippet(center, 48)}</Text>
      <Text style={studioStyles.muted}>庭のメモ {index.live.length}件 · 保存したつながり {index.edges.length}本</Text>
    </View>
    {showDots ? <GardenDiagram atlas={atlas} index={index} center={centerId} route={route} selected={picked} onPick={(id) => {
      setBand(id === centerId ? undefined : distanceBand(atlas.depth.get(id)));
      setPicked(id === centerId ? undefined : id); setRouteLimit(8);
    }} /> : <Text style={studioStyles.muted}>距離ごとにまとめて全件を表示しています。</Text>}
    {band ? <>
      <StudioAction label="距離別の全体図へ戻る" icon="arrow-back" onPress={() => { setBand(undefined); setPicked(undefined); }} />
      <Text style={studioStyles.subtitle}>{distanceBands.find((item) => item.id === band)?.label} · {atlas.bands[band].length}件</Text>
      {selected ? <View style={studioStyles.card}>
        <Text accessibilityRole="header" style={studioStyles.subtitle}>{toSeedSnippet(selected, 60)}</Text>
        <Text style={styles.kicker}>{route.length ? `保存した線をたどる経路 · ${route.length - 1}つ先` : '別のまとまり・単独のメモ'}</Text>
        {route.length > 0 && <Text selectable style={studioStyles.text}>{route.slice(0, routeLimit).map((id) => toSeedSnippet(index.byId.get(id)!, 40)).join(' → ')}
          {route.length > routeLimit && ` → … → ${toSeedSnippet(selected, 40)}`}</Text>}
        {route.length > routeLimit && <StudioAction label="経路の続きを表示" onPress={() => setRouteLimit(routeLimit + 20)} />}
        <View style={studioStyles.wrap}><StudioAction label="この場所を中心に開く" icon="locate-outline" primary onPress={() => onFocus(selected.id)} />
          <StudioAction label="この場所の原文を読む" icon="document-text-outline" onPress={() => onRead(selected.id)} />
          <StudioAction label="別のメモを選ぶ" onPress={() => setPicked(undefined)} /></View>
      </View> : <StudioNoteList key={band} index={index} selected="" scope={atlas.bands[band]} details={details}
        onPick={(id) => { setRouteLimit(8); setPicked(id); }} hint="中心からの距離と経路を確認します" mapLabel="場所を見る" />}
    </> : <>
      <Text style={studioStyles.muted}>{showDots ? '点をタップするか、下の距離からメモを選べます。' : '中心からの距離を選ぶと、画面の外のメモまでたどれます。'}</Text>
      {distanceBands.map(({ id, label }) => {
        const ids = atlas.bands[id];
        const sample = ids.slice(0, 2).map((key) => toSeedSnippet(index.byId.get(key)!, 22)).join('、');
        return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${label} ${ids.length}件`}
          accessibilityState={{ disabled: !ids.length }} disabled={!ids.length} onPress={() => setBand(id)}
          style={({ pressed }) => [studioStyles.card, styles.band, pressed && studioStyles.quiet]}>
          <View style={studioStyles.row}><Text style={[studioStyles.text, studioStyles.grow]}>{label}</Text>
            <Text style={styles.count}>{ids.length}件</Text><Ionicons name="chevron-forward" size={16} color={studioColors.green} /></View>
          {!!ids.length && <><View style={styles.track} aria-hidden><View style={[styles.bar, { width: `${100 * ids.length / Math.max(1, index.live.length - 1)}%` }]} /></View>
            <Text numberOfLines={1} style={studioStyles.muted}>{sample}</Text></>}
        </Pressable>;
      })}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  diagram: { backgroundColor: '#f0f3e8', borderRadius: 14, paddingBottom: 6 },
  diagramLegend: { color: studioColors.green, fontSize: 12, textAlign: 'center' },
  stack: { gap: 9 }, origin: { backgroundColor: '#e8efe3' }, kicker: { fontWeight: '700', fontSize: 12, color: studioColors.green },
  band: { minHeight: 48, gap: 5 }, count: { fontSize: 16, fontWeight: '700', color: studioColors.green },
  track: { height: 4, borderRadius: 2, backgroundColor: '#e2e9dc' },
  bar: { minWidth: 3, height: 4, borderRadius: 2, backgroundColor: '#65876b' },
});
