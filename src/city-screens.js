import * as THREE from 'three';
// Big screens that show the real city (wave 3A): the Shibuya screen and the other neon districts' hero billboards cycle
// through the PUBLIC projects in /api/world (plots[].project), launched first, every 8 s with a wipe. Art is the
// project's own banner/logo (bannerUrl/logoUrl, same-origin /meta/… files); without art a card is drawn from the
// server's own text (name, $TICKER, stage). Nothing is invented: with no public project the screen keeps its
// "YOUR IDEA. NEXT ADDRESS." card and the hero billboards their SUBZERONE glyphs.
export const SCREEN_PERIOD=8,SCREEN_WIPE=.7,MAX_CARDS=12;
export const IDLE_CARD={kind:'idle',key:'idle',title:'YOUR IDEA.',ticker:'',stage:'NEXT ADDRESS.',image:null,logo:null};
const HIDDEN_STAGES=['declined','cancelled','failed'];
const clean=(s,n)=>{const t=String(s??'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1)+'…':t;};
const tick=t=>String(t??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10);
// Only the server's own asset paths (and inline data images, for local mocks) are ever loaded.
export function safeImageUrl(u){return typeof u==='string'&&(/^\/meta\/[a-z0-9-]+\/(logo|banner)-v\d+\.(png|svg)$/.test(u)||/^data:image\/(png|svg\+xml)[;,]/.test(u))?u:null;}
export function screenCards(world){
 const seen=new Set(),out=[];
 (Array.isArray(world?.plots)?world.plots:[]).forEach((p,order)=>{const x=p?.project;if(!x||typeof x!=='object')return;
  if(!x.slug&&!x.ticker&&x.name==='Private project')return;          // private: the server shows nothing about it
  if(HIDDEN_STAGES.includes(x.stage)||!clean(x.name,40))return;
  const key=x.slug||`${clean(x.name,40)}|${tick(x.ticker)}`;if(seen.has(key))return;seen.add(key);
  out.push({kind:'project',key,order,launched:!!x.launched,progress:Number(x.progress)||0,title:clean(x.name,28),ticker:tick(x.ticker)?'$'+tick(x.ticker):'',
   stage:x.launched?'LAUNCHED':clean(x.stageLabel||x.stage,34),image:safeImageUrl(x.bannerUrl),logo:safeImageUrl(x.logoUrl)});});
 // Launched first (newest claim first), then the furthest along.
 out.sort((a,b)=>(b.launched-a.launched)||(a.launched?b.order-a.order:(b.progress-a.progress)||(a.order-b.order)));
 return out.slice(0,MAX_CARDS);
}
// Which card is up at `seconds` (shift = how many cards ahead of the Shibuya screen), the next one and the wipe (0…1).
export function screenAt(cards,seconds,shift=0){
 const n=cards.length;if(!n)return {index:-1,next:-1,wipe:0};
 const k=Math.floor(seconds/SCREEN_PERIOD),f=seconds/SCREEN_PERIOD-k,index=((k+shift)%n+n)%n;
 const wipe=n>1?Math.max(0,(f*SCREEN_PERIOD-(SCREEN_PERIOD-SCREEN_WIPE))/SCREEN_WIPE):0;
 return {index,next:(index+1)%n,wipe};
}

// ---------- Canvas side ----------
const images=new Map();   // url → {img, ok:null|true|false}
function image(url,onReady){if(!url||typeof Image==='undefined')return null;let e=images.get(url);
 if(!e){e={img:new Image(),ok:null,wait:new Set()};images.set(url,e);e.img.decoding='async';
  e.img.onload=()=>{e.ok=e.img.naturalWidth>0;for(const f of e.wait)f();e.wait.clear();};e.img.onerror=()=>{e.ok=false;for(const f of e.wait)f();e.wait.clear();};e.img.src=url;}
 if(e.ok===null)e.wait.add(onReady);return e.ok?e.img:null;}
function drawCard(g,card,W,H,ready){
 g.save();g.textBaseline='alphabetic';g.textAlign='left';
 if(card.kind==='idle'){
  g.fillStyle='#152f42';g.fillRect(0,0,W,H);g.fillStyle='#fa853d';g.fillRect(15,15,W-30,6);g.font='bold 65px monospace';g.fillText('YOUR IDEA.',28,105);
  g.fillStyle='#81d4d9';g.font='bold 42px monospace';g.fillText('NEXT ADDRESS.',28,170);g.fillStyle='#e6e2cf';g.font='19px monospace';g.fillText('SUBZERONE / TOKYO',28,218);g.restore();return;}
 const banner=image(card.image,ready),logo=banner?null:image(card.logo,ready);
 g.fillStyle='#10171f';g.fillRect(0,0,W,H);
 if(banner){
  // Banner art (3:1) left-aligned and cropped on the right, a strip below with the server's text.
  const h=H-58,w=banner.naturalWidth*h/banner.naturalHeight;g.drawImage(banner,0,0,w,h);
  g.fillStyle='#0d131b';g.fillRect(0,h,W,58);g.fillStyle='#FFB547';g.font='bold 30px monospace';g.fillText(card.ticker,18,h+40,180);
  g.fillStyle='#F4F1EA';g.font='bold 22px monospace';g.fillText(card.title,card.ticker?200:18,h+38,W-(card.ticker?200:18)-150);
  g.fillStyle=card.launched?'#5FE6A8':'#81d4d9';g.font='15px monospace';g.textAlign='right';g.fillText(card.stage,W-16,h+37,140);
 }else{
  g.fillStyle='#fa853d';g.fillRect(15,15,W-30,5);
  let x=28;if(logo){g.drawImage(logo,22,40,170,170);x=210;}
  g.fillStyle='#F4F1EA';g.font='bold 40px monospace';g.fillText(card.title,x,92,W-x-20);
  g.fillStyle='#81d4d9';g.font='bold 46px monospace';if(card.ticker)g.fillText(card.ticker,x,152,W-x-20);
  g.fillStyle=card.launched?'#5FE6A8':'#e6e2cf';g.font='20px monospace';g.fillText(card.stage,x,196,W-x-20);
  g.fillStyle='#8b97a3';g.font='15px monospace';g.fillText('SUBZERONE / TOKYO',x,232);
 }
 g.restore();
}
// One CanvasTexture per screen; redrawn only when the card, the wipe step or a finished image download changes it.
// strip: extra white rows under the card (city-life.js samples them for the untextured train boxes in the same batch).
export function createScreen({width=512,height=256,shift=0,strip=0}={}){
 let cards=[],key='',version=0;
 if(typeof document==='undefined')return {texture:null,setCards(c){cards=c;},update(){},get cards(){return cards;}};
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+strip;const g=canvas.getContext('2d');if(strip){g.fillStyle='#ffffff';g.fillRect(0,height,width,strip);}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const ready=()=>{version++;};
 function update(seconds){
  const list=cards.length?cards:[IDLE_CARD],s=screenAt(list,seconds,shift),step=Math.round(s.wipe*14);
  const k=`${list[s.index].key}|${list[s.next].key}|${step}|${version}`;if(k===key)return;key=k;
  drawCard(g,list[s.index],width,height,ready);
  if(step>0){const x=width*step/14;g.save();g.beginPath();g.rect(0,0,x,height);g.clip();drawCard(g,list[s.next],width,height,ready);g.restore();
   g.fillStyle='#F4F1EA';g.fillRect(x-3,0,3,height);g.fillStyle='#fa853d';g.fillRect(x,0,5,height);}
  texture.needsUpdate=true;
 }
 update(0);
 return {texture,canvas,update,setCards(next){cards=Array.isArray(next)?next:[];key='';},get cards(){return cards;}};
}
