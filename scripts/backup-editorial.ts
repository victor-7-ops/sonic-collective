// Read-only backup of every editorial table, the login accounts (no passwords) and private image files into
// .local/backups/<timestamp>/. Needs SUPABASE_URL and SUPABASE_SECRET_KEY. Prints counts only, never contents.
// The folder is git-ignored and holds team emails: never store it unencrypted (see pack-backup.ts).
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {backupTables,exportBackup,verifyManifest,type BackupTable,type Row} from '../src/lib/editorial/backup';
import {authDigest,checkAuthCoverage,exportAuthUsers,referencedAccountIds} from '../src/lib/editorial/auth-backup';

const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
if(!url||!secret) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

// Stable paging needs a unique key per table.
const orderKey:Partial<Record<BackupTable,string>>={team_members:'user_id',editorial_invitations:'request_id'};
async function read(table:BackupTable):Promise<Row[]> {
  const rows:Row[]=[];
  for(let from=0;;from+=1000) {
    const page=await admin.from(table).select('*').order(orderKey[table]??'id',{ascending:true}).range(from,from+999);
    if(page.error) throw new Error(`Could not read ${table}: ${page.error.message}`);
    rows.push(...(page.data as Row[]));
    if(page.data.length<1000) break;
  }
  return rows;
}

const {data,manifest}=await exportBackup(read);
const problems=verifyManifest(data,manifest);
if(problems.length) throw new Error(`Backup failed its own manifest check: ${problems.join(' ')}`);

// Login accounts (no passwords: the API never exposes them). Every account the CMS refers to must be included.
const accounts=await exportAuthUsers(async(page,perPage)=>{
  const listed=await admin.auth.admin.listUsers({page,perPage});
  if(listed.error) throw new Error('Auth accounts could not be listed: '+listed.error.message);
  return {users:listed.data.users as never};
});
const coverage=checkAuthCoverage(accounts,referencedAccountIds(data));
if(coverage.length) throw new Error('Auth backup is incomplete: '+coverage.join(' '));

const stamp=manifest.createdAt.replace(/[:.]/g,'-');
const dir=resolve(process.cwd(),'.local/backups',stamp);
await mkdir(join(dir,'files'),{recursive:true});
for(const table of backupTables) await writeFile(join(dir,`${table}.json`),JSON.stringify(data[table]));

// Private image files: originals and derivatives, each checked against the recorded size/hash.
let files=0;
for(const asset of data.editorial_assets) {
  if(asset.status==='failed') continue;
  const id=String(asset.id);
  for(const [kind,path] of [['original',asset.original_path],['derivative',asset.derivative_path]] as const) {
    if(typeof path!=='string') continue;
    const download=await admin.storage.from('editorial-media').download(path);
    if(download.error||!download.data) {
      if(asset.status==='ready') throw new Error(`Image file ${kind} for asset ${id} could not be downloaded.`);
      continue;
    }
    const bytes=Buffer.from(await download.data.arrayBuffer());
    if(kind==='original'&&createHash('sha256').update(bytes).digest('hex')!==asset.sha256) throw new Error(`Image original for asset ${id} does not match its recorded hash.`);
    await mkdir(join(dir,'files',id),{recursive:true});
    await writeFile(join(dir,'files',id,kind),bytes);
    files++;
  }
}
await writeFile(join(dir,'auth_users.json'),JSON.stringify(accounts));
await writeFile(join(dir,'manifest.json'),JSON.stringify({...manifest,files,auth:{rows:accounts.length,sha256:authDigest(accounts)}}));
console.log(`Backup written to ${dir}`);
for(const table of backupTables) console.log(`  ${table}: ${manifest.tables[table].rows} rows`);
console.log(`  image files: ${files}`);
console.log(`  login accounts: ${accounts.length} (no passwords)`);
