import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import overrides from '../data/youtube-overrides.json';
import { getRawCatalog } from './catalog';
import { mergeCatalog } from './merge-catalog';
import { performanceUrl } from './urls';
import { makeSnapshot, validateSnapshot, type YoutubeSnapshot } from './youtube-import';
import type { Artist } from './schemas';

export type CatalogItem = {
  id:string;source:'curated'|'youtube';title:string;artistLabel?:string;artistIds:string[];searchText:string;
  seriesId:'sessions'|'covers'|null;youtubeId:string;href:string;publishedAt?:string;
  image:{kind:'local';base:string;alt:string}|{kind:'youtube';url:string;alt:string};embeddable:boolean;featuredOrder?:number;
};
export async function getYoutubeSnapshot():Promise<YoutubeSnapshot> {
  try {const source=await readFile(resolve(process.cwd(),'.local/youtube-snapshot.json'),'utf8');return validateSnapshot(JSON.parse(source),'UCCxO94rfXnMpYf7DH_sd6Bw');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return validateSnapshot(JSON.parse(await readFile(resolve(process.cwd(),'src/data/youtube-snapshot.json'),'utf8')),'UCCxO94rfXnMpYf7DH_sd6Bw');throw error;}
}
export async function getDiscoveryCatalog() {
  const raw=await getRawCatalog(),snapshot=await getYoutubeSnapshot();
  const approved=raw.performances.filter((item)=>item.approvedForSite);
  const merged=mergeCatalog(raw.performances,snapshot,overrides);
  const uploadDates = new Map(merged.videos.map((video) => [video.youtubeId, video.publishedAt]));
  const availability=merged.availabilityByYoutubeId as Record<string,'available'|'external-only'|'unavailable'|'unverified'>;
  const artists=raw.artists.filter((artist)=>approved.some((item)=>availability[item.youtubeId]!=='unavailable'&&item.artistIds.includes(artist.id)));
  const curated:CatalogItem[]=approved.filter((item)=>availability[item.youtubeId]!=='unavailable').map((item)=>{
    const names=item.artistIds.map((id)=>raw.artists.find((artist)=>artist.id===id)).filter((artist):artist is Artist=>!!artist).map((artist)=>artist.name);
    return {id:item.id,source:'curated',title:item.title,artistLabel:names.join(' & '),artistIds:item.artistIds,searchText:[item.title,item.originalTitle??'',...item.aliases,...names,...item.artistIds.flatMap((id)=>raw.artists.find((a)=>a.id===id)?.aliases??[])].join(' '),seriesId:item.seriesId,youtubeId:item.youtubeId,href:performanceUrl(item.id),publishedAt:item.publishedAt??uploadDates.get(item.youtubeId),image:{kind:'local',base:item.thumbnail,alt:item.thumbnailAlt},embeddable:availability[item.youtubeId]!=='external-only',featuredOrder:item.featuredOrder};
  });
  const known=new Set(approved.map((item)=>item.youtubeId));
  const imported:CatalogItem[]=merged.videos.filter((video)=>!known.has(video.youtubeId)).map((video)=>({id:`yt-${video.youtubeId}`,source:'youtube',title:video.title,artistIds:[],searchText:video.title,seriesId:video.seriesId,youtubeId:video.youtubeId,href:`/watch/${video.youtubeId}/`,publishedAt:video.publishedAt,image:{kind:'youtube',url:video.thumbnailUrl,alt:`Thumbnail for ${video.title}`},embeddable:video.embeddable}));
  const availableIds=new Set(approved.filter((item)=>availability[item.youtubeId]!=='unavailable').map((item)=>item.id));
  return {raw,site:raw.site,performances:approved,artists,clips:raw.clips.filter((clip)=>clip.approvedForSite&&availableIds.has(clip.performanceId)),availability,catalogItems:[...curated,...imported],snapshot,imported};
}
export async function getPlaybackRecords() {
  const catalog=await getDiscoveryCatalog();
  const authored=catalog.performances.map((item)=>({id:item.id,title:item.title,youtubeId:item.youtubeId,embeddable:catalog.availability[item.youtubeId]!=='unavailable'&&catalog.availability[item.youtubeId]!=='external-only'}));
  const imported=catalog.imported.map((item)=>({id:item.id,title:item.title,youtubeId:item.youtubeId,embeddable:item.embeddable}));
  return [...authored,...imported];
}
export function feedSnapshot(snapshot:YoutubeSnapshot,now=new Date()):YoutubeSnapshot {
  if(snapshot.purged)return snapshot;
  if(!snapshot.initialized||!snapshot.expiresAt||Date.parse(snapshot.expiresAt)>now.getTime())return snapshot;
  const purged=makeSnapshot([] ,snapshot.channelId,now);purged.purged={at:now.toISOString(),reason:'expired'};return purged;
}
