import assert from 'node:assert/strict';
import test from 'node:test';
import { CENTER_H, CENTER_W, NODE_H, NODE_W, layoutMap, rowCapacity } from './mapLayout';

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

test('local map nodes stay inside the canvas and never overlap the center or each other, at every width and count', () => {
  for (const width of [220, 248, 280, 320, 358, 390, 430, 700]) {
    for (let count = 0; count <= 12; count += 1) {
      const layout = layoutMap(count, width);
      assert.equal(layout.spots.length, count);
      assert.deepEqual(layout.spots.map((s) => s.index).sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
      const center: Box = { x: layout.center.x, y: layout.center.y, w: CENTER_W, h: CENTER_H };
      assert.ok(center.y - CENTER_H / 2 >= 0 && center.y + CENTER_H / 2 <= layout.height, `center out of canvas w=${width} n=${count}`);
      const boxes: Box[] = layout.spots.map((s) => ({ x: s.x, y: s.y, w: NODE_W, h: NODE_H }));
      boxes.forEach((box, i) => {
        assert.ok(box.x - NODE_W / 2 >= -0.5 && box.x + NODE_W / 2 <= width + 0.5, `x out of canvas w=${width} n=${count} i=${i}`);
        assert.ok(box.y - NODE_H / 2 >= -0.5 && box.y + NODE_H / 2 <= layout.height + 0.5, `y out of canvas w=${width} n=${count} i=${i}`);
        assert.equal(overlaps(box, center), false, `center overlap w=${width} n=${count} i=${i}`);
        for (let j = i + 1; j < boxes.length; j += 1) {
          assert.equal(overlaps(box, boxes[j]), false, `nodes ${i}/${j} overlap w=${width} n=${count}`);
        }
      });
    }
  }
});

test('the row capacity follows the width (2 per row on a narrow phone, 3 on wide screens)', () => {
  assert.equal(rowCapacity(248), 2);
  assert.equal(rowCapacity(318), 2);
  assert.equal(rowCapacity(700), 3);
  assert.equal(rowCapacity(120), 1);
});
