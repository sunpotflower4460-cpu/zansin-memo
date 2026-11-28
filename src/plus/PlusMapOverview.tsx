import * as React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { mapGroupLinks, type MapGroup } from '../domain/plus/map';
import type { SeedConnection } from '../domain/types';
import { theme } from '../styles/theme';
import { PlusMapEdges, PlusMapLegend, useRoutedMapEdges } from './PlusMapEdges';
import { PlusMapSoil, soilMapColors, soilMapStyles, type MapCardPressState } from './PlusMapSoil';
import { buttonSelectionProps, plusStyles } from './PlusUI';

const inset = 16;
const gapX = 36;
const gapY = 26;
const baseCardHeight = 110;
const stagger = 14;

export function PlusMapOverview({ groups, edges, diagram, expandedId, onGroup, paper }: {
  groups: MapGroup[]; edges: readonly SeedConnection[]; diagram: boolean; expandedId?: string; onGroup: (group: MapGroup) => void; paper?: boolean;
}) {
  const [width, setWidth] = React.useState(0);
  const { fontScale } = useWindowDimensions();
  const cardHeight = Math.ceil(baseCardHeight * Math.max(1, fontScale));
  const columns = groups.length === 1 ? 1 : 2;
  const rows = Math.ceil(groups.length / columns);
  const height = inset * 2 + rows * cardHeight + Math.max(0, rows - 1) * gapY + (columns === 2 ? stagger : 0);
  const cardWidth = Math.min(180, (width - inset * 2 - (columns - 1) * gapX) / columns);
  const points = React.useMemo(() => {
    const groupWidth = columns * cardWidth + (columns - 1) * gapX;
    const left = (width - groupWidth) / 2;
    return new Map(groups.map((group, i) => {
      const column = i % columns;
      const alone = column === 0 && i === groups.length - 1;
      return [group.id, {
        x: alone ? width / 2 : left + cardWidth / 2 + column * (cardWidth + gapX),
        y: inset + cardHeight / 2 + Math.floor(i / columns) * (cardHeight + gapY) + column * stagger,
        width: cardWidth, height: cardHeight,
      }];
    }));
  }, [width, cardWidth, cardHeight, columns, groups]);
  const links = React.useMemo(() => diagram ? mapGroupLinks(edges, groups) : [], [diagram, edges, groups]);
  const lines = React.useMemo(() => links.map(({ groups: [a, b] }) => ({ id: JSON.stringify([a.id, b.id]), from: a.id, to: b.id })), [links]);
  const draw = diagram && cardWidth >= 104;
  const fibers = useRoutedMapEdges(points, lines, draw ? width : 0, height);
  const visibleLinks = links.filter((_, i) => fibers.some(({ edge }) => edge.id === lines[i].id));

  return <View style={plusStyles.row}>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={diagram ? 'まとまりの地図' : undefined}
      style={draw ? [soilMapStyles.board, paper && soilMapStyles.paper, { height }] : styles.compact}>
      {draw && !paper && <PlusMapSoil />}
      {draw && <PlusMapEdges fibers={fibers} width={width} height={height} selectedId={expandedId} paper={paper} />}
      {groups.map((group) => {
        const box = points.get(group.id)!;
        const manual = group.kind === 'manual';
        const selected = group.id === expandedId;
        return <Pressable key={group.id} accessibilityRole="button" {...buttonSelectionProps(selected)}
          accessibilityLabel={`${group.label} · ${group.seedIds.length}件${manual ? ' · 自分のまとまり' : ''}`}
          onPress={() => onGroup(group)} style={({ pressed, focused }: MapCardPressState) => draw ? [styles.group, soilMapStyles.seed, styles.pod,
            { left: box.x - box.width / 2, top: box.y - box.height / 2, width: box.width, height: box.height },
            manual && styles.manualPod, selected && soilMapStyles.selected, paper && soilMapStyles.paperCard, paper && selected && soilMapStyles.paperSelected,
            focused && soilMapStyles.focused, pressed && styles.pressed]
            : [styles.group, manual && styles.manual, selected && styles.selected, pressed && styles.pressed]}>
          {draw && selected && !paper && <View aria-hidden pointerEvents="none" style={soilMapStyles.ring} />}
          {draw && manual && !paper && <Text numberOfLines={1} style={styles.owner}>自分のまとまり</Text>}
          <Text numberOfLines={draw ? 2 : undefined} style={draw ? styles.label : styles.shortLabel}>{group.label}</Text>
          <Text style={[styles.count, draw && !paper && styles.countSeal]}>{group.seedIds.length}件</Text>
        </Pressable>;
      })}
    </View>
    {visibleLinks.length > 0 && <PlusMapLegend paper={paper}>{paper ? 'まとまりをまたぐつながり' : '実線はまとまりをまたぐ確定接続'}{visibleLinks.length > 1 ? ` · ${visibleLinks.length}組` : ` · ${visibleLinks[0].edges.length}件`}</PlusMapLegend>}
  </View>;
}

const styles = StyleSheet.create({
  compact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { minHeight: 44, maxWidth: '100%', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 6, gap: 2 },
  pod: { position: 'absolute', alignItems: 'center', paddingVertical: 8, gap: 4 },
  manualPod: { backgroundColor: soilMapColors.manualGroup },
  manual: { borderColor: '#7f9e87', backgroundColor: '#e8efe2' },
  selected: { borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  pressed: { opacity: 0.74 },
  label: { fontFamily: theme.fonts.serif, fontSize: 16, lineHeight: 20, fontWeight: '600', color: theme.colors.text, textAlign: 'center', includeFontPadding: false },
  shortLabel: { fontSize: 15, lineHeight: 20, color: theme.colors.text },
  owner: { fontSize: 12, lineHeight: 16, color: soilMapColors.darkOchre, textAlign: 'center', includeFontPadding: false },
  count: { fontSize: 13, lineHeight: 17, color: theme.colors.textMuted, includeFontPadding: false },
  countSeal: { paddingHorizontal: 7, borderRadius: 9, color: soilMapColors.darkOchre, backgroundColor: '#e8d8b9' },
});
