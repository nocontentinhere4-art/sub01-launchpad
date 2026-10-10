import test from 'node:test';
import assert from 'node:assert/strict';
import {districts} from '../src/city-state.js';
import {KANJI,kanjiOf,codeOf,addressCode} from '../src/districts-kanji.js';

test('station board: every district has a kanji name and a unique 3-letter code; plot ids read as addresses',()=>{
 for(const d of districts){assert.ok(kanjiOf(d.id),`kanji for ${d.id}`);assert.match(codeOf(d.id),/^[A-Z]{3}$/);}
 const codes=Object.values(KANJI).map(v=>v[1]);assert.equal(new Set(codes).size,codes.length,'codes are unique');
 assert.equal(Object.keys(KANJI).length,districts.length+1,'the 48 districts and the whole city');
 assert.deepEqual([kanjiOf(''),codeOf('')],['東京','TYO']);
 assert.equal(addressCode('shibuya-3'),'SBY-03');assert.equal(addressCode('tower'),'');assert.equal(addressCode('nowhere-2'),'');
});
