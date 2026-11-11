import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
import {requestedReleaseId} from './release-build';

export type LiveChoice={releaseId:string;setAt:string;setBy:string};

/** The release an owner last chose to make live, or null if none was ever chosen. Throws if it cannot be read. */
export async function latestLiveChoice(client:SupabaseClient<Database>):Promise<LiveChoice|null> {
  const result=await client.from('editorial_live_releases').select('release_id,set_at,set_by').order('id',{ascending:false}).limit(1);
  if(result.error) throw new Error('The chosen live release could not be read.');
  const row=result.data[0];
  return row?{releaseId:row.release_id,setAt:row.set_at,setBy:row.set_by}:null;
}

export type ResolvedRelease={id:string;source:'database'|'environment'}|null;

/**
 * Which release a production build uses: the owner's choice in the database wins; the CMS_RELEASE_ID
 * variable is only a fallback for before any choice exists; with neither, the build uses repository content.
 * Without database access (previews, CI) only the variable can apply.
 */
export async function resolveReleaseId(env:Record<string,string|undefined>,client:SupabaseClient<Database>|null):Promise<ResolvedRelease> {
  const fromEnv=requestedReleaseId(env);
  if(client) {
    const choice=await latestLiveChoice(client);
    if(choice) return {id:choice.releaseId,source:'database'};
  }
  return fromEnv?{id:fromEnv,source:'environment'}:null;
}
