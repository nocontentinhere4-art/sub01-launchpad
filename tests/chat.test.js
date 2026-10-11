import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAT,normalizeMsg,createLog,createBubbles,speakerOf,route,createSSEParser,createBackoff,cooldown,presenceDue,chatError,districtAt,districtLabel,chatGate,sub01Status,onlineCount} from '../src/chat.js';
import {REASONS,GATE_TEXT,reasonFor} from '../src/guest.js';
import {districts} from '../src/city-state.js';

const M=(id,o={})=>({id,at:1000+Number(String(id).replace(/\D/g,'')||0),name:'Yui',text:'hi '+id,district:'shibuya',plotId:'shibuya-2',kind:'resident',...o});

test('message model: normalised, SUB-01 always named SUB-01, any tag dropped, junk refused',()=>{
 const m=normalizeMsg({id:7,at:5,name:'x'.repeat(40),text:'hello',kind:'weird',tag:'AI-written',replyingTo:3});
 assert.equal(m.id,'7');assert.equal(m.name.length,32);assert.equal(m.kind,'resident');assert.deepEqual(m.replyingTo,{id:'3',name:null,text:null});assert.ok(!('tag' in m));
 assert.equal(normalizeMsg({id:'s',text:'yo',kind:'sub01',name:'Imposter',tag:'AI-written'}).name,'SUB-01');
 for(const bad of [null,{},{id:1},{text:'no id'},{id:1,text:5}])assert.equal(normalizeMsg(bad),null);
 // The backend's shapes: replyingTo is an object (no id for a viewer of his room), `to` marks a message SUB-01 accepted.
 const r=normalizeMsg({id:14,text:'tea',kind:'sub01',replyingTo:{id:13,name:'Aiko',text:'what are you reading?'}});assert.deepEqual(r.replyingTo,{id:'13',name:'Aiko',text:'what are you reading?'});
 assert.deepEqual(normalizeMsg({id:15,text:'hi',kind:'sub01',replyingTo:{id:null,name:null,text:'from the room'}}).replyingTo,{id:null,name:null,text:'from the room'});
 assert.equal(normalizeMsg({id:16,text:'x',kind:'sub01',replyingTo:{}}).replyingTo,null);
 assert.equal(normalizeMsg({id:13,text:'q',to:'sub01'}).to,'sub01');assert.equal(normalizeMsg({id:12,text:'q',to:'nao'}).to,null);
});
test('log: dedupe by id, cap 50, delete',()=>{
 const log=createLog();assert.equal(log.add(M('a1')),'new');assert.equal(log.add(M('a1')),'dup');assert.equal(log.add({bad:1}),null);
 for(let i=0;i<60;i++)log.add(M('m'+i));assert.equal(log.list.length,CHAT.max);assert.equal(log.list[0].id,'m10');assert.equal(log.list.at(-1).id,'m59');
 const o=createLog();o.add(M('t3',{at:300}));o.add(M('t1',{at:100}));o.add(M('t2',{at:200}));assert.deepEqual(o.list.map(x=>x.id),['t1','t2','t3'],'kept in time order (a late hello.recent)');
 assert.equal(log.del('m59'),true);assert.equal(log.del('m59'),false);assert.equal(log.list.length,49);
});
test('log: your own message is optimistic, then reconciled by the POST id or by its echo',()=>{
 const log=createLog(),a=log.local({name:'Yui',text:'hello',kind:'resident'});
 assert.ok(a.pending&&a.mine&&a.id.startsWith('local:'));
 log.confirm(a.local,'s1');assert.equal(a.id,'s1');assert.equal(a.pending,false);
 assert.equal(log.add(M('s1',{text:'hello'})),'dup','the echo after the POST id is a duplicate');assert.equal(log.list.length,1);
 // Echo first, POST answer second.
 const b=log.local({name:'Yui',text:'again',kind:'resident'});
 assert.equal(log.add(M('s2',{text:'again'})),'reconciled');assert.equal(log.list.length,2);assert.equal(log.find(b.local).id,'s2');assert.ok(log.find('s2').mine);
 log.confirm(b.local,'s2');assert.equal(log.list.length,2);
 // The echo came first with the server's cleaned text (no match): the POST answer folds it into yours and says so.
 const d=log.local({name:'Yui',text:'see  <b>you</b>',kind:'resident'});assert.equal(log.add(M('s5',{text:'see bYou/b'})),'new');
 const c5=log.confirm(d.local,'s5',{id:'s5',text:'see bYou/b',kind:'resident'});assert.equal(c5.dropped,true);assert.equal(log.list.filter(x=>x.id==='s5').length,1);assert.equal(log.find('s5').text,'see bYou/b');assert.ok(log.find('s5').mine);
 // Someone else saying the same words is not your echo once yours is reconciled.
 assert.equal(log.add(M('s3',{text:'again'})),'new');
 const c=log.local({name:'Yui',text:'oops',kind:'resident'});log.fail(c.local,'Too fast');assert.equal(c.failed,'Too fast');assert.equal(log.add(M('s4',{text:'oops'})),'new','a failed send is never matched');
});
test('bubbles: newest on top, at most 3 per speaker, expire after their time, removable by id',()=>{
 const b=createBubbles({ms:7000});
 for(const [i,t] of [[1,0],[2,100],[3,200]])b.push('me',{id:'m'+i,text:String(i)},t);
 assert.deepEqual(b.stack('me').map(x=>x.id),['m3','m2','m1']);
 const dropped=b.push('me',{id:'m4'},300);assert.deepEqual(dropped.map(x=>x.id),['m1']);assert.deepEqual(b.stack('me').map(x=>x.id),['m4','m3','m2']);
 b.push('sub01',{id:'s1'},5000);
 assert.deepEqual(b.expire(7150),['me']);assert.deepEqual(b.stack('me').map(x=>x.id),['m4','m3']);
 assert.deepEqual(b.expire(7400).sort(),['me']);assert.deepEqual(b.keys(),['sub01']);
 assert.equal(b.remove('s1'),'sub01');assert.deepEqual(b.keys(),[]);assert.equal(b.remove('nope'),null);
 b.push(null,{id:'x'},0);assert.deepEqual(b.keys(),[],'no speaker, no bubble');
 b.push('me',{id:'local:1'},0);b.rekey('local:1','s9');assert.equal(b.stack('me')[0].id,'s9');
});
test('speaker: SUB-01, you (by flag or name+plot), other residents by plot, system none',()=>{
 assert.equal(speakerOf({kind:'sub01'}),'sub01');assert.equal(speakerOf({kind:'system'}),null);
 assert.equal(speakerOf({kind:'resident',mine:true}),'me');
 assert.equal(speakerOf({kind:'resident',name:'Yui',plotId:'a-1'},{myName:'Yui',myPlot:'a-1'}),'me');
 assert.equal(speakerOf({kind:'resident',name:'Yui',plotId:'b-2'},{myName:'Yui',myPlot:'a-1'}),'plot:b-2','a namesake elsewhere is not you');
 assert.equal(speakerOf({kind:'resident',name:'Deon',plotId:'b-2'},{myName:'Yui'}),'plot:b-2');
 assert.equal(speakerOf({kind:'resident',name:'Deon'}),null);
});
test('routing: @sub01 / @SUB-01 / the chip go to SUB-01, the rest to the city',()=>{
 assert.deepEqual(route('@sub01 are you awake?'),{to:'sub01',text:'are you awake?',path:'/api/chat/sub01'});
 assert.equal(route('@SUB-01, hi').text,'hi');assert.equal(route('@Sub01: hi').to,'sub01');
 assert.equal(route('  hello   Tokyo ').text,'hello Tokyo');assert.equal(route('hello').path,'/api/chat');
 assert.equal(route('@sub01x hi').to,'city','no word boundary, no routing');
 assert.equal(route('hello',{toSub01:true}).to,'sub01');assert.equal(route('@sub01').text,'');
 assert.equal(route('x'.repeat(300)).text.length,CHAT.maxLen);
});
test('SSE parser: events, multi-line data, comments, CRLF and split chunks, id and retry',()=>{
 const p=createSSEParser();
 assert.deepEqual(p.feed(': keep-alive\n\n'),[],'a comment dispatches nothing');
 assert.deepEqual(p.feed('event: msg\ndata: {"a":1}\n\n'),[{event:'msg',data:'{"a":1}',id:null}]);
 assert.deepEqual(p.feed('data: line one\ndata: line two\n\n')[0].data,'line one\nline two');
 assert.deepEqual(p.feed('event: hel'),[]);assert.deepEqual(p.feed('lo\ndata:{"x":2}\nid: 41\n'),[]);
 const e=p.feed('\n');assert.deepEqual(e,[{event:'hello',data:'{"x":2}',id:'41'}]);assert.equal(p.lastId,'41');
 assert.equal(p.feed('event: presence\r\ndata: 3\r')[0],undefined);assert.deepEqual(p.feed('\n\r\n').map(x=>[x.event,x.data]),[['presence','3']],'CR then LF across chunks is one line end');
 p.feed('retry: 5000\n\n');assert.equal(p.retry,5000);p.feed('retry: soon\n\n');assert.equal(p.retry,5000);
 assert.deepEqual(p.feed('event: x\n\n'),[],'no data, no event');assert.equal(p.feed('data\n\n')[0].data,'');
});
test('reconnect backoff: grows to 30 s, resets after a stream opened',()=>{
 const b=createBackoff(undefined,{jitter:0});assert.deepEqual(Array.from({length:8},()=>b.next()),[1e3,2e3,4e3,8e3,15e3,30e3,30e3,30e3]);
 assert.equal(b.attempts,8);b.reset();assert.equal(b.next(),1e3);
 const j=createBackoff([1000],{jitter:.2,random:()=>1});assert.equal(j.next(),1200);
});
test('throttles: 1 message / 3 s, SUB-01 1 / 20 s, presence at most every 20 s',()=>{
 assert.equal(cooldown(0,5000,CHAT.sendGap),0);assert.equal(cooldown(10000,11000,CHAT.sendGap),2000);assert.equal(cooldown(10000,30000,CHAT.sub01Gap),0);assert.equal(cooldown(10000,25000,CHAT.sub01Gap),5000);
 assert.equal(presenceDue(0,1),true,'on load');assert.equal(presenceDue(1000,21000),false,'no change: a beat every 45 s');assert.equal(presenceDue(1000,46000),true);
 assert.equal(presenceDue(1000,20999,{changed:true}),false,'a new district still waits 20 s');assert.equal(presenceDue(1000,21000,{changed:true}),true);
});
test('district: the station board wins, else the nearest district to the camera target',()=>{
 const shibuya=districts.find(d=>d.id==='shibuya')||districts[3];
 assert.equal(districtAt({x:shibuya.x+3,z:shibuya.z-2}),shibuya.id);
 assert.equal(districtAt({x:shibuya.x,z:shibuya.z},districts,{selected:'shiba'}),'shiba');
 assert.equal(districtAt({x:shibuya.x,z:shibuya.z},districts,{selected:'atlantis'}),shibuya.id,'an unknown board value is ignored');
 assert.equal(districtAt(null),null);assert.equal(districtAt({x:0,z:0},[]),null);
 assert.equal(districtLabel('shiba'),'SHIBA');assert.equal(districtLabel(''),'');
});
test('guest gating: guests sign in (with the chat reason), wallets without a resident make one',()=>{
 assert.equal(chatGate(null),'signin');assert.equal(chatGate({user:null}),'signin');assert.equal(chatGate({user:{wallet:'w'}}),'resident');assert.equal(chatGate({user:{wallet:'w'},resident:{name:'Yui'}}),'ok');
 assert.ok(REASONS.chat&&reasonFor('chat')===REASONS.chat);assert.ok(GATE_TEXT.chat);assert.ok(!/wallet address/i.test(REASONS.chat));
});
test('SUB-01 state chip: honest labels, only offline (or unknown) blocks sending',()=>{
 assert.deepEqual([sub01Status({state:'awake',atDesk:true}).key,sub01Status({state:'awake'}).key,sub01Status({state:'asleep'}).key,sub01Status({state:'resting'}).key],['desk','awake','asleep','resting']);
 assert.equal(sub01Status({state:'awake',atDesk:true,waiting:2}).label,'Awake at his desk · 2 waiting');
 for(const s of [{state:'awake',atDesk:true},{state:'asleep'},{state:'resting'}])assert.equal(sub01Status(s).canSend,true);
 const off=sub01Status({state:'offline'});assert.equal(off.canSend,false);assert.match(off.reason,/offline/);
 assert.equal(sub01Status(null).canSend,false);assert.equal(sub01Status(null).label,'Status unknown');
 assert.equal(onlineCount([{name:'a'},{name:'b'}]),2);assert.equal(onlineCount(5),5);assert.equal(onlineCount(undefined),0);
});
test('refusals read in the city’s words: SUB-01 busy, his filter, offline, quotas, links',()=>{
 const E=(status,body)=>({status,body,message:body?.error});
 assert.equal(chatError(E(429,{error:'sub01_busy'}),'sub01'),'SUB-01 is listening to someone else, try in a few seconds.');
 assert.match(chatError(E(422,{error:'sub01_refused',reason:'tickers are not allowed'}),'sub01'),/tickers are not allowed/);
 assert.match(chatError(E(503,{error:'sub01_offline'}),'sub01'),/offline/);assert.match(chatError(E(504,{error:'sub01_no_answer'}),'sub01'),/did not answer/);
 assert.equal(chatError(E(429,{error:'rate_limited',retryAfterS:2.2}),'city'),'One message every 3 s. Wait 3 s.');assert.match(chatError(E(429,{error:'rate_limited'}),'sub01'),/every 20 s/);
 assert.match(chatError(E(400,{error:'no_links'})),/Links/);assert.match(chatError(E(409,{error:'duplicate'})),/just said/);assert.match(chatError(E(400,{error:'bad_text'})),/140/);
 assert.match(chatError(E(409,{error:'no_resident'})),/resident/);assert.equal(chatError({message:'boom'}),'boom');assert.equal(chatError(null),'Not sent.');
});

// ---- The online sheet (2026-10-11): who is here, from the presence frame and the live walkers ----
import {onlineRows,onlineAlone,ONLINE_STATUS,ONLINE_EMPTY} from '../src/chat.js';
import {homeStand} from '../src/presence.js';
test('online rows: one per name, you first, walking / out / at home from the walkers, Visit knows the plot',()=>{
 const h=homeStand('shibuya-4'),online=[{name:'Aiko',district:'ginza'},{name:'Test Pilot',district:'shibuya'},{name:'Bo',district:null},{name:'Aiko',district:'ueno'},{name:'Cy',district:'ueno'},{name:'',district:'x'},null];
 const walkers=[{id:'a',name:'Aiko',plotId:'ginza-2',state:'walk',moving:true,x:0,z:0},{id:'t',name:'Test Pilot',plotId:'shibuya-4',state:'idle',moving:false,x:h.x,z:h.z},{id:'c',name:'Cy',plotId:'ueno-1',state:'idle',moving:false,x:40,z:40}];
 const rows=onlineRows(online,walkers,{myName:'Bo'});
 assert.deepEqual(rows,[{name:'Bo',district:null,plotId:null,status:'home',mine:true},{name:'Aiko',district:'ginza',plotId:'ginza-2',status:'walking',mine:false},
  {name:'Test Pilot',district:'shibuya',plotId:'shibuya-4',status:'home',mine:false},{name:'Cy',district:'ueno',plotId:'ueno-1',status:'out',mine:false}]);
 assert.equal(onlineAlone(rows),false);assert.equal(onlineAlone(onlineRows([{name:'Bo'}],[],{myName:'Bo'})),true);assert.equal(onlineAlone([]),true);
 assert.deepEqual(onlineRows(null,null),[]);assert.deepEqual(onlineRows([{name:'Zed'}],undefined),[{name:'Zed',district:null,plotId:null,status:'home',mine:false}]);
 assert.deepEqual(ONLINE_STATUS,{walking:'walking',out:'out in the city',home:'at home'});
 assert.equal(ONLINE_EMPTY,'Only you right now. Walk around: everyone online sees you.');
});
