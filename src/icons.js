// Inline SVG icons from the sprite in index.html (<symbol id="i-…">, 24-unit grid, 1.8 stroke). DOM only when called.
const NS='http://www.w3.org/2000/svg';
export function icon(id,cls='i'){const s=document.createElementNS(NS,'svg'),u=document.createElementNS(NS,'use');
 s.setAttribute('class',cls);s.setAttribute('aria-hidden','true');u.setAttribute('href','#i-'+id);s.append(u);return s;}
// The primary button's arrow in its dark circle (.arw); 'ne' nudges diagonally on hover.
export function arw(id='arrow'){const s=document.createElement('span');s.className='arw'+(id==='ne'?' ne':'');s.append(icon(id));return s;}
// A button label with an optional trailing arrow typed the old way ('Visit →', 'Open ↗'): text plus the arrow circle.
export function cta(button,text){const m=/\s*([→↗])\s*$/.exec(text),label=m?text.slice(0,m.index):text;
 button.replaceChildren(document.createTextNode(label),...(m?[arw(m[1]==='↗'?'ne':'arrow')]:[]));return button;}
