import { StyleSheet, View } from 'react-native';
import type { MapFiber, MapSegment } from '../domain/plus/mapGeometry';

export type MapFiberPaint = MapFiber & {
  id: string;
  candidate: boolean;
  ink: string;
  thickness: number;
  halo?: { thickness: number; ink: string };
  branchPaint: { thickness: number; ink: string };
};
export type MapFiberProps = { paths: MapFiberPaint[]; width: number; height: number };

function strokeStyle({ start, end }: MapSegment, thickness: number, backgroundColor: string) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const width = Math.hypot(dx, dy) + thickness;
  return {
    width, height: thickness, backgroundColor, borderRadius: thickness / 2,
    left: (start.x + end.x - width) / 2, top: (start.y + end.y - thickness) / 2,
    transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
  };
}

export function PlusMapFibers({ paths }: MapFiberProps) {
  return paths.map(({ id, strokes, branches, ink, thickness, halo, branchPaint }) => <View key={id} style={StyleSheet.absoluteFill}>
    {branches.map((part, i) => <View key={`branch-${i}`} style={[styles.stroke, strokeStyle(part, branchPaint.thickness, branchPaint.ink)]} />)}
    {halo && strokes.map((part, i) => <View key={`halo-${i}`} style={[styles.stroke, strokeStyle(part, halo.thickness, halo.ink)]} />)}
    {strokes.map((part, i) => <View key={i} style={[styles.stroke, strokeStyle(part, thickness, ink)]} />)}
  </View>);
}

const styles = StyleSheet.create({ stroke: { position: 'absolute' } });
