import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { StudioPreferences } from '../domain/plus/contracts';
import type { Suggestion } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import { constellationGraph, radialGraph, type ConstellationGroup, type StudioGraph } from '../domain/plus/studioGraph';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { IconButton } from './StudioUI';

export const mapPalettes = {
  paper: { label: '和紙', art: '#e5e9d9', light: '#faf5e5', pattern: '#617c60', node: '#fffcf1', ink: '#263e31', border: '#a7b49a',
    center: '#204e39', onCenter: '#fffdf2', line: '#597861', highlight: '#204e39', candidate: '#854b30', motifs: ['#e1e9d6', '#eee6d4', '#dce8e1'] },
  indigo: { label: '藍', art: '#d8e5ee', light: '#f0f6f2', pattern: '#426482', node: '#f7fcfd', ink: '#203a53', border: '#9ab6ca',
    center: '#254e70', onCenter: '#f6fcff', line: '#52718d', highlight: '#254e70', candidate: '#854928', motifs: ['#d2e2ee', '#e0e5f3', '#d4e5e6'] },
  night: { label: '月夜', art: '#151e35', light: '#333b59', pattern: '#b2bce1', node: '#2c3956', ink: '#f5f0ff', border: '#6d80a8',
    center: '#dac9f4', onCenter: '#20172f', line: '#a1acd2', highlight: '#decaff', candidate: '#fbd0a5', motifs: ['#26334f', '#332f49', '#23364c'] },
};

type Camera = { x: number; y: number; scale: number };
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

export function StudioMapCanvas({ index, center, selected, emphasisId, mode, palette, height, suggestions, expanded, groups, immersive, viewKey, onSelect }: {
  index: MapIndex; center: Seed; selected: string; emphasisId?: string; mode: 'radial' | 'constellation'; palette: StudioPreferences['palette']; height: number;
  suggestions: readonly Suggestion[]; expanded: boolean; groups?: ConstellationGroup[]; immersive: boolean; viewKey: string; onSelect: (id: string) => void;
}) {
  const [width, setWidth] = React.useState(0);
  const [camera, setCamera] = React.useState(initialCamera);
  const live = React.useRef(initialCamera);
  const trail = React.useRef(new Map<string, Camera>());
  const dragged = React.useRef(false);
  const position = React.useRef({ x: 0, y: 0 });
  const surface = React.useRef<View>(null);
  const colors = mapPalettes[palette];
  const radial = mode === 'radial';
  const cameraKey = JSON.stringify([mode, viewKey, center.id]);
  const graph = React.useMemo(() => {
    const size = { width, height };
    return width ? (radial ? radialGraph(index, center, size, suggestions, expanded, emphasisId) : constellationGraph(index, center, size, groups)) : undefined;
  }, [center, emphasisId, expanded, groups, height, index, radial, suggestions, width]);
  const set = React.useCallback((value: Camera) => {
    const scale = limit(value.scale, 1, maxScale);
    const x = width * (scale - 1) / 2 + 26;
    const y = height * (scale - 1) / 2 + 30;
    const next = { scale, x: limit(value.x, -x, x), y: limit(value.y, -y, y) };
    live.current = next;
    const saved = trail.current;
    if (!saved.has(cameraKey) && saved.size >= 32) saved.delete(saved.keys().next().value!);
    saved.set(cameraKey, next);
    setCamera(next);
  }, [cameraKey, height, width]);
  React.useLayoutEffect(() => { set(trail.current.get(cameraKey) ?? initialCamera); }, [cameraKey, set]);

  const gestures = React.useMemo(() => {
    let origin = live.current;
    let pinch = undefined as undefined | { center: Camera; x: number; y: number; distance: number };
    let panOffset = { x: 0, y: 0 };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, move) => move.numberActiveTouches > 1 ||
        (Math.abs(move.dx) + Math.abs(move.dy) > 8 && (immersive || live.current.scale > 1 || Math.abs(move.dx) > Math.abs(move.dy))),
      onPanResponderGrant: (_event, move) => {
        dragged.current = true;
        origin = live.current; pinch = undefined; panOffset = { x: move.dx, y: move.dy };
        surface.current?.measureInWindow((x, y) => { position.current = { x, y }; });
      },
      onPanResponderMove: (event, move) => {
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
      onPanResponderTerminationRequest: () => false,
    });
  }, [height, immersive, set, width]);

  function zoom(delta: number) {
    const original = live.current;
    const scale = limit(original.scale * delta, 1, maxScale);
    const anchor = graph?.nodes.find(({ seed }) => seed.id === selected);
    const stretch = original.scale - scale;
    set({ scale, x: original.x + stretch * ((anchor?.x ?? width / 2) - width / 2),
      y: original.y + stretch * ((anchor?.y ?? height / 2) - height / 2) });
  }

  const patternId = React.useId().replace(/[^\w-]/g, '');
  const highlighted = selected !== center.id && graph?.lines.some((line) => [line.a.seed.id, line.b.seed.id].includes(selected) &&
    [line.a.seed.id, line.b.seed.id].includes(center.id));
  return <View ref={surface} testID="studio-map-canvas" onLayout={({ nativeEvent }) => {
    if (nativeEvent.layout.width > 0) setWidth(nativeEvent.layout.width);
  }}
    style={[styles.canvas, { height, backgroundColor: colors.art, borderColor: colors.border }]}>
    {!!width && <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={`${patternId}wash`} cx="48%" cy="42%" rx="70%" ry="70%">
            <Stop offset="0" stopColor={colors.light} /><Stop offset="1" stopColor={colors.art} />
          </RadialGradient>
          <Pattern id={patternId} width={palette === 'night' ? 29 : 19} height={palette === 'night' ? 29 : 19} patternUnits="userSpaceOnUse">
            <Circle cx="2" cy="2" r={palette === 'night' ? 1.1 : 0.8} fill={colors.pattern} opacity={palette === 'night' ? 0.3 : 0.22} />
            {palette === 'night' && <Circle cx="19" cy="15" r="0.65" fill={colors.pattern} opacity="0.28" />}
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
              {radial && [0.2, 0.295, 0.38].map((radius) => <Circle key={radius} cx={width / 2} cy={(height - 20) / 2} r={Math.min(height, width) * radius}
                fill="none" stroke={colors.line} opacity={0.19} strokeWidth={1} strokeDasharray={palette === 'night' ? '2 5' : undefined} />)}
              {graph.islands.map((island) => <Rect key={island.group} x={island.x - island.width / 2} y={island.y - island.height / 2} width={island.width}
                height={island.height} rx={19} fill={colors.motifs[island.group % colors.motifs.length]} stroke={colors.border} strokeOpacity={0.45} />)}
              {graph.lines.map((line) => {
                const ids = [line.a.seed.id, line.b.seed.id];
                const active = ids.includes(selected) && (!highlighted || ids.includes(center.id));
                const path = pathFor(line, radial);
                const ink = line.suggested ? colors.candidate : active ? colors.highlight : colors.line;
                return <React.Fragment key={line.id}>
                  {active && !line.suggested && <Path d={path} fill="none" stroke={ink} opacity={0.15} strokeWidth={7} strokeLinecap="round" />}
                  <Path d={path} fill="none" stroke={ink} strokeWidth={active ? 2.6 : 1.5} strokeLinecap="round"
                    strokeDasharray={line.suggested ? '4.5 4.5' : undefined} opacity={active ? 1 : 0.86} />
                </React.Fragment>;
              })}
            </Svg>
          </View>
          {graph.nodes.map(({ seed, x, y, width: nodeWidth, height: nodeHeight, isCenter, suggested }) => {
            const active = seed.id === selected;
            const filled = isCenter && radial;
            const ink = filled ? colors.onCenter : colors.ink;
            return <Pressable key={seed.id} accessibilityRole="button" accessibilityLabel={`${toSeedSnippet(seed, 55)}${suggested ? '、AIの候補' : ''}`}
              accessibilityHint={suggested ? '理由と原文を確認できます' : undefined}
              accessibilityState={{ selected: active }} onPressIn={() => { dragged.current = false; }}
              onPress={() => {
                if (!dragged.current) onSelect(seed.id);
                dragged.current = false;
              }}
              style={({ pressed }) => [styles.node, { left: x - nodeWidth / 2, top: y - nodeHeight / 2, width: nodeWidth, height: nodeHeight,
                backgroundColor: filled ? colors.center : colors.node, borderColor: suggested ? colors.candidate : active ? colors.highlight : colors.border,
                borderWidth: active || suggested ? 2 : 1, borderStyle: suggested ? 'dashed' : 'solid', opacity: pressed ? 0.78 : 1 },
              filled && styles.centerNode]}>
              {filled && <Ionicons name="leaf-outline" color={ink} size={16} style={styles.leaf} />}
              <Text maxFontSizeMultiplier={1.28} numberOfLines={2} style={[styles.nodeText, { color: ink }, filled && styles.centerText,
                !radial && styles.clusterText]}>{toSeedSnippet(seed, filled ? 27 : 20)}</Text>
            </Pressable>;
          })}
        </View>
      </View>}
    </View>
    <View pointerEvents="none" style={styles.corner}>
      <Text style={[styles.caption, { color: colors.ink, backgroundColor: colors.node }]}>{graph
        ? graph.hidden ? `${graph.scope}件中 ${graph.nodes.length}件を表示` : `${graph.nodes.length}件` : ''}</Text>
    </View>
    <View pointerEvents="box-none" style={styles.bottom}>
      <View pointerEvents="none" style={styles.legend}>
        <View style={styles.key}><View style={[styles.keyLine, { borderTopColor: colors.line }]} /><Text style={[styles.keyText, { color: colors.ink }]}>つながり</Text></View>
        {!!suggestions.length && radial && <View style={styles.key}><View style={[styles.keyLine, styles.dottedKey, { borderTopColor: colors.candidate }]} />
          <Text style={[styles.keyText, { color: colors.ink }]}>AIの候補</Text></View>}
      </View>
      <View style={[styles.controls, { backgroundColor: colors.node, borderColor: colors.border }]}>
        <IconButton label="地図を縮小" icon="remove" color={colors.ink} background="transparent" disabled={camera.scale <= 1} onPress={() => zoom(1 / 1.25)} />
        <IconButton label="地図を拡大" icon="add" color={colors.ink} background="transparent" disabled={camera.scale >= maxScale} onPress={() => zoom(1.25)} />
        <IconButton label="地図を画面に合わせる" icon="scan-outline" color={colors.ink} background="transparent" onPress={() => set(initialCamera)} />
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  canvas: { overflow: 'hidden', position: 'relative', borderRadius: 21, borderWidth: 1 },
  node: { position: 'absolute', paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center', borderRadius: 12,
    boxShadow: '0px 2px 5px rgba(23, 37, 25, 0.14)' },
  centerNode: { borderRadius: 15, boxShadow: '0px 4px 9px rgba(23, 37, 25, 0.22)' },
  leaf: { marginBottom: 2 },
  nodeText: { userSelect: 'none', fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  centerText: { fontSize: 16, lineHeight: 21, fontFamily: theme.fonts.serif },
  clusterText: { fontSize: 11, lineHeight: 14 },
  corner: { position: 'absolute', top: 9, left: 9, alignItems: 'flex-start' },
  bottom: { position: 'absolute', bottom: 7, left: 12, right: 7, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '700', borderRadius: 8, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 7 },
  legend: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 2, paddingBottom: 4 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyLine: { width: 15, borderTopWidth: 2 },
  dottedKey: { borderStyle: 'dashed' },
  keyText: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  controls: { flexDirection: 'row', borderWidth: 1, borderRadius: 13 },
});
