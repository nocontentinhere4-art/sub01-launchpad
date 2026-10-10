import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanStats,coinVisuals,fmtNum,fmtUsd,fmtPct,fmtInt,timeAgo,tierLabel,statusLine,nextThreshold,thresholdsLine,sourceLabel,onchainRows,mockStats,DEFAULT_THRESHOLDS,TIERS,accentOf} from '../src/coin-tier.js';

const now=1_760_000_000_000;
const real={tier:3,tierName:'roof',by:'holders',trend:'up',fresh:true,holders:{count:12345,exact:true,atLeast:false,at:now-60e3,source:'helius'},
 marketCapUsd:2345000,volume24hUsd:123456.78,liquidityUsd:45678.9,priceChange24hPct:12.5,at:now-180e3,source:'dexscreener',url:'https://dexscreener.com/solana/abc'};

test('cleanStats normalises the server record; garbage, mock and missing numbers are kept honest',()=>{
 const s=cleanStats(real);assert.equal(s.tier,3);assert.equal(s.tierName,'roof');assert.equal(s.trend,'up');assert.equal(s.mock,false);assert.equal(s.url,real.url);
 assert.equal(cleanStats(null),null);assert.equal(cleanStats('x'),null);
 const dark=cleanStats({tier:0,tierName:'none',by:null,trend:null,fresh:true,holders:null,marketCapUsd:null,volume24hUsd:null,liquidityUsd:null,priceChange24hPct:null,at:null,source:null,url:null});
 assert.equal(dark.tier,0);assert.equal(dark.at,null);assert.equal(dark.marketCapUsd,null,'null stays null, never 0');
 const m=cleanStats({tier:2,source:'mock',at:now,marketCapUsd:5});assert.equal(m.mock,true);assert.equal(m.tierName,'lit');
 assert.equal(cleanStats({tier:2,mock:true}).mock,true);
 assert.equal(cleanStats({tier:'9',trend:'moon',url:'http://evil.example/x'}).tier,0,'a string tier is not a number');assert.equal(cleanStats({tier:'9',url:'http://evil.example/x'}).url,null);assert.equal(cleanStats({tier:99,trend:'moon',url:'javascript:alert(1)'}).url,null);
 assert.equal(cleanStats({tier:-3}).tier,0);assert.equal(cleanStats({tier:2,trend:'sideways'}).trend,null);
 const floor=cleanStats({tier:4,holders:{count:20000,exact:false,atLeast:true,at:now,source:'helius'}});assert.deepEqual([floor.holders.count,floor.holders.exact,floor.holders.atLeast],[20000,false,true]);
 assert.equal(cleanStats({tier:1,holders:{count:'x'}}).holders,null);
});
test('coinVisuals: what each tier draws; height never changes, the label lifts over the rooftop structure',()=>{
 assert.equal(coinVisuals(null),null);assert.equal(coinVisuals(undefined),null);
 const t0=coinVisuals({tier:0}),t1=coinVisuals({tier:1,trend:'up'}),t2=coinVisuals({tier:2,trend:'up'}),t3=coinVisuals({tier:3,trend:'down',fresh:false}),t4=coinVisuals({tier:4,trend:'flat',source:'mock'});
 assert.deepEqual([t0.lit,t0.roof,t0.sign,t0.pulse],[false,false,false,0]);
 assert.deepEqual([t1.lit,t1.pulse],[false,0],'tier 1 has nothing beyond the launched look, even trending up');
 assert.deepEqual([t2.lit,t2.roof,t2.sign,t2.pulse,t2.litShare],[true,false,false,1,.9]);
 assert.deepEqual([t3.lit,t3.roof,t3.sign,t3.pulse,t3.stale],[true,true,false,-1,true]);
 assert.deepEqual([t4.lit,t4.roof,t4.sign,t4.mock],[true,true,true,true]);
 assert.ok(t2.labelLift===0&&t3.labelLift>0&&t4.labelLift>t3.labelLift);
 assert.equal(coinVisuals(cleanStats(real)).tier,3,'accepts an already clean record');
 assert.ok(!('height' in t4)&&!('floors' in t4),'no height from market data');
});
test('numbers: K/M, dollars, signed percent, time ago; null never prints as 0',()=>{
 assert.equal(fmtNum(12),'12');assert.equal(fmtNum(1234),'1.2K');assert.equal(fmtNum(25000),'25K');assert.equal(fmtNum(2345000),'2.3M');assert.equal(fmtNum(1e6),'1M');assert.equal(fmtNum(1.5e9),'1.5B');
 assert.equal(fmtNum(null),null);assert.equal(fmtNum(NaN),null);assert.equal(fmtNum('12'),null);assert.equal(fmtNum(0),'0');assert.equal(fmtNum(0.0023),'0.0023');
 assert.equal(fmtUsd(2345000),'$2.3M');assert.equal(fmtUsd(-1500),'−$1.5K');assert.equal(fmtUsd(null),null);
 assert.equal(fmtPct(12.5),'+12.5%');assert.equal(fmtPct(-8.25),'−8.3%');assert.equal(fmtPct(0),'0.0%');assert.equal(fmtPct(null),null);
 assert.equal(fmtInt(12345),'12,345');assert.equal(fmtInt(null),null);
 assert.equal(timeAgo(now-10e3,now),'just now');assert.equal(timeAgo(now-180e3,now),'3 min ago');assert.equal(timeAgo(now-2*3600e3,now),'2 h ago');assert.equal(timeAgo(now-3*86400e3,now),'3 d ago');
 assert.equal(timeAgo(null,now),null);assert.equal(timeAgo(0,now),null);assert.equal(timeAgo(now+5e3,now),'just now');
});
test('copy: tier label, list status line, next threshold, the About line',()=>{
 assert.equal(tierLabel(null),'no data yet');assert.equal(tierLabel({tier:0}),'no data yet');assert.equal(tierLabel({tier:1}),'open');assert.equal(tierLabel(real),'roof');
 assert.equal(statusLine('Launched',real,'ARC'),'Launched · roof · $ARC');assert.equal(statusLine('Launched',null,'ARC'),'Launched · $ARC');assert.equal(statusLine(undefined,{tier:0},null),'Launched · no data yet');
 assert.equal(nextThreshold({tier:1}),'lit at 1,000 holders or $25K 24 h volume');
 assert.equal(nextThreshold(real),'sign at 100,000 holders or $10M mcap');assert.equal(nextThreshold({tier:2}),'roof at 10,000 holders or $1M mcap');
 assert.equal(nextThreshold(null),'lit at 1,000 holders or $25K 24 h volume');assert.equal(nextThreshold({tier:4}),null,'top tier');
 assert.equal(nextThreshold({tier:2},{roof:{holders:5000,marketCapUsd:500000}}),'roof at 5,000 holders or $500K mcap','server thresholds win');
 assert.equal(nextThreshold({tier:2},{roof:'bogus'}),'roof at 10,000 holders or $1M mcap','a bad server value falls back');
 assert.equal(thresholdsLine(DEFAULT_THRESHOLDS),'lit at 1,000 holders or $25K 24 h volume · roof at 10,000 holders or $1M mcap · sign at 100,000 holders or $10M mcap');
 assert.equal(thresholdsLine(null),thresholdsLine(DEFAULT_THRESHOLDS));
 assert.deepEqual(TIERS,['none','open','lit','roof','sign']);assert.equal(accentOf('mint'),'#69A694');assert.equal(accentOf('nope'),accentOf('orange'));
});
test('source label: DexScreener with age, MOCK DATA flagged, nothing fetched = no data yet',()=>{
 assert.equal(sourceLabel(real,now),'DexScreener · 3 min ago');
 assert.equal(sourceLabel({tier:2,source:'mock',at:now-30e3},now),'MOCK DATA (local dev) · just now');
 assert.equal(sourceLabel({tier:2,mock:true,source:'dexscreener',at:now-30e3},now),'MOCK DATA (local dev) · just now','mock:true alone flags it');
 assert.equal(sourceLabel({tier:0,at:null,source:null},now),'no data yet');assert.equal(sourceLabel(null,now),'no data yet');
});
test('ON-CHAIN rows: every number or "no data yet"; holders not tracked / at least; stale rows dim',()=>{
 const rows=onchainRows(real,null,now),get=l=>rows.find(r=>r.label===l);
 assert.deepEqual(rows.map(r=>r.label),['Holders','Market cap','24 h volume','Liquidity','24 h change','Tier']);
 assert.equal(get('Holders').value,'12,345');assert.equal(get('Market cap').value,'$2.3M');assert.equal(get('24 h volume').value,'$123.5K');assert.equal(get('Liquidity').value,'$45.7K');assert.equal(get('24 h change').value,'+12.5%');
 assert.equal(get('Tier').value,'roof (by holders)');assert.equal(get('Tier').note,'next: sign at 100,000 holders or $10M mcap');assert.ok(rows.every(r=>!r.dim));
 const r2=onchainRows({tier:2,trend:'flat',fresh:false,holders:null,marketCapUsd:null,volume24hUsd:30000,at:now-3600e3,source:'dexscreener'},null,now),g2=l=>r2.find(r=>r.label===l);
 assert.equal(g2('Holders').value,'not tracked');assert.equal(g2('Market cap').value,'no data yet');assert.equal(g2('24 h volume').value,'$30K');assert.ok(g2('24 h volume').dim,'stale dims even real values');
 assert.equal(g2('Tier').value,'lit');
 const r4=onchainRows({tier:4,by:'marketCap',holders:{count:20000,atLeast:true,exact:false}},null,now);assert.equal(r4[0].value,'at least 20,000');assert.equal(r4[5].value,'sign (by market cap)');assert.equal(r4[5].note,'top tier');
 const r0=onchainRows({tier:0},null,now);assert.equal(r0[5].value,'no data yet');assert.ok(r0.every(r=>r.value!=='0'&&r.value!=='$0'));
 assert.deepEqual(onchainRows(null),[]);
});
test('mockStats is unmistakably mock, sits over its tier thresholds and is accepted by cleanStats',()=>{
 for(const t of [0,1,2,3,4]){const m=mockStats(t,'up',{now});assert.equal(m.mock,true);assert.equal(m.tier,t);assert.equal(m.tierName,TIERS[t]);
  const c=cleanStats(m);assert.equal(c.mock,true);assert.equal(c.tier,t);assert.equal(coinVisuals(c).mock,true);
  if(t>=1){assert.equal(m.source,'mock');assert.equal(m.holders.source,'mock');assert.equal(m.url,null);}else{assert.equal(m.at,null);assert.equal(m.holders,null);}}
 const m3=mockStats(3,'down',{now});assert.ok(m3.holders.count>=DEFAULT_THRESHOLDS.roof.holders);assert.ok(m3.marketCapUsd>=DEFAULT_THRESHOLDS.roof.marketCapUsd);assert.equal(m3.trend,'down');assert.ok(m3.priceChange24hPct<0);
 const m4=mockStats(4,'flat',{now,fresh:false,holders:false});assert.equal(m4.fresh,false);assert.equal(m4.holders,null);assert.ok(m4.marketCapUsd>=DEFAULT_THRESHOLDS.sign.marketCapUsd);
 assert.equal(mockStats(9,'x').tier,4);assert.equal(mockStats(9,'x').trend,'flat');assert.equal(sourceLabel(mockStats(2),now+1).startsWith('MOCK DATA'),true);
});
