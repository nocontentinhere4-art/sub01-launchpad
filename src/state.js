export const STORAGE_KEY = 'sub01-neighborhood-drafts-v1';
export const MAX_DRAFTS = 8;
export const RESIDENT_KEY = 'sub01-tokyo-resident-v1';
export const places = [
  { id: 'home', name: 'SUB-01’s place', symbol: '01', kind: 'HOME / WORKSPACE', status: 'At home', color: '#ff772c', x: -6, z: -4, description: 'The first house in the neighborhood. Ideas arrive in the mailbox at his gate; he works at the desk downstairs, sleeps in the loft, and remembers the projects he has built.' },
  { id: 'lab', name: 'The Workshop', symbol: '⌘', kind: 'DEMO / BUILD STUDIO', status: 'Taking shape', color: '#69978a', x: 3.4, z: -5, description: 'A place for tools and experiments. In the full launchpad, you will be able to open working previews and follow each project’s build history.' },
  { id: 'arcade', name: 'Bad Idea Arcade', symbol: '↗', kind: 'DEMO / GAME PROJECT', status: 'Prototype', color: '#e2a05b', x: 8, z: 7.5, description: 'A terrible idea with a good front door. An example of how a game project could become somewhere you can actually visit in the neighborhood.' },
  { id: 'studio', name: 'Midnight Studio', symbol: '♫', kind: 'DEMO / MUSIC PROJECT', status: 'In the queue', color: '#8990bb', x: -3.5, z: 8.5, description: 'A small studio for sounds made after midnight. An example project, ready for a future connection to its own site, team and activity feed.' },
];
export const residence = { id:'residence', name:'Orange Apartments', symbol:'⌂', kind:'TOKYO / RESIDENTIAL', status:'Choose your space', color:'#e9854d', x:-10.5, z:8.5, description:'Your own corner of Tokyo. Try a resident name, a character color and a coin ticker. This local preview is not a property reservation or a token launch.' };
export function validateResident(name, ticker, color) {
 const n=String(name??'').trim(), t=String(ticker??'').trim().toUpperCase();
 if(n.length<2||n.length>24)throw new Error('Use a resident name between 2 and 24 characters.');
 if(!/^[A-Z0-9]{1,10}$/.test(t))throw new Error('Use 1 to 10 letters or numbers for your concept ticker.');
 if(!['orange','mint','violet'].includes(color))throw new Error('Choose one of the character colors.');
 return {name:n,ticker:t,color,unit:'Orange Apartments / 03',mode:'local-preview'};
}
export function readResident(storage){
 try {const r=JSON.parse(storage.getItem(RESIDENT_KEY)||'null');return r?validateResident(r.name,r.ticker,r.color):null;}catch{return null;}
}
export function validateIdea(name, idea) {
  const n = String(name ?? '').trim(); const i = String(idea ?? '').trim();
  if (n.length < 2 || n.length > 40) throw new Error('Give your project a name between 2 and 40 characters.');
  if (i.length < 10 || i.length > 400) throw new Error('Describe your idea in 10 to 400 characters.');
  return { name: n, idea: i };
}
export function createDraft(name, idea, existing = [], id = crypto.randomUUID()) {
  const content = validateIdea(name, idea);
  if (existing.length >= MAX_DRAFTS) throw new Error('This preview has room for eight briefs.');
  return { id, ...content, status: 'Brief received', createdAt: new Date().toISOString() };
}
export function readDrafts(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(d => typeof d?.id === 'string' && typeof d?.name === 'string' && typeof d?.idea === 'string' && d.name.length >= 2 && d.name.length <= 40 && d.idea.length >= 10 && d.idea.length <= 400).slice(0, MAX_DRAFTS);
  } catch { return []; }
}
export const tourStops = [
  { x: -4.5, z: -2.25, duration: 4, text: 'A new idea arrived in the mailbox at the gate.' },
  { x: -4.5, z: 1.6, duration: 3, text: 'Heading out to check the neighborhood.' },
  { x: 3.4, z: 1.6, duration: 6, text: 'Every idea needs somewhere to start.' },
  { x: 3.4, z: -1.3, duration: 3, text: 'Checking in at the Workshop (an example place).' },
  { x: 3.4, z: 1.6, duration: 2, text: 'One brain. A few places to build.' },
  { x: -4.5, z: 1.6, duration: 5, text: 'Back home. There’s work to do.' },
  { x: -4.5, z: -2.25, duration: 3, text: 'Your brief is on his desk. This is only the beginning.' },
];
