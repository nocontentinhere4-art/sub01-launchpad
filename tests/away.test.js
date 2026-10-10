import test from 'node:test';
import assert from 'node:assert/strict';
import {awayModel,seenAt,markSeen,AWAY_SEEN_KEY} from '../src/away.js';

const R={since:100,visits:[{name:'Yui',at:500},{name:'Kenji',at:300}],guestbook:[{name:'Yui',text:'nice room',at:500}],project:[{ideaId:'idea_a',slug:'ramen-radar',from:'generating',to:'preview_ready',at:400}],note:'Nothing here needs an action.'};
test('away card: lines for visits and notes, project moves in plain words',()=>{
 const m=awayModel(R);assert.deepEqual(m.lines,['2 people visited: Yui, Kenji.','1 new guestbook note.']);
 assert.equal(m.project[0].text,'Your idea “ramen-radar” is now ready for your review.');assert.equal(m.newest,500);assert.equal(m.note,'Nothing here needs an action.');
 assert.deepEqual(awayModel({...R,visits:[R.visits[1]],guestbook:[]}).lines,['Kenji visited.']);
});
test('nothing new → no card; items already shown are left out',()=>{
 assert.equal(awayModel({since:1,visits:[],guestbook:[],project:[]}),null);assert.equal(awayModel(null),null);
 assert.equal(awayModel(R,500),null);
 const m=awayModel(R,450);assert.deepEqual(m.visits.map(v=>v.name),['Yui']);assert.equal(m.project.length,0);
});
test('the newest time shown is kept, and a broken storage never throws',()=>{
 const mem=new Map(),s={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
 markSeen(500,s);assert.equal(mem.get(AWAY_SEEN_KEY),'500');assert.equal(seenAt(s),500);
 const broken={getItem(){throw new Error('x');},setItem(){throw new Error('x');}};assert.equal(seenAt(broken),0);markSeen(1,broken);
});
