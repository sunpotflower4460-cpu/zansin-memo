import { StyleSheet, View } from 'react-native';
import { routeMapLine, type MapBox } from '../domain/plus/mapGeometry';
import { theme } from '../styles/theme';

export type PlotEdge = { id: string; from: string; to: string; candidate?: boolean };

export function PlusMapEdges({ points, edges, width, height, selectedId }: {
  points: ReadonlyMap<string, MapBox>; edges: readonly PlotEdge[]; width: number; height: number; selectedId?: string;
}) {
  const boxes = [...points.values()];
  const touchesSelection = ({ from, to }: PlotEdge) => from === selectedId || to === selectedId;
  const ordered = selectedId ? [...edges.filter((edge) => !touchesSelection(edge)), ...edges.filter(touchesSelection)] : edges;
  return <View testID="map-link-layer" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {ordered.map((edge) => {
      const left = points.get(edge.from);
      const right = points.get(edge.to);
      if (!left || !right) return null;
      const active = touchesSelection(edge);
      const route = routeMapLine(left, right, boxes, { width, height });
      return route.map(({ start, end }, i) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        const thickness = edge.candidate ? 1 : active ? 3 : 2;
        const segmentWidth = length + (edge.candidate || route.length === 1 ? 0 : thickness / 2);
        return <View key={`${edge.id}:${i}`} style={[styles.line, { height: thickness,
          backgroundColor: active ? theme.colors.primary : '#728477',
          width: segmentWidth, left: (start.x + end.x - segmentWidth) / 2, top: (start.y + end.y - thickness) / 2,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        }, edge.candidate && styles.candidate]} />;
      });
    })}
  </View>;
}

const styles = StyleSheet.create({
  line: { position: 'absolute' },
  candidate: { backgroundColor: 'transparent', borderTopColor: theme.colors.accent, borderTopWidth: 1, borderStyle: 'dashed' },
});
