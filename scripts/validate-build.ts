import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import overrides from '../src/data/youtube-overrides.json';
import legacyRoutes from '../src/data/legacy-watch-routes.json';
import { validateSnapshot } from '../src/lib/youtube-import.js';

const root=process.cwd(),dist=resolve(root,'dist');
let snapshot;
try{snapshot=validateSnapshot(JSON.parse(await readFile(resolve(root,'.local/youtube-snapshot.json'),'utf8')),'UCCxO94rfXnMpYf7DH_sd6Bw');}
catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')snapshot=validateSnapshot(JSON.parse(await readFile(resolve(root,'src/data/youtube-snapshot.json'),'utf8')),'UCCxO94rfXnMpYf7DH_sd6Bw');else throw error;}
const active=snapshot.initialized&&!snapshot.purged&&!!snapshot.expiresAt&&Date.parse(snapshot.expiresAt)>Date.now();
const approved=performances.filter((item)=>item.approvedForSite),authoredIds=new Set(performances.map((item)=>item.youtubeId));
if(authoredIds.size!==performances.length)throw new Error('Authored catalog contains duplicate YouTube IDs');
const available=active?new Set(snapshot.videos.map((item)=>item.youtubeId)):new Set<string>();
const exclusionOverrides=overrides as {youtubeId:string;excluded?:boolean}[];
const oldRoutes=legacyRoutes as {youtubeId:string;performanceId:string}[];
const excluded=new Set(exclusionOverrides.filter((item)=>item.excluded).map((item)=>item.youtubeId));
const visibleArtists=new Set(approved.filter((item)=>!excluded.has(item.youtubeId)&&(!active||available.has(item.youtubeId))).flatMap((item)=>item.artistIds));
for(const item of overrides) if(active&&available.has(item.youtubeId)&&!excluded.has(item.youtubeId)) for(const id of item.artistIds??[]) visibleArtists.add(id);
const routes=['404.html','index.html','about/index.html','privacy/index.html','sessions/index.html','artists/index.html',...approved.map((item)=>`sessions/${item.id}/index.html`),...artists.filter((artist)=>visibleArtists.has(artist.id)).map((artist)=>`artists/${artist.id}/index.html`),...(active?snapshot.videos.filter((item)=>!authoredIds.has(item.youtubeId)&&!excluded.has(item.youtubeId)).map((item)=>`watch/${item.youtubeId}/index.html`):[]),...oldRoutes.map((item)=>`watch/${item.youtubeId}/index.html`)];
const errors:string[]=[];const seen=new Set<string>();
for(const route of routes){if(seen.has(route))errors.push(`Duplicate output route: /${route}`);seen.add(route);try{await access(resolve(dist,route));}catch{errors.push(`Missing output route: /${route}`);}}
const total=routes.length;
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Build routes valid: ${total} HTML pages (${approved.length} authored performances, ${visibleArtists.size} artists, ${total-6-approved.length-visibleArtists.size-legacyRoutes.length} imported watch pages).`);
