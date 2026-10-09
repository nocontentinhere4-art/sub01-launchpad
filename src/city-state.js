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
const outerNames=['ginza','asakusa','ueno','ikebukuro','nakano','kanda','tsukiji','odaiba','yoyogi','meguro','shinagawa','sumida','daikanyama','nihonbashi','koenji','shimokitazawa'];
let outerIndex=0;
for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++)if(Math.abs(row)===2||Math.abs(col)===2){const id=outerNames[outerIndex++];districts.push({id,name:id[0].toUpperCase()+id.slice(1),x:col*29,z:row*30+2,color:['#758fa4','#bb8c83','#82a29c','#b5a377'][outerIndex%4]});}
// Wave 4A: a third ring (7×7 grid minus the 5×5 above) of real, lower Tokyo neighbourhoods. Appended after the first 24,
// so every older id and position (saved plots, residents) is unchanged. Row by row, north (z −88) to south (z 92).
export const RING3=['kiyosumi','ryogoku','oshiage','yanaka','sugamo','takadanobaba','ogikubo',
 'kinshicho','kichijoji','ochanomizu','kagurazaka','toyosu','omotesando','gotanda','jiyugaoka','tsukishima','sangenjaya',
 'kitasenju','nippori','aoyama','shinbashi','akasaka','iidabashi','mejiro'];
const DISPLAY={takadanobaba:'Takadanobaba',kitasenju:'Kita-Senju',jiyugaoka:'Jiyugaoka'};
let ring3=0;
for(let row=-3;row<=3;row++)for(let col=-3;col<=3;col++)if(Math.abs(row)===3||Math.abs(col)===3){const id=RING3[ring3++];districts.push({id,name:DISPLAY[id]||id[0].toUpperCase()+id.slice(1),x:col*29,z:row*30+2,ring:3,color:['#8a9a8c','#a89582','#8e9aa8','#b0a487'][ring3%4]});}
// Street grid and city edges, derived from the districts (one E–W road per district row through its centre, N–S
// boulevards midway between columns). Other modules should read these instead of hard-coding the 5×5 numbers.
export const ROAD_Z=[...new Set(districts.map(d=>d.z))].sort((a,b)=>a-b);
const COLS=[...new Set(districts.map(d=>d.x))].sort((a,b)=>a-b);
export const BOULEVARD_X=COLS.slice(1).map((x,i)=>(COLS[i]+x)/2);           // [-72.5,-43.5,-14.5,14.5,43.5,72.5]
// Built area (district blocks are 27.8 × 27.8 around their centre; boulevards run 13.5 past the outer row roads).
export const CITY_EXTENT={minX:COLS[0]-14.5,maxX:COLS.at(-1)+14.5,minZ:ROAD_Z[0]-13.5,maxZ:ROAD_Z.at(-1)+13.5};
// Scenery outside the city, moved out by one ring (+29 in x, +30 in z) from the 5×5 values in brackets.
export const CANAL_X=CITY_EXTENT.maxX+6.5;          // 108   [79]   canal centre; banks at ±6.25, bridges at z −38, 2, 42
export const METRO_Z=CITY_EXTENT.maxZ+2.5;          // 108   [78]   elevated metro track (express 2.25 north of it)
export const SKYLINE_Z=CITY_EXTENT.minZ+.5;         // −101  [−71]  north skyline edge (buildings at SKYLINE_Z − offset)
export const SKYLINE_X=CITY_EXTENT.minX+1.5;        // −100  [−71]  west skyline edge
export const FUJI_AT={x:-89.5,z:-161};              //       [−60.5, −131]
// Overview camera (main.js resetView) for the bigger map, and the zoom-out floor it needs.
export const OVERVIEW_ZOOM={desktop:.14,mobile:.065,min:.05};
export const cityPlots=districts.flatMap((d,di)=>Array.from({length:6},(_,i)=>({
 id:`${d.id}-${i+1}`,district:d.id,districtName:d.name,name:`${d.name.split(' /')[0]} ${String(i+1).padStart(2,'0')}`,
 x:d.x+[-8,0,8][i%3],z:d.z+(i<3?-6:6),height:di<8?3+((di*3+i*7)%6):di<24?5+((di*3+i*7)%12):3+((di*3+i*7)%8),
 vacant:i===5,color:d.color,symbol:i===5?'+':'▥',kind:'TOKYO / AVAILABLE SPACE',status:i===5?'Open lot':'Available building',
 description:'Choose this address for an apartment, studio or project. Customize it in the local city preview. No purchase, global ownership or token launch.'
})));
export const tower={id:'tower',name:'Tokyo Tower',x:-29,z:-28,height:32,color:'#f2773a',symbol:'△',kind:'TOKYO / LANDMARK',status:'City landmark',description:'The center of Shiba. An original, stylized Tokyo Tower made from lightweight shared geometry. This city is inspired by Tokyo, not an accurate map.'};
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
