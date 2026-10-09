// The Sims 1 "advertisement" brain, pure JS (no three): objects shout what they offer, a resident scores the shouts against
// its needs and personality, discounts by distance and picks among the best few. Nobody scripts the residents.
// Game time: 1 real minute = 1 game hour (see HOURS_PER_SECOND); the city's day/night clock can drive it.
export const NEEDS=['hunger','energy','comfort','fun','social','hygiene','bladder','room'];
export const TRAITS=['neat','outgoing','active','playful','nice'];   // the five of the original, 0..1 each
export const HOURS_PER_SECOND=1/60;
// Points lost per game hour when nothing is done about it.
const DECAY={hunger:4.2,energy:3.6,comfort:3,fun:3.4,social:2.6,hygiene:2.2,bladder:5,room:0};
// What each catalogue piece advertises: need → points, and how many game hours the use takes.
export const ADS={
 bedSingle:{energy:80,comfort:15,hours:7},bedDouble:{energy:85,comfort:25,hours:7},cabinetBed:{energy:75,comfort:10,hours:7},
 chair:{comfort:25,hours:.5},chairCushion:{comfort:35,hours:.5},chairDesk:{comfort:30,hours:.5},
 loungeSofa:{comfort:45,fun:10,hours:1},loungeChair:{comfort:40,fun:5,hours:1},loungeDesignSofa:{comfort:50,fun:10,hours:1},
 desk:{fun:30,hours:2},deskCorner:{fun:30,hours:2},laptop:{fun:45,social:10,hours:1.5},computerScreen:{fun:50,social:15,hours:1.5},
 kitchenFridge:{hunger:75,hours:1},kitchenFridgeSmall:{hunger:60,hours:1},kitchenMicrowave:{hunger:50,hours:.5},kitchenCoffeeMachine:{energy:20,fun:5,hours:.25},
 televisionModern:{fun:50,hours:1.5},radio:{fun:30,hours:1},speaker:{fun:35,hours:1},speakerSmall:{fun:25,hours:1},
 books:{fun:35,hours:1.5},bookcaseOpen:{fun:35,hours:1.5},bookcaseOpenLow:{fun:30,hours:1.5},
 washer:{hygiene:40,room:10,hours:1},trashcan:{room:20,hours:.1},
 wallWindow:{fun:15,room:10,hours:.25},wallWindowSlide:{fun:15,room:10,hours:.25},
 bear:{comfort:15,fun:15,social:10,hours:.5},pillow:{comfort:15,hours:.5},pillowBlue:{comfort:15,hours:.5},
 doorway:{social:60,bladder:100,hygiene:20,hours:2},doorwayFront:{social:60,bladder:100,hygiene:20,hours:2},   // the city: people, and a bathroom somewhere
 pottedPlant:{room:15,hours:.1},plantSmall1:{room:10,hours:.1},plantSmall2:{room:10,hours:.1},plantSmall3:{room:10,hours:.1},
};
// Which trait makes a need matter more (×(1+trait)) — a playful resident hears the TV louder, a neat one the trash can.
const TRAIT_OF={fun:'playful',social:'outgoing',room:'neat',energy:'active',comfort:'nice'};
export function makeResident(traits={},needs={}){
 return {traits:Object.fromEntries(TRAITS.map(t=>[t,Math.min(1,Math.max(0,traits[t]??.5))])),
  needs:Object.fromEntries(NEEDS.map(n=>[n,Math.min(100,Math.max(0,needs[n]??70))])),busy:null};
}
// The original's curve: a need near 0 weighs far more than one near 100, so mood is dragged down by whatever is worst.
const weight=v=>1+((100-v)/100)**2*4;
export function mood(r){let s=0,w=0;for(const n of NEEDS){const k=weight(r.needs[n]);s+=r.needs[n]*k;w+=k;}return s/w;}
export function tick(r,hours){
 for(const n of NEEDS)r.needs[n]=Math.max(0,r.needs[n]-DECAY[n]*hours*(n==='energy'&&r.busy?.item&&ADS[r.busy.item]?.energy?0:1));
 if(r.busy){const a=ADS[r.busy.item],f=Math.min(hours,r.busy.left)/a.hours;
  for(const n of NEEDS)if(a[n])r.needs[n]=Math.min(100,r.needs[n]+a[n]*f);
  r.busy.left-=hours;if(r.busy.left<=0)r.busy=null;}
}
// Score one advertisement for one resident: gain × how much the need is wanted × trait, discounted by distance.
export function score(r,item,dist=0){
 const a=ADS[item];if(!a)return 0;let s=0;
 for(const n of NEEDS){if(!a[n])continue;const want=(100-r.needs[n])/100,t=TRAIT_OF[n];s+=a[n]*want*want*(t?1+r.traits[t]:1);}
 return s/(1+dist*.08);
}
// Pick among the best few, like the original: the top is likeliest but not certain, so two residents don't behave identically.
export function choose(r,objects,at={x:0,z:0},rand=Math.random){
 const scored=objects.map((o,i)=>({i,item:o.item,s:score(r,o.item,Math.hypot((o.x??0)-at.x,(o.z??0)-at.z))})).filter(o=>o.s>0).sort((a,b)=>b.s-a.s).slice(0,3);
 if(!scored.length)return null;const total=scored.reduce((t,o)=>t+o.s,0);let roll=rand()*total;
 for(const o of scored){roll-=o.s;if(roll<=0)return o;}return scored[0];
}
export function use(r,item){const a=ADS[item];if(!a)return false;r.busy={item,left:a.hours};return true;}
// Headless run of whole game days: returns a log of what was used and when, the way the original was tuned.
export function simulate(r,objects,{days=1,step=.25,rand=Math.random}={}){
 const log=[];for(let h=0;h<days*24;h+=step){tick(r,step);if(r.busy)continue;const c=choose(r,objects,{x:0,z:0},rand);if(!c)continue;use(r,c.item);log.push({hour:h,item:c.item,mood:mood(r)});}
 return log;
}
