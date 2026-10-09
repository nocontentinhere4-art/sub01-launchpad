import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLookFields,readLook,tierMap,tierOf,isUnlocked,tierLabel,normalizeTraits,TRAITS,TRAIT_LABELS} from '../src/creator.js';

// The smallest DOM the creator needs: elements with children, dataset, style, append/replaceChildren and querySelectorAll('input').
class El{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.attrs={};}
 append(...k){for(const c of k)this.children.push(typeof c==='string'?{text:c}:c);}replaceChildren(...k){this.children=[];this.append(...k);}setAttribute(k,v){this.attrs[k]=v;}
 querySelectorAll(sel){const out=[],walk=n=>{for(const c of n.children||[]){if(c.tagName===sel.toUpperCase())out.push(c);walk(c);}};walk(this);return out;}}
globalThis.document={createElement:t=>new El(t)};
const OPTIONS={look:{skin:['#f6d5b8','#e8b48f'],hair:['#1b1b1b'],hairStyle:['short','long'],outfit:['hoodie','suit'],freeColors:['top','bottom'],
 accessories:['glasses','cap','beanie','headphones','scarf','halo','crown'],maxAccessories:4,pets:['cat','dog','dragon'],petName:{min:1,max:12}},
 traits:{keys:TRAITS},unlocks:{tiers:['resident','builder','founder','launched'],accessories:{resident:['glasses','cap','beanie','headphones','scarf'],founder:['halo'],launched:['crown']},pets:{resident:['cat','dog'],launched:['dragon']}}};
const inputs=c=>c.querySelectorAll('input'),by=(c,name,value)=>inputs(c).find(i=>i.name===name&&(value===undefined||i.value===value));

test('tier helpers: per-tier lists or name maps, locks without unlocks open only the first tier',()=>{
 assert.deepEqual(tierMap({resident:['a','b'],builder:['c']}),{a:'resident',b:'resident',c:'builder'});
 assert.deepEqual(tierMap({a:'founder'}),{a:'founder'});assert.deepEqual(tierMap(null),{});
 assert.equal(tierOf(OPTIONS.unlocks.accessories,'crown'),'launched');assert.equal(tierLabel('builder'),'Builder');
 assert.equal(isUnlocked('accessories','halo',{accessories:['halo']},OPTIONS.unlocks),true);
 assert.equal(isUnlocked('accessories','halo',null,OPTIONS.unlocks),false);assert.equal(isUnlocked('accessories','cap',null,OPTIONS.unlocks),true);
 assert.equal(isUnlocked('items','whatever',null,{}),true,'untiered things are open');
 assert.deepEqual(normalizeTraits({neat:.6,active:7,nice:'x'}),{neat:.5,outgoing:.5,active:1,playful:.5,nice:.5});
 for(const t of TRAITS)assert.equal(TRAIT_LABELS[t].length,2);
});
test('renderLookFields + readLook round-trip a v2 look and the traits; locked and over-limit choices are refused',()=>{
 const c=new El('div'),look={skin:'#e8b48f',hair:'#1b1b1b',hairStyle:'long',outfit:'suit',top:'#2f3e66',bottom:'#3a3b3d',accessories:['glasses','crown'],accessoryColor:'#69a694',pet:{kind:'dog',color:'#3a3b3d',name:'Rex'}};
 renderLookFields(c,OPTIONS,look,{tier:'resident',accessories:OPTIONS.unlocks.accessories.resident,pets:['cat','dog']},{neat:1,outgoing:0,active:.75,playful:.25,nice:.5});
 const r=readLook(c);
 assert.deepEqual(r.look,{skin:'#e8b48f',hair:'#1b1b1b',hairStyle:'long',outfit:'suit',top:'#2f3e66',bottom:'#3a3b3d',accessories:['glasses'],accessoryColor:'#69a694',pet:{kind:'dog',color:'#3a3b3d',name:'Rex'}},'the locked crown is dropped');
 assert.deepEqual(r.traits,{neat:1,outgoing:0,active:.75,playful:.25,nice:.5});
 assert.equal(by(c,'accessories','crown').disabled,true);assert.equal(by(c,'petKind','dragon').disabled,true);
 // Ticking a 4th accessory disables the rest.
 for(const a of ['cap','beanie','headphones']){const b=by(c,'accessories',a);b.checked=true;b.onchange();}
 assert.equal(by(c,'accessories','scarf').disabled,true,'max 4');assert.equal(readLook(c).look.accessories.length,4);
 by(c,'accessories','cap').checked=false;by(c,'accessories','cap').onchange();assert.equal(by(c,'accessories','scarf').disabled,false);
 // No pet, default accessory colour, unnamed pet gets its kind as a name.
 for(const i of inputs(c).filter(i=>i.name==='petKind'))i.checked=i.value==='';by(c,'accessoryColor','').checked=true;by(c,'accessoryColor','#69a694').checked=false;
 assert.equal(readLook(c).look.pet,null);assert.equal(readLook(c).look.accessoryColor,null);
 for(const i of inputs(c).filter(i=>i.name==='petKind'))i.checked=i.value==='cat';by(c,'petName').value='  ';assert.deepEqual(readLook(c).look.pet,{kind:'cat',color:'#3a3b3d',name:'Cat'});
});
test('a v1 look and no unlocks render defaults; options without v2 lists render no v2 sections',()=>{
 const c=new El('div');renderLookFields(c,OPTIONS,{},null);const r=readLook(c);
 assert.equal(r.look.skin,'#f6d5b8');assert.deepEqual(r.look.accessories,[]);assert.equal(r.look.pet,null);assert.deepEqual(r.traits,normalizeTraits({}));
 const d=new El('div');renderLookFields(d,{look:{skin:['#f6d5b8']}},{});const r2=readLook(d);assert.deepEqual(Object.keys(r2.look),['skin']);
});
