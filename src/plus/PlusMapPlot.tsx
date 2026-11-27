import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import paper from '../../assets/paper.png';
import type { MapView } from '../domain/plus/contracts';
import type { Seed, SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { toSeedSnippet } from '../utils/seedText';
import { plusStyles } from './PlusUI';

const height = 318;
const cardW = 144;
const cardH = 80;

export function PlusMapPlot({ seeds, connections, candidates, positions, viewport, selectedId, onSelect }: {
  seeds: Seed[]; connections: SeedConnection[]; positions: MapView['positions']; viewport: MapView['viewport'];
  candidates?: Array<{ id: string; pair: [string, string] }>; selectedId?: string; onSelect: (id: string) => void;
}) {
  const [width, setWidth] = React.useState(0);
  const { scale } = viewport;
  const points = new Map(seeds.flatMap((seed) => {
    if (!Object.hasOwn(positions, seed.id)) return [];
    const position = positions[seed.id];
    const x = width / 2 + (position.x - viewport.x) * scale;
    const y = height / 2 + (position.y - viewport.y) * scale;
    return x + cardW / 2 < 0 || x - cardW / 2 > width || y + cardH / 2 < 0 || y - cardH / 2 > height
      ? [] : [[seed.id, { seed, x, y, pinned: position.pinned }] as const];
  }));
  const rendered = [...points.values()];
  const lines = [...connections.map((edge) => ({ ...edge, candidate: false })),
    ...(candidates ?? []).map(({ id, pair }) => ({ id, aSeedId: pair[0], bSeedId: pair[1], candidate: true }))];
  return <View style={plusStyles.row}>
    <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessibilityLabel="確定したつながりの図">
      <Image source={paper} style={styles.paper} resizeMode="cover" accessible={false} />
      {width > 0 && lines.map((edge) => {
        const a = points.get(edge.aSeedId);
        const b = points.get(edge.bSeedId);
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) return null;
        const trim = Math.min(length, 2 * Math.min(cardW / 2 * length / Math.abs(dx), cardH / 2 * length / Math.abs(dy)));
        const visible = length - trim;
        if (visible <= 0) return null;
        const selected = a.seed.id === selectedId || b.seed.id === selectedId;
        return <View key={edge.id} pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[styles.line, selected && styles.lineSelected, edge.candidate && styles.candidate, {
          width: visible, left: (a.x + b.x - visible) / 2, top: (a.y + b.y) / 2, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        }]} />;
      })}
      {width > 0 && rendered.map(({ seed, x, y, pinned }) => <Pressable key={seed.id} onPress={() => onSelect(seed.id)}
        accessibilityRole="button" accessibilityState={{ selected: selectedId === seed.id }}
        accessibilityLabel={`${toSeedSnippet(seed, 50)}${pinned ? '。位置を固定しています' : ''}`}
        style={[styles.node, { left: x - cardW / 2, top: y - cardH / 2 }, selectedId === seed.id && styles.nodeSelected]}>
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
  line: { position: 'absolute', backgroundColor: '#628370', height: 2 },
  lineSelected: { height: 3, backgroundColor: theme.colors.primary },
  candidate: { height: 1, backgroundColor: 'transparent', borderTopColor: theme.colors.accent, borderTopWidth: 1, borderStyle: 'dashed' },
  node: { width: cardW, height: cardH, position: 'absolute', borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  nodeSelected: { borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  nodeText: { fontSize: 16, lineHeight: 21, color: theme.colors.text, fontFamily: theme.fonts.serif },
  mark: { color: theme.colors.primary, fontSize: 12, lineHeight: 15 },
});
