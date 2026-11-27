import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { routeMapSynapse, type MapBox } from '../domain/plus/mapGeometry';
import { theme } from '../styles/theme';
import { PlusMapFibers, type MapFiberPaint } from './PlusMapFibers';
import { plusStyles } from './PlusUI';

export type PlotEdge = { id: string; from: string; to: string; candidate?: boolean };

const restingInk = '#5b7365';
const focusHalo = '#ccd9c4';
const boutonFill = '#faf2d9';

export function PlusMapEdges({ points, edges, width, height, selectedId }: {
  points: ReadonlyMap<string, MapBox>; edges: readonly PlotEdge[]; width: number; height: number; selectedId?: string;
}) {
  const fibers = React.useMemo(() => {
    const boxes = [...points.values()];
    return edges.flatMap((edge) => {
      const from = points.get(edge.from);
      const to = points.get(edge.to);
      if (!from || !to) return [];
      const path = routeMapSynapse(from, to, boxes, { width, height }, edge.candidate);
      return path ? [{ ...path, edge }] : [];
    });
  }, [points, edges, width, height]);

  const paint = React.useMemo(() => {
    const quiet: MapFiberPaint[] = [];
    const focused: MapFiberPaint[] = [];
    for (const { edge, strokes, boutons } of fibers) {
      const active = !edge.candidate && (edge.from === selectedId || edge.to === selectedId);
      const ink = edge.candidate ? theme.colors.accent : active ? theme.colors.primary : restingInk;
      (active ? focused : quiet).push({
        id: edge.id, candidate: Boolean(edge.candidate), strokes, boutons, ink,
        thickness: active ? 2.6 : edge.candidate ? 1.4 : 1.85,
        halo: active ? { thickness: 5, ink: focusHalo } : undefined,
        seal: { diameter: active ? 6.6 : 5.4, fill: boutonFill, border: 1.1 },
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
        : <><View style={styles.linkSwatch} /><View style={styles.boutonSwatch} /></>}
    </View>
    <Text style={[plusStyles.meta, styles.legendText]}>{children}</Text>
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  legend: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  legendText: { flex: 1 },
  swatch: { width: 24, height: 18, justifyContent: 'center', alignItems: 'center' },
  linkSwatch: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: restingInk, borderRadius: 1 },
  boutonSwatch: { width: 5, height: 5, borderRadius: 3, backgroundColor: boutonFill, borderWidth: 1, borderColor: restingInk },
  candidateSwatch: { flexDirection: 'row', gap: 3 },
  dash: { width: 5, height: 1.5, borderRadius: 1, backgroundColor: theme.colors.accent },
});
