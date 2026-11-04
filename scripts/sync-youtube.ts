import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import config from '../src/data/youtube-config.json';
import performances from '../src/data/performances.json';
import { emptySnapshot, makeSnapshot, parseDuration, purgeExpiredSnapshot, validateSnapshot, type ImportedVideo, type YoutubeSnapshot } from '../src/lib/youtube-import.js';

type Fetcher = typeof fetch;
type ApiItem = { id?:string; snippet?:{title?:string;channelId?:string;publishedAt?:string;thumbnails?:Record<string,{url?:string}>};contentDetails?:{duration?:string};status?:{privacyStatus?:string;embeddable?:boolean};liveStreamingDetails?:{actualEndTime?:string;scheduledStartTime?:string;actualStartTime?:string} };
const series = {sessions:'sessions',covers:'covers'} as const;
const root=resolve(import.meta.dirname,'..');
function safePath(path:string) { const target=resolve(root,path); const rel=relative(root,target); if (!rel || rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel)) throw new Error('Output paths must stay inside the project and cannot replace the project root'); return target; }
async function json(path:string) { return JSON.parse(await readFile(path,'utf8')); }
async function request(url:URL,key:string,fetcher:Fetcher) {
  for(let attempt=0;;attempt++) {
    const response=await fetcher(url,{headers:{'X-Goog-Api-Key':key},signal:AbortSignal.timeout(config.limits.requestTimeoutMs)}).catch((error)=>{if(attempt>=config.limits.transientRetries)throw new Error(`YouTube request failed (${error.name})`);return null;});
    if (!response) { await new Promise(r=>setTimeout(r,150*(attempt+1))); continue; }
    if(response.ok)return response.json() as Promise<any>;
    if([429,500,502,503,504].includes(response.status)&&attempt<config.limits.transientRetries){await new Promise(r=>setTimeout(r,Math.min(2000,Number(response.headers.get('retry-after'))*1000||200*(attempt+1))));continue;}
    const error=await response.json().catch(()=>({}));
    throw new Error(response.status===401||response.status===403?`YouTube API rejected the key or request (HTTP ${response.status}, ${error.error?.errors?.[0]?.reason??'request denied'})`:`YouTube API failed (HTTP ${response.status})`);
  }
}
async function pages(playlistId:string,key:string,fetcher:Fetcher):Promise<string[]> {
  const ids:string[]=[];let token:string|undefined;const seen=new Set<string>();
  do { const url=new URL('https://www.googleapis.com/youtube/v3/playlistItems'); for(const [k,v] of Object.entries({part:'contentDetails',playlistId,maxResults:String(config.limits.pageSize),...(token?{pageToken:token}:{})}))url.searchParams.set(k,v);
    const data=await request(url,key,fetcher); if(!Array.isArray(data.items))throw new Error('Malformed playlist response'); for(const item of data.items)if(typeof item.contentDetails?.videoId==='string')ids.push(item.contentDetails.videoId);
    token=data.nextPageToken; if(token&&seen.has(token))throw new Error('Repeated YouTube pagination token');if(token)seen.add(token);
  }while(token); return [...new Set(ids)];
}
function selectThumbnail(item:ApiItem) { return ['maxres','standard','high','medium','default'].map(k=>item.snippet?.thumbnails?.[k]?.url).find((url)=>{try{const u=new URL(url!);return u.protocol==='https:'&&config.thumbnailHosts.includes(u.hostname)}catch{return false}}); }
export async function fetchCycle(fetcher:Fetcher=fetch,key:string,now=new Date(),authoredIds=performances.map((performance)=>performance.youtubeId)):Promise<{videos:ImportedVideo[];reasons:string[]}> {
  const channels=new URL('https://www.googleapis.com/youtube/v3/channels');for(const [k,v]of Object.entries({part:'contentDetails',id:config.channelId}))channels.searchParams.set(k,v);
  const channel=await request(channels,key,fetcher);if(!Array.isArray(channel.items)||channel.items.length!==1||channel.items[0].id!==config.channelId)throw new Error('Configured channel was not verified by channels.list');
  const uploads=channel.items[0].contentDetails?.relatedPlaylists?.uploads;if(typeof uploads!=='string'||!uploads)throw new Error('Verified channel has no uploads playlist');
  const uploadIds=await pages(uploads,key,fetcher),membership=new Map<string,string[]>(),ids=new Set([...uploadIds,...authoredIds]),reasons:string[]=[];
  for(const rule of config.playlistRules as {seriesId:keyof typeof series;playlistId:string}[]) { const members=await pages(rule.playlistId,key,fetcher);for(const id of members){ids.add(id);membership.set(id,[...(membership.get(id)??[]),rule.seriesId]);} }
  const all=[...ids],authoritative:ApiItem[]=[];
  for(let i=0;i<all.length;i+=config.limits.videoBatchSize){const url=new URL('https://www.googleapis.com/youtube/v3/videos');for(const [k,v]of Object.entries({part:'snippet,contentDetails,status,liveStreamingDetails',id:all.slice(i,i+config.limits.videoBatchSize).join(',')}))url.searchParams.set(k,v);const data=await request(url,key,fetcher);if(!Array.isArray(data.items))throw new Error('Malformed videos response');authoritative.push(...data.items);}
  const records:ImportedVideo[]=[];
  for(const item of authoritative){const id=item.id;if(!id||(!uploadIds.includes(id)&&!authoredIds.includes(id)))continue;if(item.snippet?.channelId!==config.channelId||item.status?.privacyStatus!=='public')continue;
    if((item.liveStreamingDetails?.actualStartTime||item.liveStreamingDetails?.scheduledStartTime)&&!item.liveStreamingDetails.actualEndTime){reasons.push(`${id}: live stream not complete`);continue;}
    const duration=parseDuration(item.contentDetails?.duration),thumbnail=selectThumbnail(item);
    if(!duration){reasons.push(`${id}: duration missing or invalid`);continue;}if(!thumbnail){reasons.push(`${id}: approved thumbnail missing`);continue;}
    if(!item.snippet?.title||!item.snippet.publishedAt||!Number.isFinite(Date.parse(item.snippet.publishedAt)))throw new Error(`Malformed public video metadata for ${id}`);
    const memberships=[...new Set(membership.get(id))];
    const seriesId=memberships.length===1?series[memberships[0] as keyof typeof series]:null;
    records.push({youtubeId:id,channelId:config.channelId,title:item.snippet.title,thumbnailUrl:thumbnail,publishedAt:item.snippet.publishedAt,durationSeconds:duration,seriesId,embeddable:item.status?.embeddable===true});
  }
  // A playlist membership must never authorize a foreign-channel video.
  void now; return {videos:records,reasons};
}
function dueMaintenance(previous:YoutubeSnapshot,now:Date) {return previous.initialized&&(!previous.validatedAt||now.getTime()-Date.parse(previous.validatedAt)>=config.limits.refreshMaintenanceDays*86400000);}
export function candidateSnapshot(videos:ImportedVideo[],previous:YoutubeSnapshot,now=new Date(),allowMassRemovalReason?:string) {
  const next=makeSnapshot(videos,config.channelId,now),maintenanceDue=dueMaintenance(previous,now);
  const removed=previous.initialized?previous.videos.filter(v=>!next.videos.some(n=>n.youtubeId===v.youtubeId)).length:0;
  if(previous.initialized&&previous.videos.length>=4&&removed/previous.videos.length>config.limits.unexpectedRemovalFraction&&!allowMassRemovalReason?.trim())throw new Error(`Unexpected removal guard: ${removed}/${previous.videos.length} records disappeared; rerun with --allow-mass-removal and a reason after reviewing the authoritative result`);
  const changed=next.contentHash!==previous.contentHash||!previous.initialized||!!previous.purged;
  return {snapshot:next,maintenanceDue,changed,needsPublish:changed||maintenanceDue};
}
export async function writeAtomic(path:string,data:string) {await mkdir(dirname(path),{recursive:true});const tmp=`${path}.${process.pid}.tmp`;try{await writeFile(tmp,data,{flag:'wx'});await rename(tmp,path);}catch(error){await import('node:fs/promises').then(fs=>fs.rm(tmp,{force:true}));throw error;}}
async function main() {
  const args=process.argv.slice(2),value=(flag:string)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1]};const fixture=value('--fixture'),dry=args.includes('--dry-run'),maintenance=args.includes('--maintenance');
  if(args.some((a)=>a.startsWith('--')&&!['--fixture','--dry-run','--previous','--output','--maintenance','--allow-mass-removal'].includes(a)))throw new Error('Unknown option');
  if(maintenance&&fixture)throw new Error('--maintenance cannot be combined with --fixture');
  const key=process.env.YOUTUBE_API_KEY;if(!fixture&&!maintenance&&!key)throw new Error('YOUTUBE_API_KEY is required for live synchronization; no request or file write was made');
  const previousPath=value('--previous')??'.local/youtube-snapshot.json',outputPath=value('--output');let previous:YoutubeSnapshot;
  try{previous=validateSnapshot(await json(safePath(previousPath)),config.channelId);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'&&!value('--previous'))previous=emptySnapshot(config.channelId);else throw error;}
  const now=new Date();let videos:ImportedVideo[]=previous.videos,reasons:string[]=[];
  if(fixture){const data=await json(safePath(fixture));if(!Array.isArray(data.videos))throw new Error('Fixture must contain a videos array');videos=data.videos;reasons=data.reasons??[];}
  else if(!maintenance){const result=await fetchCycle(fetch,key!,now);videos=result.videos;reasons=result.reasons;}
  if(maintenance){const purged=purgeExpiredSnapshot(previous,now);if(purged!==previous){const result={snapshot:purged,changed:true,needsPublish:true,maintenanceDue:true,sourceValidatedAt:null,outcome:'expired metadata purged'};if(!dry)await writeAtomic(safePath(outputPath??'.local/youtube-snapshot.json'),JSON.stringify(result.snapshot,null,2));console.log(JSON.stringify({...result,reasons},null,2));return;}
    console.log(JSON.stringify({changed:false,needsPublish:false,maintenanceDue:false,sourceValidatedAt:previous.validatedAt,outcome:'maintenance check',videoCount:previous.videos.length,reasons},null,2));return;}
  const result=candidateSnapshot(videos,previous,now,value('--allow-mass-removal'));const semanticChanged=result.changed;
  if(!dry&&result.needsPublish&&(!fixture||outputPath))await writeAtomic(safePath(outputPath??'.local/youtube-snapshot.json'),JSON.stringify(result.snapshot,null,2));
  console.log(JSON.stringify({changed:semanticChanged,needsPublish:result.needsPublish,maintenanceDue:result.maintenanceDue,sourceValidatedAt:result.snapshot.validatedAt,outcome:fixture?'fixture simulation':'complete validated cycle',videoCount:result.snapshot.videos.length,massRemovalOverride:value('--allow-mass-removal')??null,reasons},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.dirname,'sync-youtube.ts'))main().catch(error=>{console.error(error.message);process.exitCode=1;});
