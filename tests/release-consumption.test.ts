import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import clips from '../src/data/clips.json';
import series from '../src/data/series.json';
import site from '../src/data/site.json';
import overrides from '../src/data/youtube-overrides.json';
import snapshot from '../src/data/youtube-snapshot.json';
import {buildReleaseArtifact,parseReleaseArtifact} from '../src/lib/editorial/releases';
import {readBuildInputs} from '../scripts/lib/build-inputs.mjs';
import {validateSnapshot} from '../src/lib/youtube-import';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`:JSON.stringify(value);
function releaseFixture(){
  let index=0;
  const records:{kind:string;stableId:string;revisionId:string;payload:unknown}[]=[];
  for(const [kind,items] of Object.entries({artist:artists,performance:performances,clip:clips,series})) for(const payload of items) records.push({kind,stableId:payload.id,revisionId:uuid(++index),payload});
  records.push({kind:'site',stableId:'site',revisionId:uuid(++index),payload:site});
  for(const payload of overrides) records.push({kind:'youtube-review',stableId:payload.youtubeId,revisionId:uuid(++index),payload});
  const changedArtist=records.find(record=>record.kind==='artist'&&record.stableId===artists[0].id);
  assert.ok(changedArtist);
  changedArtist.payload={...artists[0],name:'Release fixture artist'};
  return buildReleaseArtifact(uuid(900),records);
}

test('shared build inputs preserve repository defaults and load configured release plus the same API snapshot',async()=>{
  const root=process.cwd();
  const expectedSnapshot=await readFile(resolve(root,'.local/youtube-snapshot.json'),'utf8')
    .then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return snapshot;throw error;});
  const baseline=await readBuildInputs(root,{});
  assert.deepEqual(baseline.catalog,{artists,performances,clips,series,site});
  assert.deepEqual(baseline.youtubeOverrides,overrides);
  assert.deepEqual(baseline.snapshot,expectedSnapshot);
  const directory=await mkdtemp(join(tmpdir(),'sonic-release-'));
  try {
    const artifact=releaseFixture(),file=join(directory,'release.json');
    await writeFile(file,JSON.stringify(artifact));
    const configured=await readBuildInputs(root,{CMS_RELEASE_FILE:file});
    assert.deepEqual(configured.catalog,artifact.catalog);
    assert.deepEqual(configured.youtubeOverrides,artifact.youtubeOverrides);
    assert.deepEqual(configured.snapshot,expectedSnapshot);
    assert.deepEqual(parseReleaseArtifact(configured.release),artifact);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('configured release fails closed on malformed, tampered, or graph-invalid artifacts',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'sonic-release-invalid-'));
  try {
    const file=join(directory,'release.json'),artifact=releaseFixture();
    await writeFile(file,JSON.stringify({...artifact,contentHash:'0'.repeat(64)}));
    await assert.rejects(readBuildInputs(process.cwd(),{CMS_RELEASE_FILE:file}),/content hash/);
    await writeFile(file,JSON.stringify({...artifact,schemaVersion:2}));
    await assert.rejects(readBuildInputs(process.cwd(),{CMS_RELEASE_FILE:file}),/unsupported or malformed/);
    const broken=structuredClone(artifact);
    broken.catalog.site.hero.performanceId='missing-performance';
    const {contentHash:_,...body}=broken;
    broken.contentHash=createHash('sha256').update(canonical(body)).digest('hex');
    await writeFile(file,JSON.stringify(broken));
    await assert.rejects(readBuildInputs(process.cwd(),{CMS_RELEASE_FILE:file}),/Invalid release catalog/);
    assert.throws(()=>parseReleaseArtifact(broken),/Invalid release catalog/);
    await assert.rejects(readBuildInputs(process.cwd(),{CMS_RELEASE_FILE:'relative/release.json'}),/absolute artifact file/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('configured public catalog and discovery use artifact content and overrides',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'sonic-release-runtime-'));
  const previous=process.env.CMS_RELEASE_FILE;
  try {
    const artifact=releaseFixture(),file=join(directory,'release.json');
    await writeFile(file,JSON.stringify(artifact));
    process.env.CMS_RELEASE_FILE=file;
    const {getRawCatalog}=await import('../src/lib/catalog');
    const {getDiscoveryCatalog}=await import('../src/lib/discovery');
    const raw=await getRawCatalog();
    assert.deepEqual(raw,artifact.catalog);
    const discovery=await getDiscoveryCatalog({raw:artifact.catalog,snapshot:validateSnapshot(snapshot),overrides:artifact.youtubeOverrides});
    assert.equal(discovery.site,artifact.catalog.site);
    assert.ok(discovery.artists.length>0);
  } finally {
    if(previous===undefined) delete process.env.CMS_RELEASE_FILE; else process.env.CMS_RELEASE_FILE=previous;
    await rm(directory,{recursive:true,force:true});
  }
});
