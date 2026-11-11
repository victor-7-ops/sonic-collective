// Read-only backup of every editorial table, plus private image files, into .local/backups/<timestamp>/.
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY. Prints counts only, never row contents. The folder is git-ignored
// and holds team and invitation data: store copies somewhere private. Supabase Auth accounts are NOT included.
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {backupTables,exportBackup,verifyManifest,type BackupTable,type Row} from '../src/lib/editorial/backup';

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
await writeFile(join(dir,'manifest.json'),JSON.stringify({...manifest,files}));
console.log(`Backup written to ${dir}`);
for(const table of backupTables) console.log(`  ${table}: ${manifest.tables[table].rows} rows`);
console.log(`  image files: ${files}`);
