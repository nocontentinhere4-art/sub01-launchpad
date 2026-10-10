import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFortune,omikujiStep,canDraw,OMIKUJI0,predictionModel,emaRow,ledgerRow,verifyText,boardRows,disclosureRows,shortHash,PREDICTION_POINTS,CHEER_LINE} from '../src/rituals.js';
import {REASONS,reasonFor} from '../src/guest.js';

const SLIP={drawn:true,fresh:true,date:'2026-10-10',fortune:{id:'daikichi',kanji:'大吉',rank:1},text:'Great blessing.',buff:{kind:'glow',until:1791644400000},drawnAt:1,note:'Cosmetic only.'};
test('fortunes: the server slip and the flat shape both read; nothing drawn is null',()=>{
 const f=normalizeFortune(SLIP);assert.equal(f.kanji,'大吉');assert.equal(f.name,'Great blessing');assert.deepEqual(f.buff,{kind:'glow',until:1791644400000});assert.equal(f.fresh,true);
 assert.equal(normalizeFortune({fortune:'kyo',kanji:'凶',text:'Curse.',buff:{kind:'none'}}).name,'Curse');
 assert.equal(normalizeFortune({drawn:false,date:'2026-10-10'}),null);assert.equal(normalizeFortune(null),null);
 assert.equal(normalizeFortune({...SLIP,buff:{kind:'sparkles'}}).buff.kind,'none','unknown buff → none');
});
test('omikuji reveal: ready → drawing → unfolding → revealed; reduced motion and repeats skip the animation',()=>{
 let s=omikujiStep(OMIKUJI0,{type:'today',data:{drawn:false,date:'2026-10-10'},today:'2026-10-10'});assert.equal(s.phase,'ready');assert.ok(canDraw(s,'2026-10-10'));
 s=omikujiStep(s,{type:'draw'});assert.equal(s.phase,'drawing');assert.equal(omikujiStep(s,{type:'draw'}),s,'no double draw');
 s=omikujiStep(s,{type:'result',data:SLIP});assert.equal(s.phase,'unfolding');assert.equal(omikujiStep(s,{type:'draw'}).phase,'unfolding');
 s=omikujiStep(s,{type:'shown'});assert.equal(s.phase,'revealed');assert.ok(!canDraw(s,'2026-10-10'));
 assert.equal(omikujiStep({...OMIKUJI0,phase:'drawing'},{type:'result',data:SLIP,reduced:true}).phase,'revealed');
 assert.equal(omikujiStep({...OMIKUJI0,phase:'drawing'},{type:'result',data:{...SLIP,fresh:false}}).phase,'revealed','fresh:false repeat');
 const e=omikujiStep({...OMIKUJI0,phase:'drawing'},{type:'error',message:'no'});assert.equal(e.phase,'ready');assert.equal(e.error,'no');
});
test('omikuji once per Tokyo day: today\'s slip keeps the box shut, a new day reopens it',()=>{
 let s=omikujiStep(OMIKUJI0,{type:'today',data:{...SLIP,fresh:false},today:'2026-10-10'});assert.equal(s.phase,'revealed');assert.ok(!canDraw(s,'2026-10-10'));
 assert.equal(omikujiStep(s,{type:'day',today:'2026-10-10'}),s);
 s=omikujiStep(s,{type:'day',today:'2026-10-11'});assert.equal(s.phase,'ready');assert.equal(s.fortune,null);assert.ok(canDraw(s,'2026-10-11'));
 assert.equal(omikujiStep(OMIKUJI0,{type:'today',data:SLIP,today:'2026-10-11'}).phase,'ready','yesterday\'s slip does not count');
 assert.ok(!canDraw(OMIKUJI0,'2026-10-10'),'still loading');
});
test('prediction states: open, own idea, guessed, closed without a vote, decided right / wrong / not guessed',()=>{
 const v={ideaId:'idea_a',closed:false,decision:null,total:4,build:3,pass:1,mine:null,correct:null};
 assert.equal(predictionModel(null).mode,'loading');
 const open=predictionModel(v);assert.equal(open.mode,'open');assert.ok(open.buttons);assert.equal(open.tally.text,'4 guesses · 75% build');
 assert.equal(predictionModel(v,{own:true}).mode,'own');assert.ok(!predictionModel(v,{own:true}).buttons);
 assert.equal(predictionModel({...v,mine:'pass'}).mode,'guessed');
 assert.equal(predictionModel({...v,closed:true}).mode,'closed');
 const right=predictionModel({...v,closed:true,decision:'build',mine:'build',correct:true});assert.equal(right.mode,'decided');assert.equal(right.result.points,PREDICTION_POINTS);assert.match(right.result.text,/right: \+10 points/);
 const wrong=predictionModel({...v,closed:true,decision:'build',mine:'pass',correct:false});assert.equal(wrong.result.correct,false);assert.equal(wrong.result.points,0);
 assert.equal(predictionModel({...v,closed:true,decision:'pass'}).result.correct,null);
 assert.equal(predictionModel({...v,total:0,build:0,pass:0}).tally.text,'No guesses yet');
});
test('ema, ledger, leaderboard and disclosure rows carry only public fields',()=>{
 const e=emaRow({ideaId:'idea_a',pinnedHash:'9f2c1a7be03d55aa',pinnedAt:1,title:'Ramen',stage:'submitted',stageLabel:'In his mailbox',cheers:2,wallet:'X'},36e5*3);
 assert.deepEqual(Object.keys(e).sort(),['cheers','hash','ideaId','slug','stage','title','when']);assert.equal(e.hash,'9f2c1a7b');assert.equal(e.when,'pinned 3 h ago');
 assert.equal(emaRow({}),null);assert.equal(shortHash('not-hex'),'');
 const l=ledgerRow({seq:2,decision:'pass',networks:{reward:1,attention:.4},vote:{options:[{action:'build',p:.2},{action:'pass',p:.8}]},hash:'e265'+'0'.repeat(60),idea:null});
 assert.equal(l.build,.2);assert.deepEqual(l.lit,['reward']);assert.equal(l.title,null);assert.equal(l.hash.length,10);
 assert.equal(verifyText({ok:true,from:1,to:2,checked:2}).ok,true);assert.match(verifyText({ok:false,broken_at:2}).text,/#2/);assert.equal(verifyText(null).ok,null);
 assert.deepEqual(boardRows({top:[{name:'Yui',points:10,wallet:'X'}]}),[{rank:1,name:'Yui',points:10}]);
 const d=disclosureRows({system:'SUB-01',not_conscious:true,datasets:[],operator:null,ai_act:'Art. 50 disclosure'});
 assert.deepEqual(d.map(r=>r.label),['System','Conscious?','Datasets','Operator','EU AI Act']);assert.equal(d.find(r=>r.label==='Datasets').value,'Not listed yet');
 assert.match(CHEER_LINE,/do not influence/);
});
test('the wallet prompt explains the three new actions',()=>{
 for(const k of ['omikuji','predict','cheer']){assert.ok(REASONS[k]);assert.equal(reasonFor(k),REASONS[k]);}
 assert.match(REASONS.predict,/nothing of value/);
});
