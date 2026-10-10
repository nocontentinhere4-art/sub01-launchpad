// Inline SVG icons from the sprite in index.html (<symbol id="i-…">, 24-unit grid, 1.8 stroke, currentColor) and the
// one leading tile every list row, sheet header and avatar uses. DOM only when called (tests never import this).
// Icon rule (uidir/PANEL-RESEARCH.md): no typed glyphs (↗ → › × ✉ ⌘ ☀ …) anywhere in the UI; kanji only as content.
import {safeImageUrl} from './city-screens.js';
const NS='http://www.w3.org/2000/svg';
export function icon(id,cls='i'){const s=document.createElementNS(NS,'svg'),u=document.createElementNS(NS,'use');
 s.setAttribute('class',cls);s.setAttribute('aria-hidden','true');u.setAttribute('href','#i-'+id);s.append(u);return s;}
// The primary button's arrow in its dark circle (.arw): 'arrow' = do it / go there, 'ne' = leaves the city page.
export function arw(id='arrow'){const s=document.createElement('span');s.className='arw'+(id==='ne'?' ne':'');s.append(icon(id));return s;}
// A button label with an optional trailing arrow typed the old way ('Visit →', 'Open ↗'): text plus the arrow circle.
export function cta(button,text){const m=/\s*([→↗])\s*$/.exec(text),label=m?text.slice(0,m.index):text;
 button.replaceChildren(document.createTextNode(label),...(m?[arw(m[1]==='↗'?'ne':'arrow')]:[]));return button;}
// Text with a trailing/leading icon for links and small buttons ('See the ledger' + arrow, chevron + 'Back').
export function withIcon(node,text,id,{lead=false,cls='i'}={}){node.replaceChildren(...(lead?[icon(id,cls),document.createTextNode(text)]:[document.createTextNode(text),icon(id,cls)]));return node;}

// Palette names the server uses for residents and projects (world-sync.js PALETTE) → tile colours.
export const TILE_COLORS={orange:'#FB752B',mint:'#69A694',violet:'#8990BB',sand:'#E2A05B'};
export const tileColor=c=>TILE_COLORS[c]||(typeof c==='string'&&/^#[0-9a-f]{3,8}$/i.test(c)?c:null);
export const initialsOf=n=>(String(n??'').match(/[\p{L}\p{N}]/gu)||['?']).slice(0,2).join('').toUpperCase();
// The brand mark as an <img>: SUB-01's tile, chat avatar and activity badge (never the text "01").
export function brandMark(cls='',src='/brand/mark-small.svg'){const i=document.createElement('img');i.src=src;i.alt='';i.width=i.height=40;i.decoding='async';if(cls)i.className=cls;return i;}

// tile(spec, size): one leading tile. spec = {kind, logo, name, color, icon, kanji, private, empty, label}
//   kind 'sub01'    → the brand mark
//        'project'  → logo image (safeImageUrl, lazy; a broken image falls back to the kanji tile); private → lock
//        'resident' → initials on the resident's palette colour (or `icon` when the look has no avatar yet)
//        'landmark' → an SVG glyph from the sprite (`icon`), coloured
//        'idea'     → the mail glyph
//        'lot'      → the district kanji in small type (neutral); empty:true → dashed "your logo here" tile
// size: '' | 'sm' | 'lg'. The element is a <span class="tile …"> with --c for its colour; aria-hidden (decorative).
export function tile(spec={},size=''){
 const t=document.createElement('span');t.className='tile'+(size?' tile-'+size:'');t.setAttribute('aria-hidden','true');
 const color=tileColor(spec.color);if(color)t.style.setProperty('--c',color);
 const kanji=()=>{t.classList.add('is-kanji');const k=document.createElement('span');k.className='jp';k.textContent=spec.kanji||'東';t.replaceChildren(k);};
 const glyph=id=>t.replaceChildren(icon(id));
 if(spec.empty){t.classList.add('is-empty');glyph('plus');if(spec.label)t.title=spec.label;return t;}
 switch(spec.kind){
  case 'sub01':t.classList.add('is-brand');t.replaceChildren(brandMark());break;
  case 'project':{
   if(spec.private){t.classList.add('is-lock');glyph('lock');break;}
   const src=safeImageUrl(spec.logo);
   if(!src){kanji();break;}
   const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
   img.onerror=()=>{img.remove();t.classList.remove('has-img');kanji();};t.classList.add('has-img');img.src=src;t.replaceChildren(img);break;}
  case 'resident':{if(spec.icon){glyph(spec.icon);break;}t.classList.add('is-initials');t.textContent=initialsOf(spec.name);break;}
  case 'idea':glyph('mail');break;
  case 'landmark':glyph(spec.icon||'building');break;
  default:kanji();
 }
 return t;
}
