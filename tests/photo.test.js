import test from 'node:test';
import assert from 'node:assert/strict';
import {postcardCaption,shareLink,serverCardUrl,parseGradient,postcardSize,postcardName} from '../src/photo.js';

test('captions: room = name + district + の部屋, building = name + $TICKER + state, never a price or a mint',()=>{
 assert.deepEqual(postcardCaption({kind:'room',name:'Yui',district:'Ebisu',date:'2026-10-10'}),{title:'Yui',jp:'の部屋',sub:'Ebisu · 2026-10-10'});
 const b=postcardCaption({kind:'building',name:'Ramen Radar',ticker:'ramen',phase:'open',date:'2026-10-10',price:'0.0042 SOL',mint:'So11111111111111111111111111111111111111112',marketCap:'$1M',wallet:'9xQ…'});
 assert.deepEqual(b,{title:'Ramen Radar · $RAMEN',jp:'',sub:'Launched · 2026-10-10'});
 const all=JSON.stringify(b);for(const bad of ['SOL','So111','$1M','0.0042','9xQ'])assert.ok(!all.includes(bad),bad);
 assert.equal(postcardCaption({kind:'building',name:'X',ticker:'not a ticker!',phase:'thinking',date:'d'}).title,'X');
 assert.equal(postcardCaption({kind:'city',district:'Shibuya',date:'2026-10-10'}).title,'Shibuya');
 assert.equal(postcardCaption({kind:'room',name:'\u0007',date:'d'}).title,'A resident');
});
test('links: /p/<slug> for a public project, /r/<plotId> for a room, the city otherwise',()=>{
 assert.equal(shareLink('https://sub.zero/',{kind:'building',slug:'ramen-radar'}),'https://sub.zero/p/ramen-radar');
 assert.equal(shareLink('https://sub.zero',{kind:'room',plotId:'ebisu-1'}),'https://sub.zero/r/ebisu-1');
 assert.equal(shareLink('https://sub.zero',{kind:'building',slug:'../x'}),'https://sub.zero/');
 assert.equal(serverCardUrl({type:'project',slug:'ramen-radar'},'ginza-3'),'/api/postcard/ramen-radar.svg');
 assert.equal(serverCardUrl({type:'project',slug:null},'ginza-3'),null);assert.equal(serverCardUrl({type:'project',slug:'x',private:true},'ginza-3'),null);
 assert.equal(serverCardUrl({type:'apartment'},'ebisu-1'),'/api/postcard/room/ebisu-1.svg');assert.equal(serverCardUrl(null,'home'),null);
});
test('sky gradients parse for the canvas; size and file name',()=>{
 assert.deepEqual(parseGradient('linear-gradient(#0d1726,#2a3550 80%,#4a3f57)'),[{color:'#0d1726',at:0},{color:'#2a3550',at:.8},{color:'#4a3f57',at:1}]);
 assert.deepEqual(parseGradient('linear-gradient(rgb(201, 216, 226), rgb(239, 230, 214))').map(s=>s.at),[0,1]);
 assert.deepEqual(parseGradient('linear-gradient(180deg,#000,#111,#222)').map(s=>s.at),[0,.5,1]);
 assert.equal(parseGradient('none'),null);assert.equal(parseGradient(''),null);
 assert.deepEqual(postcardSize(2160,1350),{w:1600,h:1000});assert.deepEqual(postcardSize(800,600),{w:800,h:600});
 assert.equal(postcardName({title:'Ramen Radar · $RAMEN'},'2026-10-10'),'subzerone-ramen-radar-ramen-2026-10-10.png');
});
