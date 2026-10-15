import { REWARDS_POLICY } from './rewards.js';
import { b58encode } from './api.js';

const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function publicKeyBytes(address) {
  if(typeof address!=='string'||address.length<32||address.length>44)throw Error('Invalid wallet address');
  let n=0n;for(const c of address){const i=ALPHABET.indexOf(c);if(i<0)throw Error('Invalid wallet address');n=n*58n+BigInt(i);}
  const bytes=[];while(n){bytes.unshift(Number(n&255n));n>>=8n;}for(const c of address){if(c!=='1')break;bytes.unshift(0);}
  if(bytes.length!==32)throw Error('Invalid wallet address');return Uint8Array.from(bytes);
}
export const unsignedAmount=value=>typeof value==='string'&&/^(0|[1-9]\d{0,19})$/.test(value)&&BigInt(value)<(1n<<64n)?BigInt(value):null;
const u64=n=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(n),true);return b;};
const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const unhex=s=>{if(!/^[a-f0-9]{64}$/.test(s||''))throw Error('Invalid reward proof');return Uint8Array.from(s.match(/../g).map(x=>parseInt(x,16)));};
const concat=(...arrays)=>{const b=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrays){b.set(a,offset);offset+=a.length;}return b;};
const hash=async bytes=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
const compare=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;};
export async function verifyClaimProof({program,epochId,wallet,amountLamports,proof,root}) {
  try{
    if(!Number.isSafeInteger(epochId)||epochId<0||epochId>100000||unsignedAmount(amountLamports)===null||!Array.isArray(proof)||proof.length>32)return false;
    let h=await hash(concat(new TextEncoder().encode('SUB01_REWARDS_V1'),publicKeyBytes(program),publicKeyBytes(REWARDS_POLICY.mint),u64(epochId),publicKeyBytes(wallet),u64(amountLamports)));
    for(const sibling of proof){const p=unhex(sibling),[a,b]=compare(h,p)<=0?[h,p]:[p,h];h=await hash(concat(new TextEncoder().encode('SUB01_NODE_V1'),a,b));}
    return hex(h)===root;
  }catch{return false;}
}

// Review the actual legacy transaction bytes, not merely the server's description.
// Permit one known claim and, only when chosen, one exact buyback contribution.
export function reviewClaimTransaction(base64,expected) {
  try {
    if(typeof base64!=='string'||base64.length>6000)throw Error();
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));let offset=0;
    const read=n=>{if(offset+n>bytes.length)throw Error();const b=bytes.slice(offset,offset+n);offset+=n;return b;};
    const short=()=>{let value=0,shift=0;for(let i=0;i<3;i++){const byte=read(1)[0];value|=(byte&127)<<shift;if(!(byte&128))return value;shift+=7;}throw Error();};
    if(short()!==1||read(64).some(b=>b!==0))throw Error();
    const header=read(3);if(header[0]!==1||header[1]!==0||header[2]!==2)throw Error();
    const donating=expected.destination==='buyback';
    if(expected.destination!==undefined&&!['wallet','buyback'].includes(expected.destination))throw Error();
    const keyCount=donating?6:5;
    if(short()!==keyCount)throw Error();const keys=Array.from({length:keyCount},()=>b58encode(read(32)));
    if(new Set(keys).size!==keyCount||keys[0]!==expected.wallet)throw Error();read(32);
    if(short()!==(donating?2:1))throw Error();const programIndex=read(1)[0];if(keys[programIndex]!==expected.program||programIndex<keyCount-2)throw Error();
    if(short()!==4)throw Error();const accounts=[...read(4)].map(i=>keys[i]);
    if(accounts.join('|')!==[expected.wallet,expected.escrow,expected.claimRecord,'11111111111111111111111111111111'].join('|'))throw Error();
    if(keys.indexOf(expected.escrow)<1||keys.indexOf(expected.escrow)>keyCount-3||keys.indexOf(expected.claimRecord)<1||keys.indexOf(expected.claimRecord)>keyCount-3)throw Error();
    const data=read(short());if(!Array.isArray(expected.proof)||expected.proof.length>32)throw Error();
    const desired=concat(Uint8Array.of(1),u64(expected.epochId),u64(expected.amountLamports),Uint8Array.of(expected.proof.length),...expected.proof.map(unhex));
    if(data.length!==desired.length||compare(data,desired)!==0)throw Error();
    if(donating){
      if(expected.buybackWallet!==REWARDS_POLICY.fundingWallet||keys.indexOf(expected.buybackWallet)<1||keys.indexOf(expected.buybackWallet)>3)throw Error();
      if(keys[read(1)[0]]!=='11111111111111111111111111111111'||short()!==2)throw Error();
      const transferAccounts=[...read(2)].map(i=>keys[i]);
      if(transferAccounts.join('|')!==[expected.wallet,REWARDS_POLICY.fundingWallet].join('|'))throw Error();
      const transfer=read(short()),desiredTransfer=concat(Uint8Array.of(2,0,0,0),u64(expected.amountLamports));
      if(transfer.length!==12||compare(transfer,desiredTransfer)!==0)throw Error();
    }
    if(offset!==bytes.length)throw Error();
    return true;
  }catch{return false;}
}

export function explorerLink(value) {
  if(typeof value!=='string')return null;
  try{const u=new URL(value);if(u.origin==='https://explorer.solana.com'&&/^\/(address|tx)\/[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(u.pathname)&&['','?cluster=devnet'].includes(u.search))return u.href;}catch{}
  return null;
}

// Initial treasury funding: exactly one publish instruction, fixed one-SOL basis.
export function reviewFundingTransaction(base64, expected) {
  try {
    if (expected.wallet !== REWARDS_POLICY.fundingWallet || expected.epochId !== 100000 || expected.creatorRewardsLamports !== '1000000000'
      || !Number.isSafeInteger(expected.snapshotEnd) || expected.snapshotEnd % 1000 !== 0) return false;
    if (typeof base64 !== 'string' || base64.length > 6000) return false;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); let offset = 0;
    const read = n => { if (offset + n > bytes.length) throw Error(); const b = bytes.slice(offset, offset + n); offset += n; return b; };
    const short = () => { let n = 0, shift = 0; for (let i = 0; i < 3; i++) { const b = read(1)[0]; n |= (b & 127) << shift; if (!(b & 128)) return n; shift += 7; } throw Error(); };
    if (short() !== 1 || read(64).some(b => b !== 0)) return false;
    if (compare(read(3), Uint8Array.of(1, 0, 2)) !== 0 || short() !== 4) return false;
    const keys = Array.from({ length: 4 }, () => b58encode(read(32)));
    if (new Set(keys).size !== 4 || keys[0] !== expected.wallet || keys[1] !== expected.escrow) return false;
    read(32);
    if (short() !== 1 || keys[read(1)[0]] !== expected.program || short() !== 3) return false;
    if ([...read(3)].map(i => keys[i]).join('|') !== [expected.wallet, expected.escrow, '11111111111111111111111111111111'].join('|')) return false;
    const data = read(short()), desired = concat(Uint8Array.of(0), u64(100000), u64('1000000000'), unhex(expected.root), u64(expected.snapshotEnd / 1000));
    return offset === bytes.length && data.length === desired.length && compare(data, desired) === 0;
  } catch { return false; }
}
