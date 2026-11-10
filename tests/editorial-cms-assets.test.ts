import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cmsAssetBase,cmsAssetFile,cmsAssetId,cmsAssetIds,cmsManifestEntry,withCmsAssets} from '../src/lib/editorial/cms-assets';
import {buildReleaseArtifact} from '../src/lib/editorial/releases';
import {previewCatalog} from '../src/lib/editorial/preview';
import {requireReadyCmsAssets} from '../src/lib/editorial/release-server';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import clips from '../src/data/clips.json';
import series from '../src/data/series.json';
import site from '../src/data/site.json';
import overrides from '../src/data/youtube-overrides.json';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function baselineRecords() {
  let revision=0;
  const records:{kind:string;stableId:string;revisionId:string;payload:unknown}[]=[];
  for(const [kind,items] of Object.entries({artist:artists,performance:performances,clip:clips,series})) for(const payload of items) records.push({kind,stableId:payload.id,revisionId:uuid(++revision),payload});
  records.push({kind:'site',stableId:'site',revisionId:uuid(++revision),payload:site});
  for(const payload of overrides) records.push({kind:'youtube-review',stableId:payload.youtubeId,revisionId:uuid(++revision),payload});
  return records;
}
const id='3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';

test('only exact media-library paths resolve to asset IDs',()=>{
  assert.equal(cmsAssetId(cmsAssetBase(id)),id);
  for(const bad of [`${cmsAssetBase(id)}.webp`,`/media/cms/${id}/x`,'/media/cms/../x','/media/artists/rena','https://example.com/x',`/media/cms/${id.toUpperCase()}`])
    assert.equal(cmsAssetId(bad),null,bad);
});

test('manifest entry points at the materialized derivative',()=>{
  const entry=cmsManifestEntry({id,width:2400,height:1200});
  assert.equal(entry.aspectRatio,2);
  assert.equal(entry.variants[0]!.src,cmsAssetFile(id));
  assert.equal(withCmsAssets({},[{id,width:1,height:1}])[cmsAssetBase(id)]!==undefined,true);
});

test('release artifact accepts library artwork and rejects malformed references',()=>{
  const records=baselineRecords();
  const withPortrait=records.map(record=>record.kind==='artist'&&record.stableId===artists[0]!.id?{...record,payload:{...(record.payload as object),portrait:cmsAssetBase(id),portraitAlt:'Library portrait'}}:record);
  const artifact=buildReleaseArtifact(uuid(902),withPortrait);
  assert.deepEqual(cmsAssetIds(artifact.catalog),[id]);
  assert.equal(artifact.catalog.artists.find(artist=>artist.id===artists[0]!.id)!.portrait,cmsAssetBase(id));
  assert.notEqual(artifact.contentHash,buildReleaseArtifact(uuid(902),records).contentHash);
  const broken=records.map(record=>record.kind==='artist'&&record.stableId===artists[0]!.id?{...record,payload:{...(record.payload as object),portrait:'/media/cms/not-a-uuid',portraitAlt:'x'}}:record);
  assert.throws(()=>buildReleaseArtifact(uuid(903),broken),/media manifest/);
});

test('preview validates library image references',()=>{
  const artist={...structuredClone(artists[0]!),portrait:cmsAssetBase(id),portraitAlt:'Library portrait'};
  const catalog=previewCatalog('artist',artist.id,artist);
  assert.equal(catalog.artists.find(item=>item.id===artist.id)!.portrait,cmsAssetBase(id));
  const broken={...artist,portrait:'/media/cms/not-a-uuid'};
  assert.throws(()=>previewCatalog('artist',artist.id,broken));
});

test('release preparation rejects references to images that are not ready',async()=>{
  const client=(rows:{id:string;derivative_path?:string|null;width?:number|null;height?:number|null}[]|null,error:unknown=null)=>({from:()=>({select:()=>({eq:()=>({in:async()=>({data:rows,error})})})})}) as never;
  const complete={id,derivative_path:'a/b.webp',width:10,height:5};
  await requireReadyCmsAssets(client([complete]),[id]);
  await assert.rejects(()=>requireReadyCmsAssets(client([{...complete,derivative_path:null}]),[id]),/not ready/);
  await assert.rejects(()=>requireReadyCmsAssets(client([{...complete,width:0}]),[id]),/not ready/);
  await requireReadyCmsAssets(client(null),[]);
  await assert.rejects(()=>requireReadyCmsAssets(client([]),[id]),/not ready/);
  await assert.rejects(()=>requireReadyCmsAssets(client(null,new Error('x')),[id]),/could not be verified/);
});

