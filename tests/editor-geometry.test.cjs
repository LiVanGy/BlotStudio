const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core.js');
const B = globalThis.BS;

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `expected ${expected}, got ${actual}`);
}

test('all eight handles keep the opposite edge or corner fixed, including after rotation', () => {
  for (const rotation of [0, 37, 90, -115]) {
    const frame = {x: 100, y: 100, w: 80, h: 40, rotation};
    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const point = (r, fx, fy) => ({
      x: r.x + r.w/2 + cos*(fx-.5)*r.w - sin*(fy-.5)*r.h,
      y: r.y + r.h/2 + sin*(fx-.5)*r.w + cos*(fy-.5)*r.h
    });
    for (const handle of ['nw','n','ne','e','se','s','sw','w']) {
      const horizontal = handle.includes('w') ? -1 : +handle.includes('e');
      const vertical = handle.includes('n') ? -1 : +handle.includes('s');
      const dx = cos*horizontal*12 - sin*vertical*9;
      const dy = sin*horizontal*12 + cos*vertical*9;
      const next = B.resizeFrame(frame, handle, dx, dy, false);
      near(next.w, frame.w + Math.abs(horizontal)*12);
      near(next.h, frame.h + Math.abs(vertical)*9);
      const fixed = point(frame,(1-horizontal)/2,(1-vertical)/2);
      const after = point(next,(1-horizontal)/2,(1-vertical)/2);
      near(after.x, fixed.x);
      near(after.y, fixed.y);
    }
  }
});

test('aspect lock works from an edge and rotated visual edges align and distribute', () => {
  const scaled = B.resizeFrame({x:0,y:0,w:80,h:40,rotation:0}, 'n', 0,-20,true);
  near(scaled.w,120);
  near(scaled.h,60);
  near(scaled.x,-20);
  near(scaled.y,-20);
  const objects = [
    {x:10,y:20,w:100,h:20,rotation:90},
    {x:140,y:50,w:30,h:40,rotation:0},
    {x:290,y:30,w:75,h:25,rotation:45}
  ];
  B.alignObjects(objects, 'left');
  const visualLeft = o => (o.x + o.w/2) - (Math.abs(o.w*Math.cos(o.rotation*Math.PI/180))+Math.abs(o.h*Math.sin(o.rotation*Math.PI/180)))/2;
  near(visualLeft(objects[0]),50);
  near(visualLeft(objects[1]),50);
  near(visualLeft(objects[2]),50);
  objects[1].x+=120;
  objects[2].x+=300;
  B.alignObjects(objects,'distributeX');
  const edges = objects.map(o=>[visualLeft(o),2*(o.x+o.w/2)-visualLeft(o)]);
  near(edges[1][0]-edges[0][1], edges[2][0]-edges[1][1]);
});
