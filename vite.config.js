import {defineConfig} from 'vite';
// In development the city and the launchpad server share one origin through this proxy, so the wallet session
// cookie and the server's same-origin check both work. In production the server serves the city build itself
// (CITY_DIST), and this file is not involved.
const target=process.env.LAUNCHPAD_URL||'http://localhost:8787';
const backend={target,changeOrigin:true,configure:proxy=>proxy.on('proxyReq',req=>{if(req.getHeader('origin'))req.setHeader('origin',target);})};
const proxy=Object.fromEntries(['/api','/preview','/meta','/js','/css','/favicon.svg','/launchpad','/submit','/ideas','/projects','/token','/me','/admin','/fees','/how'].map(path=>[path,backend]));
export default defineConfig({server:{proxy},preview:{proxy}});
