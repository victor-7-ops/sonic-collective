import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
import {buildReleaseArtifact,parseReleaseArtifact,type ReleaseArtifact} from './releases';

const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

/** CMS_RELEASE_ID selects the immutable release to build; CMS_RELEASE_FILE is the separate local-file path. */
export function requestedReleaseId(env:Record<string,string|undefined>):string|null {
  const id=env.CMS_RELEASE_ID?.trim();
  if(!id) return null;
  if(!uuid.test(id)) throw new Error('CMS_RELEASE_ID must be a release UUID.');
  if(env.CMS_RELEASE_FILE!==undefined) throw new Error('Set CMS_RELEASE_ID or CMS_RELEASE_FILE, not both.');
  return id;
}

/** Loads one stored release and proves it is a valid, hash-consistent artifact. Throws on any doubt. */
export async function loadReleaseArtifact(client:SupabaseClient<Database>,id:string):Promise<ReleaseArtifact> {
  const stored=await client.from('editorial_releases').select('id,snapshot').eq('id',id).maybeSingle();
  if(stored.error) throw new Error(`Release ${id} could not be read.`);
  if(!stored.data) throw new Error(`Release ${id} does not exist.`);
  const artifact=buildReleaseArtifact(stored.data.id,stored.data.snapshot);
  return parseReleaseArtifact(JSON.parse(JSON.stringify(artifact)));
}
