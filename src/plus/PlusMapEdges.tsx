import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { routeMapFiber, type MapBox } from '../domain/plus/mapGeometry';
import { PlusMapFibers, type MapFiberPaint } from './PlusMapFibers';
import { soilMapColors } from './PlusMapSoil';
import { plusStyles } from './PlusUI';

export type PlotEdge = { id: string; from: string; to: string; candidate?: boolean };

export function PlusMapEdges({ points, edges, width, height, selectedId }: {
  points: ReadonlyMap<string, MapBox>; edges: readonly PlotEdge[]; width: number; height: number; selectedId?: string;
}) {
  const fibers = React.useMemo(() => {
    const boxes = [...points.values()];
    return edges.flatMap((edge) => {
      const from = points.get(edge.from);
      const to = points.get(edge.to);
      if (!from || !to) return [];
      const path = routeMapFiber(from, to, boxes, { width, height }, edge.candidate);
      return path ? [{ ...path, edge }] : [];
    });
  }, [points, edges, width, height]);

  const paint = React.useMemo(() => {
    const quiet: MapFiberPaint[] = [];
    const focused: MapFiberPaint[] = [];
    for (const { edge, strokes, branches } of fibers) {
      const active = !edge.candidate && (edge.from === selectedId || edge.to === selectedId);
      const ink = edge.candidate ? soilMapColors.candidate : active ? soilMapColors.selectedConnection : soilMapColors.connection;
      (active ? focused : quiet).push({
        id: edge.id, candidate: Boolean(edge.candidate), strokes, branches, ink,
        thickness: active ? 2.35 : edge.candidate ? 1.65 : 1.9,
        halo: active ? { thickness: 4, ink: soilMapColors.selectedHalo } : undefined,
        branchPaint: active ? { thickness: 1.1, ink: soilMapColors.selectedBranch } : { thickness: 0.95, ink: soilMapColors.branch },
      });
    }
    return [...quiet, ...focused];
  }, [fibers, selectedId]);

  return <View testID="map-link-layer" pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={styles.layer}>
    <PlusMapFibers paths={paint} width={width} height={height} />
  </View>;
}

export function PlusMapLegend({ children, candidate = false }: { children: React.ReactNode; candidate?: boolean }) {
  return <View style={styles.legend}>
    <View aria-hidden style={styles.swatch}>
      {candidate ? <View style={styles.candidateSwatch}><View style={styles.dash} /><View style={styles.dash} /><View style={styles.dash} /></View>
        : <View style={styles.linkSwatch} />}
    </View>
    <Text style={[plusStyles.meta, styles.legendText]}>{children}</Text>
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  legend: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  legendText: { flex: 1 },
  swatch: { width: 24, height: 15, marginTop: 2, borderRadius: 7.5, backgroundColor: soilMapColors.ground,
    justifyContent: 'center', alignItems: 'center' },
  linkSwatch: { width: 15, height: 2, backgroundColor: soilMapColors.connection, borderRadius: 1 },
  candidateSwatch: { flexDirection: 'row', gap: 3 },
  dash: { width: 4, height: 1.5, borderRadius: 1, backgroundColor: soilMapColors.candidate },
});
