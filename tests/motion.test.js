import test from 'node:test';
import assert from 'node:assert/strict';
import {TILE, STRIDE, blockedTiles, route, mover, key} from '../src/motion.js';

const HALF = 3.5;
// A sofa across the middle of the room, leaving the sides free.
const sofa = [{x: 0, z: 0, hx: 1.5, hz: .5}];

test('footprints block the tiles they cover', () => {
  const b = blockedTiles(sofa, HALF);
  assert.ok(b.has(key(0, 0)) && b.has(key(-3, -1)) && b.has(key(2, 0)));
  assert.ok(!b.has(key(4, 0)) && !b.has(key(0, 2)));
});

test('routes go around furniture in four directions with the fewest turns', () => {
  const b = blockedTiles(sofa, HALF);
  const path = route(b, {x: 0, z: -2}, {x: 0, z: 2}, HALF);
  assert.ok(path && path.length > 8, 'walks around, not through');
  for (const p of path) assert.ok(!b.has(key(Math.round(p.x / TILE), Math.round(p.z / TILE))), 'never steps on the sofa');
  let turns = 0, last = null;
  for (let i = 1; i < path.length; i++) {
    const d = Math.sign(path[i].x - path[i - 1].x) + ',' + Math.sign(path[i].z - path[i - 1].z);
    assert.ok(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].z - path[i - 1].z) <= TILE + 1e-9, 'one tile per step, no diagonals');
    if (last && d !== last) turns++;
    last = d;
  }
  assert.ok(turns <= 2, `fewest turns (${turns})`);
});

test('a destination on a piece of furniture is still reachable (its use slot)', () => {
  const b = blockedTiles(sofa, HALF);
  const path = route(b, {x: 3, z: 3}, {x: 0, z: 0}, HALF);
  assert.ok(path && path.at(-1).x === 0 && path.at(-1).z === 0);
});

test('no route when boxed in', () => {
  const b = new Set([key(1, 0), key(-1, 0), key(0, 1), key(0, -1)]);
  assert.equal(route(b, {x: 0, z: 0}, {x: 3, z: 3}, HALF), null);
});

test('the walk phase advances with distance travelled, and the mover turns on the spot first', () => {
  const m = mover({x: 0, z: 0, yaw: 0, speed: 1, rand: () => .5});
  let arrived = false;
  m.go(route(new Set(), {x: 0, z: 0}, {x: 2, z: 0}, HALF), () => arrived = true);
  const first = m.update(.05);
  assert.ok(!first.moving, 'turning toward +x before walking');
  let t = 0, last;
  while (m.busy && t < 10) { last = m.update(.05); t += .05; }
  assert.ok(arrived && Math.abs(last.x - 2) < 1e-6);
  assert.ok(Math.abs(last.yaw - Math.PI / 2) < 1e-6, 'faces +x');
  assert.ok(Math.abs(last.phase - (2 / STRIDE) % 1) < 1e-6, 'phase = distance / stride');
  assert.equal(m.heading, 0);
});

test('an idle mover fidgets now and then', () => {
  const m = mover({fidgetEvery: [1, 1], rand: () => 0});
  let fidgets = 0;
  for (let i = 0; i < 50; i++) if (m.update(.1).fidget) fidgets++;
  assert.ok(fidgets >= 4 && fidgets <= 5);
});
