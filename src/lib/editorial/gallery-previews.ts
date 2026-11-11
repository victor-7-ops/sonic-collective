import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
import {cmsAssetId} from './cms-assets';
import {siteMediaManifest} from '../site-media';

/**
 * Small preview URLs for the images in a gallery, for the editor only. Packaged images use their public
 * file; private library images get short-lived signed links (the server credential is used only after the
 * member's own access to the asset has been confirmed through row-level security).
 */
export async function galleryThumbnails(
  client:SupabaseClient<Database>,admin:SupabaseClient<Database>|null,images:string[],
):Promise<Map<string,string>> {
  const result=new Map<string,string>();
  const libraryIds=new Map<string,string>();
  for(const image of images) {
    const id=cmsAssetId(image);
    if(id) {libraryIds.set(id,image);continue;}
    const entry=(siteMediaManifest as Record<string,{variants:{src:string}[]}|undefined>)[image];
    const src=entry?.variants[0]?.src;
    if(src) result.set(image,src);
  }
  if(libraryIds.size&&admin) {
    const rows=await client.from('editorial_assets').select('id,derivative_path').in('id',[...libraryIds.keys()]).eq('status','ready');
    const paths=(rows.data??[]).flatMap(row=>row.derivative_path?[{id:row.id,path:row.derivative_path}]:[]);
    if(paths.length) {
      const signed=await admin.storage.from('editorial-media').createSignedUrls(paths.map(item=>item.path),300);
      for(const [index,entry] of (signed.data??[]).entries()) {
        const owner=paths[index];
        if(owner&&entry.signedUrl) result.set(libraryIds.get(owner.id)!,entry.signedUrl);
      }
    }
  }
  return result;
}
