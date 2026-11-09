import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';

function canonical(value) {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  if(value===null||typeof value==='string'||typeof value==='boolean') return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value)) return JSON.stringify(value);
  throw new Error('Release artifact contains a non-JSON value.');
}

const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');

export function verifyReleaseArtifactEnvelope(input) {
  if(!exactKeys(input,['schemaVersion','releaseId','revisionMap','catalog','youtubeOverrides','contentHash'])||input.schemaVersion!==1||!uuid.test(input.releaseId)||!Array.isArray(input.revisionMap)||!Array.isArray(input.youtubeOverrides)||!/^[a-f\d]{64}$/.test(input.contentHash)) throw new Error('Release artifact has an unsupported or malformed envelope.');
  if(!exactKeys(input.catalog,['artists','performances','clips','series','site'])||!['artists','performances','clips','series'].every(key=>Array.isArray(input.catalog[key]))||!input.catalog.site||typeof input.catalog.site!=='object') throw new Error('Release artifact catalog is malformed.');
  const seen=new Set();
  for(const entry of input.revisionMap) {
    if(!exactKeys(entry,['kind','stableId','revisionId'])||typeof entry.kind!=='string'||typeof entry.stableId!=='string'||!uuid.test(entry.revisionId)) throw new Error('Release artifact revision map is malformed.');
    const key=`${entry.kind}:${entry.stableId}`;
    if(seen.has(key)) throw new Error('Release artifact revision map contains duplicates.');
    seen.add(key);
  }
  const {contentHash,...body}=input;
  const actual=createHash('sha256').update(canonical(body)).digest('hex');
  if(actual!==contentHash) throw new Error('Release artifact content hash does not match.');
  return input;
}

export async function readConfiguredRelease(env=process.env) {
  const file=env.CMS_RELEASE_FILE;
  if(file===undefined) return null;
  if(!file.trim()||!isAbsolute(file)) throw new Error('CMS_RELEASE_FILE must name an absolute artifact file.');
  const input=JSON.parse(await readFile(file,'utf8'));
  return verifyReleaseArtifactEnvelope(input);
}
