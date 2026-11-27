import * as React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import paper from '../../assets/paper.png';
import { mapGroupLinks, type MapGroup } from '../domain/plus/map';
import type { SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { PlusMapEdges, PlusMapLegend } from './PlusMapEdges';
import { buttonSelectionProps, plusStyles } from './PlusUI';

const inset = 14;
const gapX = 36;
const gapY = 28;
const cardHeight = 102;
const stagger = 14;

export function PlusMapOverview({ groups, edges, diagram, expandedId, onGroup }: {
  groups: MapGroup[]; edges: readonly SeedConnection[]; diagram: boolean; expandedId?: string; onGroup: (group: MapGroup) => void;
}) {
  const [width, setWidth] = React.useState(0);
  const columns = groups.length === 1 ? 1 : 2;
  const rows = Math.ceil(groups.length / columns);
  const height = inset * 2 + rows * cardHeight + Math.max(0, rows - 1) * gapY + (columns === 2 ? stagger : 0);
  const cardWidth = (width - inset * 2 - (columns - 1) * gapX) / columns;
  const points = React.useMemo(() => new Map(groups.map((group, i) => [group.id, {
    x: inset + cardWidth / 2 + (i % columns) * (cardWidth + gapX),
    y: inset + cardHeight / 2 + Math.floor(i / columns) * (cardHeight + gapY) + (i % columns) * stagger,
    width: cardWidth, height: cardHeight,
  }])), [cardWidth, columns, groups]);
  const links = React.useMemo(() => diagram ? mapGroupLinks(edges, groups) : [], [diagram, edges, groups]);
  const lines = React.useMemo(() => links.map(({ groups: [a, b] }) => ({ id: JSON.stringify([a.id, b.id]), from: a.id, to: b.id })), [links]);
  const draw = diagram && cardWidth >= 76;

  return <View style={plusStyles.row}>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={diagram ? 'まとまりの地図' : undefined}
      style={diagram ? [styles.board, { height: draw ? height : undefined }, !draw && styles.compact] : styles.compact}>
      {diagram && <Image source={paper} resizeMode="cover" accessible={false} style={styles.paper} />}
      {draw && <PlusMapEdges points={points} edges={lines} width={width} height={height} selectedId={expandedId} />}
      {groups.map((group, i) => {
        const box = points.get(group.id)!;
        const manual = group.kind === 'manual';
        const selected = group.id === expandedId;
        return <Pressable key={group.id} accessibilityRole="button" {...buttonSelectionProps(selected)}
          accessibilityLabel={`${group.label} · ${group.seedIds.length}件${manual ? ' · 自分のまとまり' : ''}`}
          onPress={() => onGroup(group)} style={({ pressed }) => [styles.group, draw && styles.organism, draw && i % 2 === 1 && styles.mirrored,
            manual && styles.manual, selected && styles.selected,
            draw && { position: 'absolute', left: box.x - box.width / 2, top: box.y - box.height / 2, width: box.width, height: box.height },
            pressed && styles.pressed]}>
          {draw && manual && <Text style={styles.owner}>自分のまとまり</Text>}
          <Text numberOfLines={draw ? 2 : undefined} style={draw ? styles.label : styles.shortLabel}>{group.label}</Text>
          <Text style={[styles.count, draw && styles.countSeal, draw && manual && styles.countManual]}>{group.seedIds.length}件</Text>
        </Pressable>;
      })}
    </View>
    {draw && links.length > 0 && <PlusMapLegend>実線はまとまりをまたぐ確定接続{links.length > 1 ? ` · ${links.length}組` : ` · ${links[0].edges.length}件`}</PlusMapLegend>}
  </View>;
}

const styles = StyleSheet.create({
  board: { overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: theme.colors.rule, backgroundColor: '#f1f1e7' },
  paper: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.34 },
  compact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { minHeight: 44, maxWidth: '100%', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 6, gap: 2 },
  organism: { borderColor: '#a8ae98', zIndex: 1, borderTopLeftRadius: 29, borderTopRightRadius: 23,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 31, paddingHorizontal: 12,
    shadowColor: theme.colors.shadow, shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4 },
  mirrored: { borderTopLeftRadius: 23, borderTopRightRadius: 31, borderBottomLeftRadius: 29, borderBottomRightRadius: 22 },
  manual: { borderColor: '#7f9e87', backgroundColor: '#e8efe2' },
  selected: { borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  pressed: { opacity: 0.74 },
  label: { fontFamily: theme.fonts.serif, fontSize: 16, lineHeight: 20, fontWeight: '600', color: theme.colors.text, includeFontPadding: false },
  shortLabel: { fontSize: 15, lineHeight: 20, color: theme.colors.text },
  owner: { fontSize: 12, lineHeight: 16, color: theme.colors.primary, includeFontPadding: false },
  count: { fontSize: 13, lineHeight: 17, color: theme.colors.textMuted, includeFontPadding: false },
  countSeal: { alignSelf: 'flex-start', paddingHorizontal: 7, borderRadius: 12, backgroundColor: '#eeeadb' },
  countManual: { backgroundColor: '#d9e6d3', color: theme.colors.primaryPressed },
});
