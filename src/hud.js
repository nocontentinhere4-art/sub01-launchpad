// HUD words and cuts (SIMPLIFY pass, scratchpad/uidir/SIMPLIFY.md): the Walk button's label, the one-line hint, the
// places-list cut, the first-visit coach memory and the small label helpers main.js prints. Pure (tests/hud.test.js).

// The places list shows LIST_MAX rows, then "All places (N)".
export const LIST_MAX=5;
export function listCut(total,{max=LIST_MAX,all=false}={}){
 const n=Math.max(0,Number(total)||0),cut=!all&&n>max,shown=cut?max:n;
 return {shown,hidden:n-shown,button:n>max,label:all?'Fewer places':`All places (${n})`};
}

// The character control. Signed in with a resident or playing as a guest: "Walk as ‹name›"; nobody yet: "Walk around".
// While the model is out (any explorer state, going home included): "Stop walking". Phones get the short words.
export function walkLabel({walking=false,name=null,short=false}={}){
 if(walking)return short?'Stop':'Stop walking';
 const n=typeof name==='string'&&name.trim()?name.trim():null;
 if(short)return 'Walk';
 return n?`Walk as ${n}`:'Walk around';
}
export const walkIcon=walking=>walking?'x':'walk';
// What a tap on "Stop walking" does: the first one sends the model home, a second one ends the outing where it stands.
export const stopToast=(name,{atOnce=false}={})=>atOnce?`${name||'Your character'} stopped here.`:`${name||'Your character'} is walking home. Press Stop again to end it here.`;

// The one-line hint over the world (desktop). It goes after the first drag or click in that context.
export const hintFor=(walking,{touch=false}={})=>walking?(touch?'Tap a street to walk · Double-tap to run':'Click a street to walk · Double-click to run'):(touch?'Drag to look around · Tap a building':'Drag to look around · Click a building');

// First-visit coach: three steps, shown once per browser.
export const COACH_KEY='sub01.coach';
export const COACH_STEPS=['Drag to look around','Click a building','Walk as your character'];
export const coachSteps=({touch=false}={})=>COACH_STEPS.map(s=>touch?s.replace('Click','Tap'):s);
export function coachSeen(store,key=COACH_KEY){try{return store?.getItem?.(key)==='1';}catch{return false;}}
export function markCoach(store,key=COACH_KEY){try{if(typeof store?.setItem!=='function')return false;store.setItem(key,'1');return true;}catch{return false;}}

// "Weather: rain" → "rain" for the More sheet's value column; a label without a colon is its own value.
export const valueOf=label=>{const s=String(label??''),i=s.indexOf(': ');return i<0?s:s.slice(i+2);};
export const DAY_WORDS={day:'Day',night:'Night',auto:'Tokyo clock'};
// Topbar badge and the activity eyebrow.
export const liveText=up=>up?'LIVE':'OFFLINE';
