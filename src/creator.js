// Resident creator fields: pure DOM, no three.js. API:
//   renderLookFields(container, options, look = {}, unlocks = null, traits = {})
//     options: GET /api/world/options (uses options.look, options.unlocks, options.traits)
//     unlocks: GET /api/me .unlocks ({tier, accessories[], pets[], ...}); null = only the first tier's things are open
//     Replaces container's children with: skin, hair colour, hair, outfit, top, bottom (radio swatches/chips, the markup
//     main.js used), accessories (checkbox chips, at most options.look.maxAccessories = 4, locked ones greyed with the
//     tier), accessory colour, pet (kind chips incl. "No pet", colour, name) and Personality (5 sliders, step 0.25).
//     Two columns (.creator-col): the body (skin, hair, personality) and the style (clothes, accessories, pet); style.css
//     stacks them on phones. Each slider carries its fill in --v.
//   readLook(container) -> {look, traits}: look as POST /api/residents expects it (accessories[], accessoryColor|null,
//     pet {kind,color,name}|null), traits {neat,outgoing,active,playful,nice} numbers 0..1.
// Helpers (also used by room.js): tierMap, tierOf, isUnlocked, tierLabel.
export const CLOTHES=['#fb752b','#2f3e66','#69a694','#e8e0cf','#3a3b3d','#d9a5a0','#c4a465','#9390c4'];
// The server's look vocabulary (GET /api/world/options .look), used for strangers until the options load.
export const SKINS=['#f6d5b8','#e8b48f','#c98e66','#a26a45','#7a4a2e','#4f3020'],HAIRS=['#1b1b1b','#3b2a20','#6b4428','#a87443','#d9b26f','#b23a2e','#e8e8e8','#4a6cd4'],HAIR_STYLES=['short','long','bun','buzz','curly'];
export const PET_COLORS=['#c8a27a','#f3efe4','#3a3b3d','#e8a04b','#9aa0a6','#7fd36b','#6fa8ff','#e05a47'];
export const TRAITS=['neat','outgoing','active','playful','nice'];
export const TRAIT_LABELS={neat:['messy','neat'],outgoing:['shy','outgoing'],active:['lazy','active'],playful:['serious','playful'],nice:['grouchy','nice']};
const LOOK_FIELDS=[['skin','Skin'],['hair','Hair colour'],['hairStyle','Hair'],['outfit','Outfit'],['top','Top'],['bottom','Bottom']];
const nice=s=>String(s).replace(/_/g,' ');
// The server lists unlocks per tier ({resident:[...]}) ; a {name: tier} map is accepted too. Returns {name: tier}.
export function tierMap(byTier){
 if(!byTier||typeof byTier!=='object')return {};const out={};
 for(const [k,v] of Object.entries(byTier)){if(Array.isArray(v))for(const n of v)out[n]??=k;else if(typeof v==='string')out[k]=v;}
 return out;
}
export const tierOf=(byTier,name)=>tierMap(byTier)[name]??null;
export const tierLabel=t=>t?t[0].toUpperCase()+t.slice(1):'';
// kind: 'items' | 'emotes' | 'accessories' | 'pets'. Without unlocks only the first tier (and untiered things) are open.
export function isUnlocked(kind,name,unlocks,optionsUnlocks){
 if(Array.isArray(unlocks?.[kind]))return unlocks[kind].includes(name);
 const t=tierOf(optionsUnlocks?.[kind],name),first=optionsUnlocks?.tiers?.[0]??'resident';return !t||t===first;
}
const clamp01=v=>{v=Number(v);return Number.isFinite(v)?Math.min(1,Math.max(0,Math.round(v*4)/4)):.5;};
export const normalizeTraits=t=>Object.fromEntries(TRAITS.map(k=>[k,clamp01(t?.[k]??.5)]));

function el(tag,props={},...kids){const n=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='dataset')Object.assign(n.dataset,v);else if(k==='style')n.style.cssText=v;else n[k]=v;}for(const c of kids)if(c!=null)n.append(c);return n;}
let uid=0;
function choice(group,{type='radio',name,value,checked,text,color,locked,tier}){
 const id=`cr-${name}-${uid++}`,input=el('input',{type,name,value,id,checked:!!checked,disabled:!!locked});
 const label=el('label',{htmlFor:id,className:(color?'swatch':'chip')+(locked?' is-locked':''),title:locked?`Unlocks at ${tierLabel(tier)}`:(color||nice(text))});
 if(color)label.style.background=color;else label.textContent=nice(text);
 if(locked)label.append(el('small',{className:'creator-tier',textContent:tierLabel(tier)}));
 group.append(input,label);return input;
}
const fieldset=(legend,cls='swatches')=>{const f=el('fieldset',{className:cls});f.append(el('legend',{textContent:legend}));return f;};

export function renderLookFields(container,options={},look={},unlocks=null,traits={}){
 const L=options?.look||{},U=options?.unlocks||{},body=[],parts=[];look=look||{};
 for(const [key,label] of LOOK_FIELDS){
  const values=Array.isArray(L[key])?L[key]:L.freeColors?.includes(key)?CLOTHES:[];if(!values.length)continue;
  const f=fieldset(label),cur=look[key]&&values.includes(look[key])?look[key]:values[0];
  for(const v of values)choice(f,{name:key,value:v,checked:v===cur,...(/^#[0-9a-f]{6}$/i.test(v)?{color:v}:{text:v})});
  (['skin','hair','hairStyle'].includes(key)?body:parts).push(f);
 }
 // Accessories: chips, at most `max`; reaching it disables the rest until one is unticked.
 const accList=Array.isArray(L.accessories)?L.accessories:[],max=Number(L.maxAccessories)||4;
 if(accList.length){
  const f=fieldset(`Accessories · up to ${max}`,'swatches creator-acc'),mine=new Set(look.accessories||[]),boxes=[];
  for(const a of accList){const locked=!isUnlocked('accessories',a,unlocks,U);boxes.push(choice(f,{type:'checkbox',name:'accessories',value:a,text:a,checked:mine.has(a)&&!locked,locked,tier:tierOf(U.accessories,a)}));}
  const limit=()=>{const n=boxes.filter(b=>b.checked).length;for(const b of boxes)if(!b.checked)b.disabled=n>=max||!isUnlocked('accessories',b.value,unlocks,U);};
  for(const b of boxes)b.onchange=limit;limit();parts.push(f);
  const c=fieldset('Accessory colour');choice(c,{name:'accessoryColor',value:'',text:'default',checked:!look.accessoryColor});
  for(const v of CLOTHES)choice(c,{name:'accessoryColor',value:v,color:v,checked:look.accessoryColor===v});parts.push(c);
 }
 // Pet: a kind (or none), its colour and name.
 const pets=Array.isArray(L.pets)?L.pets:[];
 if(pets.length){
  const pet=look.pet||null,f=fieldset('Pet','swatches creator-pet');
  choice(f,{name:'petKind',value:'',text:'no pet',checked:!pet});
  for(const k of pets){const locked=!isUnlocked('pets',k,unlocks,U);choice(f,{name:'petKind',value:k,text:k,checked:pet?.kind===k&&!locked,locked,tier:tierOf(U.pets,k)});}
  const c=fieldset('Pet colour');for(const v of PET_COLORS)choice(c,{name:'petColor',value:v,color:v,checked:(pet?.color||PET_COLORS[0])===v});
  const n=fieldset('Pet name','creator-petname');n.append(el('input',{type:'text',name:'petName',value:pet?.name||'',maxLength:Number(L.petName?.max)||12,placeholder:'Mochi',autocomplete:'off'}));
  parts.push(f,c,n);
 }
 // Personality: the five Sims traits.
 const keys=Array.isArray(options?.traits?.keys)?options.traits.keys.filter(k=>TRAITS.includes(k)):TRAITS,tv=normalizeTraits(traits);
 const p=fieldset('Personality','creator-traits');
 for(const k of keys){const [lo,hi]=TRAIT_LABELS[k],input=el('input',{type:'range',name:'trait-'+k,min:0,max:1,step:.25,value:tv[k],style:`--v:${tv[k]*100}%`});input.setAttribute('aria-label',`${lo} to ${hi}`);
  input.oninput=()=>input.style.setProperty('--v',`${input.value*100}%`);
  p.append(el('label',{className:'creator-trait'},el('span',{textContent:lo}),input,el('span',{textContent:hi})));}
 body.push(p);
 container.replaceChildren(el('div',{className:'creator-col'},...body),el('div',{className:'creator-col'},...parts));
 return container;
}

export function readLook(container){
 const look={},traits={},inputs=[...container.querySelectorAll('input')];let accessories=[],petKind='',petColor=PET_COLORS[0],petName='',accessoryColor=null,hasAcc=false,hasPet=false;
 for(const i of inputs){
  if(i.name.startsWith('trait-')){traits[i.name.slice(6)]=clamp01(i.value);continue;}
  if(i.name==='petName'){petName=String(i.value||'').trim();continue;}
  if(i.name==='accessories'){hasAcc=true;if(i.checked&&!i.disabled)accessories.push(i.value);continue;}
  if(!i.checked)continue;
  if(i.name==='accessoryColor')accessoryColor=i.value||null;else if(i.name==='petKind'){hasPet=true;petKind=i.value;}else if(i.name==='petColor')petColor=i.value;
  else if(LOOK_FIELDS.some(([k])=>k===i.name))look[i.name]=i.value;
 }
 if(hasAcc){look.accessories=[...new Set(accessories)].slice(0,4);look.accessoryColor=accessoryColor;}
 if(hasPet)look.pet=petKind?{kind:petKind,color:petColor,name:petName||petKind[0].toUpperCase()+petKind.slice(1)}:null;
 return {look,traits:normalizeTraits(traits)};
}
