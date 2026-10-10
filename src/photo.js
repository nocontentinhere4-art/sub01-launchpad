// Photo mode + postcards. 📷 hides the HUD and leaves the camera free to drag; "Take postcard" renders one frame and
// reads the WebGL canvas in the same task (preserveDrawingBuffer stays false), composes it on an offscreen canvas with
// the CSS sky behind (the city canvas is transparent), the SUBZERONE lockup and a caption, then offers Share (Web
// Share with the file where it exists), Download and Copy link (/p/<slug>, /r/<plotId>). A caption never carries a
// price, a mint or any market number. Pure helpers first (tests/photo.test.js).
const clean=v=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,'').trim():'';
const TICKER=/^[A-Z0-9]{1,10}$/;
export const STATE_WORD={thinking:'Thinking it over',scaffold:'Under construction',stopped:'On hold',review:'Built, in review',launch:'Launching soon',open:'Launched',home:'Home'};
// ctx: {kind:'room', name, district} | {kind:'building', name, ticker, phase} | {kind:'city', district}. Only these
// fields are read, so nothing else (a mint, a price, a wallet) can reach the picture.
export function postcardCaption(ctx={}){
 const date=clean(ctx.date)||new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
 if(ctx.kind==='room'){const name=clean(ctx.name).slice(0,24)||'A resident';return {title:name,jp:'の部屋',sub:`${clean(ctx.district)||'Tokyo'} · ${date}`};}
 if(ctx.kind==='building'){const t=clean(ctx.ticker).replace(/^\$/,'').toUpperCase(),name=clean(ctx.name).slice(0,32)||'A project';
  return {title:TICKER.test(t)?`${name} · $${t}`:name,jp:'',sub:`${STATE_WORD[ctx.phase]||'In the city'} · ${date}`};}
 return {title:clean(ctx.district)||'Tokyo',jp:'東京',sub:`SUBZERONE city · ${date}`};
}
// The link a postcard shares: the server's share pages carry the Open Graph card and redirect into the city.
export function shareLink(origin,ctx={}){
 const o=String(origin||'').replace(/\/$/,'');
 if(ctx.kind==='building'&&/^[a-z0-9-]{1,40}$/.test(ctx.slug||''))return `${o}/p/${ctx.slug}`;
 if(ctx.kind==='room'&&/^[a-z]+-[1-6]$/.test(ctx.plotId||''))return `${o}/r/${ctx.plotId}`;
 return `${o}/`;
}
// The server's own card for the detail sheet ("Share card ↗"): public project with a slug, or an apartment.
export function serverCardUrl(b,plotId){
 if(b?.type==='project'&&!b.private&&/^[a-z0-9-]{1,40}$/.test(b.slug||''))return `/api/postcard/${b.slug}.svg`;
 if(b?.type==='apartment'&&/^[a-z]+-[1-6]$/.test(plotId||''))return `/api/postcard/room/${plotId}.svg`;
 return null;
}
// CSS linear-gradient(...) → [{color, at}] stops for the canvas (hex/rgb colours; missing positions spread evenly).
export function parseGradient(css){
 const m=/linear-gradient\((.*)\)\s*$/i.exec(String(css||'').trim());if(!m)return null;
 const parts=m[1].split(/,(?![^(]*\))/).map(s=>s.trim()).filter(s=>!/^(to |\d+deg)/.test(s));
 const stops=parts.map(p=>{const c=/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*(\d+(?:\.\d+)?%)?$/i.exec(p);return c?{color:c[1],at:c[2]?parseFloat(c[2])/100:null}:null;});
 if(!stops.length||stops.some(s=>!s))return null;
 stops.forEach((s,i)=>{if(s.at===null)s.at=stops.length===1?0:i===0?0:i===stops.length-1?1:null;});
 for(let i=1;i<stops.length-1;i++)if(stops[i].at===null){let j=i;while(stops[j].at===null)j++;const a=stops[i-1].at,b=stops[j].at;for(let k=i;k<j;k++)stops[k].at=a+(b-a)*(k-i+1)/(j-i+1);}
 return stops;
}
// Output size: the frame scaled so its long side is at most `max` px.
export function postcardSize(w,h,max=1600){const k=Math.min(1,max/Math.max(w,h,1));return {w:Math.round(w*k),h:Math.round(h*k)};}
export const postcardName=(cap,date)=>`subzerone-${String(cap?.title||'tokyo').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'tokyo'}-${date||'postcard'}.png`;

// ---------------------------------------------------------------- DOM
// ctx: capture() → the WebGL canvas right after a fresh render; sky() → CSS background of the sky; context() → caption
// context; enter() / exit() → main.js hides the HUD; openDialog(id), closeDialog(), notify(text).
export function createPhoto(ctx){
 const $=id=>document.getElementById(id),el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
 let on=false,lockup=null,last=null,url='';
 const loadLockup=()=>{if(lockup)return;lockup=new Image();lockup.decoding='async';lockup.src='/brand/lockup.svg';};
 const bar=el('div',{className:'photo-bar',hidden:true});bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Photo mode');
 const take=el('button',{type:'button',className:'button button-orange',onclick:()=>shoot()},'Take postcard');
 const done=el('button',{type:'button',className:'button button-dark',onclick:()=>exit()},'Done');
 bar.append(el('span',{className:'photo-hint'},el('span',{className:'kbd',textContent:'DRAG'}),' TO FRAME · ',el('span',{className:'kbd',textContent:'ESC'}),' TO LEAVE'),take,done);
 document.body.append(bar);
 function enter(){if(on)return;on=true;loadLockup();bar.hidden=false;document.body.classList.add('is-photo');ctx.enter?.();take.focus({preventScroll:true});}
 function exit(){if(!on)return;on=false;bar.hidden=true;document.body.classList.remove('is-photo');ctx.exit?.();}
 function compose(gl,cap){
  const {w,h}=postcardSize(gl.width,gl.height),c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  const stops=parseGradient(ctx.sky?.())||[{color:'#C9D8E2',at:0},{color:'#EFE6D6',at:1}],grad=g.createLinearGradient(0,0,0,h);
  for(const s of stops)try{grad.addColorStop(Math.min(1,Math.max(0,s.at)),s.color);}catch{}
  g.fillStyle=grad;g.fillRect(0,0,w,h);g.drawImage(gl,0,0,w,h);
  // Landscape: lockup bottom-left, caption bottom-right. Portrait: lockup top-left, caption bottom-right (no overlap).
  const portrait=w<h*1.1,u=portrait?w/70:Math.min(h,w*.62)/100,band=Math.round(u*20),pad=Math.round(Math.max(18,Math.min(w,h)*.04)),lh=Math.round(Math.max(26,u*7.5));
  const shadeAt=(y0,y1)=>{const gr=g.createLinearGradient(0,y0,0,y1);gr.addColorStop(0,'rgba(14,12,10,0)');gr.addColorStop(1,'rgba(14,12,10,.82)');g.fillStyle=gr;g.fillRect(0,Math.min(y0,y1),w,Math.abs(y1-y0));};
  shadeAt(h-band*1.4,h);if(portrait)shadeAt(band*1.2,0);
  const ly=portrait?pad:h-pad-lh;
  if(lockup?.complete&&lockup.naturalWidth){const lw=Math.min(w-2*pad,lh*lockup.naturalWidth/lockup.naturalHeight);g.drawImage(lockup,pad,ly,lw,lw*lockup.naturalHeight/lockup.naturalWidth);}
  else{g.fillStyle='#F6F4EF';g.font=`800 ${Math.round(lh*.5)}px Archivo, system-ui, sans-serif`;g.textBaseline='top';g.fillText('SUBZERONE',pad,ly+lh*.25);}
  g.textAlign='right';g.textBaseline='alphabetic';g.fillStyle='#F6F4EF';g.font=`800 ${Math.round(u*6.4)}px Archivo, system-ui, sans-serif`;
  const maxW=portrait?w-2*pad:w*.6,tw=g.measureText(cap.title).width;g.fillText(cap.title,w-pad,h-pad-u*4.6,maxW);
  if(cap.jp){g.fillStyle='#FF9A5C';g.font=`700 ${Math.round(u*3.4)}px "Hiragino Sans","Noto Sans JP",sans-serif`;g.fillText(cap.jp,w-pad,h-pad-u*11.6);}
  g.fillStyle='rgba(246,244,239,.78)';g.font=`600 ${Math.round(u*2.3)}px "JetBrains Mono", ui-monospace, monospace`;g.fillText(cap.sub.toUpperCase(),w-pad,h-pad,maxW);
  g.fillStyle='#FB752B';g.fillRect(w-pad-Math.min(tw,maxW),h-pad-u*3.4,Math.min(tw,maxW),Math.max(2,u*.35));
  return c;
 }
 function shoot(){
  const context=ctx.context?.()||{kind:'city'},cap=postcardCaption(context);let canvas;
  try{canvas=compose(ctx.capture(),cap);}catch(err){console.warn('[city] postcard',err);ctx.notify('The postcard could not be made in this browser.');return;}
  canvas.toBlob(blob=>{if(!blob){ctx.notify('The postcard could not be made in this browser.');return;}
   if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);last={blob,cap,context,link:shareLink(location.origin,context),name:postcardName(cap,cap.sub.split(' · ').pop())};preview();},'image/png');
 }
 function preview(){
  const {blob,cap,link,name}=last,file=typeof File==='function'?new File([blob],name,{type:'image/png'}):null;
  const canFiles=!!(file&&navigator.canShare?.({files:[file]}));
  const share=el('button',{type:'button',className:'button button-orange',hidden:!canFiles&&!navigator.share},'Share');
  share.onclick=async()=>{try{await navigator.share(canFiles?{files:[file],title:cap.title,text:`${cap.title} · SUBZERONE`,url:link}:{title:cap.title,url:link});}catch(err){if(err?.name!=='AbortError')ctx.notify('Sharing did not work here. Download it instead.');}};
  const dl=el('a',{className:'button button-ghost',href:url,download:name,textContent:'Download'});
  const copy=el('button',{type:'button',className:'button button-ghost',textContent:'Copy link'});
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(link);copy.textContent='Link copied';}catch{prompt('Copy this link',link);}};
  $('postcard-body').replaceChildren(el('img',{className:'postcard-img',src:url,alt:`Postcard: ${cap.title}, ${cap.sub}`}),
   el('div',{className:'postcard-actions'},share,dl,copy),el('p',{className:'fine',textContent:`Link: ${link.replace(/^https?:\/\//,'')} · made in your browser, nothing uploaded.`}));
  ctx.openDialog('postcard-backdrop');
 }
 return {enter,exit,toggle:()=>on?exit():enter(),shoot,get on(){return on;},get last(){return last;}};
}
