// Decrypts an encrypted backup into a new, empty folder so it can be inspected or used by the restore rehearsal.
// Usage: BACKUP_PASSPHRASE=... npx tsx scripts/unpack-backup.ts <file.enc> <empty-output-folder>
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {decryptBackup,unbundleFiles} from '../src/lib/editorial/backup-pack';

const [input,output]=process.argv.slice(2);
if(!input||!output) throw new Error('Usage: unpack-backup.ts <file.enc> <empty-output-folder>');
const passphrase=process.env.BACKUP_PASSPHRASE??'';
if(!passphrase) throw new Error('BACKUP_PASSPHRASE is required.');
const target=resolve(output);
await mkdir(target,{recursive:true});
if((await readdir(target)).length) throw new Error('The output folder must be empty.');

const files=unbundleFiles(decryptBackup(await readFile(resolve(input)),passphrase));
for(const [path,base64] of Object.entries(files)) {
  const destination=join(target,path);
  const within=relative(target,destination);
  if(!within||within.startsWith('..')||isAbsolute(within)) throw new Error('The backup contains an unsafe file path.');
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,Buffer.from(base64,'base64'));
}
console.log(`Unpacked ${Object.keys(files).length} files into ${target}. Run: npx tsx scripts/restore-rehearsal.ts "${target}"`);
