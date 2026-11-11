import artists from '../../data/artists.json';
import performances from '../../data/performances.json';
import clips from '../../data/clips.json';
import series from '../../data/series.json';
import site from '../../data/site.json';
import overrides from '../../data/youtube-overrides.json';
import { parseEditorialPayload, type EditorialKind } from './content';
import { assembleContent, type ApprovedReleaseRecord } from './releases';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';

const placeholderRevision='00000000-0000-4000-8000-000000000000';

/** Repository content as records; the base for previews only when no CMS-approved base is supplied (tests). */
export function repositoryRecords():ApprovedReleaseRecord[] {
  const records:ApprovedReleaseRecord[]=[];
  for(const [kind,items] of Object.entries({artist:artists,performance:performances,clip:clips,series}) as [EditorialKind,{id:string}[]][])
    for(const payload of items) records.push({kind,stableId:payload.id,revisionId:placeholderRevision,payload});
  records.push({kind:'site',stableId:'site',revisionId:placeholderRevision,payload:site});
  for(const payload of overrides) records.push({kind:'youtube-review',stableId:payload.youtubeId,revisionId:placeholderRevision,payload});
  return records;
}

export async function loadPreviewArtistDrafts(client:SupabaseClient<Database>,stableIds:string[]) {
  const ids=[...new Set(stableIds)];
  if(!ids.length)return {data:[],error:false};
  const items=await client.from('content_items').select('id,stable_id,draft_revision_id').eq('kind','artist').is('archived_at',null).in('stable_id',ids);
  if(items.error)return {data:[],error:true};
  const targets=(items.data??[]).filter(item=>item.draft_revision_id);
  if(!targets.length)return {data:[],error:false};
  const revisions=await client.from('content_revisions').select('id,item_id,payload')
    .in('item_id',targets.map(item=>item.id)).in('id',targets.map(item=>item.draft_revision_id!));
  if(revisions.error)return {data:[],error:true};
  const byItem=new Map(targets.map(item=>[item.id,item]));
  return {data:(revisions.data??[]).flatMap(revision=>{
    const item=byItem.get(revision.item_id);
    return item?.draft_revision_id===revision.id?[{id:item.stable_id,payload:revision.payload}]:[];
  }),error:false};
}

/**
 * Assembles a preview exactly as a release is assembled (same validator), from the approved records
 * with the selected revision, and any permitted artist drafts, laid over them.
 */
export function previewFromRecords(base:ApprovedReleaseRecord[],kind:EditorialKind,id:string,input:unknown,artistDrafts:{id:string;payload:unknown}[] = []) {
  if(!['artist','performance','site'].includes(kind)) throw new Error('This content type does not have a page preview yet.');
  const payload=parseEditorialPayload(kind,id,input);
  const records=base.map(record=>({...record}));
  const put=(recordKind:EditorialKind,stableId:string,recordPayload:unknown)=>{
    const record={kind:recordKind,stableId,revisionId:placeholderRevision,payload:recordPayload};
    const index=records.findIndex(candidate=>candidate.kind===recordKind&&candidate.stableId===stableId);
    if(index<0) records.push(record); else records[index]=record;
  };
  if(kind==='performance') for(const dependency of artistDrafts) put('artist',dependency.id,parseEditorialPayload('artist',dependency.id,dependency.payload));
  put(kind,id,payload);
  return assembleContent(records,false);
}

export function previewCatalog(kind:EditorialKind,id:string,input:unknown,artistDrafts:{id:string;payload:unknown}[] = []) {
  return previewFromRecords(repositoryRecords(),kind,id,input,artistDrafts).catalog;
}
