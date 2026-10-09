import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, readDrafts, validateIdea, MAX_DRAFTS, places, tourStops } from '../src/state.js';

test('a brief is validated, trimmed and kept as a draft',()=>{
  const d=createDraft('  Arcade  ','  A tiny playable arcade for the neighborhood.  ',[],'brief-1');
  assert.equal(d.name,'Arcade');assert.equal(d.status,'Brief received');assert.equal(d.id,'brief-1');
  assert.equal(d.idea,'A tiny playable arcade for the neighborhood.');
});
test('invalid or oversized briefs cannot enter the project queue',()=>{
  for(const [name,idea] of [['x','A sufficiently long idea'],['Okay','short'],['a'.repeat(41),'A sufficiently long idea'],['Okay','a'.repeat(401)]])assert.throws(()=>validateIdea(name,idea));
  assert.throws(()=>createDraft('Okay','A sufficiently long idea',Array(MAX_DRAFTS).fill({})));
});
test('corrupt and hostile local storage cannot break or populate the project list',()=>{
  assert.deepEqual(readDrafts({getItem:()=>'{invalid'}),[]);
  assert.deepEqual(readDrafts({getItem:()=>'{"id":"bad"}'}),[]);
  assert.deepEqual(readDrafts({getItem:()=>JSON.stringify([{id:'bad',name:'a'.repeat(100),idea:'a'.repeat(1000)}])}),[]);
  assert.deepEqual(readDrafts({getItem:()=>{throw Error('unavailable');}}),[]);
});
test('saved drafts can be recovered without launching a token',()=>{
  const d=createDraft('My Studio','A real idea with a long enough description.',[],'saved');
  assert.deepEqual(readDrafts({getItem:()=>JSON.stringify([d])}),[d]);
  assert.equal('mint' in d,false);
});
test('demo route visits the Workshop and returns home along the road',()=>{
  const start=tourStops[0],end=tourStops.at(-1);
  assert.equal(start.x,end.x);assert.equal(start.z,end.z);
  assert.ok(tourStops.some(s=>s.x===places[1].x));
  for(let i=1;i<tourStops.length;i++){const a=tourStops[i-1],b=tourStops[i];assert.ok(a.x===b.x||a.z===b.z);assert.ok(b.duration>0);}
});

import {validateResident,readResident} from '../src/state.js';
test('resident previews normalize tickers and do not confer ownership',()=>{const r=validateResident(' Bro ','coin','mint');assert.equal(r.ticker,'COIN');assert.equal(r.mode,'local-preview');assert.equal('wallet' in r,false);assert.throws(()=>validateResident('Bro','<coin>','mint'));assert.throws(()=>validateResident('Bro','COIN','arbitrary'));assert.equal(readResident({getItem:()=>'{invalid'}),null);});
