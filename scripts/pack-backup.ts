// Packs a backup folder into ONE encrypted file that is safe to store somewhere public (the repository is public,
// so workflow artifacts are too). Refuses to run without a strong passphrase and proves it can decrypt its output.
// Usage: BACKUP_PASSPHRASE=... npx tsx scripts/pack-backup.ts [backup-folder]   (defaults to the newest backup)
import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join,relative,resolve,sep} from 'node:path';
import {bundleFiles,decryptBackup,encryptBackup,minPassphraseLength,unbundleFiles,type BackupFiles} from '../src/lib/editorial/backup-pack';

const passphrase=process.env.BACKUP_PASSPHRASE??'';
if(passphrase.length<minPassphraseLength()) throw new Error(`BACKUP_PASSPHRASE is required and must be at least ${minPassphraseLength()} characters. Nothing was written.`);

const base=resolve(process.cwd(),'.local/backups');
const folder=process.argv[2]?resolve(process.argv[2]):join(base,(await readdir(base)).filter(name=>!name.endsWith('.enc')).sort().at(-1)??'');
await stat(join(folder,'manifest.json'));

const files:BackupFiles={};
async function walk(dir:string) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if(entry.isDirectory()) await walk(path);
    else files[relative(folder,path).split(sep).join('/')]=(await readFile(path)).toString('base64');
  }
}
await walk(folder);

const plain=bundleFiles(files);
const packed=encryptBackup(plain,passphrase);
// Prove the file is recoverable before anyone relies on it.
const roundTrip=unbundleFiles(decryptBackup(packed,passphrase));
if(Object.keys(roundTrip).length!==Object.keys(files).length||roundTrip['manifest.json']!==files['manifest.json']) throw new Error('The encrypted backup failed its own round-trip check. Nothing was kept.');

const out=`${folder}.enc`;
await writeFile(out,packed);
console.log(`Encrypted backup written: ${out}`);
console.log(`  files inside: ${Object.keys(files).length}, size: ${(packed.length/1048576).toFixed(2)} MB (AES-256-GCM, passphrase not stored)`);
