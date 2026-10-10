// Coin stats → building lights (CITY-API.md "Coin stats (building lights)"). Pure helpers, no THREE, no DOM: everything
// the city shows about a launched coin passes through here, so the rule "real numbers or nothing" lives in one place.
//   cleanStats()   the server's `project.stats` → a normalised record (or null); a mock source is flagged, never hidden
//   coinVisuals()  tier + trend → what city.js / city-events.js draw (lit windows, roof, giant sign, pulse, stale dot)
//   tierLabel(), statusLine(), nextThreshold(), thresholdsLine()  copy for the list rows, the detail sheet, About
//   onchainRows(), sourceLabel()  the detail sheet's ON-CHAIN block; a missing number reads "no data yet", never 0
//   fmtNum/fmtUsd/fmtPct/timeAgo  formatting (K/M, signed percent, "3 min ago")
//   mockStats()    a synthetic, unmistakably mock record for the dev override (window.__city.debug.coinTier)
export const TIERS=['none','open','lit','roof','sign'];
// Mirrors the server's constants (src/coin-stats.js THRESHOLDS); /api/disclosure `coin_stats.thresholds` replaces them at run time.
export const DEFAULT_THRESHOLDS={lit:{holders:1000,volume24hUsd:25000},roof:{holders:10000,marketCapUsd:1000000},sign:{holders:100000,marketCapUsd:10000000}};
// The project palette (world-sync.js PALETTE → icons.js TILE_COLORS) as sign colours; never a price colour.
export const ACCENT={orange:'#FB752B',mint:'#69A694',violet:'#8990BB',sand:'#E2A05B'};
export const accentOf=c=>ACCENT[c]||ACCENT.orange;
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const ms=v=>{const n=num(v);return n!==null&&n>0?n:null;};
const SAFE_URL=/^https:\/\/dexscreener\.com\/[A-Za-z0-9/_\-.]*$/;

// Normalise `stats` from /api/world. Returns null when there is no object (an unlaunched or private project).
export function cleanStats(s){
 if(!s||typeof s!=='object')return null;
 const tier=Math.max(0,Math.min(4,Math.floor(num(s.tier)??0))),mock=s.mock===true||s.source==='mock';
 const h=s.holders&&typeof s.holders==='object'&&num(s.holders.count)!==null?{count:Math.max(0,Math.floor(s.holders.count)),exact:s.holders.exact!==false&&!s.holders.atLeast,atLeast:s.holders.atLeast===true,at:ms(s.holders.at),source:typeof s.holders.source==='string'?s.holders.source:null}:null;
 return {tier,tierName:TIERS[tier],by:['holders','marketCap','volume','usd'].includes(s.by)?s.by:null,trend:['up','down','flat'].includes(s.trend)?s.trend:null,
  fresh:s.fresh!==false,holders:h,marketCapUsd:num(s.marketCapUsd),volume24hUsd:num(s.volume24hUsd),liquidityUsd:num(s.liquidityUsd),priceChange24hPct:num(s.priceChange24hPct),
  at:ms(s.at),source:typeof s.source==='string'&&s.source?s.source:null,url:typeof s.url==='string'&&SAFE_URL.test(s.url)?s.url:null,mock};
}
// What a launched building draws for its stats. null = nothing beyond the plain launched look (tier 0/1 or no stats).
// Heights never change with market data (lots are fixed and neighbours touch): tier 3+ adds a rooftop structure instead.
export function coinVisuals(stats){
 const s=stats&&typeof stats==='object'&&'tierName' in stats?stats:cleanStats(stats);if(!s)return null;
 const t=s.tier,pulse=t>=2?s.trend==='up'?1:s.trend==='down'?-1:0:0;
 return {tier:t,tierName:s.tierName,lit:t>=2,roof:t>=3,sign:t>=4,pulse,stale:!s.fresh,mock:s.mock,litShare:t>=2?.9:null,labelLift:t>=4?5.6:t>=3?2.4:0};
}
// Numbers: 1234 → "1.2K", 2345000 → "2.3M", 12 → "12"; null → null (callers print "no data yet").
export function fmtNum(n,{digits=1}={}){
 const v=num(n);if(v===null)return null;const a=Math.abs(v),sign=v<0?'−':'';
 const f=(x,u)=>{let s=x.toFixed(digits);if(s.endsWith('.'+'0'.repeat(digits)))s=s.slice(0,-digits-1);return sign+s+u;};
 if(a>=1e9)return f(a/1e9,'B');if(a>=1e6)return f(a/1e6,'M');if(a>=1e3)return f(a/1e3,'K');
 return sign+(Number.isInteger(a)?String(a):a.toFixed(a<1?4:2));
}
export const fmtInt=n=>{const v=num(n);return v===null?null:Math.round(v).toLocaleString('en-US');};
export const fmtUsd=n=>{const s=fmtNum(n);return s===null?null:s.startsWith('−')?'−$'+s.slice(1):'$'+s;};
export function fmtPct(n){const v=num(n);if(v===null)return null;return (v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1)+'%';}
export function timeAgo(at,now=Date.now()){
 const t=ms(at);if(t===null)return null;const d=Math.max(0,now-t);
 if(d<45e3)return 'just now';if(d<3600e3)return `${Math.max(1,Math.round(d/60e3))} min ago`;if(d<86400e3)return `${Math.round(d/3600e3)} h ago`;
 return `${Math.round(d/86400e3)} d ago`;
}
// "lit" | "roof" | "sign" | "open" | "no data yet" (tier 0: nothing fetched yet, or no pair).
export function tierLabel(stats){const s=cleanStats(stats);if(!s||s.tier===0)return 'no data yet';return s.tierName;}
// The places list row of a launched coin: "Launched · lit · $ARC".
export function statusLine(stageLabel,stats,ticker){
 const parts=[String(stageLabel||'Launched')];if(stats)parts.push(tierLabel(stats));if(ticker)parts.push('$'+ticker);return parts.join(' · ');
}
const thOf=th=>({...DEFAULT_THRESHOLDS,...(th&&typeof th==='object'?Object.fromEntries(Object.entries(th).filter(([,v])=>v&&typeof v==='object')):{})});
const line=(name,t)=>{const alt=t.volume24hUsd!=null?`${fmtUsd(t.volume24hUsd)} 24 h volume`:`${fmtUsd(t.marketCapUsd)} mcap`;return `${name} at ${fmtInt(t.holders)} holders or ${alt}`;};
// The next tier and what reaches it: "roof at 10,000 holders or $1M mcap"; null at the top tier.
export function nextThreshold(stats,thresholds){
 const s=cleanStats(stats),th=thOf(thresholds),tier=s?s.tier:0;
 if(tier>=4)return null;const name=TIERS[Math.max(2,tier+1)];return line(name,th[name]);
}
// Every threshold on one line (the About sheet).
export function thresholdsLine(thresholds){const th=thOf(thresholds);return ['lit','roof','sign'].map(n=>line(n,th[n])).join(' · ');}
// "DexScreener · 3 min ago" | "MOCK DATA (local dev) · just now" | "no data yet".
export function sourceLabel(stats,now=Date.now()){
 const s=cleanStats(stats);if(!s||!s.at)return 'no data yet';
 const src=s.mock?'MOCK DATA (local dev)':s.source==='dexscreener'?'DexScreener':s.source||'unknown source';return `${src} · ${timeAgo(s.at,now)}`;
}
const NO_DATA='no data yet';
// The ON-CHAIN block: label/value rows. `dim` marks a value worth showing greyed (stale, a floor, not tracked).
export function onchainRows(stats,thresholds,now=Date.now()){
 const s=cleanStats(stats);if(!s)return [];
 const v=x=>x===null?NO_DATA:x,dim=!s.fresh,rows=[];
 const h=s.holders;rows.push({label:'Holders',value:h?(h.atLeast?'at least ':'')+fmtInt(h.count)+(h.exact||h.atLeast?'':' (approx.)'):'not tracked',dim:dim||!h});
 rows.push({label:'Market cap',value:v(fmtUsd(s.marketCapUsd)),dim:dim||s.marketCapUsd===null});
 rows.push({label:'24 h volume',value:v(fmtUsd(s.volume24hUsd)),dim:dim||s.volume24hUsd===null});
 rows.push({label:'Liquidity',value:v(fmtUsd(s.liquidityUsd)),dim:dim||s.liquidityUsd===null});
 rows.push({label:'24 h change',value:v(fmtPct(s.priceChange24hPct)),dim:dim||s.priceChange24hPct===null});
 const next=nextThreshold(s,thresholds);rows.push({label:'Tier',value:s.tier===0?NO_DATA:s.tierName+(s.by?` (by ${s.by==='marketCap'?'market cap':s.by})`:''),note:next?`next: ${next}`:'top tier',dim:s.tier===0});
 return rows;
}
// Dev override (window.__city.debug.coinTier): a synthetic record at the given tier, marked mock everywhere so it can
// never pass for real data. Numbers sit just over the tier's thresholds.
export function mockStats(tier=2,trend='flat',{now=Date.now(),fresh=true,holders=true}={}){
 const t=Math.max(0,Math.min(4,Math.floor(Number(tier)||0))),th=DEFAULT_THRESHOLDS;
 const count=t>=4?th.sign.holders*1.2:t>=3?th.roof.holders*1.23:t>=2?th.lit.holders*1.5:t>=1?240:null;
 const mcap=t>=4?th.sign.marketCapUsd*1.4:t>=3?th.roof.marketCapUsd*2.3:t>=2?310000:t>=1?42000:null;
 const pct=trend==='up'?12.5:trend==='down'?-8.2:1.1;
 return {tier:t,tierName:TIERS[t],by:t>=2?'holders':null,trend:t>=1?(['up','down','flat'].includes(trend)?trend:'flat'):null,fresh:!!fresh,
  holders:t>=1&&holders?{count:Math.round(count),exact:true,atLeast:false,at:now-120e3,source:'mock'}:null,
  marketCapUsd:mcap,volume24hUsd:t>=2?Math.round(mcap*.12):t>=1?3100:null,liquidityUsd:t>=1?Math.round((mcap||0)*.06)+1000:null,priceChange24hPct:t>=1?pct:null,
  at:t>=1?now-180e3:null,source:t>=1?'mock':null,url:null,mock:true};
}
