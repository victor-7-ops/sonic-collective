// Proves a backup is restorable: loads it into a scratch database built from the real migrations, then checks that
// the restored data is identical, internally consistent, and still able to produce a valid release.
// Usage: npx tsx scripts/restore-rehearsal.ts [backup-folder]   (defaults to the newest in .local/backups)
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {backupTables,checkIntegrity,exportBackup,restoreBackup,verifyManifest,type BackupData,type BackupManifest} from '../src/lib/editorial/backup';
import {loadApprovedReleaseRecords,type ApprovedSnapshotReader} from '../src/lib/editorial/release-server';
import {assembleContent,buildReleaseArtifact} from '../src/lib/editorial/releases';
import {migratedScratchDb} from './lib/scratch-db';
import {authDigest,checkAuthCoverage,referencedAccountIds,restoreAuthUsers,type AuthUser} from '../src/lib/editorial/auth-backup';

const base=resolve(process.cwd(),'.local/backups');
const folder=process.argv[2]?resolve(process.argv[2]):join(base,(await readdir(base)).sort().at(-1)??'');
const manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8')) as BackupManifest;
const data={} as BackupData;
for(const table of backupTables) data[table]=JSON.parse(await readFile(join(folder,`${table}.json`),'utf8'));

const failures:string[]=[];
const step=(name:string,problems:string[])=>{console.log(`${problems.length?'FAIL':'ok  '}  ${name}${problems.length?`\n        ${problems.join('\n        ')}`:''}`);failures.push(...problems);};

step('backup files match their manifest',verifyManifest(data,manifest));

const authProblems:string[]=[];
try {
  const accounts=JSON.parse(await readFile(join(folder,'auth_users.json'),'utf8')) as AuthUser[];
  const expected=(manifest as unknown as {auth?:{rows:number;sha256:string}}).auth;
  if(!expected) authProblems.push('The manifest has no login-account section.');
  else if(accounts.length!==expected.rows||authDigest(accounts)!==expected.sha256) authProblems.push('Login accounts do not match the manifest.');
  authProblems.push(...checkAuthCoverage(accounts,referencedAccountIds(data)));
  const plan=await restoreAuthUsers({auth:{admin:{createUser:async()=>({error:null})}}},accounts,{dryRun:true});
  console.log(`      ${plan.created.length} login account(s) would be recreated with their original IDs (dry run)`);
} catch(error) {authProblems.push('Login-account backup is unreadable: '+(error instanceof Error?error.message:String(error)));}
step('login accounts are present and cover every account the CMS refers to',authProblems);
const db=await migratedScratchDb();
await restoreBackup(db,data);
// to_jsonb keeps timestamp microseconds exactly as the hosted API reports them (a JS Date would round them).
const again=await exportBackup(table=>db.query<{r:Record<string,unknown>}>(`select to_jsonb(t) r from public.${table} t`).then(result=>result.rows.map(row=>row.r)));
step('restored tables are identical to the backup',backupTables.flatMap(table=>again.manifest.tables[table].sha256===manifest.tables[table].sha256?[]:[`${table} differs after restore`]));
step('restored data is internally consistent',await checkIntegrity(db));

const problems:string[]=[];
try {
  const reader:ApprovedSnapshotReader={
    async items(from,to) {
      const result=await db.query<{id:string;kind:string;stable_id:string;approved_revision_id:string|null}>('select id,kind,stable_id,approved_revision_id from public.content_items where archived_at is null and approved_revision_id is not null order by kind,stable_id offset $1 limit $2',[from,to-from+1]);
      return {data:result.rows,error:null};
    },
    async revisions(ids) {
      const result=await db.query<{id:string;item_id:string;payload:unknown}>('select id,item_id,payload from public.content_revisions where id = any($1::uuid[])',[ids]);
      return {data:result.rows,error:null};
    },
  };
  const approved=await loadApprovedReleaseRecords(reader);
  const assembled=assembleContent(approved.records,true);
  console.log(`      restored copy assembles ${assembled.catalog.artists.length} artists, ${assembled.catalog.performances.length} performances`);
} catch(error) {problems.push(`approved content does not assemble: ${error instanceof Error?error.message:String(error)}`);}
step('restored approved content still produces a valid release',problems);

const releaseProblems:string[]=[];
for(const release of data.editorial_releases) {
  try {buildReleaseArtifact(String(release.id),release.snapshot);}
  catch(error) {releaseProblems.push(`release ${release.id}: ${error instanceof Error?error.message:String(error)}`);}
}
step(`all ${data.editorial_releases.length} saved release snapshots still validate`,releaseProblems);

console.log(failures.length?`\nRESTORE REHEARSAL FAILED (${failures.length} problems)`:'\nRESTORE REHEARSAL PASSED');
process.exit(failures.length?1:0);
