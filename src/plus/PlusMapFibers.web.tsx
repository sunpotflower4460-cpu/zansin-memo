import * as React from 'react';
import type { MapSegment } from '../domain/plus/mapGeometry';
import type { MapFiberProps } from './PlusMapFibers';

function trace(context: CanvasRenderingContext2D, strokes: MapSegment[]) {
  context.beginPath();
  let tip: MapSegment['end'] | undefined;
  for (const { start, end } of strokes) {
    if (tip?.x !== start.x || tip?.y !== start.y) context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    tip = end;
  }
}

export function PlusMapFibers({ paths, width, height }: MapFiberProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const scale = window.devicePixelRatio || 1;
    const pixelWidth = Math.ceil(width * scale);
    const pixelHeight = Math.ceil(height * scale);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, pixelWidth / scale, pixelHeight / scale);
    context.lineJoin = 'round';
    context.lineCap = 'round';

    for (const { strokes, boutons, ink, thickness, halo, seal } of paths) {
      trace(context, strokes);
      if (halo) {
        context.strokeStyle = halo.ink;
        context.lineWidth = halo.thickness;
        context.stroke();
      }
      context.strokeStyle = ink;
      context.lineWidth = thickness;
      context.stroke();

      context.fillStyle = seal.fill;
      context.lineWidth = seal.border;
      for (const { x, y } of boutons) {
        context.beginPath();
        context.arc(x, y, (seal.diameter - seal.border) / 2, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }
  }, [paths, width, height]);

  const candidates = paths.filter(({ candidate }) => candidate).length;
  return <canvas ref={ref} style={{ position: 'absolute', left: 0, top: 0, width, height }}
    data-confirmed-links={paths.length - candidates} data-candidate-links={candidates} />;
}
