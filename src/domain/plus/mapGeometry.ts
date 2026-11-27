type Point = { x: number; y: number };
export type MapBox = Point & { width: number; height: number };
export type MapSegment = { start: Point; end: Point };
export type MapFiber = { strokes: MapSegment[]; boutons: Point[] };
type Frame = { width: number; height: number };

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

function segmentsBetween(points: readonly Point[]): MapSegment[] {
  return points.slice(1).flatMap((end, i) => {
    const start = points[i];
    return start.x === end.x && start.y === end.y ? [] : [{ start, end }];
  });
}

function clearsCards(segments: MapSegment[], a: MapBox, b: MapBox, boxes: readonly MapBox[], frame: Frame): boolean {
  const inFrame = ({ x, y }: Point) => x >= 2 && y >= 2 && x <= frame.width - 2 && y <= frame.height - 2;
  return segments.every((segment) => inFrame(segment.start) && inFrame(segment.end) &&
    !boxes.some((box) => touchesBox(segment, box, box === a || box === b ? 0 : 4)));
}

/** Route a real edge between card borders without suggesting that it meets a third card. */
export function routeMapLine(a: MapBox, b: MapBox, boxes: readonly MapBox[], frame: Frame): MapSegment[] {
  function path(via: Point[]): MapSegment[] {
    const start = outsideEdge(a, via[0] ?? b);
    const end = outsideEdge(b, via.at(-1) ?? a);
    if (!start || !end) return [];
    if (!via.length && (end.x - start.x) * (b.x - a.x) + (end.y - start.y) * (b.y - a.y) <= 0) return [];
    const segments = segmentsBetween([start, ...via, end]);
    return clearsCards(segments, a, b, boxes, frame) ? segments : [];
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

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function bendFiber({ start, end }: MapSegment): Point[] {
  const length = distance(start, end);
  const steps = Math.max(14, Math.ceil(length / 5));
  const bow = Math.min(32, length * 0.58);
  return [start, ...Array.from({ length: steps - 1 }, (_, i) => {
    const t = (i + 1) / steps;
    const center = mix(start, end, t);
    // The curve eases into each card and bends back once, like a nerve fiber.
    const offset = bow * Math.sin(Math.PI * t) ** 2 * (1.18 - 2.1 * t);
    return { x: center.x - (end.y - start.y) / length * offset, y: center.y + (end.x - start.x) / length * offset };
  }), end];
}

function softenCorners(route: MapSegment[]): Point[] {
  const points = [route[0].start];
  for (let i = 1; i < route.length; i++) {
    const { start, end: corner } = route[i - 1];
    const { end } = route[i];
    const before = distance(start, corner);
    const after = distance(corner, end);
    const radius = Math.min(18, before / 3, after / 3);
    const entry = mix(corner, start, radius / before);
    const exit = mix(corner, end, radius / after);
    points.push(entry);
    for (const t of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) points.push(mix(mix(entry, corner, t), mix(corner, exit, t), t));
    points.push(exit);
  }
  return [...points, route[route.length - 1].end];
}

/** Draw one undirected fiber. The slight overrun at either end sits under the rounded card. */
export function routeMapSynapse(a: MapBox, b: MapBox, boxes: readonly MapBox[], frame: Frame, candidate = false): MapFiber | undefined {
  if (a.x > b.x || (a.x === b.x && a.y > b.y)) [a, b] = [b, a];
  const route = routeMapLine(a, b, boxes, frame);
  if (!route.length) return undefined;
  const bent = segmentsBetween(route.length === 1 ? bendFiber(route[0]) : softenCorners(route));
  const fiber = clearsCards(bent, a, b, boxes, frame) ? bent : route;
  let length = 0;
  const measured = fiber.map(({ start, end }) => {
    const from = length;
    length += distance(start, end);
    return { start, end, from, to: length };
  });
  function at({ start, end, from, to }: typeof measured[number], offset: number): Point {
    if (offset === from) return start;
    if (offset === to) return end;
    return mix(start, end, (offset - from) / (to - from));
  }

  if (candidate) {
    // Extremely brief strokes would lose their gaps behind the rounded caps.
    if (length < 6) return undefined;
    // Short candidates keep a visible break, independent of colour.
    const step = length / (Math.max(2, Math.round(length / 9) + 1) - 0.5);
    const strokes: MapSegment[] = [];
    for (const part of measured) {
      for (let offset = Math.floor(part.from / step) * step; offset < part.to; offset += step) {
        const start = Math.max(offset, part.from);
        const end = Math.min(offset + step / 2, part.to);
        if (start < end) strokes.push({ start: at(part, start), end: at(part, end) });
      }
    }
    return { strokes, boutons: [] };
  }

  const start = fiber[0].start;
  const end = fiber[fiber.length - 1].end;
  const underCard = (point: Point, box: MapBox) => mix(point, box, Math.min(1, 18 / distance(point, box)));
  const middle = length / 2;
  const marks = length >= 23 ? [middle - 3.7, middle + 3.7] : length >= 10 ? [middle] : [];
  return {
    strokes: [{ start: underCard(start, a), end: start }, ...fiber, { start: end, end: underCard(end, b) }],
    boutons: marks.map((offset) => at(measured.find((part) => part.to >= offset)!, offset)),
  };
}
