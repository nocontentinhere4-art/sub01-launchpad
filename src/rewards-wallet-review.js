// Wallets may add bounded compute-budget instructions. Every reviewed action stays identical.
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58=b=>{let n=0n;for(const x of b)n=(n<<8n)+BigInt(x);let s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const x of b){if(x)break;s='1'+s;}return s;};
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const budget='ComputeBudget111111111111111111111111111111';
function decode(value){
 if(typeof value!=='string'||value.length>6000)throw Error('Invalid transaction');
 const b=Uint8Array.from(atob(value),x=>x.charCodeAt(0));let p=0;
 const read=n=>{if(!Number.isSafeInteger(n)||n<0||p+n>b.length)throw Error('Truncated transaction');const r=b.slice(p,p+n);p+=n;return r;};
 const short=()=>{let n=0,s=0;for(let i=0;i<3;i++){const x=read(1)[0];n|=(x&127)<<s;if(!(x&128))return n;s+=7;}throw Error('Invalid length');};
 if(short()!==1)throw Error('Unexpected signers');read(64);
 const header=read(3);if(header[0]!==1||header[1]!==0)throw Error('Unexpected header');
 const count=short();if(count<1||count>16||header[2]>=count)throw Error('Unexpected keys');
 const keys=Array.from({length:count},()=>b58(read(32)));if(new Set(keys).size!==count)throw Error('Duplicate keys');
 const roles=Object.fromEntries(keys.map((k,i)=>[k,{signer:i===0,writable:i<count-header[2]}]));
 const blockhash=hex(read(32)),instructions=[];const total=short();if(total>8)throw Error('Too many instructions');
 for(let j=0;j<total;j++){const index=read(1)[0];if(index>=count)throw Error('Invalid program');const indices=Array.from(read(short()));if(indices.some(i=>i>=count))throw Error('Invalid accounts');instructions.push({program:keys[index],accounts:indices.map(i=>keys[i]),data:hex(read(short()))});}
 if(p!==b.length)throw Error('Trailing bytes');return {keys,roles,blockhash,instructions};
}
export function reviewWalletAdjustedReward(original,signed,{baseNetworkFeeLamports,maxNetworkFeeLamports}){
 try{
  if(!/^\d+$/.test(baseNetworkFeeLamports)||!/^\d+$/.test(maxNetworkFeeLamports))return false;
  const base=BigInt(baseNetworkFeeLamports),cap=BigInt(maxNetworkFeeLamports);if(base<0n||cap<base||cap>100000n)return false;
  const a=decode(original),b=decode(signed);if(a.keys[0]!==b.keys[0]||a.blockhash!==b.blockhash||a.keys.includes(budget))return false;
  for(const k of a.keys)if(JSON.stringify(a.roles[k])!==JSON.stringify(b.roles[k]))return false;
  for(const k of b.keys)if(!a.keys.includes(k)&&(k!==budget||b.roles[k].signer||b.roles[k].writable))return false;
  let limit=200000n*BigInt(a.instructions.length),price=0n,seenLimit=false,seenPrice=false;const actions=[];
  for(const ix of b.instructions){
   if(ix.program!==budget){actions.push(ix);continue;}
   if(ix.accounts.length)return false;
   const data=Uint8Array.from(ix.data.match(/../g)||[],x=>parseInt(x,16)),v=new DataView(data.buffer);
   if(data[0]===2&&data.length===5&&!seenLimit){limit=BigInt(v.getUint32(1,true));seenLimit=true;}
   else if(data[0]===3&&data.length===9&&!seenPrice){price=v.getBigUint64(1,true);seenPrice=true;}
   else return false;
  }
  if(limit<1n||limit>200000n*BigInt(a.instructions.length)||JSON.stringify(actions)!==JSON.stringify(a.instructions))return false;
  const priority=(limit*price+999999n)/1000000n;
  return base+priority<=cap;
 }catch{return false;}
}
