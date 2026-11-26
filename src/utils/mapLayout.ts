// 局所マップの配置計算（画面部品から切り離した純粋な処理）。
// 中心のメモを真ん中に置き、つながり先を上の行・下の行へ並べる。幅が狭いときは1行の件数を減らして行を増やし、
// どの幅でも、ノードどうし・中心と重ならない（円周配置は狭い端末で重なるため使わない）。
export const NODE_W = 112;
export const NODE_H = 72;
export const CENTER_W = 128;
export const CENTER_H = 84;
const GAP = 8; // ノード間の余白
const EDGE = 6; // 外枠との余白
const LINE_ROOM = 28; // 中心とノード行のあいだ（線が見える間隔）

export type Spot = { index: number; x: number; y: number };
export type MapLayout = { height: number; center: { x: number; y: number }; spots: Spot[] };

/** 1行に並べられる件数（幅から決める。最大3）。 */
export const rowCapacity = (width: number): number => Math.max(1, Math.min(3, Math.floor((width - EDGE * 2 + GAP) / (NODE_W + GAP))));

export const layoutMap = (count: number, width: number): MapLayout => {
  const capacity = rowCapacity(width);
  const topCount = Math.ceil(count / 2);
  const bottomCount = count - topCount;
  const topRows = Math.ceil(topCount / capacity);
  const bottomRows = Math.ceil(bottomCount / capacity);
  const rowH = NODE_H + GAP;

  const topBlock = topRows > 0 ? EDGE + topRows * rowH - GAP + LINE_ROOM : EDGE;
  const centerY = topBlock + CENTER_H / 2;
  const height = topBlock + CENTER_H + (bottomRows > 0 ? LINE_ROOM + bottomRows * rowH - GAP + EDGE : EDGE);

  const spots: Spot[] = [];
  const placeRow = (startIndex: number, items: number, y: number) => {
    const total = items * NODE_W + (items - 1) * GAP;
    const left = (width - total) / 2;
    for (let i = 0; i < items; i += 1) {
      spots.push({ index: startIndex + i, x: left + NODE_W / 2 + i * (NODE_W + GAP), y });
    }
  };

  let next = 0;
  for (let row = 0; row < topRows; row += 1) {
    const items = Math.min(capacity, topCount - row * capacity);
    placeRow(next, items, EDGE + row * rowH + NODE_H / 2);
    next += items;
  }
  const bottomStart = centerY + CENTER_H / 2 + LINE_ROOM;
  for (let row = 0; row < bottomRows; row += 1) {
    const items = Math.min(capacity, bottomCount - row * capacity);
    placeRow(next, items, bottomStart + row * rowH + NODE_H / 2);
    next += items;
  }
  return { height, center: { x: width / 2, y: centerY }, spots };
};
