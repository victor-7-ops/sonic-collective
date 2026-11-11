import type {EditorialKind} from './content';
import {cmsAssetBase} from './cms-assets';
import {artistSchema,performanceSchema} from '../schemas';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Json} from './database.types';

type CreateChoices={artistIds:string[];performanceMedia:string[];artistMedia:string[];youtubeIds:string[]};

export function requestedEditorialCreateKind(value:string|null) {
  return value==='performance'?'performance':'artist';
}

export function createEditorialPayload(kind:string,form:URLSearchParams,choices:CreateChoices) {
  if(kind!=='artist'&&kind!=='performance') throw new Error('Choose an artist or performance.');
  const id=form.get('id')?.trim()??'';
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('Use a stable ID with letters, numbers, hyphens, or underscores.');
  if(kind==='artist') {
    const portrait=form.get('portrait')?.trim()??'';
    if(portrait&&!choices.artistMedia.includes(portrait)) throw new Error('Choose an available artist image.');
    const portraitAlt=form.get('portraitAlt')?.trim()??'';
    if(portrait&&!portraitAlt) throw new Error('Describe the selected portrait.');
    const payload={id,name:form.get('name')?.trim()??'',aliases:[],kind:form.get('artistKind')??'',...(portrait?{portrait,portraitAlt}:{}),focalPoint:'50% 50%',portraitLayout:'portrait',links:[]};
    return artistSchema.parse(payload);
  } else {
    const artistId=form.get('artistId')??'';
    const thumbnail=form.get('thumbnail')??'';
    const youtubeId=form.get('youtubeId')??'';
    if(!choices.artistIds.includes(artistId)) throw new Error('Choose an available artist.');
    if(!choices.performanceMedia.includes(thumbnail)) throw new Error('Choose available performance artwork.');
    if(!choices.youtubeIds.includes(youtubeId)) throw new Error('Choose a video from the validated catalog.');
    const payload={id,title:form.get('title')?.trim()??'',aliases:[],artistIds:[artistId],seriesId:form.get('seriesId')??'',youtubeId,thumbnail,thumbnailAlt:form.get('thumbnailAlt')?.trim()??'',featuredOrder:0,approvedForSite:false};
    return performanceSchema.parse(payload);
  }
}

/** `/media/cms/<id>` choices for ready media-library images the signed-in member may read. */
export async function readyLibraryChoices(client:SupabaseClient<Database>):Promise<{path:string;label:string}[]> {
  const result=await client.from('editorial_assets').select('id,alt_text').eq('status','ready').order('created_at',{ascending:false}).limit(50);
  return result.error?[]:(result.data??[]).map(row=>({path:cmsAssetBase(row.id),label:`Library image: ${row.alt_text.slice(0,60)}`}));
}
export async function readyLibraryPaths(client:SupabaseClient<Database>):Promise<string[]> {
  return (await readyLibraryChoices(client)).map(choice=>choice.path);
}

export async function saveNewEditorialDraft(client:SupabaseClient<Database>,kind:EditorialKind,id:string,payload:Json) {
  const saved=await client.rpc('save_editorial_content',{p_kind:kind,p_stable_id:id,p_payload:payload,p_expected_version:0});
  if(saved.error) throw new Error(['23505','40001'].includes(saved.error.code??'')?'That stable ID already exists or changed. Choose another ID.':'The draft could not be created. Check your access and try again.');
  const revision=await client.from('content_revisions').select('item_id').eq('id',saved.data).maybeSingle();
  if(revision.error||!revision.data) throw new Error('The draft was saved, but its content page could not be opened. Return to the library and reload.');
  return revision.data.item_id;
}
