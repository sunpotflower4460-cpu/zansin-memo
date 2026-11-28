import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { connectionId } from '../data/gardenModel';
import type { StudioPlacement, StudioPreferences } from '../domain/plus/contracts';
import type { Suggestion } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import { canPlaceStudioNode, clampStudioPosition, constellationGraph, placeStudioNodes, radialGraph, studioMapLabel, withStudioNodes,
  type ConstellationGroup, type RadialNeighborhood, type StudioGraph, type StudioNode } from '../domain/plus/studioGraph';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { IconButton } from './StudioUI';
import { buttonSelectionProps } from './PlusUI';

export const mapPalettes = {
  paper: { label: '和紙', art: '#e8eadc', light: '#fdf5e0', pattern: '#617c60', node: '#fffcf2', ink: '#253e31', border: '#a9b69e',
    center: '#204b38', onCenter: '#fffdf2', line: '#56765f', highlight: '#214e39', candidate: '#854b30', motifs: ['#e1e9d6', '#eee6d4', '#dce8e1'] },
  indigo: { label: '藍', art: '#d9e5ef', light: '#f6f9f8', pattern: '#426482', node: '#f9fcff', ink: '#203a53', border: '#9ab6ca',
    center: '#244b6d', onCenter: '#f6fcff', line: '#4f6e8c', highlight: '#254e70', candidate: '#854928', motifs: ['#d2e2ee', '#e0e5f3', '#d4e5e6'] },
  night: { label: '月夜', art: '#141d33', light: '#363e61', pattern: '#b2bce1', node: '#2c3956', ink: '#f5f0ff', border: '#6d80a8',
    center: '#dac9f4', onCenter: '#20172f', line: '#a1acd2', highlight: '#decaff', candidate: '#fbd0a5', motifs: ['#26334f', '#332f49', '#23364c'] },
};

type Camera = { x: number; y: number; scale: number };
type Drag = { node: StudioNode; x: number; y: number; valid: boolean };
type Arrange = { onPlace: (point: StudioPlacement) => void; onReject: () => void };
const initialCamera: Camera = { x: 0, y: 0, scale: 1 };
const maxScale = 2.6;
const limit = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function touchSpan(event: GestureResponderEvent) {
  const [first, second] = event.nativeEvent.touches;
  if (!second) return undefined;
  return { x: (first.pageX + second.pageX) / 2, y: (first.pageY + second.pageY) / 2,
    distance: Math.max(1, Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY)) };
}

function pathFor({ a, b }: StudioGraph['lines'][number], radial: boolean) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) return `M ${a.x} ${a.y}`;
  // Touch the straight portion of each rounded card, clear of its corners.
  function port(node: typeof a, direction: number) {
    const halfWidth = node.width / 2;
    const halfHeight = node.height / 2;
    if (Math.abs(dx) / halfWidth >= Math.abs(dy) / halfHeight) {
      return { x: node.x + Math.sign(dx) * direction * (halfWidth - 2),
        y: node.y + direction * limit(dy * halfWidth / Math.abs(dx), 10 - halfHeight, halfHeight - 10) };
    }
    return { x: node.x + direction * limit(dx * halfHeight / Math.abs(dy), 10 - halfWidth, halfWidth - 10),
      y: node.y + Math.sign(dy) * direction * (halfHeight - 2) };
  }
  const start = port(a, 1);
  const end = port(b, -1);
  if (Math.abs(dx) < 45 || !radial) {
    const shift = radial ? 20 : limit(dx * 0.2, -18, 18);
    return `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2 + shift} ${(start.y + end.y) / 2 - shift} ${end.x} ${end.y}`;
  }
  const mid = (start.x + end.x) / 2;
  return `M ${start.x} ${start.y} C ${mid} ${start.y}, ${mid} ${end.y}, ${end.x} ${end.y}`;
}

export function StudioMapCanvas({ index, center, selected, emphasisId, mode, palette, suggestions, expanded, neighborhood, groups, viewKey,
  back, onDepth, onMore, onGroups, onSelect, fitRequest, placement, arrange, onStartArrange }: {
  index: MapIndex; center: Seed; selected: string; emphasisId?: string; mode: 'radial' | 'constellation'; palette: StudioPreferences['palette'];
  suggestions: readonly Suggestion[]; expanded: boolean; neighborhood?: RadialNeighborhood; groups?: ConstellationGroup[]; viewKey: string;
  back?: { title: string; onPress: () => void }; onDepth?: () => void; onMore: (visibleIds: string[]) => void; onGroups?: () => void;
  onSelect: (id: string) => void; fitRequest: number;
  placement?: readonly StudioPlacement[]; arrange?: Arrange; onStartArrange?: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [{ width, height }, setSize] = React.useState({ width: 0, height: 0 });
  const [camera, setCamera] = React.useState(initialCamera);
  const live = React.useRef(initialCamera);
  const lastFit = React.useRef(fitRequest);
  const trail = React.useRef(new Map<string, Camera>());
  const dragged = React.useRef(false);
  const dragValue = React.useRef<Drag>(undefined);
  const [drag, setDrag] = React.useState<Drag>();
  const position = React.useRef({ x: 0, y: 0 });
  const surface = React.useRef<View>(null);
  const colors = mapPalettes[palette];
  const radial = mode === 'radial';
  const cameraKey = JSON.stringify([mode, viewKey, center.id]);
  const automatic = React.useMemo(() => {
    const size = { width, height };
    if (!width || !height) return undefined;
    return radial ? radialGraph(index, center, size, suggestions, expanded, emphasisId, selected, neighborhood)
      : constellationGraph(index, center, size, groups);
  }, [center, emphasisId, expanded, groups, height, index, neighborhood, radial, selected, suggestions, width]);
  const placed = React.useMemo(() => automatic && radial && placement ? placeStudioNodes(automatic, { width, height }, placement) : automatic,
    [automatic, height, placement, radial, width]);
  const graph = React.useMemo(() => drag && placed
    ? withStudioNodes(placed, placed.nodes.map((node) => node.seed.id === drag.node.seed.id ? { ...node, x: drag.x, y: drag.y } : node)) : placed,
    [drag, placed]);
  const edit = React.useRef({ arrange, placed, automatic, onSelect });
  edit.current = { arrange, placed, automatic, onSelect };

  const measureSurface = React.useCallback(() => {
    surface.current?.measureInWindow((x, y) => { position.current = { x, y }; });
  }, []);

  const drop = React.useCallback((node: StudioNode, point: { x: number; y: number }, valid: boolean) => {
    const original = edit.current.automatic?.nodes.find(({ seed }) => seed.id === node.seed.id);
    if (!edit.current.arrange || !original || !width || !height || (node.x === point.x && node.y === point.y)) return;
    if (!valid) { edit.current.arrange.onReject(); return; }
    edit.current.arrange.onPlace({ seedId: node.seed.id,
      x: Math.round((point.x - original.x) / width * 10000) / 10000, y: Math.round((point.y - original.y) / height * 10000) / 10000 });
  }, [height, width]);
  const set = React.useCallback((value: Camera) => {
    const scale = limit(value.scale, 1, maxScale);
    const x = scale > 1 ? width * (scale - 1) / 2 + 26 : 0;
    const y = scale > 1 ? height * (scale - 1) / 2 + 30 : 0;
    const next = { scale, x: limit(value.x, -x, x), y: limit(value.y, -y, y) };
    live.current = next;
    const saved = trail.current;
    if (!saved.has(cameraKey) && saved.size >= 32) saved.delete(saved.keys().next().value!);
    saved.set(cameraKey, next);
    setCamera(next);
  }, [cameraKey, height, width]);
  React.useLayoutEffect(() => {
    const fit = lastFit.current !== fitRequest;
    lastFit.current = fitRequest;
    set(fit ? initialCamera : trail.current.get(cameraKey) ?? initialCamera);
  }, [cameraKey, fitRequest, set]);

  const gestures = React.useMemo(() => {
    let origin = live.current;
    let pinch = undefined as undefined | { center: Camera; x: number; y: number; distance: number };
    let panOffset = { x: 0, y: 0 };
    let card: StudioNode | undefined;
    let start = { x: 0, y: 0 };
    let cancelled = false;
    function hitCard() {
      const x = start.x - position.current.x;
      const y = start.y - position.current.y;
      return edit.current.placed?.nodes.find((node) =>
        Math.abs(node.x - x) <= node.width / 2 && Math.abs(node.y - y) <= node.height / 2);
    }
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: () => Boolean(edit.current.arrange),
      onMoveShouldSetPanResponderCapture: (_, move) => move.numberActiveTouches > 1 || Math.abs(move.dx) + Math.abs(move.dy) > 8,
      onPanResponderGrant: (_event, move) => {
        dragged.current = true;
        origin = live.current; pinch = undefined; panOffset = { x: move.dx, y: move.dy };
        start = { x: move.x0, y: move.y0 }; cancelled = false; card = undefined;
        measureSurface();
      },
      onPanResponderMove: (event, move) => {
        if (edit.current.arrange) {
          if (move.numberActiveTouches > 1) {
            cancelled = true; dragValue.current = undefined; setDrag(undefined);
          }
          if (cancelled || Math.abs(move.dx) + Math.abs(move.dy) < 4) return;
          if (!card) {
            card = hitCard();
            if (card) edit.current.onSelect(card.seed.id);
          }
          if (!card || !edit.current.placed) return;
          const point = clampStudioPosition(card, { width, height }, {
            x: card.x + move.dx - panOffset.x, y: card.y + move.dy - panOffset.y,
          });
          dragValue.current = { node: card, ...point, valid: canPlaceStudioNode(edit.current.placed, card, point) };
          setDrag(dragValue.current);
          return;
        }
        const touch = touchSpan(event);
        if (touch) {
          const started = pinch ??= { center: live.current, ...touch };
          const localX = started.x - position.current.x - width / 2;
          const localY = started.y - position.current.y - height / 2;
          const scale = limit(started.center.scale * touch.distance / started.distance, 1, maxScale);
          const ratio = scale / started.center.scale;
          set({ scale, x: localX + (started.center.x - localX) * ratio + touch.x - started.x,
            y: localY + (started.center.y - localY) * ratio + touch.y - started.y });
          return;
        }
        if (pinch) {
          origin = live.current; pinch = undefined; panOffset = { x: move.dx, y: move.dy };
        }
        set({ ...origin, x: origin.x + move.dx - panOffset.x, y: origin.y + move.dy - panOffset.y });
      },
      onPanResponderRelease: () => {
        const current = dragValue.current;
        if (edit.current.arrange && !cancelled) {
          if (current) drop(current.node, current, current.valid);
          else {
            const tapped = hitCard();
            if (tapped) edit.current.onSelect(tapped.seed.id);
          }
        }
        dragValue.current = undefined; card = undefined; setDrag(undefined);
      },
      onPanResponderTerminate: () => { dragValue.current = undefined; card = undefined; setDrag(undefined); },
      onPanResponderTerminationRequest: () => false,
    });
  }, [drop, height, measureSurface, set, width]);

  function nudge(node: StudioNode, name: string) {
    const step = 18;
    const dx = name === 'left' ? -step : name === 'right' ? step : 0;
    const dy = name === 'up' ? -step : name === 'down' ? step : 0;
    const next = clampStudioPosition(node, { width, height }, { x: node.x + dx, y: node.y + dy });
    if (placed) drop(node, next, canPlaceStudioNode(placed, node, next));
  }

  function zoom(delta: number) {
    const original = live.current;
    const scale = limit(original.scale * delta, 1, maxScale);
    const anchor = graph?.nodes.find(({ seed }) => seed.id === selected);
    const stretch = original.scale - scale;
    set({ scale, x: original.x + stretch * ((anchor?.x ?? width / 2) - width / 2),
      y: original.y + stretch * ((anchor?.y ?? height / 2) - height / 2) });
  }

  const patternId = React.useId().replace(/[^\w-]/g, '');
  const selectedNode = graph?.nodes.find(({ seed }) => seed.id === selected);
  const via = selectedNode?.via;
  const lines = React.useMemo(() => {
    const path = radial && selected !== center.id ? new Set([
      connectionId(via ?? center.id, selected), ...(via ? [connectionId(center.id, via)] : []),
    ]) : undefined;
    const links = graph?.lines ?? [];
    const hasPath = links.some((line) => path?.has(line.id));
    return links.map((line) => ({
      line, active: hasPath ? Boolean(path?.has(line.id)) : selected !== center.id && (line.a.seed.id === selected || line.b.seed.id === selected),
      branch: line.a.isCenter || line.b.isCenter || line.a.via === line.b.seed.id || line.b.via === line.a.seed.id,
    })).sort((a, b) => Number(a.active) - Number(b.active));
  }, [center.id, graph, radial, selected, via]);
  const focusRoute = lines.some(({ active }) => active);
  const shown = Math.max(0, (graph?.nodes.length ?? 0) - Number(radial));
  const hasCandidates = suggestions.length > 0 && radial;
  const label = radial && !hasCandidates ? `${expanded ? '周辺' : '直接'} ${shown}件` : `表示 ${shown} / ${(graph?.scope ?? 0) - Number(radial)}件`;
  const hidden = graph?.hidden ?? 0;
  return <View ref={surface} testID="studio-map-canvas" onLayout={({ nativeEvent }) => {
    const { width: nextWidth, height: nextHeight } = nativeEvent.layout;
    if (nextWidth > 0 && nextHeight > 0) setSize((before) => before.width === nextWidth && before.height === nextHeight
      ? before : { width: nextWidth, height: nextHeight });
    measureSurface();
  }}
    style={[styles.canvas, { backgroundColor: colors.art, borderColor: colors.border }]}>
    {!!width && <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={`${patternId}wash`} cx="45%" cy="40%" rx="77%" ry="75%">
            <Stop offset="0" stopColor={colors.light} /><Stop offset="0.55" stopColor={colors.art} /><Stop offset="1" stopColor={colors.art} />
          </RadialGradient>
          <Pattern id={patternId} width={palette === 'night' ? 47 : 23} height={palette === 'night' ? 43 : 23} patternUnits="userSpaceOnUse">
            {palette === 'indigo' ? <Path d="M0 23 V0 H23" fill="none" stroke={colors.pattern} strokeWidth={0.7} opacity={0.17} /> : <>
              <Circle cx="3" cy="3" r={palette === 'night' ? 1 : 0.7} fill={colors.pattern} opacity={palette === 'night' ? 0.42 : 0.19} />
              {palette === 'paper' ? <Path d="M12 15 l3 -1" stroke={colors.pattern} strokeWidth={0.65} opacity={0.14} /> :
                <Circle cx="29" cy="22" r="0.7" fill={colors.pattern} opacity="0.35" />}
            </>}
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${patternId}wash)`} />
        <Rect width={width} height={height} fill={`url(#${patternId})`} />
      </Svg>
    </View>}
    <View style={StyleSheet.absoluteFill} {...gestures.panHandlers}>
      {graph && <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: camera.x }, { translateY: camera.y }] }]}>
        <View style={[StyleSheet.absoluteFill, { transform: [{ scale: camera.scale }] }]}>
          <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            <Svg height={height} width={width}>
              {radial && !arrange && [0.23, 0.36].map((radius) => <Circle key={radius} cx={width / 2} cy={(height - 4) / 2} r={Math.min(height, width) * radius}
                fill="none" stroke={colors.line} opacity={0.15} strokeWidth={1} strokeDasharray={palette === 'night' ? '2 7' : undefined} />)}
              {graph.islands.map((island) => <Rect key={island.group} x={island.x - island.width / 2} y={island.y - island.height / 2} width={island.width}
                height={island.height} rx={19} fill={colors.motifs[island.group % colors.motifs.length]} stroke={colors.border} strokeOpacity={0.45} />)}
              {lines.map(({ line, active, branch }) => {
                const path = pathFor(line, radial);
                const ink = line.suggested ? colors.candidate : active ? colors.highlight : colors.line;
                return <React.Fragment key={line.id}>
                  {active && !line.suggested && <Path d={path} fill="none" stroke={ink} opacity={0.16} strokeWidth={8} strokeLinecap="round" />}
                  <Path testID={active ? 'studio-map-active-connection' : undefined} d={path} fill="none" stroke={ink}
                    strokeWidth={active ? 2.8 : !radial || branch ? 1.65 : 1.15} strokeLinecap="round" strokeDasharray={line.suggested ? '4.5 4.5' : undefined}
                    opacity={active || line.suggested ? 1 : focusRoute ? branch ? 0.55 : 0.35 : branch ? 0.9 : 0.68} />
                </React.Fragment>;
              })}
            </Svg>
          </View>
          {graph.nodes.map(({ seed, x, y, width: nodeWidth, height: nodeHeight, isCenter, suggested, via: parent }) => {
            const active = seed.id === selected;
            const intermediate = seed.id === via;
            const filled = isCenter && radial;
            const ink = filled ? colors.onCenter : colors.ink;
            const title = toSeedSnippet(seed, 55);
            const fontSize = filled ? 17 : !radial || parent ? 12 : 13;
            const labelText = studioMapLabel(title, Math.floor((nodeWidth - 16) / (fontSize * Math.min(fontScale, 1.28))));
            const moving = drag?.node.seed.id === seed.id;
            return <Pressable key={seed.id} testID={`studio-map-node-${seed.id}`} accessibilityRole="button"
              accessibilityLabel={`${title}${suggested ? '、AIの候補' : ''}`}
              accessibilityHint={suggested ? '理由と原文を確認できます' : filled ? '地図の中心のメモ' : parent ? '中心から2つ先のメモ' : undefined}
              {...buttonSelectionProps(active)} onPressIn={() => { dragged.current = false; }}
              accessibilityActions={arrange ? [{ name: 'left', label: '左へ移動' }, { name: 'right', label: '右へ移動' },
                { name: 'up', label: '上へ移動' }, { name: 'down', label: '下へ移動' }] : undefined}
              onAccessibilityAction={arrange ? (event) => {
                const node = placed?.nodes.find((item) => item.seed.id === seed.id);
                if (node) nudge(node, event.nativeEvent.actionName);
              } : undefined}
              onPress={() => {
                if (!dragged.current) onSelect(seed.id);
                dragged.current = false;
              }}
              style={({ pressed }) => [styles.node, { left: x - nodeWidth / 2, top: y - nodeHeight / 2, width: nodeWidth, height: nodeHeight,
                backgroundColor: filled ? colors.center : colors.node, borderColor: moving && !drag?.valid ? '#b34839' :
                  suggested ? colors.candidate : active || intermediate ? colors.highlight : colors.border,
                borderWidth: active || suggested ? 2 : intermediate ? 1.5 : 1, borderStyle: suggested ? 'dashed' : 'solid',
                opacity: pressed ? 0.78 : 1, zIndex: moving ? 2 : 1 },
              filled && styles.centerNode, moving && styles.moving]}>
              {filled && <View aria-hidden style={styles.centerMarker}>
                <Ionicons name="leaf-outline" color={ink} size={12} />
                <Text maxFontSizeMultiplier={1.1} style={[styles.centerLabel, { color: ink }]}>中心</Text>
              </View>}
              <Text maxFontSizeMultiplier={1.28} numberOfLines={2} style={[styles.nodeText, { color: ink }, filled && styles.centerText,
                (!radial || parent) && styles.clusterText]}>{labelText}</Text>
              {arrange && <Ionicons aria-hidden name="move-outline" size={12} color={ink} style={styles.handle} />}
            </Pressable>;
          })}
        </View>
      </View>}
    </View>
    <View pointerEvents="box-none" style={styles.top}>
      <View pointerEvents="box-none" style={styles.topLeading}>
        {back && <Pressable accessibilityRole="button" accessibilityLabel="前の中心へ戻る" accessibilityHint={back.title} onPress={back.onPress}
          style={({ pressed }) => [styles.mapButton, styles.backButton, { maxWidth: Math.max(54, Math.min(170, width * 0.37)),
            backgroundColor: colors.node, borderColor: colors.border }, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={15} color={colors.ink} />
          <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={[styles.buttonText, styles.backTitle, { color: colors.ink }]}>{back.title}</Text>
        </Pressable>}
        {radial && graph && hidden > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`表示していない ${hidden}件を一覧で見る`}
          onPress={() => onMore(graph.nodes.map(({ seed }) => seed.id))}
          style={({ pressed }) => [styles.mapButton, { backgroundColor: colors.node, borderColor: colors.border }, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={1.15} style={[styles.buttonText, { color: colors.ink }]}>ほか{hidden}件</Text>
          <Ionicons name="chevron-forward" size={12} color={colors.ink} />
        </Pressable> : graph && <Text pointerEvents="none" style={[styles.caption, { color: colors.ink, backgroundColor: colors.node }]}>{label}</Text>}
      </View>
      {onDepth && <Pressable accessibilityRole="button" {...buttonSelectionProps(expanded)}
        accessibilityLabel={expanded ? '直接のつながりに戻す' : '2つ先まで見る'} onPress={onDepth}
        style={({ pressed }) => [styles.mapButton, { backgroundColor: expanded ? colors.center : colors.node, borderColor: expanded ? colors.center : colors.border },
          pressed && styles.pressed]}>
        <Ionicons name="git-branch-outline" size={15} color={expanded ? colors.onCenter : colors.ink} />
        <Text maxFontSizeMultiplier={1.15} style={[styles.buttonText, { color: expanded ? colors.onCenter : colors.ink }]}>2つ先まで</Text>
      </Pressable>}
      {onGroups && <Pressable accessibilityRole="button" accessibilityLabel="まとまりを探す" onPress={onGroups}
        style={({ pressed }) => [styles.mapButton, { backgroundColor: colors.node, borderColor: colors.border }, pressed && styles.pressed]}>
        <Ionicons name="layers-outline" size={15} color={colors.ink} />
        <Text maxFontSizeMultiplier={1.15} style={[styles.buttonText, { color: colors.ink }]}>まとまり</Text>
      </Pressable>}
    </View>
    {!arrange && <View pointerEvents="box-none" style={styles.bottom}>
      <View pointerEvents="none" style={styles.legend}>
        {radial && graph?.scope === 1 ? <Text style={[styles.keyText, { color: colors.ink }]}>つながりはまだありません</Text>
          : <View style={styles.key}><View style={[styles.keyLine, { borderTopColor: focusRoute ? colors.highlight : colors.line }]} />
            <Text style={[styles.keyText, { color: colors.ink }]}>{focusRoute && radial ? '選んだ経路' : 'つながり'}</Text></View>}
        {hasCandidates && <View style={styles.key}><View style={[styles.keyLine, styles.dottedKey, { borderTopColor: colors.candidate }]} />
          <Text style={[styles.keyText, { color: colors.ink }]}>AIの候補</Text></View>}
      </View>
      {onStartArrange && <Pressable accessibilityRole="button" accessibilityLabel="マインドマップの配置を編集" onPress={onStartArrange}
        style={({ pressed }) => [styles.mapButton, styles.arrange, { backgroundColor: colors.node, borderColor: colors.border }, pressed && styles.pressed]}>
        <Ionicons name="move-outline" size={16} color={colors.ink} />
        <Text maxFontSizeMultiplier={1.15} style={[styles.buttonText, { color: colors.ink }]}>配置</Text>
      </Pressable>}
      <View style={[styles.controls, { backgroundColor: colors.node, borderColor: colors.border }]}>
        <IconButton label="地図を縮小" icon="remove" color={colors.ink} background="transparent" disabled={camera.scale <= 1} onPress={() => zoom(1 / 1.25)} />
        <IconButton label="地図を拡大" icon="add" color={colors.ink} background="transparent" disabled={camera.scale >= maxScale} onPress={() => zoom(1.25)} />
        <Pressable accessibilityRole="button" accessibilityLabel="地図を画面に合わせる" onPress={() => set(initialCamera)}
          style={({ pressed }) => [styles.fit, { borderLeftColor: colors.border }, pressed && styles.pressed]}>
          <Ionicons name="scan-outline" color={colors.ink} size={16} />
          <Text maxFontSizeMultiplier={1.15} style={[styles.buttonText, { color: colors.ink }]}>全体</Text>
        </Pressable>
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  canvas: { flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', borderRadius: 21, borderWidth: 1, userSelect: 'none' },
  node: { position: 'absolute', paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center', borderRadius: 12,
    boxShadow: '0px 2px 5px rgba(23, 37, 25, 0.14)' },
  centerNode: { borderRadius: 15, boxShadow: '0px 4px 9px rgba(23, 37, 25, 0.22)' },
  handle: { position: 'absolute', top: 4, right: 5, opacity: 0.63 },
  moving: { boxShadow: '0px 7px 14px rgba(21, 42, 31, 0.28)' },
  centerMarker: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
  centerLabel: { fontSize: 10, fontWeight: '700', lineHeight: 13 },
  nodeText: { fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  centerText: { fontSize: 17, lineHeight: 21, fontFamily: theme.fonts.serif },
  clusterText: { fontSize: 12, lineHeight: 15 },
  top: { position: 'absolute', top: 6, left: 7, right: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  topLeading: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 },
  mapButton: { minHeight: 44, borderRadius: 11, borderWidth: 1, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  buttonText: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  backButton: { minWidth: 44, flexShrink: 1 },
  backTitle: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  bottom: { position: 'absolute', bottom: 7, left: 8, right: 7, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 },
  arrange: { minWidth: 47 },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '700', borderRadius: 8, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 7 },
  legend: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 2, paddingBottom: 4 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyLine: { width: 15, borderTopWidth: 2 },
  dottedKey: { borderStyle: 'dashed' },
  keyText: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  controls: { flexDirection: 'row', borderWidth: 1, borderRadius: 13 },
  fit: { minHeight: 44, minWidth: 60, borderLeftWidth: StyleSheet.hairlineWidth, paddingHorizontal: 5, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 4 },
});
