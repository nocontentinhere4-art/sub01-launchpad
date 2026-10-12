// Same-origin calls to the SUBZERONE launchpad server (served together with the city, or proxied by Vite in dev).
import {recordError} from './support.js';
export class ApiError extends Error{constructor(status,body){super(body?.message||body?.error||`request failed (${status})`);this.status=status;this.body=body;}}
// A gate (guest.js) may stop a write before it leaves the browser: it returns a message to refuse with (as a 401, the
// status the server would answer), or nothing to let the call through.
let gate=null;
export const setGate=fn=>{gate=typeof fn==='function'?fn:null;};
// Every failed call (network or HTTP) goes into support.js's ring of the last 10: the Help sheet attaches it, if the
// author agrees. Method, path without its query, status, the server's code and message: never a body or a header.
export async function api(path,{method='GET',body,headers={}}={}){
 const stop=gate?.(path,method);if(stop)throw new ApiError(401,{error:'sign_in',message:stop});
 let res;
 try{res=await fetch(path,{method,credentials:'same-origin',headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined});}
 catch(e){recordError({method,path,status:0,code:'network',message:e?.message||'network error'});throw e;}
 let json=null;try{json=await res.json();}catch{}
 if(!res.ok){recordError({method,path,status:res.status,code:json?.error,message:json?.message});throw new ApiError(res.status,json);}
 return json;
}
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58encode(bytes){let n=0n;for(const b of bytes)n=(n<<8n)+BigInt(b);let out='';while(n>0n){out=ALPHABET[Number(n%58n)]+out;n/=58n;}for(const b of bytes){if(b===0)out='1'+out;else break;}return out;}
export const short=(a,n=4)=>a&&a.length>2*n+3?`${a.slice(0,n)}…${a.slice(-n)}`:a||'';
