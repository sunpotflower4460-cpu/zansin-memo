import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import paper from '../../assets/paper.png';
import type { MapView } from '../domain/plus/contracts';
import { mapCell } from '../domain/plus/map';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { PlusMapEdges } from './PlusMapEdges';
import { buttonSelectionProps, plusStyles } from './PlusUI';

const height = 318;
const cardH = 80;
const inset = 8;

function focusAnchor(length: number, cardSize: number, offsets: number[]): number {
  const center = length / 2;
  const clearance = center - cardSize / 2 - inset;
  let nearest = Infinity;
  for (const offset of offsets) {
    if (offset !== 0 && Math.abs(offset) <= 2 * clearance && Math.abs(offset) < Math.abs(nearest)) nearest = offset;
  }
  return Number.isFinite(nearest) ? center - Math.sign(nearest) * Math.max(0, Math.abs(nearest) - clearance) : center;
}

export function PlusMapPlot({ seeds, connections, candidates, positions, viewport, selectedId, onSelect }: {
  seeds: Seed[]; connections: SeedConnection[]; positions: MapView['positions']; viewport: MapView['viewport'];
  candidates?: Array<{ id: string; pair: [string, string] }>; selectedId?: string; onSelect: (id: string) => void;
}) {
  const [width, setWidth] = React.useState(0);
  const points = React.useMemo(() => {
    const { scale } = viewport;
    const cardW = Math.min(144, Math.max(110, Math.floor((width - 32) / 2)));
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
  const lines = React.useMemo(() => [...connections.map(({ id, aSeedId, bSeedId }) => ({ id, from: aSeedId, to: bSeedId })),
    ...(candidates ?? []).map(({ id, pair }) => ({ id, from: pair[0], to: pair[1], candidate: true }))], [connections, candidates]);
  return <View style={plusStyles.row}>
    <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessibilityLabel="確定したつながりの図">
      <Image source={paper} style={styles.paper} resizeMode="cover" accessible={false} />
      {width > 0 && <PlusMapEdges points={points} edges={lines} width={width} height={height} selectedId={selectedId} />}
      {width > 0 && rendered.length === 0 && <Text style={styles.empty}>この位置に表示できる種はありません。</Text>}
      {rendered.map(({ seed, x, y, width: cardW, pinned }) => <Pressable key={seed.id} onPress={() => onSelect(seed.id)}
        accessibilityRole="button" {...buttonSelectionProps(selectedId === seed.id)}
        accessibilityLabel={`${toSeedSnippet(seed, 50)}${pinned ? '。位置を固定しています' : ''}`}
        style={[styles.node, { width: cardW, left: x - cardW / 2, top: y - cardH / 2 }, selectedId === seed.id && styles.nodeSelected]}>
        <Text style={styles.nodeText} numberOfLines={2}>{toSeedSnippet(seed, 60)}</Text>
        {pinned && <Text style={styles.mark}>位置固定</Text>}
      </Pressable>)}
    </View>
    <Text style={plusStyles.meta}>実線は確定したつながり。図に表示中 {rendered.length}件{rendered.length < seeds.length ? `、ほか${seeds.length - rendered.length}件はリストから読めます` : ''}。</Text>
    {Boolean(candidates?.length) && <Text style={plusStyles.meta}>点線は未採用の例の候補です。</Text>}
  </View>;
}

const styles = StyleSheet.create({
  plot: { height, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: theme.colors.rule, backgroundColor: theme.colors.surface },
  paper: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.28 },
  empty: { margin: 'auto', color: theme.colors.textMuted, fontSize: 14, padding: 16 },
  node: { height: cardH, position: 'absolute', borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  nodeSelected: { borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  nodeText: { fontSize: 16, lineHeight: 21, color: theme.colors.text, fontFamily: theme.fonts.serif },
  mark: { color: theme.colors.primary, fontSize: 12, lineHeight: 15 },
});
