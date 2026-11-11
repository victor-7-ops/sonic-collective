import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';

/** What the editor typed, made safe for a filter: bounded, no filter-syntax characters, wildcards escaped. */
export function searchTerm(raw:string):string {
  return raw.trim().slice(0,80).replace(/[,()"]/g,' ').replace(/\s+/g,' ').trim().replace(/[\\%_]/g,'\\$&');
}

/** Revisions whose artist name or performance title contains the term (newest data wins when combined with item filters). */
export async function matchingRevisionIds(client:SupabaseClient<Database>,term:string):Promise<string[]|null> {
  if(!term) return [];
  const found=await client.from('content_revisions').select('id')
    .or(`payload->>name.ilike.*${term}*,payload->>title.ilike.*${term}*`).limit(300);
  return found.error?null:(found.data??[]).map(row=>row.id);
}

/**
 * Items match by stable ID, or because their current draft or approved revision has a matching name or title.
 * If the revision lookup failed, fall back to the stable ID alone rather than showing nothing.
 */
export function itemSearchFilter(term:string,revisionIds:string[]|null):string {
  const parts=[`stable_id.ilike.*${term}*`];
  if(revisionIds?.length) {
    const list=revisionIds.join(',');
    parts.push(`draft_revision_id.in.(${list})`,`approved_revision_id.in.(${list})`);
  }
  return parts.join(',');
}
