import test from 'node:test';import assert from 'node:assert/strict';
import {LIST_MAX,listCut,walkLabel,walkIcon,stopToast,hintFor,COACH_KEY,COACH_STEPS,coachSteps,coachSeen,markCoach,valueOf,DAY_WORDS,liveText} from '../src/hud.js';

test('places list: five rows, then "All places (N)"; expanded shows every row and offers fewer',()=>{
 assert.equal(LIST_MAX,5);
 assert.deepEqual(listCut(3),{shown:3,hidden:0,button:false,label:'All places (3)'});
 assert.deepEqual(listCut(12),{shown:5,hidden:7,button:true,label:'All places (12)'});
 assert.deepEqual(listCut(12,{all:true}),{shown:12,hidden:0,button:true,label:'Fewer places'});
 assert.deepEqual(listCut(5),{shown:5,hidden:0,button:false,label:'All places (5)'});
 assert.equal(listCut('x').shown,0);assert.equal(listCut(-2).shown,0);
});
test('walk button: Walk as ‹name› / Walk around / Stop walking; short words on phones',()=>{
 assert.equal(walkLabel(),'Walk around');assert.equal(walkLabel({name:'  '}),'Walk around');
 assert.equal(walkLabel({name:'Sael'}),'Walk as Sael');assert.equal(walkLabel({name:' Sael '}),'Walk as Sael');
 assert.equal(walkLabel({walking:true,name:'Sael'}),'Stop walking');
 assert.equal(walkLabel({short:true,name:'Sael'}),'Walk');assert.equal(walkLabel({short:true,walking:true}),'Stop');
 assert.equal(walkIcon(false),'walk');assert.equal(walkIcon(true),'x');
 assert.equal(stopToast('Sael'),'Sael is walking home. Press Stop again to end it here.');
 assert.equal(stopToast(null,{atOnce:true}),'Your character stopped here.');
});
test('hint: one plain line per context, mouse or touch words',()=>{
 assert.equal(hintFor(false),'Drag to look around · Click a building');
 assert.equal(hintFor(true),'Click a street to walk · Double-click to run');
 assert.equal(hintFor(false,{touch:true}),'Drag to look around · Tap a building');
 assert.equal(hintFor(true,{touch:true}),'Tap a street to walk · Double-tap to run');
});
test('coach: three steps, remembered once, storage failures are not errors',()=>{
 assert.equal(COACH_STEPS.length,3);assert.equal(COACH_KEY,'sub01.coach');
 assert.deepEqual(coachSteps(),COACH_STEPS);assert.deepEqual(coachSteps({touch:true}),['Drag to look around','Tap a building','Walk as your character']);
 const mem=new Map(),store={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
 assert.equal(coachSeen(store),false);assert.equal(markCoach(store),true);assert.equal(coachSeen(store),true);
 assert.equal(coachSeen(null),false);assert.equal(markCoach(null),false);
 const broken={getItem(){throw new Error('no');},setItem(){throw new Error('no');}};
 assert.equal(coachSeen(broken),false);assert.equal(markCoach(broken),false);
});
test('labels: the value after the colon, day words, live badge',()=>{
 assert.equal(valueOf('Weather: rain'),'rain');assert.equal(valueOf('Low graphics: off'),'off');assert.equal(valueOf('Day'),'Day');assert.equal(valueOf(null),'');
 assert.deepEqual(DAY_WORDS,{day:'Day',night:'Night',auto:'Tokyo clock'});
 assert.equal(liveText(true),'LIVE');assert.equal(liveText(false),'OFFLINE');
});
