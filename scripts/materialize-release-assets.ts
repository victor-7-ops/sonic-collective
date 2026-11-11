// Copies the ready, validated image derivatives that a release references into public/media/cms
// and records their sizes for the media manifest. Used by build-with-release.ts and runnable alone
// (`npm run cms:materialize`) when CMS_RELEASE_FILE is set.
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {parseReleaseArtifact} from '../src/lib/editorial/releases';
import {cmsAssetIds} from '../src/lib/editorial/cms-assets';
import type {Catalog} from '../src/lib/schemas';
import type {Database} from '../src/lib/editorial/database.types';

export async function materializeReleaseAssets(catalog:Catalog|null,root=process.cwd()):Promise<number> {
  const publicDir=resolve(root,'public/media/cms'),dataDir=resolve(root,'src/data/cms-media');
  await rm(publicDir,{recursive:true,force:true});await rm(dataDir,{recursive:true,force:true});
  const ids=catalog?cmsAssetIds(catalog):[];
  if(!ids.length) return 0;

  const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required to materialize release images.');
  const admin=createClient<Database>(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  await mkdir(publicDir,{recursive:true});await mkdir(dataDir,{recursive:true});

  const rows=await admin.from('editorial_assets').select('id,status,width,height,derivative_path').in('id',ids);
  if(rows.error) throw new Error('Release image records could not be read.');
  for(const id of ids) {
    const row=rows.data?.find(candidate=>candidate.id===id);
    if(!row||row.status!=='ready'||!row.derivative_path||!row.width||!row.height) throw new Error(`Release image ${id} is not a ready asset.`);
    const download=await admin.storage.from('editorial-media').download(row.derivative_path);
    if(download.error||!download.data) throw new Error(`Release image ${id} could not be downloaded.`);
    const bytes=Buffer.from(await download.data.arrayBuffer());
    const meta=await sharp(bytes,{limitInputPixels:25_000_000,failOn:'error'}).metadata();
    if(meta.format!=='webp'||meta.width!==row.width||meta.height!==row.height) throw new Error(`Release image ${id} does not match its validated record.`);
    await writeFile(join(publicDir,`${id}.webp`),bytes);
    await writeFile(join(dataDir,`${id}.json`),JSON.stringify({id,width:row.width,height:row.height})+'\n');
  }
  return ids.length;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const file=process.env.CMS_RELEASE_FILE;
  const catalog=file?parseReleaseArtifact(JSON.parse(await readFile(file,'utf8'))).catalog:null;
  const count=await materializeReleaseAssets(catalog);
  console.log(file?`Materialized ${count} release image${count===1?'':'s'}.`:'No CMS_RELEASE_FILE; cleared release images.');
}
