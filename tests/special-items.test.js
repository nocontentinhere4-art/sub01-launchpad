import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSpecial,stats,SPECIAL_ITEMS,SPECIAL_TIERS,SPECIAL_DIMS,SPECIAL_USE,SPECIAL_LABELS,SPECIAL_ADS} from '../src/special-items.js';
import {EMOTES} from '../src/characters.js';
import {ADS} from '../src/needs.js';

test('16 special pieces in four tiers, each with dims, a label and a use',()=>{
 assert.equal(SPECIAL_ITEMS.length,16);
 const per={};for(const i of SPECIAL_ITEMS)per[SPECIAL_TIERS[i]]=(per[SPECIAL_TIERS[i]]||0)+1;assert.deepEqual(per,{resident:4,builder:4,founder:4,launched:4});
 for(const i of SPECIAL_ITEMS){const d=SPECIAL_DIMS[i];assert.ok(d.w>0&&d.h>0&&d.d>0&&d.w<=1.5&&d.d<=1,i);assert.ok(SPECIAL_LABELS[i],i);const u=SPECIAL_USE[i];assert.ok(u&&u.ms>0,i);if(u.emote)assert.ok(EMOTES.includes(u.emote),i+' uses a real emote');}
 for(const [k,a] of Object.entries(SPECIAL_ADS)){assert.ok(a.hours>0,k);for(const [n,v] of Object.entries(a))if(n!=='hours')assert.ok(n in ADS.bedSingle||['fun','social','hygiene','bladder','room','hunger','comfort','energy'].includes(n),k+' '+n);}
});
test('every piece builds within budget (≤300 tris, ≤16 draws), animates finitely, uses and disposes what it owns',()=>{
 const disposed=new Set(),orig=THREE.Material.prototype.dispose;THREE.Material.prototype.dispose=function(){disposed.add(this);return orig.call(this);};
 const shared=new Set();
 try{for(const item of SPECIAL_ITEMS){
  const sp=createSpecial(item,{text:'Hello world!!!!',accent:'#2f7f7a'}),{tris,draws}=stats(sp.root);
  assert.ok(tris>0&&tris<=300,`${item}: ${tris} tris`);assert.ok(draws<=16,`${item}: ${draws} draws`);
  const box=new THREE.Box3();sp.root.updateMatrixWorld(true);sp.root.traverse(n=>{if(n.isMesh&&n.visible)box.union(new THREE.Box3().setFromObject(n));});assert.ok(box.min.y>=-1e-6,item+' stands on the floor');assert.ok(box.max.y<=SPECIAL_DIMS[item].h+.05,item+' within its height');
  let calls=[];const who={emote:(n,o)=>{calls.push(n);return true;},play:n=>calls.push('play:'+n)};
  for(let i=0;i<5;i++)sp.update(.1);const ms=sp.use(who);assert.equal(ms,SPECIAL_USE[item].ms);assert.equal(sp.active,true);
  if(SPECIAL_USE[item].emote)assert.deepEqual(calls,[SPECIAL_USE[item].emote]);
  for(let i=0;i<120;i++)sp.update(.1);assert.equal(sp.active,false);
  let ok=true;sp.root.traverse(n=>{for(const v of [...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray()])if(!Number.isFinite(v))ok=false;if(n.isMesh)for(const m of [n.material].flat())shared.add(m);});assert.ok(ok,item+' finite');
  const parent=new THREE.Group();parent.add(sp.root);sp.dispose();assert.equal(sp.root.parent,null);
 }}finally{THREE.Material.prototype.dispose=orig;}
 // Plain colours come from the shared cache: they survive a dispose (other rooms use them).
 const kept=[...shared].filter(m=>!disposed.has(m)&&m.isMeshToonMaterial);assert.ok(kept.length>5);
 const a=createSpecial('trophyIdea'),b=createSpecial('trophyIdea');const ga=[],gb=[];a.root.traverse(n=>n.isMesh&&ga.push(n.geometry));b.root.traverse(n=>n.isMesh&&gb.push(n.geometry));
 assert.deepEqual(ga,gb,'geometry is shared between copies');a.dispose();b.dispose();
});
test('unknown items fall back to a box; missing character is tolerated',()=>{const sp=createSpecial('nope');assert.ok(stats(sp.root).tris>0);assert.equal(createSpecial('karaokeMic').use(null),SPECIAL_USE.karaokeMic.ms);sp.dispose();});
