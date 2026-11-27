import { StyleSheet, View } from 'react-native';
import type { MapFiber, MapSegment } from '../domain/plus/mapGeometry';

export type MapFiberPaint = MapFiber & {
  id: string;
  candidate: boolean;
  ink: string;
  thickness: number;
  halo?: { thickness: number; ink: string };
  seal: { diameter: number; border: number; fill: string };
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
  return paths.map(({ id, strokes, boutons, ink, thickness, halo, seal }) => <View key={id} style={StyleSheet.absoluteFill}>
    {halo && strokes.map((part, i) => <View key={`halo-${i}`} style={[styles.stroke, strokeStyle(part, halo.thickness, halo.ink)]} />)}
    {strokes.map((part, i) => <View key={i} style={[styles.stroke, strokeStyle(part, thickness, ink)]} />)}
    {boutons.map(({ x, y }, i) => <View key={`bouton-${i}`} style={[styles.stroke, {
      left: x - seal.diameter / 2, top: y - seal.diameter / 2, width: seal.diameter, height: seal.diameter,
      borderRadius: seal.diameter / 2, borderColor: ink, borderWidth: seal.border, backgroundColor: seal.fill,
    }]} />)}
  </View>);
}

const styles = StyleSheet.create({ stroke: { position: 'absolute' } });
