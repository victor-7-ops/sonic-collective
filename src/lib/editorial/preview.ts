import artists from '../../data/artists.json';
import performances from '../../data/performances.json';
import clips from '../../data/clips.json';
import series from '../../data/series.json';
import site from '../../data/site.json';
import manifest from '../../data/media-manifest.json';
import { catalogSchema,artistSchema,performanceSchema } from '../schemas';
import { validateCatalog } from '../validate-catalog';
import { parseEditorialPayload, type EditorialKind } from './content';
import { cmsAssetFile, cmsAssetIds, withCmsAssets } from './cms-assets';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';

const published=catalogSchema.parse({artists,performances,clips,series,site});
// shortcut: previews accept existing packaged media only, until validated uploads are implemented.
const assets=new Set([
  ...Object.values(manifest).flatMap(entry=>entry.variants.map(variant=>variant.src)),
  ...published.clips.flatMap(clip=>[clip.src,clip.poster]),
  published.site.hero.portraitPoster,published.site.hero.portraitLoopSrc,
]);

function replaceOrAppend<T extends {id:string}>(records:T[],record:T) {
  const index=records.findIndex(item=>item.id===record.id);
  if(index<0) records.push(record); else records[index]=record;
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

export function previewCatalog(kind:EditorialKind,id:string,input:unknown,artistDrafts:{id:string;payload:unknown}[] = []) {
  if(!['artist','performance','site'].includes(kind)) throw new Error('This content type does not have a page preview yet.');
  const payload=parseEditorialPayload(kind,id,input);
  const raw=structuredClone(published);
  if(kind==='site') raw.site=payload as typeof raw.site;
  else if(kind==='artist') replaceOrAppend(raw.artists,artistSchema.parse(payload));
  else {
    for(const dependency of artistDrafts)replaceOrAppend(raw.artists,artistSchema.parse(parseEditorialPayload('artist',dependency.id,dependency.payload)));
    replaceOrAppend(raw.performances,performanceSchema.parse(payload));
  }
  // Library images are private until a release; previews validate their references but cannot render them publicly.
  const cmsIds=cmsAssetIds(raw);
  const result=validateCatalog(raw,withCmsAssets(manifest,cmsIds.map(id=>({id,width:1,height:1}))),path=>assets.has(path)||cmsIds.some(id=>cmsAssetFile(id)===path),false);
  if(!result.ok) throw new Error(result.errors.join('; '));
  return result.catalog!;
}
