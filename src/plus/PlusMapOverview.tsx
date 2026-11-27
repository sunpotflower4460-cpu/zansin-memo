import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import paper from '../../assets/paper.png';
import { mapGroupLinks, type MapGroup } from '../domain/plus/map';
import type { SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { PlusMapEdges } from './PlusMapEdges';
import { buttonSelectionProps, plusStyles } from './PlusUI';

const inset = 14;
const gapX = 36;
const gapY = 28;
const cardHeight = 102;

export function PlusMapOverview({ groups, edges, diagram, expandedId, onGroup }: {
  groups: MapGroup[]; edges: readonly SeedConnection[]; diagram: boolean; expandedId?: string; onGroup: (group: MapGroup) => void;
}) {
  const [width, setWidth] = React.useState(0);
  const columns = groups.length === 1 ? 1 : 2;
  const rows = Math.ceil(groups.length / columns);
  const height = inset * 2 + rows * cardHeight + (rows - 1) * gapY;
  const cardWidth = (width - inset * 2 - (columns - 1) * gapX) / columns;
  const points = new Map(groups.map((group, i) => [group.id, {
    x: inset + cardWidth / 2 + (i % columns) * (cardWidth + gapX),
    y: inset + cardHeight / 2 + Math.floor(i / columns) * (cardHeight + gapY), width: cardWidth, height: cardHeight,
  }]));
  const links = React.useMemo(() => diagram ? mapGroupLinks(edges, groups) : [], [diagram, edges, groups]);
  const lines = links.map(({ groups: [a, b] }) => ({ id: JSON.stringify([a.id, b.id]), from: a.id, to: b.id }));
  const draw = diagram && cardWidth >= 76;

  return <View style={plusStyles.row}>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={diagram ? 'まとまりの地図' : undefined}
      style={diagram ? [styles.board, { height: draw ? height : undefined }, !draw && styles.compact] : styles.compact}>
      {diagram && <Image source={paper} resizeMode="cover" accessible={false} style={styles.paper} />}
      {draw && <PlusMapEdges points={points} edges={lines} width={width} height={height} />}
      {groups.map((group) => {
        const box = points.get(group.id)!;
        const manual = group.kind === 'manual';
        const selected = group.id === expandedId;
        return <Pressable key={group.id} accessibilityRole="button" {...buttonSelectionProps(selected)}
          accessibilityLabel={`${group.label} · ${group.seedIds.length}件${manual ? ' · 自分のまとまり' : ''}`}
          onPress={() => onGroup(group)} style={({ pressed }) => [styles.group, manual && styles.manual, selected && styles.selected,
            draw && { position: 'absolute', left: box.x - box.width / 2, top: box.y - box.height / 2, width: box.width, height: box.height },
            pressed && styles.pressed]}>
          {draw && manual && <Text style={styles.owner}>自分のまとまり</Text>}
          <Text numberOfLines={draw ? 2 : undefined} style={draw ? styles.label : styles.shortLabel}>{group.label}</Text>
          <Text style={styles.count}>{group.seedIds.length}件</Text>
        </Pressable>;
      })}
    </View>
    {draw && links.length > 0 && <View style={styles.legend}>
      <View style={styles.swatch} accessible={false} />
      <Text style={plusStyles.meta}>実線はまとまりをまたぐ確定接続{links.length > 1 ? ` · ${links.length}組` : ` · ${links[0].edges.length}件`}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  board: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  paper: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.22 },
  compact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { minHeight: 44, maxWidth: '100%', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 6, gap: 2 },
  manual: { borderColor: theme.colors.chipSelectedBorder, backgroundColor: '#edf1e6' },
  selected: { borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  pressed: { opacity: 0.74 },
  label: { fontFamily: theme.fonts.serif, fontSize: 16, lineHeight: 20, fontWeight: '600', color: theme.colors.text },
  shortLabel: { fontSize: 15, lineHeight: 20, color: theme.colors.text },
  owner: { fontSize: 12, lineHeight: 16, color: theme.colors.primary },
  count: { fontSize: 13, lineHeight: 17, color: theme.colors.textMuted },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { backgroundColor: '#728477', width: 18, height: 2 },
});
