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
