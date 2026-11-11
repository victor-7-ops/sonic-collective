import {createCipheriv,createDecipheriv,randomBytes,scryptSync} from 'node:crypto';

// One encrypted file per backup: "SCB1" | salt(16) | iv(12) | auth tag(16) | AES-256-GCM ciphertext.
// The key is derived from a passphrase with scrypt, so the file is safe to store in a public place.
const magic=Buffer.from('SCB1');

export function minPassphraseLength() {return 20;}

function key(passphrase:string,salt:Buffer) {
  return scryptSync(passphrase,salt,32,{N:2**15,r:8,p:1,maxmem:128*1024*1024});
}

export function encryptBackup(plain:Buffer,passphrase:string):Buffer {
  if(passphrase.length<minPassphraseLength()) throw new Error(`The backup passphrase must be at least ${minPassphraseLength()} characters.`);
  const salt=randomBytes(16),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key(passphrase,salt),iv);
  const body=Buffer.concat([cipher.update(plain),cipher.final()]);
  return Buffer.concat([magic,salt,iv,cipher.getAuthTag(),body]);
}

export function decryptBackup(packed:Buffer,passphrase:string):Buffer {
  if(packed.length<magic.length+16+12+16||!packed.subarray(0,4).equals(magic)) throw new Error('This is not an encrypted Sonic Collective backup.');
  const salt=packed.subarray(4,20),iv=packed.subarray(20,32),tag=packed.subarray(32,48),body=packed.subarray(48);
  const decipher=createDecipheriv('aes-256-gcm',key(passphrase,salt),iv);
  decipher.setAuthTag(tag);
  try {return Buffer.concat([decipher.update(body),decipher.final()]);}
  catch {throw new Error('The backup could not be decrypted: wrong passphrase or damaged file.');}
}

export type BackupFiles=Record<string,string>; // relative path -> base64 contents

/** A whole backup folder as one JSON document (binary files as base64). */
export function bundleFiles(files:BackupFiles):Buffer {
  return Buffer.from(JSON.stringify({schemaVersion:1,files}));
}
export function unbundleFiles(bytes:Buffer):BackupFiles {
  const parsed=JSON.parse(bytes.toString('utf8')) as {schemaVersion?:number;files?:BackupFiles};
  if(parsed.schemaVersion!==1||!parsed.files||typeof parsed.files!=='object') throw new Error('Unsupported backup bundle.');
  for(const path of Object.keys(parsed.files)) if(path.startsWith('/')||path.split(/[\\/]/).includes('..')) throw new Error('The backup contains an unsafe file path.');
  return parsed.files;
}
