// Same-origin calls to the SUBZERONE launchpad server (served together with the city, or proxied by Vite in dev).
export class ApiError extends Error{constructor(status,body){super(body?.message||body?.error||`request failed (${status})`);this.status=status;this.body=body;}}
export async function api(path,{method='GET',body}={}){
 const res=await fetch(path,{method,credentials:'same-origin',headers:body!==undefined?{'content-type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined});
 let json=null;try{json=await res.json();}catch{}
 if(!res.ok)throw new ApiError(res.status,json);
 return json;
}
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58encode(bytes){let n=0n;for(const b of bytes)n=(n<<8n)+BigInt(b);let out='';while(n>0n){out=ALPHABET[Number(n%58n)]+out;n/=58n;}for(const b of bytes){if(b===0)out='1'+out;else break;}return out;}
export const short=(a,n=4)=>a&&a.length>2*n+3?`${a.slice(0,n)}…${a.slice(-n)}`:a||'';
