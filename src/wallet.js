// Wallet Standard sign-in (Phantom, Solflare, Backpack…). The city only signs the server's sign-in message:
// no transaction, no funds. Launch signatures happen in the project's office page, which shows the transaction first.
import {api,b58encode} from './api.js';
const wallets=new Map(),listeners=new Set();
function register(...list){
 for(const w of list){const solana=(w.chains||[]).some(c=>String(c).startsWith('solana:'));if(solana&&w.features?.['standard:connect']&&w.features?.['solana:signMessage'])wallets.set(w.name,w);}
 listeners.forEach(fn=>fn());return()=>{};
}
const registerApi=Object.freeze({register});
if(typeof window!=='undefined'){
 window.addEventListener('wallet-standard:register-wallet',e=>{try{e.detail(registerApi);}catch{}});
 window.dispatchEvent(new CustomEvent('wallet-standard:app-ready',{detail:registerApi}));
}
export const onWallets=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export const listWallets=()=>[...wallets.values()].map(w=>({name:w.name,icon:w.icon}));
export async function signIn(name){
 const w=wallets.get(name);if(!w)throw new Error('Wallet not found.');
 const {accounts}=await w.features['standard:connect'].connect();const account=accounts?.[0];
 if(!account)throw new Error('The wallet shared no account.');
 const n=await api('/api/auth/nonce',{method:'POST',body:{wallet:account.address}});
 const [res]=await w.features['solana:signMessage'].signMessage({account,message:new TextEncoder().encode(n.message)});
 await api('/api/auth/verify',{method:'POST',body:{wallet:account.address,nonce:n.nonce,signature:b58encode(res.signature)}});
 return account.address;
}
export const signOut=()=>api('/api/auth/logout',{method:'POST',body:{}});
