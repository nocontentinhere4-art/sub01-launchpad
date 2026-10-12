import test from 'node:test';import assert from 'node:assert/strict';
import {MAX_VERSIONS,POLL,counterLabel,latencyLabel,prefillFrom,pollPlan,waitingLine,historyLine,verdictModel,reviseButton} from '../src/verdict.js';

const feedback={summary:'Pass. Nothing in it was new to me. Give it a twist, then drop it again.',likes:['reward 1.00 lit up when I read it.'],dislikes:['Nothing in it was new to me.'],
 suggestions:[{what:'Give it a twist I have not seen',why:'My novelty check found nothing new.',how:'One object nobody else has.'},{what:'',why:'x',how:'y'},null],
 wouldBuildIf:'give it a twist I have not seen.',context:['Read by the demo brain, not the live one.']};
const passed={status:'declined',version:1,maxVersions:5,canRevise:true,nextVersionAt:null,versions:[{version:1,decision:'pass'}],evaluation:{decision:'declined',verdict:'pass',latencyMs:412,feedback}};

test('counter, latency and prefill',()=>{
 assert.equal(MAX_VERSIONS,5);assert.equal(counterLabel(2),'v2 of 5');assert.equal(counterLabel(undefined),'v1 of 5');assert.equal(counterLabel(3,7),'v3 of 7');
 assert.equal(latencyLabel(412),'0.4 s');assert.equal(latencyLabel(40),'0.1 s');assert.equal(latencyLabel(12400),'12 s');assert.equal(latencyLabel(300000),'5 min');assert.equal(latencyLabel(NaN),'');assert.equal(latencyLabel(-1),'');
 assert.deepEqual(prefillFrom({title:' Ramen ',concept:'c',nameSuggestion:null,tickerSuggestion:'RAMEN',receivingWallet:'w'}),{title:'Ramen',concept:'c',nameSuggestion:'',tickerSuggestion:'RAMEN',receivingWallet:'w'});
 assert.deepEqual(prefillFrom(null),{title:'',concept:'',nameSuggestion:'',tickerSuggestion:'',receivingWallet:''});
});
test('poll plan: every 2 s for 30 s, then late',()=>{
 assert.deepEqual(POLL,{everyMs:2000,forMs:30000});
 assert.deepEqual(pollPlan(1000,1500),{again:true,delay:2000,late:false});
 assert.deepEqual(pollPlan(1000,31000),{again:false,delay:0,late:true});
 assert.deepEqual(pollPlan(1000,30999),{again:true,delay:2000,late:false});
});
test('waiting line: reading, offline with the next try, asleep',()=>{
 assert.equal(waitingLine({status:'evaluating',statusNote:'reading it'},1000),'SUB-01 is reading it…');
 assert.equal(waitingLine({status:'evaluating',statusNote:'SUB-01 is offline right now (x). Next try in 5 s.',eta:6000},1000),'SUB-01 is offline. Your idea waits by his door; he reads it the moment he is back (next try in 5 s).');
 assert.equal(waitingLine({status:'evaluating',statusNote:'SUB-01 is asleep (NREM).',eta:1000+20*60000},1000),'SUB-01 is asleep. Your idea waits by his bed; he reads it when he wakes (next try in 20 min).');
 assert.equal(waitingLine({status:'evaluating',statusNote:'SUB-01 is asleep (NREM).'}),'SUB-01 is asleep. He reads it when he wakes.');
 assert.equal(waitingLine({statusNote:"Waiting for SUB-01's brain (unreachable)",eta:5},1000),'SUB-01 is offline. He reads it the moment he is back.');
});
test('history line',()=>{
 assert.equal(historyLine([{version:1,decision:'pass'},{version:2,decision:null},{version:3,decision:'build'}]),'v1: pass → v3: build');
 assert.equal(historyLine(undefined),'');
});
test('model: a pass with feedback, every section cleaned',()=>{
 const m=verdictModel(passed,1000);
 assert.equal(m.state,'pass');assert.equal(m.headline,'He passed.');assert.equal(m.summary,feedback.summary);
 assert.deepEqual(m.likes,feedback.likes);assert.deepEqual(m.dislikes,feedback.dislikes);
 assert.deepEqual(m.suggestions,[{what:'Give it a twist I have not seen',why:'My novelty check found nothing new.',how:'One object nobody else has.'}],'empty and null suggestions dropped');
 assert.equal(m.wouldBuildIf,'give it a twist I have not seen.');assert.deepEqual(m.context,feedback.context);
 assert.equal(m.counter,'v1 of 5');assert.equal(m.latency,'0.4 s');assert.equal(m.canRevise,true);assert.equal(m.nextVersionAt,null);assert.equal(m.history,'v1: pass');
 assert.deepEqual(reviseButton(m,1000),{label:'Revise & resubmit · v2 of 5',disabled:false});
});
test('model: a build has no "would build if" and no revise; counter and latency shown',()=>{
 const m=verdictModel({status:'selected',version:2,canRevise:false,versions:[{version:1,decision:'pass'},{version:2,decision:'build'}],evaluation:{verdict:'build',latencyMs:150,feedback:{summary:'Build. reward 1.00 lit up when I read it. I want this one.',likes:['Clear in one read.'],wouldBuildIf:null}}});
 assert.equal(m.state,'build');assert.equal(m.headline,'He builds it.');assert.equal(m.wouldBuildIf,null);assert.equal(m.canRevise,false);
 assert.equal(m.counter,'v2 of 5');assert.equal(m.latency,'0.2 s');assert.equal(m.history,'v1: pass → v2: build');assert.equal(reviseButton(m),null);
 assert.equal(verdictModel({status:'generating',version:1,evaluation:{decision:'selected',feedback:{}}}).state,'build','later stages still read as a build');
});
test('model: waiting while he reads, offline note with eta, failed, gone',()=>{
 const w=verdictModel({status:'evaluating',version:1,statusNote:'reading it',evaluation:null},1000);
 assert.equal(w.state,'waiting');assert.equal(w.headline,'SUB-01 is reading…');assert.equal(w.waitNote,'SUB-01 is reading it…');assert.equal(w.canRevise,false);assert.equal(reviseButton(w),null);
 const off=verdictModel({status:'evaluating',version:1,statusNote:'SUB-01 is offline right now (brain service unreachable (timeout)). Next try in 15 s.',eta:16000},1000);
 assert.match(off.waitNote,/offline.*next try in 15 s/);
 const f=verdictModel({status:'failed',version:1,statusNote:"evaluation unavailable: SUB-01's brain did not answer. Nothing was decided."});
 assert.equal(f.state,'failed');assert.match(f.summary,/Nothing was decided/);assert.equal(f.canRevise,false);
 assert.equal(verdictModel(null).state,'gone');assert.equal(verdictModel('x').state,'gone');
});
test('revise button: the author only, the version cap, the 60 s wait counts down',()=>{
 assert.deepEqual(reviseButton(verdictModel({...passed,canRevise:false,version:5})),{label:'5 versions: start a new idea',disabled:true});
 assert.deepEqual(reviseButton(verdictModel({...passed,canRevise:false,version:2,owner:false})),{label:'Only the author can revise it',disabled:true});
 assert.equal(reviseButton(verdictModel({...passed,canRevise:false,version:2,owner:true})),null,'the author without the right (e.g. not declined any more): no button');
});
test('model: after a resubmit the old verdict is not shown as the new one; he is reading again',()=>{
 const m=verdictModel({status:'evaluating',version:2,statusNote:'reading version 2',canRevise:false,versions:[{version:1,decision:'pass'},{version:2,decision:null}],evaluation:{verdict:'pass',version:1,latencyMs:3,feedback}});
 assert.equal(m.state,'waiting');assert.equal(m.summary,'');assert.deepEqual(m.suggestions,[]);assert.equal(m.counter,'v2 of 5');assert.equal(m.history,'v1: pass');assert.equal(m.latency,'');
 const asleep=verdictModel({status:'evaluating',version:2,statusNote:'SUB-01 is asleep (NREM). Your idea waits by his bed; he reads it when he wakes.',eta:1000+1200000,evaluation:{verdict:'pass',version:1,feedback}},1000);
 assert.equal(asleep.state,'waiting');assert.match(asleep.waitNote,/asleep.*next try in 20 min/);
 assert.equal(verdictModel({status:'declined',version:2,evaluation:{verdict:'pass',version:2,feedback}}).state,'pass','the matching version shows');
 assert.deepEqual(reviseButton(verdictModel({...passed,nextVersionAt:61000},1000),1000),{label:'Revise & resubmit (in 60 s)',disabled:true});
 assert.deepEqual(reviseButton(verdictModel({...passed,nextVersionAt:500},1000),1000),{label:'Revise & resubmit · v2 of 5',disabled:false});
 assert.deepEqual(reviseButton(verdictModel({...passed,version:4}),1000),{label:'Revise & resubmit · v5 of 5',disabled:false});
});
test('build verdict: the next step is choosing the logo on the PC (owner only); a pass has none',async()=>{
 const {NEXT_LOGO}=await import('../src/verdict.js');
 const built={status:'generating',version:1,maxVersions:5,versions:[{version:1,decision:'build'}],evaluation:{decision:'selected',verdict:'build',latencyMs:300,feedback:{summary:'Build.'}}};
 assert.equal(verdictModel(built).next,NEXT_LOGO);assert.match(NEXT_LOGO,/choose your logo on your PC/);
 assert.equal(verdictModel({...built,owner:false}).next,'');
 assert.equal(verdictModel(passed).next,undefined);
});

// ---- the build, step by step (2026-10-12; backend build-steps.js)
import {cleanBuild,serverNow,stepLeft,liveEta,durationLabel,leftLabel,ordinal,queueLine,buildModel,placeBuildLine,summaryOf,BUILD_ICONS,READY_LINE} from '../src/verdict.js';
const T=1_000_000;
const running={state:'running',startedAt:T-60000,etaSeconds:55,percent:38,attempt:1,now:T,queue:null,steps:[
 {id:'queued',label:'In line',state:'done',startedAt:T-60000,endedAt:T-59800},
 {id:'brief',label:'Name, ticker and story',state:'done',startedAt:T-59800,endedAt:T-34800,provider:'language model',expectedSeconds:25,p90Seconds:40},
 {id:'app',label:'The app',state:'running',startedAt:T-10000,provider:'language model',expectedSeconds:20,p90Seconds:32},
 {id:'art',label:'Two logo + banner options',state:'todo',plannedProvider:'Higgsfield',expectedSeconds:40,p90Seconds:64},
 {id:'site',label:'The website',state:'todo',plannedProvider:'sandbox',expectedSeconds:5,p90Seconds:8},
 {id:'ready',label:'Ready for your review',state:'todo'},{bogus:true}]};

test('build: cleaned from the server, unknown states and empty rows dropped',()=>{
 const b=cleanBuild(running,T);
 assert.equal(b.steps.length,6);assert.equal(b.steps[2].state,'running');assert.equal(b.now,T);assert.equal(b.receivedAt,T);
 assert.equal(cleanBuild({state:'weird',steps:[{id:'x',state:'nope'}]},T).state,'running');
 assert.equal(cleanBuild({state:'weird',steps:[{id:'x',state:'nope'}]},T).steps[0].state,'todo');
 assert.equal(cleanBuild(null),null);assert.equal(cleanBuild({steps:'no'}),null);
 assert.equal(serverNow({now:T,receivedAt:5000},8000),T+3000,'the server clock, whatever the phone says');
});
test('build: the countdown re-estimates like the server (median, then p90, never negative)',()=>{
 assert.equal(stepLeft(20,32,0),20);assert.equal(stepLeft(20,32,25),7);assert.equal(stepLeft(20,32,33),31);assert.ok(stepLeft(20,32,1e6)>0);
 const b=cleanBuild(running,T);
 const e0=liveEta(b,T);assert.equal(e0.remaining,10+40+5);assert.equal(e0.percent,Math.floor(100*35/90));
 const e1=liveEta(b,T+8000);assert.equal(e1.remaining,2+40+5,'counts down');
 const e2=liveEta(b,T+15000);assert.equal(e2.remaining,7+40+5,'past the median: extended to the p90');
 assert.deepEqual(liveEta(cleanBuild({...running,state:'ready'},T),T),{remaining:0,wait:0,percent:100});
 const q=cleanBuild({...running,state:'queued',queue:{position:2,startsInSeconds:60},steps:running.steps.map(s=>s.id==='queued'?{...s,state:'running',endedAt:null}:s.id==='brief'||s.id==='app'?{...s,state:'todo'}:s)},T);
 assert.equal(liveEta(q,T).wait,60);assert.equal(liveEta(q,T).percent,0);assert.equal(liveEta(q,T+90000).wait,0,'never negative');
 assert.equal(liveEta(q,T+90000).remaining,25+20+40+5,'still the whole build when the line takes longer');
});
test('build: labels',()=>{
 assert.equal(durationLabel(0.2),'1 s');assert.equal(durationLabel(45),'45 s');assert.equal(durationLabel(100),'1 min 40 s');assert.equal(durationLabel(98),'1 min 40 s');assert.equal(durationLabel(120),'2 min');assert.equal(durationLabel(900),'15 min');assert.equal(durationLabel(-1),'');
 assert.equal(leftLabel(62),'~1 min left');assert.equal(leftLabel(12),'~15 s left');assert.equal(leftLabel(150),'~3 min left');
 assert.deepEqual([1,2,3,4,11,12,13,21,22].map(ordinal),['1st','2nd','3rd','4th','11th','12th','13th','21st','22nd']);
 assert.equal(queueLine({state:'queued',now:T,queue:{position:2,startsInSeconds:60}},T),'2nd in line, starts in ~1 min');
 assert.equal(queueLine({state:'queued',now:T,queue:{position:1,startsInSeconds:2}},T),'Next in line, starts in a moment');
 assert.equal(queueLine({state:'retrying',now:T,queue:{position:1,startsInSeconds:30}},T),'Trying again: starts in ~30 s');
 assert.deepEqual(BUILD_ICONS,{queued:'clock',brief:'think',app:'wrench',fit:'target',art:'brush',site:'globe',qa:'check',ready:'rocket'});
});
test('build model: countdown, step rows with icon, provider and time',()=>{
 const m=buildModel(cleanBuild(running,T),T);
 assert.equal(m.countdown,'Ready in ~55 s');assert.equal(m.sub,'38% done');assert.equal(m.ready,false);
 const by=Object.fromEntries(m.steps.map(s=>[s.id,s]));
 assert.deepEqual([by.brief.state,by.brief.provider,by.brief.time,by.brief.icon],['done','language model','25 s','think']);
 assert.deepEqual([by.app.state,by.app.provider,by.app.time],['running','language model','10 s of ~20 s']);
 assert.deepEqual([by.art.state,by.art.provider,by.art.time,by.art.icon],['todo','Higgsfield','~40 s','brush']);
 assert.equal(by.ready.time,'');assert.equal(by.queued.time,'','a wait of no time says nothing');
 const later=buildModel(cleanBuild(running,T),T+40000);assert.equal(later.countdown,'Ready in ~59 s','the app ran past its p90: another p90, the estimate grows (55 s → 59 s), honestly');
 const done=buildModel(cleanBuild({...running,state:'ready',steps:running.steps.map(s=>s.id?{...s,state:'done',endedAt:s.endedAt??s.startedAt??T}:s)},T),T);
 assert.equal(done.countdown,'Your site is ready');assert.equal(done.ready,true);assert.match(done.sub,/^Built in /);
 const failed=buildModel(cleanBuild({...running,state:'failed',steps:running.steps.map(s=>s.id==='app'?{...s,state:'failed',note:'stopped here'}:s)},T),T);
 assert.equal(failed.countdown,'The build stopped');assert.equal(failed.steps.find(s=>s.id==='app').time,'stopped');
 assert.equal(buildModel(null,T),null);
});
test('place card: "Building · 62% · ~1 min left", in line, ready',()=>{
 assert.equal(placeBuildLine({state:'running',percent:62,etaAt:T+65000,now:T},T),'Building · 62% · ~1 min left');
 assert.equal(placeBuildLine({state:'running',percent:90,etaAt:T+1000,now:T},T),'Building · 90% · almost done');
 assert.equal(placeBuildLine({state:'queued',percent:0,etaAt:T+150000,queuePosition:2},T),'In line · 2nd · ready in ~2 min 30 s');
 assert.equal(placeBuildLine({state:'ready',percent:100},T),'Built · ready for review');
 assert.equal(placeBuildLine({state:'failed'},T),null);assert.equal(placeBuildLine(null,T),null);
 const s=summaryOf(cleanBuild(running,T));assert.equal(s.state,'running');assert.equal(s.step.id,'app');assert.equal(s.etaAt,T+55000);assert.equal(s.percent,38);
});
test('verdict model: a build shows the timeline; the logo step only once the site is ready',()=>{
 const idea={status:'generating',version:1,owner:true,evaluation:{decision:'selected',verdict:'build',feedback:{summary:'Build.'}},build:running,receivedAt:T};
 const m=verdictModel(idea,T);
 assert.equal(m.state,'build');assert.ok(m.build);assert.equal(m.build.countdown,'Ready in ~55 s');assert.equal(m.next,'','no logo step while he builds');
 const r=verdictModel({...idea,status:'preview_ready',build:{...running,state:'ready'}},T);assert.equal(r.next,READY_LINE);assert.equal(r.build.ready,true);
 assert.match(READY_LINE,/Your site is ready — choose your logo on your PC/);
 const old=verdictModel({...idea,build:null},T);assert.equal(old.build,null);assert.match(old.next,/choose your logo/,'a build from before the timeline: the old line');
});

// ---- does it match the idea? (2026-10-12; backend fidelity.js): the PadPad case
import {fidelityModel,GAP_LINE} from '../src/verdict.js';
const PADPAD_FIT={v:1,source:'rules',verdict:'missing',built:'PadPad: launch a coin here (coin launcher), with the community wall, and the chain panels every coin gets',
 message:"I can't build launchpads that launch launchpads yet. The launch block launches plain coins. What I built instead: PadPad: launch a coin here.",
 core:[{feature:'Anyone launches a real coin from the site',capability:'launchpad-app',status:'built',builtBy:['launch'],reason:'The launch block.',terms:[]},
  {feature:'Launchpads that launch launchpads',capability:'recursive-launchpads',status:'missing',builtBy:[],reason:'The launch block launches plain coins.',terms:['recursive']},
  {feature:'Creator fees up the family tree',capability:'fee-tree',status:'partial',builtBy:['launch'],reason:'One level only.',terms:[]},
  {feature:'A live family tree',capability:'family-tree-view',status:'missing',builtBy:[],reason:'No block draws a family tree.',terms:[]},{bogus:1}],tools:[]};
test('fidelity: cleaned from the server; the missing and partial features listed; nothing for a build that matches',()=>{
 const f=fidelityModel(PADPAD_FIT);
 assert.equal(f.verdict,'missing');
 assert.deepEqual(f.missing.map(x=>x.feature),['Launchpads that launch launchpads','A live family tree']);
 assert.deepEqual(f.partial.map(x=>x.feature),['Creator fees up the family tree']);
 assert.equal(f.built.length,1);assert.match(f.message,/^I can't build launchpads that launch launchpads yet/);
 assert.equal(f.builtLine,PADPAD_FIT.built);
 assert.equal(fidelityModel(null),null);assert.equal(fidelityModel({verdict:'nope',core:[]}),null);assert.equal(fidelityModel({verdict:'match'}),null);
 assert.equal(fidelityModel({...PADPAD_FIT,verdict:'match',core:[PADPAD_FIT.core[0]]}).missing.length,0);
});
test('fidelity: the fit step is flagged, the ready line never says "ready" alone when something core is missing',()=>{
 const steps=[{id:'queued',label:'In line',state:'done',startedAt:T-9000,endedAt:T-9000},{id:'app',label:'The app',state:'done',startedAt:T-9000,endedAt:T-8000},
  {id:'fit',label:'Does it match the idea?',state:'done',startedAt:T-8000,endedAt:T-7000,provider:'rules (no AI)',note:'Not all of it. Missing: Launchpads that launch launchpads',flag:'missing'},
  {id:'ready',label:'Ready for your review',state:'done',startedAt:T,endedAt:T}];
 const b=cleanBuild({state:'ready',steps,now:T},T);
 assert.equal(b.steps[2].flag,'missing');
 assert.equal(cleanBuild({state:'ready',steps:[{id:'fit',state:'done',flag:'<script>'}]},T).steps[0].flag,null,'only missing | partial');
 const m=buildModel(b,T);
 assert.equal(m.gap,'missing');assert.equal(m.countdown,'Built, but not all of your idea');
 assert.deepEqual([m.steps[2].icon,m.steps[2].flag,m.steps[2].note],['target','missing','Not all of it. Missing: Launchpads that launch launchpads']);
 assert.equal(buildModel(cleanBuild({state:'ready',steps:steps.map(s=>({...s,flag:null})),now:T},T),T).gap,null);
 assert.match(GAP_LINE,/not all of your idea/);
 // the verdict card carries it
 const v=verdictModel({id:'i',status:'preview_ready',version:1,evaluation:{verdict:'build',version:1,feedback:{summary:'Built.'}},build:{state:'ready',steps,now:T},fidelity:PADPAD_FIT,receivedAt:T},T);
 assert.equal(v.state,'build');assert.equal(v.fidelity.verdict,'missing');assert.equal(v.build.gap,'missing');
});
