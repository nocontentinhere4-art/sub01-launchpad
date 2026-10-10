import test from 'node:test';
import assert from 'node:assert/strict';
import {diaryNav,shiftDate,isDate,tokyoDate,diaryEntries,countsLine,shouldToastDiary,DIARY_MIN} from '../src/diary.js';

test('dates: shifting across months and leap days; malformed dates refused',()=>{
 assert.equal(shiftDate('2026-03-01',-1),'2026-02-28');assert.equal(shiftDate('2028-02-28',1),'2028-02-29');assert.equal(shiftDate('2026-12-31',1),'2027-01-01');
 assert.equal(shiftDate('2026-02-30',1),null);assert.ok(!isDate('2026-2-3'));assert.ok(isDate('2026-10-10'));
 assert.equal(tokyoDate(Date.UTC(2026,9,10,14,59)),'2026-10-10');assert.equal(tokyoDate(Date.UTC(2026,9,10,15,0)),'2026-10-11');
});
test('navigation: no next day past today, no prev before the first day; out-of-range dates clamp',()=>{
 assert.deepEqual(diaryNav('2026-10-10','2026-10-10'),{date:'2026-10-10',prev:'2026-10-09',next:null,isToday:true});
 assert.deepEqual(diaryNav('2026-10-08','2026-10-10'),{date:'2026-10-08',prev:'2026-10-07',next:'2026-10-09',isToday:false});
 assert.equal(diaryNav('2030-01-01','2026-10-10').date,'2026-10-10');assert.equal(diaryNav('junk','2026-10-10').date,'2026-10-10');
 const first=diaryNav('2019-05-05','2026-10-10');assert.equal(first.date,DIARY_MIN);assert.equal(first.prev,null);
});
test('entries: kind icons, Tokyo time, score bar from the ledger value; unknown kinds dropped',()=>{
 const e=diaryEntries({entries:[{kind:'built',at:Date.UTC(2026,9,10,12,4),text:'I built Ramen Radar.',score:.8,slug:'ramen-radar',ticker:'RAMEN'},{kind:'passed',at:0,text:'I passed.',score:null},{kind:'weird',at:0,text:'x'},{kind:'built',text:5}]});
 assert.equal(e.length,2);assert.equal(e[0].icon,'hammer');assert.equal(e[0].time,'21:04');assert.equal(e[0].pct,80);assert.equal(e[1].pct,null);
 assert.deepEqual(diaryEntries(null),[]);
 assert.equal(countsLine({built:1,passed:2,launched:0,residents:1}),'1 built · 2 passed · 1 new residents');assert.equal(countsLine(null),'');
});
test('the 23:00 toast: once a day, only between 23:00 and midnight, never while busy',()=>{
 assert.ok(shouldToastDiary({hours:23.1,today:'2026-10-10',last:null,busy:false}));
 assert.ok(!shouldToastDiary({hours:23.1,today:'2026-10-10',last:'2026-10-10',busy:false}));
 assert.ok(!shouldToastDiary({hours:22.9,today:'2026-10-10',last:null,busy:false}));
 assert.ok(!shouldToastDiary({hours:23.5,today:'2026-10-10',last:'2026-10-09',busy:true}));
});
