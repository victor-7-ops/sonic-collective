// Production build entry. Without CMS_RELEASE_ID it is exactly `npm run build` (repository content).
// With CMS_RELEASE_ID it builds from that immutable release and fails closed: any doubt aborts the build,
// so the previously deployed site keeps serving.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {loadReleaseArtifact,requestedReleaseId} from '../src/lib/editorial/release-build';
import {materializeReleaseAssets} from './materialize-release-assets';
import {buildReleaseMarker} from '../src/lib/editorial/release-marker';
import type {Database} from '../src/lib/editorial/database.types';

const env:NodeJS.ProcessEnv={...process.env};
const releaseId=requestedReleaseId(env);
let catalog=null;
let marked:{releaseId:string;contentHash:string}|null=null;
if(releaseId) {
  const url=env.SUPABASE_URL,secret=env.SUPABASE_SECRET_KEY;
  if(!url||!secret) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required to build a CMS release.');
  const client=createClient<Database>(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const artifact=await loadReleaseArtifact(client,releaseId);
  const file=resolve(process.cwd(),'.local/release',`${releaseId}.json`);
  await mkdir(resolve(file,'..'),{recursive:true});
  await writeFile(file,JSON.stringify(artifact));
  env.CMS_RELEASE_FILE=file;
  catalog=artifact.catalog;
  marked={releaseId:artifact.releaseId,contentHash:artifact.contentHash};
  console.log(`Building CMS release ${releaseId} (content hash ${artifact.contentHash.slice(0,12)}).`);
}
const copied=await materializeReleaseAssets(catalog);
if(releaseId) console.log(`Release images copied: ${copied}.`);

// Public marker so the admin can verify which content is actually live.
await writeFile(resolve(process.cwd(),'public/release.json'),JSON.stringify(buildReleaseMarker(marked,env.VERCEL_GIT_COMMIT_SHA))+'\n');

const build=spawnSync('npm',['run','build'],{stdio:'inherit',env,shell:true});
process.exit(build.status??1);
