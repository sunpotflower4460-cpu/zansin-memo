import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { routeMapFiber, type MapBox, type MapFiber } from '../domain/plus/mapGeometry';
import { PlusMapFibers, type MapFiberPaint } from './PlusMapFibers';
import { soilMapColors } from './PlusMapSoil';
import { plusStyles } from './PlusUI';

export type PlotEdge = { id: string; from: string; to: string; candidate?: boolean };
type RoutedMapEdge = MapFiber & { edge: PlotEdge };

export function useRoutedMapEdges(points: ReadonlyMap<string, MapBox>, edges: readonly PlotEdge[], width: number, height: number): RoutedMapEdge[] {
  return React.useMemo(() => {
    if (width <= 0) return [];
    const boxes = [...points.values()];
    return edges.flatMap((edge) => {
      const from = points.get(edge.from);
      const to = points.get(edge.to);
      if (!from || !to) return [];
      const path = routeMapFiber(from, to, boxes, { width, height }, edge.candidate);
      return path ? [{ ...path, edge }] : [];
    });
  }, [points, edges, width, height]);
}

const paperMapColors = {
  ground: '#e5ebdd', connection: '#557260', branch: '#718773', selectedConnection: '#284d3d',
  selectedBranch: '#4a6f57', selectedHalo: '#d1dfce', candidate: '#934d36',
};

export function PlusMapEdges({ fibers, width, height, selectedId, paper }: {
  fibers: readonly RoutedMapEdge[]; width: number; height: number; selectedId?: string; paper?: boolean;
}) {
  const paint = React.useMemo(() => {
    const colors = paper ? paperMapColors : soilMapColors;
    const quiet: MapFiberPaint[] = [];
    const focused: MapFiberPaint[] = [];
    for (const { edge, strokes, branches } of fibers) {
      const active = !edge.candidate && (edge.from === selectedId || edge.to === selectedId);
      const ink = edge.candidate ? colors.candidate : active ? colors.selectedConnection : colors.connection;
      (active ? focused : quiet).push({
        id: edge.id, candidate: Boolean(edge.candidate), strokes, branches, ink,
        thickness: active ? 2.35 : edge.candidate ? 1.65 : 1.9,
        halo: active ? { thickness: 4, ink: colors.selectedHalo } : undefined,
        branchPaint: active ? { thickness: 1.1, ink: colors.selectedBranch } : { thickness: 0.95, ink: colors.branch },
      });
    }
    return [...quiet, ...focused];
  }, [fibers, paper, selectedId]);

  return <View testID="map-link-layer" pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={styles.layer}>
    <PlusMapFibers paths={paint} width={width} height={height} />
  </View>;
}

export function PlusMapLegend({ children, candidate = false, paper }: { children: React.ReactNode; candidate?: boolean; paper?: boolean }) {
  const colors = paper ? paperMapColors : soilMapColors;
  return <View style={styles.legend}>
    <View aria-hidden style={[styles.swatch, { backgroundColor: colors.ground }]}>
      {candidate ? <View style={styles.candidateSwatch}>{[0, 1, 2].map((n) =>
        <View key={n} style={[styles.dash, { backgroundColor: colors.candidate }]} />)}</View>
        : <View style={[styles.linkSwatch, { backgroundColor: colors.connection }]} />}
    </View>
    <Text style={[plusStyles.meta, styles.legendText]}>{children}</Text>
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  legend: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  legendText: { flex: 1 },
  swatch: { width: 24, height: 15, marginTop: 2, borderRadius: 7.5,
    justifyContent: 'center', alignItems: 'center' },
  linkSwatch: { width: 15, height: 2, borderRadius: 1 },
  candidateSwatch: { flexDirection: 'row', gap: 3 },
  dash: { width: 4, height: 1.5, borderRadius: 1 },
});
