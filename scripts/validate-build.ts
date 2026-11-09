import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import legacyRoutes from '../src/data/legacy-watch-routes.json';
const legacy=legacyRoutes as {youtubeId:string}[];
import {readBuildInputs} from './lib/build-inputs.mjs';
import {catalogSchema} from '../src/lib/schemas';
import {parseReleaseArtifact} from '../src/lib/editorial/releases';
import {validateSnapshot} from '../src/lib/youtube-import';
import {youtubeOverridesSchema} from '../src/lib/merge-catalog';

const root=process.cwd(),dist=resolve(root,'dist/client');
const inputs=await readBuildInputs(root);
const release=inputs.release?parseReleaseArtifact(inputs.release):null;
const catalog=release?.catalog??catalogSchema.parse(inputs.catalog);
const overrides=release?.youtubeOverrides??youtubeOverridesSchema.parse(inputs.youtubeOverrides);
const snapshot=validateSnapshot(inputs.snapshot,'UCCxO94rfXnMpYf7DH_sd6Bw');
const active=snapshot.initialized&&!snapshot.purged&&!!snapshot.expiresAt&&Date.parse(snapshot.expiresAt)>Date.now();
const approved=catalog.performances.filter(item=>item.approvedForSite),authoredIds=new Set(catalog.performances.map(item=>item.youtubeId));
if(authoredIds.size!==catalog.performances.length)throw new Error('Authored catalog contains duplicate YouTube IDs');
const excluded=new Set(overrides.filter(item=>item.excluded).map(item=>item.youtubeId));
const available=active?new Set(snapshot.videos.map(item=>item.youtubeId)):new Set<string>();
const visibleArtists=new Set(approved.filter(item=>!excluded.has(item.youtubeId)&&(!active||available.has(item.youtubeId))).flatMap(item=>item.artistIds));
for(const item of overrides) if(active&&available.has(item.youtubeId)&&!item.excluded) for(const id of item.artistIds??[]) visibleArtists.add(id);
const routes=['404.html','index.html','about/index.html','privacy/index.html','sessions/index.html','artists/index.html',...approved.map(item=>`sessions/${item.id}/index.html`),...catalog.artists.filter(artist=>visibleArtists.has(artist.id)).map(artist=>`artists/${artist.id}/index.html`),...(active?snapshot.videos.filter(item=>!authoredIds.has(item.youtubeId)&&!excluded.has(item.youtubeId)).map(item=>`watch/${item.youtubeId}/index.html`):[]),...legacy.map(item=>`watch/${item.youtubeId}/index.html`)];
const errors:string[]=[];const seen=new Set<string>();
for(const route of routes) {
  if(seen.has(route)) errors.push(`Duplicate output route: /${route}`);
  seen.add(route);
  try { await access(resolve(dist,route)); } catch { errors.push(`Missing output route: /${route}`); }
}
if(errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
else console.log(`Build routes valid: ${routes.length} HTML pages (${approved.length} authored performances, ${visibleArtists.size} artists, ${routes.length-6-approved.length-visibleArtists.size-legacyRoutes.length} imported watch pages).`);
