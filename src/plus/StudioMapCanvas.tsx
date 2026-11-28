import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';
import type { StudioPreferences } from '../domain/plus/contracts';
import type { Suggestion } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import { constellationGraph, radialGraph, type StudioGraph } from '../domain/plus/studioGraph';
import type { Seed } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { IconButton } from './StudioUI';

export const mapPalettes = {
  paper: { label: '和紙', art: '#edeee2', pattern: '#7c8868', node: '#fffdf4', ink: '#2b4030', border: '#b7c2a9',
    center: '#28543d', onCenter: '#fffdf2', line: '#6d8b6e', highlight: '#38674a', candidate: '#9a5c39', motifs: ['#e1e8d6', '#eee6d4', '#dfe8e1'] },
  indigo: { label: '藍', art: '#e6edf2', pattern: '#6b899f', node: '#fafcff', ink: '#203c51', border: '#a8bfcc',
    center: '#24536c', onCenter: '#f6fcff', line: '#6287a0', highlight: '#275975', candidate: '#92573d', motifs: ['#d7e5ec', '#e1e7f2', '#d6e8e5'] },
  night: { label: '月夜', art: '#19233a', pattern: '#8293bc', node: '#293750', ink: '#f5f0ff', border: '#5d6c90',
    center: '#d6c5f0', onCenter: '#20172f', line: '#8b9ac4', highlight: '#dbc8ff', candidate: '#ffd3a3', motifs: ['#222d46', '#2b2e47', '#22354b'] },
} satisfies Record<StudioPreferences['palette'], { label: string; art: string; pattern: string; node: string; ink: string; border: string;
  center: string; onCenter: string; line: string; highlight: string; candidate: string; motifs: string[] }>;

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
  if (Math.abs(a.x - b.x) < 45 || !radial) {
    const shift = radial ? 24 : Math.max(-26, Math.min(26, (b.x - a.x) * 0.24));
    return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 + shift} ${(a.y + b.y) / 2 - shift} ${b.x} ${b.y}`;
  }
  const mid = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
}

export function StudioMapCanvas({ index, center, selected, mode, palette, height, suggestions, expanded, onSelect }: {
  index: MapIndex; center: Seed; selected: string; mode: 'radial' | 'constellation'; palette: StudioPreferences['palette']; height: number;
  suggestions: Suggestion[]; expanded: boolean; onSelect: (id: string) => void;
}) {
  const [width, setWidth] = React.useState(0);
  const [camera, setCamera] = React.useState(initialCamera);
  const live = React.useRef(initialCamera);
  const position = React.useRef({ x: 0, y: 0 });
  const surface = React.useRef<View>(null);
  const colors = mapPalettes[palette];
  const radial = mode === 'radial';
  const graph = React.useMemo(() => {
    const size = { width, height };
    return width ? (radial ? radialGraph(index, center, size, suggestions, expanded) : constellationGraph(index, center, size)) : undefined;
  }, [center, expanded, height, index, radial, suggestions, width]);
  const set = React.useCallback((value: Camera) => {
    const scale = limit(value.scale, 1, maxScale);
    const x = width * (scale - 1) / 2 + 26;
    const y = height * (scale - 1) / 2 + 30;
    const next = { scale, x: limit(value.x, -x, x), y: limit(value.y, -y, y) };
    live.current = next;
    setCamera(next);
  }, [height, width]);
  React.useEffect(() => { set(initialCamera); }, [center.id, height, mode, set, width]);

  const gestures = React.useMemo(() => {
    let origin = live.current;
    let pinch = undefined as undefined | { center: Camera; x: number; y: number; distance: number };
    let panOffset = { x: 0, y: 0 };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, move) => move.numberActiveTouches > 1 || Math.abs(move.dx) + Math.abs(move.dy) > 8,
      onPanResponderGrant: (_event, move) => {
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
  }, [height, set, width]);

  function zoom(delta: number) {
    const original = live.current;
    const scale = limit(original.scale * delta, 1, maxScale);
    const ratio = scale / original.scale;
    set({ scale, x: original.x * ratio, y: original.y * ratio });
  }

  const patternId = React.useId().replace(/[^\w-]/g, '');
  return <View ref={surface} testID="studio-map-canvas" onLayout={({ nativeEvent }) => {
    if (nativeEvent.layout.width > 0) setWidth(nativeEvent.layout.width);
  }}
    style={[styles.canvas, { height, backgroundColor: colors.art, borderColor: colors.border }]}>
    <View style={StyleSheet.absoluteFill} {...gestures.panHandlers}>
      {graph && <View style={[StyleSheet.absoluteFill, { transform: [{ translateX: camera.x }, { translateY: camera.y }] }]}>
        <View style={[StyleSheet.absoluteFill, { transform: [{ scale: camera.scale }] }]}>
          <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
            <Svg height={height} width={width}>
              <Defs><Pattern id={patternId} width={18} height={18} patternUnits="userSpaceOnUse">
                <Circle cx="1" cy="1" r="1" fill={colors.pattern} opacity="0.27" />
              </Pattern></Defs>
              <Rect x={0} y={0} width={width} height={height} fill={`url(#${patternId})`} />
              {radial && [48, 85].map((r) => <Circle key={r} cx={width / 2} cy={(height - 20) / 2} r={r}
                fill="none" stroke={colors.line} opacity={0.17} strokeWidth={1} />)}
              {graph.islands.map((island) => <Rect key={island.group} x={island.x - island.width / 2} y={island.y - island.height / 2} width={island.width}
                height={island.height} rx={19} fill={colors.motifs[island.group % colors.motifs.length]} stroke={colors.border} strokeOpacity={0.45} />)}
              {graph.lines.map((line) => {
                const active = line.a.seed.id === selected || line.b.seed.id === selected;
                return <Path key={line.id} d={pathFor(line, radial)} fill="none"
                  stroke={line.suggested ? colors.candidate : active ? colors.highlight : colors.line}
                  strokeWidth={active ? 2 : 1.35} strokeLinecap="round" strokeDasharray={line.suggested ? '4 4' : undefined} opacity={active ? 1 : 0.74} />;
              })}
            </Svg>
          </View>
          {graph.nodes.map(({ seed, x, y, width: nodeWidth, height: nodeHeight, isCenter, suggested }) => {
            const active = seed.id === selected;
            const filled = isCenter && radial;
            const ink = filled ? colors.onCenter : colors.ink;
            return <Pressable key={seed.id} accessibilityRole="button" accessibilityLabel={`${toSeedSnippet(seed, 55)}${suggested ? '、AIの候補' : ''}`}
              accessibilityState={{ selected: active }} onPress={() => onSelect(seed.id)}
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
      <Text style={[styles.caption, { color: colors.ink }]}>{graph ? `${graph.nodes.length}件を表示${graph.hidden ? ` / ${graph.scope}件` : ''}` : ''}</Text>
    </View>
    <View pointerEvents="box-none" style={styles.bottom}>
      <View pointerEvents="none" style={styles.legend}>
        <Text style={[styles.caption, { color: colors.ink }]}>{suggestions.length && radial ? '実線　保存済み　／　点線　候補' : '線は保存したつながり'}</Text>
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
  corner: { position: 'absolute', top: 10, left: 13, right: 13 },
  bottom: { position: 'absolute', bottom: 7, left: 12, right: 7, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  legend: { flex: 1, paddingBottom: 3 },
  controls: { flexDirection: 'row', borderWidth: 1, borderRadius: 13 },
});
