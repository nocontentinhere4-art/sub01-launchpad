import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FACADE,FAC_FLAG,facadeCode,facadeAtlasData,TILED,DECAL_IDS,ATLAS_SIZE,SLOT,GUTTER,PERIOD,prismGeometry,arcGeometry,withFacade,facadeDetail} from '../src/facades.js';
import {wallMaterial,toon} from '../src/toon.js';
import {windowMaterial,WINDOW} from '../src/windows.js';
import {cityLayout,TOWER_PARKS,subLotsOf} from '../src/lots.js';
import {TOWER,towerPlan,bandAt,legAt,shaftAt,footTownTop} from '../src/tokyo-tower.js';
import {createCity} from '../src/city.js';
import {tower} from '../src/city-state.js';

const shader=()=>({uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader});
const braces=src=>assert.equal((src.match(/{/g)||[]).length,(src.match(/}/g)||[]).length);

test('facade atlas: one 1024² RGBA, 15 tileable surfaces + 4 decals, deterministic, mean multiplier exactly 1 per surface',()=>{
 assert.equal(TILED.length,15);assert.equal(DECAL_IDS.length,4);assert.ok(ATLAS_SIZE<=1024);
 const a=facadeAtlasData(),b=facadeAtlasData();assert.equal(a.data.length,1024*1024*4);assert.deepEqual(a.data,b.data,'deterministic');
 for(const [i,m] of a.mean.entries())assert.ok(Math.abs(m-1)<.02,`${TILED[i]} mean ${m}`);
 // The gutter wraps the period: column GUTTER and column GUTTER+PERIOD hold the same texel (seamless tiling).
 for(const s of [0,5,12]){const ox=(s%4)*SLOT,oy=Math.floor(s/4)*SLOT,row=oy+40;
  for(const k of [0,3]){const i=(row*1024+ox+k+GUTTER-GUTTER)*4,j=(row*1024+ox+k+PERIOD)*4;assert.equal(a.data[i],a.data[j],`slot ${s} wraps`);}}
 // Real variation (grout, boards, ribs) in every surface; the awning carries the cream stripe mask in B.
 for(let s=0;s<15;s++){const ox=(s%4)*SLOT,oy=Math.floor(s/4)*SLOT;let lo=255,hi=0;for(let y=oy+8;y<oy+248;y+=3)for(let x=ox+8;x<ox+248;x+=3){const i=(y*1024+x)*4,v=a.data[i]*a.data[i+1];lo=Math.min(lo,v);hi=Math.max(hi,v);}
  assert.ok(hi-lo>800,`${TILED[s]} contrast ${hi-lo}`);}
 const aw=TILED.indexOf('awning');let blue=0;for(let x=0;x<240;x++){const i=((Math.floor(aw/4)*SLOT+100)*1024+(aw%4)*SLOT+8+x)*4;if(a.data[i+2]>128)blue++;}assert.ok(blue>90&&blue<150,`stripes ${blue}`);
});

test('facade codes: ids, flags and swap round-trip the way the shader reads them',()=>{
 assert.equal(FACADE.tileWhite,1);assert.equal(FACADE.siding,15);assert.equal(FACADE.fan,17);assert.equal(FACADE.paint,20);
 const dec=v=>{const a=Math.abs(v);return {id:a%64,noEdge:Math.floor(a/64)%2,inset:Math.floor(a/128),swap:v<0};};
 assert.deepEqual(dec(facadeCode('kawara',{swap:true,noEdge:true})),{id:FACADE.kawara,noEdge:1,inset:0,swap:true});
 assert.deepEqual(dec(facadeCode('membrane',{inset:true})),{id:FACADE.membrane,noEdge:0,inset:1,swap:false});
 assert.equal(facadeCode('nope'),0);assert.equal(facadeCode(FACADE.brick),3);assert.equal(FAC_FLAG.inset,128);
});

test('wallMaterial: facade + bevel chunk injected, toon/dirt/weather kept, fixed facade and edges options change the program',()=>{
 const w=wallMaterial(),s=shader();w.onBeforeCompile(s);
 assert.match(s.vertexShader,/attribute float aFacade;/);assert.match(s.fragmentShader,/textureGrad\(uFacadeMap/);assert.match(s.fragmentShader,/#define FACADE_EDGES/);
 assert.match(s.fragmentShader,/diffuseColor\.rgb\*=\(1\.-uDirt/,'w4b dirt still there');assert.equal(s.uniforms.uFacadeDetail,facadeDetail);assert.ok(s.uniforms.uFacadeMap.value?.isDataTexture);
 braces(s.vertexShader);braces(s.fragmentShader);
 const f=wallMaterial({facade:'tileWhite',edges:false}),t=shader();f.onBeforeCompile(t);
 assert.match(t.vertexShader,/#define FACADE_FIXED 1/);assert.doesNotMatch(t.fragmentShader,/#define FACADE_EDGES/);
 assert.notEqual(w.customProgramCacheKey(),f.customProgramCacheKey());
 const g=withFacade(toon(),{edges:false}),u=shader();g.onBeforeCompile(u);assert.match(u.fragmentShader,/uFacAccent/);assert.notEqual(g.customProgramCacheKey(),toon().customProgramCacheKey());
});

test('windows: sliding-sash meeting rail, lintel/jamb shadows and a lit sill in the window shader',()=>{
 const m=windowMaterial(),s=shader();m.onBeforeCompile(s);
 for(const k of ['winMull','winShade','winSill'])assert.match(s.fragmentShader,new RegExp(k));
 assert.ok(WINDOW.lintel>0&&WINDOW.jamb>0&&WINDOW.sillLift>0);braces(s.fragmentShader);
});

test('shared geometries: prism slope, back and ends / 6 triangles with outward normals, quarter-round awning arcs',()=>{
 const p=prismGeometry(),n=p.attributes.normal,pos=p.attributes.position;assert.equal(pos.count/3,6);
 const inside=[0,-1/6,-1/6];   // the prism's interior centroid
 for(let i=0;i<pos.count;i+=3){const c=['getX','getY','getZ'].map(k=>(pos[k](i)+pos[k](i+1)+pos[k](i+2))/3);
  const d=(c[0]-inside[0])*n.getX(i)+(c[1]-inside[1])*n.getY(i)+(c[2]-inside[2])*n.getZ(i);assert.ok(d>0,`prism face ${i/3} points inward`);}
 const a=arcGeometry(6);assert.equal(a.attributes.position.count/3,24);
 const box=new THREE.Box3().setFromBufferAttribute(a.attributes.position);assert.ok(box.min.y>=-.5-1e-6&&box.max.z<=.5+1e-6);
});

test('lots: wave 5A skins by type (tile/concrete/glass, plaster/wood…), ~20 % bay windows, gable T5, pent/mansard T4, a park beside the tower',()=>{
 const L=cityLayout([]),allowed={T1:['tileWhite','concrete','glass','tileBeige','brick'],T2:['tileBeige','tileWhite','siding','brick'],T3:['tileWhite','plaster','brick'],
  T4:['plaster','wood','siding','metal'],T5:['wood','plaster'],T6:['tileWhite'],T7:['glass','concrete']};
 for(const l of L.lots){assert.ok(allowed[l.type].includes(l.facade),`${l.id} ${l.type} ${l.facade}`);assert.ok(FACADE[l.facade]);}
 const t24=L.lots.filter(l=>l.type==='T2'||l.type==='T4'),bays=t24.filter(l=>l.bayWindow).length/t24.length;assert.ok(bays>.1&&bays<.3,`bay share ${bays}`);
 assert.ok(L.lots.filter(l=>l.type==='T5').every(l=>l.roofForm==='gable'));assert.ok(L.lots.some(l=>l.roofForm==='pent')&&L.lots.some(l=>l.roofForm==='mansard'));
 assert.ok(L.lots.filter(l=>l.type!=='T4').every(l=>!['pent','mansard'].includes(l.roofForm)));
 for(const id of TOWER_PARKS)assert.equal(subLotsOf(id).spots[0].kind,'park');
 assert.equal(JSON.stringify(cityLayout([]).lots.map(l=>[l.facade,l.roofForm])),JSON.stringify(L.lots.map(l=>[l.facade,l.roofForm])),'deterministic');
});

test('Tokyo Tower: real ratios (main deck 0.45 H, top deck 0.75 H), ≈ 2× the tallest slab, horizontal orange/white bands',()=>{
 const H=TOWER.height,mid=d=>(d.y0+d.y1)/2;
 assert.ok(Math.abs(mid(TOWER.deck)/H-150/333)<.02,`main deck ${mid(TOWER.deck)/H}`);assert.ok(Math.abs(mid(TOWER.top)/H-250/333)<.02,`top deck ${mid(TOWER.top)/H}`);
 assert.ok(Math.abs(TOWER.mastBase/H-.81)<.03);
 const L=cityLayout([]),tallest=Math.max(...L.lots.map(l=>l.height));assert.ok(H/tallest>1.8&&H/tallest<2.4,`tower ${H} vs tallest ${tallest}`);
 // Bands: 14, alternating, contiguous from 0 to H, white at the main deck and around the top deck.
 const B=TOWER.bands;assert.equal(B.length,14);assert.equal(B[0][0],0);assert.equal(B.at(-1)[1],H);
 for(let i=1;i<B.length;i++){assert.equal(B[i][0],B[i-1][1]);assert.notEqual(B[i][2],B[i-1][2]);}
 assert.equal(bandAt(mid(TOWER.deck)),'W');assert.equal(bandAt(mid(TOWER.top)),'W');assert.equal(bandAt(2),'O');
 // Concave legs: wide at the feet, nearly vertical just under the deck; the shaft continues from the legs' outer chords.
 const r0=legAt(0).r,r1=legAt(TOWER.deck.y0*.5).r,r2=legAt(TOWER.deck.y0).r;assert.ok(r0-r1>2*(r1-r2),'concave');
 assert.ok(Math.abs(legAt(TOWER.deck.y0).r+legAt(TOWER.deck.y0).h-shaftAt(TOWER.deck.y0))<1e-9);
 assert.ok(TOWER.feet+TOWER.leg>3.43&&TOWER.feet+TOWER.leg<5.1,'feet stand on the tower park lawn (owner 2026-10-10), inside its 10.2 width and clear of the neighbours at ±5.1');
 // Lattice budget: ≤ 2,500 ribbons (2 triangles each), each in one band; FootTown under the legs.
 const p=towerPlan(tower.x,tower.z);assert.ok(p.members.length>900&&p.members.length<=2500,`${p.members.length} members`);
 assert.ok(p.members.every(m=>m.band==='O'||m.band==='W'));const o=p.members.filter(m=>m.band==='O').length/p.members.length;assert.ok(o>.4&&o<.8,`orange share ${o}`);
 assert.ok(p.members.length*2+p.boxes.length*12<5600,'≤ +3k triangles over the 208-box tower');
 assert.ok(footTownTop()>9&&footTownTop()<12);
});

test('city: tower ribbons are one extra batch, heightOf("tower") is the tower height, the plaza replaces the Shiba zebra',()=>{
 const scene=new THREE.Scene(),city=createCity(scene,[],()=>{},[]),st=city.stats();
 assert.equal(city.heightOf('tower'),TOWER.height);assert.equal(st.towerMembers,city.ribbons.count);assert.ok(city.ribbons.material.side===THREE.DoubleSide);
 assert.ok(city.ribbons.geometry.attributes.nightLight,'per-instance night glow');
 city.setDetail(false);assert.equal(facadeDetail.value,0);city.setDetail(true);assert.equal(facadeDetail.value,1);
});
