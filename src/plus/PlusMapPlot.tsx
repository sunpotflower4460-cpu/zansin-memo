import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapView } from '../domain/plus/contracts';
import { mapCell } from '../domain/plus/map';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { PlusMapEdges, PlusMapLegend, useRoutedMapEdges } from './PlusMapEdges';
import { PlusMapSoil, soilMapColors, soilMapStyles, type MapCardPressState } from './PlusMapSoil';
import { buttonSelectionProps, plusStyles } from './PlusUI';

const height = 310;
const cardH = 92;
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

export function PlusMapPlot({ seeds, connections, candidates, positions, viewport, selectedId, onSelect, paper }: {
  seeds: Seed[]; connections: SeedConnection[]; positions: MapView['positions']; viewport: MapView['viewport'];
  candidates?: Array<{ id: string; pair: [string, string] }>; selectedId?: string; onSelect: (id: string) => void; paper?: boolean;
}) {
  const [width, setWidth] = React.useState(0);
  const points = React.useMemo(() => {
    const { scale } = viewport;
    const cardW = Math.min(138, Math.max(110, Math.floor((width - 40) / 2)));
    const scaleX = Math.min(scale, Math.max(cardW + 12, width - cardW - 2 * inset) / mapCell.x);
    const offsets = seeds.flatMap((seed) => {
      if (!Object.hasOwn(positions, seed.id)) return [];
      const position = positions[seed.id];
      return [{ seed, dx: (position.x - viewport.x) * scaleX, dy: (position.y - viewport.y) * scale, pinned: position.pinned }];
    });
    const centered = offsets.some(({ dx, dy }) => dx === 0 && dy === 0);
    const anchorX = centered ? focusAnchor(width, cardW, offsets.filter(({ dy }) => Math.abs(dy) <= mapCell.y * scale).map(({ dx }) => dx)) : width / 2;
    const anchorY = centered ? focusAnchor(height, cardH, offsets.filter(({ dx }) => Math.abs(dx) <= mapCell.x * scaleX).map(({ dy }) => dy)) : height / 2;
    return new Map(offsets.flatMap(({ seed, dx, dy, pinned }) => {
      const x = anchorX + dx;
      const y = anchorY + dy;
      return x - cardW / 2 < 1 || x + cardW / 2 > width - 1 || y - cardH / 2 < 1 || y + cardH / 2 > height - 1
        ? [] : [[seed.id, { seed, x, y, width: cardW, height: cardH, pinned }] as const];
    }));
  }, [positions, seeds, viewport, width]);
  const rendered = [...points.values()];
  const offscreen = seeds.length - rendered.length;
  const lines = React.useMemo(() => [...connections.map(({ id, aSeedId, bSeedId }) => ({ id, from: aSeedId, to: bSeedId })),
    ...(candidates ?? []).map(({ id, pair }) => ({ id, from: pair[0], to: pair[1], candidate: true }))], [connections, candidates]);
  const fibers = useRoutedMapEdges(points, lines, width, height);
  return <View style={plusStyles.row}>
    <View style={[soilMapStyles.board, paper && soilMapStyles.paper, styles.plot]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessibilityLabel="確定したつながりの図">
      {!paper && <PlusMapSoil />}
      {width > 0 && <PlusMapEdges fibers={fibers} width={width} height={height} selectedId={selectedId} paper={paper} />}
      {width > 0 && rendered.length === 0 && <Text style={[styles.empty, paper && styles.paperEmpty]}>この位置に表示できる種はありません。</Text>}
      {rendered.map(({ seed, x, y, width: cardW, pinned }) => {
        const selected = selectedId === seed.id;
        return <Pressable key={seed.id} onPress={() => onSelect(seed.id)}
          accessibilityRole="button" {...buttonSelectionProps(selected)}
          accessibilityLabel={`${toSeedSnippet(seed, 50)}${pinned ? '。位置を固定しています' : ''}`}
          style={({ pressed, focused }: MapCardPressState) => [soilMapStyles.seed, styles.node, { width: cardW, left: x - cardW / 2, top: y - cardH / 2 },
            pinned && styles.pinned, selected && soilMapStyles.selected, paper && soilMapStyles.paperCard,
            paper && selected && soilMapStyles.paperSelected, focused && soilMapStyles.focused, pressed && soilMapStyles.pressed]}>
          {selected && !paper && <View aria-hidden pointerEvents="none" style={soilMapStyles.ring} />}
          <Text style={styles.nodeText} numberOfLines={2}>{toSeedSnippet(seed, 60)}</Text>
          {pinned && <Text style={styles.mark}>位置固定</Text>}
        </Pressable>;
      })}
    </View>
    <PlusMapLegend paper={paper}>{paper ? '' : '実線は確定したつながり\n'}図に{rendered.length}件を表示{offscreen > 0 ? ` · ほか${offscreen}件はリストで` : ''}</PlusMapLegend>
    {fibers.some(({ edge }) => edge.candidate) && <PlusMapLegend candidate paper={paper}>{paper ? '点線は未採用の候補です。' : '点線は未採用の例の候補です。'}</PlusMapLegend>}
  </View>;
}

const styles = StyleSheet.create({
  plot: { height },
  empty: { margin: 'auto', color: soilMapColors.selectedConnection, fontSize: 14, padding: 16, textAlign: 'center' },
  paperEmpty: { color: '#3d5d49' },
  node: { height: cardH, position: 'absolute', justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 3, gap: 3 },
  pinned: { paddingHorizontal: 15 },
  nodeText: { fontSize: 16, lineHeight: 21, color: theme.colors.text, fontFamily: theme.fonts.serif, textAlign: 'center', includeFontPadding: false },
  mark: { color: soilMapColors.darkOchre, fontSize: 12, lineHeight: 15, textAlign: 'center', includeFontPadding: false },
});
