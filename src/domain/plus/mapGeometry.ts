type Point = { x: number; y: number };
export type MapBox = Point & { width: number; height: number };
export type MapSegment = { start: Point; end: Point };

function touchesBox({ start, end }: MapSegment, box: MapBox, margin: number): boolean {
  let enter = 0;
  let leave = 1;
  for (const [axis, size] of [['x', 'width'], ['y', 'height']] as const) {
    const radius = box[size] / 2 + margin;
    const offset = start[axis] - box[axis];
    const change = end[axis] - start[axis];
    if (change === 0) {
      if (Math.abs(offset) > radius) return false;
      continue;
    }
    const a = (-radius - offset) / change;
    const b = (radius - offset) / change;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

function outsideEdge(box: MapBox, toward: Point): Point | undefined {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  const t = Math.min((box.width / 2 + 2) / Math.abs(dx), (box.height / 2 + 2) / Math.abs(dy));
  return t < 1 ? { x: box.x + dx * t, y: box.y + dy * t } : undefined;
}

/** Route a real edge between card borders without suggesting that it meets a third card. */
export function routeMapLine(a: MapBox, b: MapBox, boxes: readonly MapBox[], frame: { width: number; height: number }): MapSegment[] {
  function path(via: Point[]): MapSegment[] {
    const start = outsideEdge(a, via[0] ?? b);
    const end = outsideEdge(b, via.at(-1) ?? a);
    if (!start || !end) return [];
    if (!via.length && (end.x - start.x) * (b.x - a.x) + (end.y - start.y) * (b.y - a.y) <= 0) return [];
    const points = [start, ...via, end];
    if (points.some(({ x, y }) => x < 2 || y < 2 || x > frame.width - 2 || y > frame.height - 2)) return [];
    const segments = points.slice(1).flatMap((point, i) => {
      const previous = points[i];
      return previous.x === point.x && previous.y === point.y ? [] : [{ start: previous, end: point }];
    });
    return segments.some((segment) => boxes.some((box) => touchesBox(segment, box, box === a || box === b ? 0 : 4))) ? [] : segments;
  }

  const direct = path([]);
  if (direct.length) return direct;

  const xs = [(a.x + b.x) / 2, Math.min(a.x - a.width / 2, b.x - b.width / 2) - 8,
    Math.max(a.x + a.width / 2, b.x + b.width / 2) + 8];
  const ys = [(a.y + b.y) / 2, Math.min(a.y - a.height / 2, b.y - b.height / 2) - 8,
    Math.max(a.y + a.height / 2, b.y + b.height / 2) + 8];
  const alternatives = [
    ...xs.map((x) => [{ x, y: a.y }, { x, y: b.y }]),
    ...ys.map((y) => [{ x: a.x, y }, { x: b.x, y }]),
  ];
  let best: MapSegment[] = [];
  let shortest = Infinity;
  for (const bends of alternatives) {
    const route = path(bends);
    if (!route.length) continue;
    const length = route.reduce((total, { start, end }) => total + Math.hypot(end.x - start.x, end.y - start.y), 0);
    if (length < shortest) { shortest = length; best = route; }
  }
  return best;
}
