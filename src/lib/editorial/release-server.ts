import type {EditorialKind} from './content';
import type {ApprovedReleaseRecord} from './releases';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
import {buildReleaseArtifact} from './releases';

export type ApprovedItemRow={id:string;kind:string;stable_id:string;approved_revision_id:string|null};
export type ApprovedRevisionMapEntry={kind:EditorialKind;stableId:string;revisionId:string};
type QueryResult<T>={data:T[]|null;error:unknown|null};
export type ApprovedSnapshotReader={
  items(from:number,to:number):Promise<QueryResult<ApprovedItemRow>>;
  revisions(ids:string[]):Promise<QueryResult<{id:string;item_id:string;payload:unknown}>>;
};

const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;

export async function loadApprovedReleaseRecords(reader:ApprovedSnapshotReader):Promise<{records:ApprovedReleaseRecord[];expectedMap:ApprovedRevisionMapEntry[]}> {
  const items:ApprovedItemRow[]=[];
  for(let from=0;;from+=500) {
    const result=await reader.items(from,from+499);
    if(result.error) throw new Error('Approved content could not be loaded.');
    const page=result.data??[];
    items.push(...page);
    if(page.length<500) break;
  }
  const itemIds=new Set<string>();
  for(const item of items) {
    if(itemIds.has(item.id)) throw new Error('Approved content changed during snapshot collection. Reload and try again.');
    itemIds.add(item.id);
    if(!item.approved_revision_id) throw new Error('An approved record is missing its saved revision. Reload and try again.');
  }
  const revisions=new Map<string,{item_id:string;payload:unknown}>();
  const revisionIds=items.map(item=>item.approved_revision_id!);
  for(let offset=0;offset<revisionIds.length;offset+=100) {
    const result=await reader.revisions(revisionIds.slice(offset,offset+100));
    if(result.error) throw new Error('Approved revisions could not be loaded.');
    for(const revision of result.data??[]) {
      if(revisions.has(revision.id)) throw new Error('A saved revision was returned more than once. Reload and try again.');
      revisions.set(revision.id,{item_id:revision.item_id,payload:revision.payload});
    }
  }
  const ordered=[...items].sort((a,b)=>compare(a.kind,b.kind)||compare(a.stable_id,b.stable_id));
  const records:ApprovedReleaseRecord[]=ordered.map(item=>{
    const revision=revisions.get(item.approved_revision_id!);
    if(!revision||revision.item_id!==item.id) throw new Error('An approved saved revision is unavailable. Reload and try again.');
    return {kind:item.kind as EditorialKind,stableId:item.stable_id,revisionId:item.approved_revision_id!,payload:revision.payload};
  });
  const expectedMap=records.map(({kind,stableId,revisionId})=>({kind,stableId,revisionId}));
  return {records,expectedMap};
}

export async function prepareEditorialRelease(client:SupabaseClient<Database>,requestId:string):Promise<string> {
  const snapshot=await loadApprovedReleaseRecords({
    async items(from,to) {
      const result=await client.from('content_items').select('id,kind,stable_id,approved_revision_id')
        .is('archived_at',null).not('approved_revision_id','is',null)
        .order('kind',{ascending:true}).order('stable_id',{ascending:true}).range(from,to);
      return {data:result.data,error:result.error};
    },
    async revisions(ids) {
      const result=await client.from('content_revisions').select('id,item_id,payload').in('id',ids);
      return {data:result.data,error:result.error};
    },
  });
  buildReleaseArtifact('00000000-0000-4000-8000-000000000000',snapshot.records);
  const created=await client.rpc('create_editorial_release',{p_request_id:requestId,p_expected_map:snapshot.expectedMap});
  if(created.error||!created.data) {
    if(created.error?.code==='40001') throw new Error('Approved content changed while preparing the release. Reload and try again.');
    throw new Error('The release snapshot could not be prepared. Verify editor access and MFA, then try again.');
  }
  const stored=await client.from('editorial_releases').select('id,snapshot').eq('id',created.data).maybeSingle();
  if(stored.error||!stored.data) throw new Error('The immutable release snapshot could not be loaded.');
  buildReleaseArtifact(stored.data.id,stored.data.snapshot);
  return stored.data.id;
}
