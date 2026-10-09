import test from 'node:test';
import assert from 'node:assert/strict';
import {makeResident, mood, tick, score, choose, simulate, NEEDS} from '../src/needs.js';

// A deterministic generator so the "best few" pick is repeatable.
const seeded = (s = 1) => () => (s = (s * 16807) % 2147483647) / 2147483647;

const studio = [
  {item: 'bedSingle', x: -3, z: -3}, {item: 'kitchenFridgeSmall', x: 3, z: -3}, {item: 'loungeSofa', x: 0, z: 2},
  {item: 'televisionModern', x: 0, z: -3.5}, {item: 'desk', x: 3, z: 3}, {item: 'washer', x: -3, z: 3}, {item: 'trashcan', x: 3.5, z: 0},
  {item: 'doorway', x: -3.5, z: 0},
];

test('mood is dragged down by the worst need', () => {
  const fine = makeResident({}, Object.fromEntries(NEEDS.map(n => [n, 80])));
  const starving = makeResident({}, {...fine.needs, hunger: 5});
  assert.ok(mood(starving) < mood(fine) - 15);
});

test('a hungry resident hears the fridge louder than the sofa', () => {
  const r = makeResident({}, {hunger: 10, comfort: 90});
  assert.ok(score(r, 'kitchenFridgeSmall') > score(r, 'loungeSofa') * 3);
  assert.equal(score(r, 'rugRectangle'), 0, 'rugs advertise nothing');
});

test('distance discounts an advertisement', () => {
  const r = makeResident({}, {fun: 20});
  assert.ok(score(r, 'televisionModern', 0) > score(r, 'televisionModern', 6));
});

test('a playful resident picks the TV over the book more often than a serious one', () => {
  const both = [{item: 'televisionModern'}, {item: 'books'}];
  const count = traits => {
    let tv = 0;
    const rand = seeded(7);
    for (let i = 0; i < 200; i++) if (choose(makeResident(traits, {fun: 30}), both, {x: 0, z: 0}, rand).item === 'televisionModern') tv++;
    return tv;
  };
  assert.ok(count({playful: 1}) >= count({playful: 0}));
});

test('needs decay while idle and recover while using', () => {
  const r = makeResident({}, {energy: 50});
  tick(r, 2);
  assert.ok(r.needs.energy < 50);
  assert.ok(r.needs.hunger < 70);
  const r2 = makeResident({}, {hunger: 10});
  r2.busy = {item: 'kitchenFridge', left: 1};
  tick(r2, 1);
  assert.ok(r2.needs.hunger > 70);
  assert.equal(r2.busy, null, 'the meal ends');
});

test('a furnished studio keeps a resident alive for three game days', () => {
  const r = makeResident({neat: .8, playful: .6});
  const log = simulate(r, studio, {days: 3, rand: seeded(3)});
  assert.ok(log.length > 10, 'the resident keeps choosing things to do');
  assert.ok(log.some(e => e.item.startsWith('bed')), 'sleeps');
  assert.ok(log.some(e => e.item.startsWith('kitchen')), 'eats');
  assert.ok(log.some(e => e.item === 'doorway'), 'goes out to see people');
  for (const n of NEEDS) if (n !== 'room') assert.ok(r.needs[n] > 15, `${n} stays above the red (${r.needs[n].toFixed(0)})`);
});

test('an empty room starves', () => {
  const r = makeResident();
  simulate(r, [], {days: 2});
  assert.equal(r.needs.hunger, 0);
});
