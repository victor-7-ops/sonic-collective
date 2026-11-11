import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
import {editorialStatusLabels} from './content';
import {readLiveRelease,type LiveRelease} from './release-marker';

type ItemFacts={version:number;draft_revision_id:string|null;approved_revision_id:string|null;review_state:string};
export type LiveFact={state:'unknown'}|{state:'repository'}|{state:'release';revisionId:string|null;version:number|null};
export type ContentFacts={draft:string;review:string;approved:string;live:string;draftAhead:boolean};

/** Draft, review, approved and live are four separate facts about one record; never merge them into one badge. */
export function contentFacts(item:ItemFacts,approvedVersion:number|null,live:LiveFact):ContentFacts {
  const approvedHere=item.approved_revision_id!==null&&item.approved_revision_id===item.draft_revision_id;
  const approved=item.approved_revision_id===null?'Never approved'
    :approvedVersion===null?'An earlier revision'
    :approvedHere?`Revision ${approvedVersion} (same as the draft)`
    :`Revision ${approvedVersion}; the draft is ${Math.max(item.version-approvedVersion,1)} revision${item.version-approvedVersion>1?'s':''} ahead`;
  let liveText:string;
  if(live.state==='unknown') liveText='Unknown: the live site did not report which release it was built from';
  else if(live.state==='repository') liveText='Not controlled by the CMS: the live site is built from repository files';
  else if(live.revisionId===null) liveText='Not in the live release';
  else if(live.revisionId===item.approved_revision_id) liveText=`Revision ${live.version??approvedVersion??'?'} (the approved revision)`;
  else liveText=live.version!==null?`Revision ${live.version}, older than the approved revision`:'An older revision than the approved one';
  return {
    draft:`Revision ${item.version} (latest saved)`,
    review:editorialStatusLabels[item.review_state]??item.review_state,
    approved,live:liveText,draftAhead:item.approved_revision_id!==null&&!approvedHere,
  };
}

export async function loadContentFacts(client:SupabaseClient<Database>,item:ItemFacts&{kind:string;stable_id:string},origin:string,live?:LiveRelease):Promise<ContentFacts> {
  const marker=live??await readLiveRelease(origin);
  let liveFact:LiveFact={state:marker.state==='release'?'release':marker.state==='repository'?'repository':'unknown'} as LiveFact;
  let liveRevisionId:string|null=null,liveOk=marker.state!=='unknown';
  if(marker.state==='release') {
    const release=await client.from('editorial_releases').select('snapshot').eq('id',marker.marker.releaseId!).maybeSingle();
    const records=release.data?.snapshot;
    if(release.error||!Array.isArray(records)) {liveFact={state:'unknown'};liveOk=false;}
    else {
      const found=(records as {kind?:string;stableId?:string;revisionId?:string}[]).find(record=>record.kind===item.kind&&record.stableId===item.stable_id);
      liveRevisionId=found?.revisionId??null;
    }
  }
  const wanted=[...new Set([item.approved_revision_id,liveRevisionId].filter((id):id is string=>!!id))];
  const versions=new Map<string,number>();
  if(wanted.length) {
    const rows=await client.from('content_revisions').select('id,version').in('id',wanted);
    for(const row of rows.data??[]) versions.set(row.id,row.version);
  }
  if(marker.state==='release'&&liveOk) liveFact={state:'release',revisionId:liveRevisionId,version:liveRevisionId?versions.get(liveRevisionId)??null:null};
  return contentFacts(item,item.approved_revision_id?versions.get(item.approved_revision_id)??null:null,liveFact);
}
