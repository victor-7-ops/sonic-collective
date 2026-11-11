// Production build entry. Without CMS_RELEASE_ID it is exactly `npm run build` (repository content).
// With CMS_RELEASE_ID it builds from that immutable release and fails closed: any doubt aborts the build,
// so the previously deployed site keeps serving.
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {loadReleaseArtifact} from '../src/lib/editorial/release-build';
import {resolveReleaseId} from '../src/lib/editorial/live-release';
import {materializeReleaseAssets} from './materialize-release-assets';
import {buildReleaseMarker} from '../src/lib/editorial/release-marker';
import type {Database} from '../src/lib/editorial/database.types';

const env:NodeJS.ProcessEnv={...process.env};
const url=env.SUPABASE_URL,secret=env.SUPABASE_SECRET_KEY;
const client=url&&secret?createClient<Database>(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null;
const resolved=await resolveReleaseId(env,client);
const releaseId=resolved?.id??null;
let catalog=null;
let marked:{releaseId:string;contentHash:string}|null=null;
if(releaseId) {
  if(!client) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required to build a CMS release.');
  const artifact=await loadReleaseArtifact(client,releaseId);
  const file=resolve(process.cwd(),'.local/release',`${releaseId}.json`);
  await mkdir(resolve(file,'..'),{recursive:true});
  await writeFile(file,JSON.stringify(artifact));
  env.CMS_RELEASE_FILE=file;
  catalog=artifact.catalog;
  marked={releaseId:artifact.releaseId,contentHash:artifact.contentHash};
  console.log(`Building CMS release ${releaseId} chosen via ${resolved!.source} (content hash ${artifact.contentHash.slice(0,12)}).`);
}
const copied=await materializeReleaseAssets(catalog);
if(releaseId) console.log(`Release images copied: ${copied}.`);

// Public marker so the admin can verify which content is actually live.
const marker=resolve(process.cwd(),'public/release.json');
await writeFile(marker,JSON.stringify(buildReleaseMarker(marked,env.VERCEL_GIT_COMMIT_SHA))+'\n');

// npm is a .cmd shim on Windows and needs a shell there; elsewhere run it directly so the secret never passes through one.
const build=spawnSync('npm',['run','build'],{stdio:'inherit',env,shell:process.platform==='win32'});
// A failed build must not leave a marker claiming content that never went live.
if(build.status!==0) await rm(marker,{force:true});
process.exit(build.status??1);
