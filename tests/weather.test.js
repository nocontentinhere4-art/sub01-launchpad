import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STATES,MODES,nextMode,WEIGHTS,weatherAt,LEVELS,approach,atmosphere,wind,tokyoClock,skyGradient,particleSeeds,createWeather,createAmbience} from '../src/weather.js';
import {weather,toon,wallMaterial,addWeather} from '../src/toon.js';

const H=36e5,MIN=6e4,T0=Date.UTC(2026,9,9,0,0,0);

test('weather schedule: deterministic per hour, 4–8 minute slots covering the hour, clear at least 60% of the time',()=>{
 for(let h=0;h<5;h++){const start=T0+h*H;let t=start,slots=0;
  while(t<start+H){const a=weatherAt(t),b=weatherAt(t+1);assert.equal(a.from,t);assert.ok(STATES.includes(a.state));
   assert.deepEqual(weatherAt(t+(a.until-t)/2),a,'same answer anywhere in the slot');assert.equal(b.state,a.state);
   const len=(a.until-a.from)/MIN;assert.ok(len>=4&&len<12,`slot ${len} min`);t=a.until;slots++;}
  assert.equal(t,start+H);assert.ok(slots>=5&&slots<=15);}
 assert.deepEqual(weatherAt(T0+1234567),weatherAt(T0+1234567));
 let clear=0,total=0;const seen=new Set();
 for(let t=T0;t<T0+2000*H;t+=MIN){const s=weatherAt(t).state;seen.add(s);total++;if(s==='clear')clear++;}
 assert.ok(clear/total>=.6,`clear ${clear/total}`);assert.deepEqual([...seen].sort(),[...STATES].sort());
 assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a,b)=>a+b,0)-1)<1e-9);
});

test('weather button cycles clear → rain → storm → sakura → snow → auto → clear',()=>{
 assert.deepEqual(MODES,['clear','rain','storm','sakura','snow','auto']);
 let m='clear';const seq=[];for(let i=0;i<6;i++){m=nextMode(m);seq.push(m);}
 assert.deepEqual(seq,['rain','storm','sakura','snow','auto','clear']);
});

test('wetness and fog mapping: rain wets, fog closes in and the sun dims; streets dry slower than they wet',()=>{
 const clear=atmosphere(LEVELS.clear);assert.deepEqual(clear,{fogNear:1,fogFar:1,sun:1,fill:1,shadow:1,hemi:1});
 const rain=atmosphere(LEVELS.rain),storm=atmosphere(LEVELS.storm);
 assert.ok(rain.fogFar<1&&storm.fogFar<rain.fogFar&&storm.fogFar>=.35);assert.ok(rain.sun<1&&storm.sun<rain.sun&&storm.sun>.2);
 assert.equal(LEVELS.rain.wet,1);assert.equal(LEVELS.snow.wet,0);assert.ok(LEVELS.snow.cover>0);assert.equal(LEVELS.sakura.petals,1);
 const l={...LEVELS.clear};for(let i=0;i<20;i++)approach(l,LEVELS.rain,1);const wetAfter20=l.wet;assert.ok(wetAfter20>.5&&wetAfter20<1);
 for(let i=0;i<20;i++)approach(l,LEVELS.clear,1);assert.ok(l.wet>wetAfter20*.6,'drying takes longer');assert.ok(l.rain<.01,'rain stops fast');
 const f={...LEVELS.clear};approach(f,LEVELS.storm,.5,8);assert.ok(f.wet>.15,'manual picks converge faster');
 for(const s of [0,100,1e4]){const [x,z]=wind(s,2);assert.ok(Number.isFinite(x)&&Number.isFinite(z));assert.ok(Math.hypot(x,z)<=3.4+1e-9);}
});

test('Tokyo clock: UTC+9, sunrise/sunset from the date, dusk/dawn blends of 40 minutes',()=>{
 const at=(h,m=0,mo=9,d=9)=>Date.UTC(2026,mo,d,h-9,m);   // JST wall time
 const noon=tokyoClock(at(12));assert.equal(noon.label,'12:00');assert.equal(noon.night,0);assert.equal(noon.phase,'day');
 const late=tokyoClock(at(22,41));assert.equal(late.label,'22:41');assert.equal(late.night,1);assert.equal(late.phase,'night');
 const oct=tokyoClock(at(12));assert.ok(Math.abs(oct.sunrise-5.65)<.25&&Math.abs(oct.sunset-17.23)<.25,`${oct.sunrise} ${oct.sunset}`);
 const jun=tokyoClock(at(12,0,5,21)),dec=tokyoClock(at(12,0,11,21));assert.ok(jun.sunset-jun.sunrise>14&&dec.sunset-dec.sunrise<10.2);
 const set=oct.sunset,dusk=tokyoClock(at(Math.floor(set),Math.round((set%1)*60)));assert.equal(dusk.phase,'dusk');assert.ok(Math.abs(dusk.night-.5)<.06);
 const before=tokyoClock(at(Math.floor(set-.7),Math.round(((set-.7)%1)*60)));assert.ok(before.night<.05);
 const rise=tokyoClock(at(Math.floor(oct.sunrise),Math.round((oct.sunrise%1)*60)));assert.equal(rise.phase,'dawn');assert.ok(Math.abs(rise.night-.5)<.06);
 let prev=-1;for(let m=0;m<=120;m+=10){const v=tokyoClock(at(16,30)+m*MIN).night;assert.ok(v>=prev);prev=v;}
});

test('sky gradient: brief colours in plain day and night, warm horizon at dusk, greyer when overcast',()=>{
 assert.equal(skyGradient(0),'linear-gradient(#c9d8e2,#eae3d8 80%,#efe6d6)');
 assert.equal(skyGradient(1),'linear-gradient(#0d1726,#2a3550 80%,#4a3f57)');
 assert.match(skyGradient(.5),/#f4b77e\)$/);assert.notEqual(skyGradient(0,1),skyGradient(0));
});

test('particle buffers: finite seeds in [0,1), meshes hidden when clear, ≤ 3 extra draw calls',()=>{
 const a=particleSeeds(500,3);assert.equal(a.length,2000);assert.ok(a.every(v=>Number.isFinite(v)&&v>=0&&v<1));assert.deepEqual(particleSeeds(8,3),particleSeeds(8,3));
 const scene=new THREE.Scene(),w=createWeather(scene,{mobile:true});
 for(const m of [w.precip,w.splash,w.refl])for(const k in m.geometry.attributes)assert.ok(m.geometry.attributes[k].array.every(Number.isFinite),k);
 const camera=new THREE.OrthographicCamera(-30,30,18,-18,.1,400);camera.position.set(100,100,100);camera.zoom=.7;
 const view=l=>({seconds:12,now:1e4,camera,target:new THREE.Vector3(),px:20,levels:{...l},night:0,wind:[1,0]});
 w.update(view(LEVELS.clear));assert.equal(w.drawCalls,0);
 w.update(view(LEVELS.storm));assert.equal(w.drawCalls,2);assert.ok(w.precip.geometry.instanceCount>0);
 w.update(view(LEVELS.snow));assert.equal(w.drawCalls,1);w.update(view(LEVELS.sakura));assert.equal(w.drawCalls,1);
 assert.equal(createAmbience().toggle(),false,'no Web Audio in node: stays off');
});

test('toon materials share the weather uniforms (wet streets, snow on up-facing faces)',()=>{
 assert.deepEqual(Object.keys(weather),['wet','snow']);
 for(const m of [toon(),wallMaterial()]){const sh={uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader};
  m.onBeforeCompile(sh);assert.equal(sh.uniforms.uWxWet,weather.wet);assert.equal(sh.uniforms.uWxSnow,weather.snow);
  assert.match(sh.vertexShader,/vWxY=/);assert.match(sh.fragmentShader,/uWxSnow/);}
 const sh={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <emissivemap_fragment>'};addWeather(sh);assert.match(sh.fragmentShader,/#include <emissivemap_fragment>$/);
});
