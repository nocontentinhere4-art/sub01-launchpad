import test from 'node:test';
import assert from 'node:assert/strict';
import {countdown,eventState,chipFor,stripModel,nextEventText,sheetModel,jst,THEME_DOT} from '../src/calendar-ui.js';

const NOW=Date.UTC(2026,9,10,3,0);   // 12:00 JST
const MIN=6e4,H=36e5;
const cal=(today=[],upcoming=[])=>({now:NOW,tokyoDate:'2026-10-10',weekTheme:{id:'matsuri',title:'Matsuri',kanji:'祭',text:'Festival week.',isoWeek:'2026-W41'},today:{events:today},upcoming});
const omikuji={kind:'omikuji',at:NOW-12*H,ends:NOW+12*H,title:'Omikuji'};
const party=(dt,len=3*H,ticker='RAMEN')=>({kind:'launch_party',at:NOW+dt,ends:NOW+dt+len,title:'Launch party',name:'Ramen Radar',ticker,plotId:'ginza-2',slug:'ramen-radar'});

test('countdowns: minutes, hours with padded minutes, days; nothing left is "now"',()=>{
 assert.equal(countdown(40*MIN),'40 min');assert.equal(countdown(30*1e3),'1 min');assert.equal(countdown(65*MIN),'1 h 05');assert.equal(countdown(3*H),'3 h');
 assert.equal(countdown(50*H),'2 d');assert.equal(countdown(0),'now');assert.equal(countdown(-5),'now');assert.equal(countdown(NaN),'now');
});
test('event state: soon before it starts, live until it ends, then past',()=>{
 assert.equal(eventState(party(10*MIN),NOW),'soon');assert.equal(eventState(party(-10*MIN),NOW),'live');assert.equal(eventState(party(-4*H),NOW),'past');
 assert.equal(eventState({at:NOW-30e3},NOW),'live','no end: one minute');
});
test('chips: a launch party counts down, then says how long it has left; the omikuji follows the slip',()=>{
 assert.deepEqual([chipFor(party(40*MIN),NOW).label,chipFor(party(40*MIN),NOW).sub],['Launch party','$RAMEN · in 40 min']);
 assert.equal(chipFor(party(-60*MIN),NOW).sub,'$RAMEN · on now, 2 h left');
 assert.equal(chipFor(omikuji,NOW).label,'Draw your omikuji');assert.equal(chipFor(omikuji,NOW,{drawn:true,kanji:'大吉'}).label,'Omikuji · 大吉');
 assert.equal(chipFor({kind:'open_soon',at:NOW,ends:NOW+24*H,name:'Neko'},NOW).sub,'Neko · on signature');
});
test('strip ordering: live first, then today by start, then opening soon, then the omikuji; past and placeholders dropped',()=>{
 const later=party(2*H,H,'LATE'),sooner=party(30*MIN,H,'SOON'),live=party(-30*MIN,H,'LIVE'),past=party(-5*H,H,'PAST');
 const m=stripModel(cal([omikuji,later,past,sooner,live,{kind:'ranking',at:NOW+H,placeholder:true}],[{kind:'open_soon',at:NOW,ends:NOW+24*H,ticker:'NEKO',plotId:'shiba-2'},{kind:'omikuji',at:NOW+12*H}]),NOW,{max:6});
 assert.deepEqual(m.chips.map(c=>c.sub.split(' · ')[0]),['$LIVE','$SOON','$LATE','$NEKO','one slip a day']);
 assert.equal(m.theme.kanji,'祭');assert.equal(m.theme.dot,THEME_DOT.matsuri);
 assert.equal(stripModel(cal([omikuji,later,sooner,live]),NOW).chips.length,4);
 assert.equal(stripModel(cal([omikuji,later,sooner,live]),NOW,{max:2}).chips.length,2);
 assert.deepEqual(stripModel(null,NOW),{theme:null,chips:[]});
 assert.deepEqual(stripModel(cal([{kind:'bogus',at:NOW},{kind:'launch_party'}]),NOW).chips,[]);
});
test('the activity bar names the next real event, else the next omikuji',()=>{
 assert.equal(nextEventText(cal([omikuji,party(40*MIN)]),NOW),'Launch party $RAMEN in 40 min');
 assert.equal(nextEventText(cal([omikuji,party(-40*MIN)]),NOW),'Launch party $RAMEN on now');
 assert.equal(nextEventText(cal([omikuji],[{kind:'omikuji',at:NOW+12*H,ends:NOW+36*H}]),NOW),'Next omikuji in 12 h');
 assert.equal(nextEventText(cal([],[]),NOW),'');
});
test('sheet rows: Tokyo times, dates for the coming days, placeholders flagged',()=>{
 const m=sheetModel(cal([party(40*MIN)],[{kind:'ranking',at:Date.UTC(2026,9,31,14,59),ends:Date.UTC(2026,9,31,15,0),title:'Monthly room ranking closes',placeholder:true}]),NOW);
 assert.equal(m.today[0].when,'12:40 JST');assert.equal(m.today[0].plotId,'ginza-2');
 assert.equal(m.upcoming[0].when,'Oct 31 · 23:59 JST');assert.equal(m.upcoming[0].placeholder,true);assert.equal(m.date,'2026-10-10');
 assert.deepEqual(jst(Date.UTC(2026,9,10,15,0)),{date:'2026-10-11',time:'00:00',md:'Oct 11'});
});
