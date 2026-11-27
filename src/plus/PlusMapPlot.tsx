import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import paper from '../../assets/paper.png';
import type { MapView } from '../domain/plus/contracts';
import { mapCell } from '../domain/plus/map';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { PlusMapEdges, PlusMapLegend } from './PlusMapEdges';
import { buttonSelectionProps, plusStyles } from './PlusUI';

const height = 310;
const cardH = 88;
const inset = 8;

function focusAnchor(length: number, cardSize: number, offsets: number[]): number {
  const center = length / 2;
  const clearance = center - cardSize / 2 - inset;
  let nearest = Infinity;
  for (const offset of offsets) {
    if (offset !== 0 && Math.abs(offset) <= 2 * clearance && Math.abs(offset) < Math.abs(nearest)) nearest = offset;
  }
  const anchor = Number.isFinite(nearest) ? center - Math.sign(nearest) * Math.max(0, Math.abs(nearest) - clearance) : center;
  // Share the spare space without re-centering the same cluster after a pan.
  const visible = center - cardSize / 2 - 1;
  let first = 0;
  let last = 0;
  for (const offset of offsets) {
    if (Math.abs(anchor + offset - center) <= visible) {
      first = Math.min(first, offset);
      last = Math.max(last, offset);
    }
  }
  const balanced = center - (first + last) / 2;
  return (anchor + balanced) / 2;
}

export function PlusMapPlot({ seeds, connections, candidates, positions, viewport, selectedId, onSelect }: {
  seeds: Seed[]; connections: SeedConnection[]; positions: MapView['positions']; viewport: MapView['viewport'];
  candidates?: Array<{ id: string; pair: [string, string] }>; selectedId?: string; onSelect: (id: string) => void;
}) {
  const [width, setWidth] = React.useState(0);
  const points = React.useMemo(() => {
    const { scale } = viewport;
    const cardW = Math.min(144, Math.max(110, Math.floor((width - 40) / 2)));
    const scaleX = Math.min(scale, Math.max(cardW + 12, width - cardW - 2 * inset) / mapCell.x);
    const offsets = seeds.flatMap((seed) => {
      if (!Object.hasOwn(positions, seed.id)) return [];
      const position = positions[seed.id];
      return [{ seed, dx: (position.x - viewport.x) * scaleX, dy: (position.y - viewport.y) * scale, pinned: position.pinned,
        mirrored: Math.round(position.x / mapCell.x) % 2 !== 0 }];
    });
    const centered = offsets.some(({ dx, dy }) => dx === 0 && dy === 0);
    const anchorX = centered ? focusAnchor(width, cardW, offsets.filter(({ dy }) => Math.abs(dy) <= mapCell.y * scale).map(({ dx }) => dx)) : width / 2;
    const anchorY = centered ? focusAnchor(height, cardH, offsets.filter(({ dx }) => Math.abs(dx) <= mapCell.x * scaleX).map(({ dy }) => dy)) : height / 2;
    return new Map(offsets.flatMap(({ seed, dx, dy, pinned, mirrored }) => {
      const x = anchorX + dx;
      const y = anchorY + dy;
      return x - cardW / 2 < 1 || x + cardW / 2 > width - 1 || y - cardH / 2 < 1 || y + cardH / 2 > height - 1
        ? [] : [[seed.id, { seed, x, y, width: cardW, height: cardH, pinned, mirrored }] as const];
    }));
  }, [positions, seeds, viewport, width]);
  const rendered = [...points.values()];
  const lines = React.useMemo(() => [...connections.map(({ id, aSeedId, bSeedId }) => ({ id, from: aSeedId, to: bSeedId })),
    ...(candidates ?? []).map(({ id, pair }) => ({ id, from: pair[0], to: pair[1], candidate: true }))], [connections, candidates]);
  return <View style={plusStyles.row}>
    <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessibilityLabel="確定したつながりの図">
      <Image source={paper} style={styles.paper} resizeMode="cover" accessible={false} />
      {width > 0 && <PlusMapEdges points={points} edges={lines} width={width} height={height} selectedId={selectedId} />}
      {width > 0 && rendered.length === 0 && <Text style={styles.empty}>この位置に表示できる種はありません。</Text>}
      {rendered.map(({ seed, x, y, width: cardW, pinned, mirrored }) => {
        const selected = selectedId === seed.id;
        return <Pressable key={seed.id} onPress={() => onSelect(seed.id)}
          accessibilityRole="button" {...buttonSelectionProps(selected)}
          accessibilityLabel={`${toSeedSnippet(seed, 50)}${pinned ? '。位置を固定しています' : ''}`}
          style={({ pressed }) => [styles.node, { width: cardW, left: x - cardW / 2, top: y - cardH / 2 }, mirrored && styles.mirrored,
            selected && styles.nodeSelected, pressed && styles.pressed]}>
          {selected && <View aria-hidden pointerEvents="none" style={[styles.membrane, mirrored && styles.membraneMirrored]} />}
          {!pinned && <View aria-hidden style={[styles.nucleus, selected && styles.nucleusSelected]} />}
          <Text style={styles.nodeText} numberOfLines={2}>{toSeedSnippet(seed, 60)}</Text>
          {pinned && <Text style={styles.mark}>位置固定</Text>}
        </Pressable>;
      })}
    </View>
    <PlusMapLegend>実線は確定したつながり。図に表示中 {rendered.length}件{rendered.length < seeds.length ? `、ほか${seeds.length - rendered.length}件はリストから読めます` : ''}。</PlusMapLegend>
    {Boolean(candidates?.length) && <PlusMapLegend candidate>点線は未採用の例の候補です。</PlusMapLegend>}
  </View>;
}

const styles = StyleSheet.create({
  plot: { height, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: theme.colors.rule, backgroundColor: '#f0f1e6' },
  paper: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.34 },
  empty: { margin: 'auto', color: theme.colors.textMuted, fontSize: 14, padding: 16 },
  node: { height: cardH, position: 'absolute', zIndex: 1, borderWidth: 1, borderColor: '#a3ac94',
    borderTopLeftRadius: 34, borderTopRightRadius: 25, borderBottomLeftRadius: 23, borderBottomRightRadius: 32,
    backgroundColor: theme.colors.surfaceElevated, justifyContent: 'center', alignItems: 'stretch',
    paddingHorizontal: 10, paddingVertical: 3, gap: 3,
    shadowColor: theme.colors.shadow, shadowOpacity: 0.09, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4 },
  mirrored: { borderTopLeftRadius: 25, borderTopRightRadius: 34, borderBottomLeftRadius: 32, borderBottomRightRadius: 23 },
  nodeSelected: { borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  membrane: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: '#acc3a7',
    borderTopLeftRadius: 29, borderTopRightRadius: 20, borderBottomLeftRadius: 18, borderBottomRightRadius: 27 },
  membraneMirrored: { borderTopLeftRadius: 20, borderTopRightRadius: 29, borderBottomLeftRadius: 27, borderBottomRightRadius: 18 },
  pressed: { backgroundColor: theme.colors.leafPressed },
  nucleus: { alignSelf: 'center', width: 7, height: 7, borderRadius: 4, backgroundColor: '#b7c3a9', borderWidth: 1, borderColor: '#71836e' },
  nucleusSelected: { backgroundColor: '#e4cc8e', borderColor: '#8b763d' },
  nodeText: { fontSize: 16, lineHeight: 21, color: theme.colors.text, fontFamily: theme.fonts.serif, textAlign: 'center', includeFontPadding: false },
  mark: { color: theme.colors.primary, fontSize: 12, lineHeight: 15, textAlign: 'center', includeFontPadding: false },
});
