import { validateIdea } from './state.js';
export const CITY_KEY='sub01-tokyo-buildings-v1';
export const districts=[
 {id:'shiba',name:'Shiba / Tower',x:-29,z:-28,color:'#df8962'},
 {id:'shinjuku',name:'Shinjuku',x:0,z:-28,color:'#8b91b2'},
 {id:'akihabara',name:'Akihabara',x:29,z:-28,color:'#c4a465'},
 {id:'shibuya',name:'Shibuya',x:29,z:2,color:'#729d92'},
 {id:'harajuku',name:'Harajuku',x:29,z:32,color:'#ab97b6'},
 {id:'nakameguro',name:'Nakameguro',x:0,z:32,color:'#86a57b'},
 {id:'ebisu',name:'Ebisu',x:-29,z:32,color:'#b8a276'},
 {id:'roppongi',name:'Roppongi',x:-29,z:2,color:'#8a9fa7'},
];
export const cityPlots=districts.flatMap((d,di)=>Array.from({length:6},(_,i)=>({
 id:`${d.id}-${i+1}`,district:d.id,districtName:d.name,name:`${d.name.split(' /')[0]} ${String(i+1).padStart(2,'0')}`,
 x:d.x+[-8,0,8][i%3],z:d.z+(i<3?-6:6),height:3+((di*3+i*7)%6),
 vacant:i===5,color:d.color,symbol:i===5?'+':'▥',kind:'TOKYO / AVAILABLE SPACE',status:i===5?'Open lot':'Available building',
 description:'Choose this address for an apartment, studio or project. Customize it in the local city preview. No purchase, global ownership or token launch.'
})));
export const tower={id:'tower',name:'Tokyo Tower',x:-29,z:-28,height:21,color:'#f2773a',symbol:'△',kind:'TOKYO / LANDMARK',status:'City landmark',description:'The center of Shiba. An original, stylized Tokyo Tower made from lightweight shared geometry. This city is inspired by Tokyo, not an accurate map.'};
export const buildingColors={orange:'#f4864e',mint:'#80a897',violet:'#a19bc4',sand:'#d4bf91'};
export function createBuilding(plotId,name,idea,ticker,type,color,existing=[],id=crypto.randomUUID()){
 if(!cityPlots.some(p=>p.id===plotId))throw new Error('Choose an available city address.');
 if(existing.some(b=>b.plotId===plotId))throw new Error('This address already has your project. Choose another.');
 const content=validateIdea(name,idea),symbol=String(ticker??'').trim().toUpperCase();
 if(!/^[A-Z0-9]{1,10}$/.test(symbol))throw new Error('Use 1 to 10 letters or numbers for the concept ticker.');
 if(!['apartment','studio','project'].includes(type)||!Object.hasOwn(buildingColors,color))throw new Error('Choose a building style and color.');
 return {id,...content,plotId,ticker:symbol,type,color,mode:'local-preview',status:'Your city project',createdAt:new Date().toISOString()};
}
export function readBuildings(storage){try{
 const rows=JSON.parse(storage.getItem(CITY_KEY)||'[]');if(!Array.isArray(rows))return[];const valid=[];
 for(const b of rows.slice(0,cityPlots.length)){try{const clean=createBuilding(b.plotId,b.name,b.idea,b.ticker,b.type,b.color,valid,b.id);if(typeof b.id!=='string'||b.id.length>100)continue;clean.createdAt=typeof b.createdAt==='string'?b.createdAt:clean.createdAt;valid.push(clean);}catch{}}
 return valid;
}catch{return[];}}
export function plotView(plot,buildings){const b=buildings.find(b=>b.plotId===plot.id);return b?{...plot,name:b.name,description:b.idea,status:`$${b.ticker} · concept`,kind:`YOUR ${b.type.toUpperCase()} / ${plot.districtName}`,color:buildingColors[b.color],claimed:true,building:b}:plot;}
