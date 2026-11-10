import type {SupabaseClient} from '@supabase/supabase-js';
import type {ImportedVideo} from '../youtube-import';
import type {Database} from './database.types';

export const inboxPageSize=50;
export const inboxFilters=['all','unreviewed','reviewed','excluded','authored'] as const;
export type InboxFilter=typeof inboxFilters[number];
export type ReviewRow={youtubeId:string;itemId:string;reviewState:string;payload:Record<string,unknown>};
export type InboxRow={
  video:ImportedVideo;status:Exclude<InboxFilter,'all'>;itemId?:string;reviewState?:string;
  format?:string;seriesId?:string|null;artistIds:string[];fullYoutubeId?:string;
};

export function inboxFilter(value:string|null):InboxFilter {
  return inboxFilters.find(filter=>filter===value)??'unreviewed';
}

/** API data stays read-only; a row only reflects human decisions stored in youtube-review records. */
export function buildInbox(videos:ImportedVideo[],reviews:ReviewRow[],authoredIds:ReadonlySet<string>):InboxRow[] {
  const byVideo=new Map(reviews.map(review=>[review.youtubeId,review]));
  return videos.map((video):InboxRow=>{
    const review=byVideo.get(video.youtubeId);
    const payload=review?.payload??{};
    const status=authoredIds.has(video.youtubeId)?'authored':payload.excluded===true?'excluded':review?'reviewed':'unreviewed';
    return {
      video,status,itemId:review?.itemId,reviewState:review?.reviewState,
      format:typeof payload.format==='string'?payload.format:undefined,
      seriesId:payload.seriesId===null?null:typeof payload.seriesId==='string'?payload.seriesId:undefined,
      artistIds:Array.isArray(payload.artistIds)?payload.artistIds.filter((id):id is string=>typeof id==='string'):[],
      fullYoutubeId:typeof payload.fullYoutubeId==='string'?payload.fullYoutubeId:undefined,
    };
  }).sort((a,b)=>Date.parse(b.video.publishedAt)-Date.parse(a.video.publishedAt)||(a.video.youtubeId<b.video.youtubeId?-1:1));
}

export function inboxPage(rows:InboxRow[],filter:InboxFilter,page:number) {
  const matching=filter==='all'?rows:rows.filter(row=>row.status===filter);
  const pages=Math.max(1,Math.ceil(matching.length/inboxPageSize));
  const current=Number.isSafeInteger(page)&&page>=1?Math.min(page,pages):1;
  return {rows:matching.slice((current-1)*inboxPageSize,current*inboxPageSize),total:matching.length,page:current,pages};
}

export function inboxCounts(rows:InboxRow[]) {
  const counts:Record<InboxFilter,number>={all:rows.length,unreviewed:0,reviewed:0,excluded:0,authored:0};
  for(const row of rows) counts[row.status]++;
  return counts;
}

/** Videos a Short may point to: authored performances and reviewed full-format videos. */
export function fullTargetIds(authoredIds:Iterable<string>,reviews:ReviewRow[]):string[] {
  return [...new Set([...authoredIds,...reviews.filter(review=>review.payload.format==='full').map(review=>review.youtubeId)])].sort();
}

/** A changed Short-to-full mapping must be a Short pointing at a different, known full video. */
export function checkFullMapping(youtubeId:string,payload:Record<string,unknown>,previous:Record<string,unknown>,allowed:readonly string[]) {
  const target=payload.fullYoutubeId;
  if(target===undefined||target===previous.fullYoutubeId) return;
  if(payload.format!=='short') throw new Error('Only a Short can link to a full performance. Set the video format to Short first.');
  if(typeof target!=='string'||target===youtubeId||!allowed.includes(target)) throw new Error('Choose a full performance from the available list.');
}

/** YouTube IDs of authored performances in their current drafts. */
export async function loadPerformanceVideoIds(client:SupabaseClient<Database>):Promise<string[]|null> {
  const items=await client.from('content_items').select('draft_revision_id').eq('kind','performance').is('archived_at',null).not('draft_revision_id','is',null);
  if(items.error) return null;
  const ids=items.data.flatMap(item=>item.draft_revision_id?[item.draft_revision_id]:[]);
  const found:string[]=[];
  for(let offset=0;offset<ids.length;offset+=100) {
    const result=await client.from('content_revisions').select('payload').in('id',ids.slice(offset,offset+100));
    if(result.error) return null;
    for(const row of result.data) {const id=(row.payload as {youtubeId?:unknown}).youtubeId;if(typeof id==='string') found.push(id);}
  }
  return found;
}

export async function loadReviewRows(client:SupabaseClient<Database>):Promise<ReviewRow[]|null> {
  const items:{id:string;stable_id:string;review_state:string;draft_revision_id:string|null}[]=[];
  for(let from=0;;from+=500) {
    const page=await client.from('content_items').select('id,stable_id,review_state,draft_revision_id').eq('kind','youtube-review').is('archived_at',null)
      .order('stable_id',{ascending:true}).range(from,from+499);
    if(page.error) return null;
    items.push(...page.data);
    if(page.data.length<500) break;
  }
  const revisionIds=items.flatMap(item=>item.draft_revision_id?[item.draft_revision_id]:[]);
  const payloads=new Map<string,Record<string,unknown>>();
  for(let offset=0;offset<revisionIds.length;offset+=100) {
    const result=await client.from('content_revisions').select('id,payload').in('id',revisionIds.slice(offset,offset+100));
    if(result.error) return null;
    for(const revision of result.data) payloads.set(revision.id,revision.payload as Record<string,unknown>);
  }
  return items.flatMap(item=>item.draft_revision_id&&payloads.has(item.draft_revision_id)
    ?[{youtubeId:item.stable_id,itemId:item.id,reviewState:item.review_state,payload:payloads.get(item.draft_revision_id)!}]:[]);
}
