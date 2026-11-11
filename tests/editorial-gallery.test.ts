import {test} from 'node:test';
import assert from 'node:assert/strict';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import {artistSchema,performanceSchema,maxGalleryImages} from '../src/lib/schemas';
import {cmsAssetBase,cmsAssetIds} from '../src/lib/editorial/cms-assets';
import {diffRevisionPayload} from '../src/lib/editorial/revision-diff';
import {assembleContent} from '../src/lib/editorial/releases';
import {previewFromRecords,repositoryRecords} from '../src/lib/editorial/preview';
import {migratedScratchDb} from '../scripts/lib/scratch-db';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const image=(n:number)=>`/media/cms/${uuid(n)}`;
const item=(n:number,over:Record<string,unknown>={})=>({image:image(n),alt:`Photo ${n}`,...over});
const gallery=(count:number)=>Array.from({length:count},(_,i)=>item(i+1));

test('galleries hold at most 24 unique images, each with a description',()=>{
  const artist=artists[0]!;
  assert.equal(maxGalleryImages,24);
  assert.equal(artistSchema.safeParse({...artist,gallery:gallery(24)}).success,true);
  assert.equal(artistSchema.safeParse({...artist,gallery:gallery(25)}).success,false);
  assert.equal(artistSchema.safeParse({...artist,gallery:[]}).success,true);
  assert.equal(artistSchema.safeParse({...artist}).success,true);
  assert.equal(artistSchema.safeParse({...artist,gallery:[item(1),item(1,{alt:'Same image again'})]}).success,false);
  for(const bad of [{alt:''},{alt:'   '},{alt:'x'.repeat(301)},{caption:'x'.repeat(301)},{image:'https://example.com/a.jpg'},{image:'/media/../x'}])
    assert.equal(artistSchema.safeParse({...artist,gallery:[item(1,bad)]}).success,false,JSON.stringify(bad));
  assert.equal(artistSchema.safeParse({...artist,gallery:[item(1,{caption:'Backstage, 2026'})]}).success,true);
  const performance=performances[0]!;
  assert.equal(performanceSchema.safeParse({...performance,gallery:gallery(24)}).success,true);
  assert.equal(performanceSchema.safeParse({...performance,gallery:gallery(25)}).success,false);
});

test('every library image in a gallery is tracked, in artists and performances',()=>{
  const artist={...artists[0]!,portrait:image(1),gallery:[item(2),item(3),{image:'/media/artists/rena',alt:'Packaged'}]};
  const performance={...performances[0]!,thumbnail:'/media/performances/x',gallery:[item(4),item(2)]};
  assert.deepEqual(cmsAssetIds({artists:[artist],performances:[performance]} as never),[1,2,3,4].map(uuid));
});

test('releases and previews validate gallery references like any other image',()=>{
  const base=repositoryRecords().map((record,index)=>({...record,revisionId:uuid(index+1)}));
  const withGallery=(payload:object)=>base.map(record=>record.kind==='artist'&&record.stableId===artists[0]!.id?{...record,payload:{...(record.payload as object),...payload}}:record);
  const ok=assembleContent(withGallery({gallery:[item(7),{image:'/media/artists/rena',alt:'Packaged'}]}),true);
  assert.equal(ok.catalog.artists.find(artist=>artist.id===artists[0]!.id)!.gallery!.length,2);
  assert.deepEqual(cmsAssetIds(ok.catalog),[uuid(7)]);
  assert.throws(()=>assembleContent(withGallery({gallery:[{image:'/media/missing-thing',alt:'Missing'}]}),true),/gallery\[0\]: missing or invalid media manifest entry/);
  const preview=previewFromRecords(base,'artist',artists[0]!.id,{...artists[0]!,gallery:[item(8)]});
  assert.equal(preview.catalog.artists.find(artist=>artist.id===artists[0]!.id)!.gallery![0]!.image,image(8));
});

test('history shows gallery changes in words, not raw data',()=>{
  const before={id:'a',name:'A',gallery:[item(1)]};
  const after={id:'a',name:'A',gallery:[item(1),item(2,{alt:'Backstage'})]};
  const [change]=diffRevisionPayload(after,before);
  assert.equal(change!.field,'Gallery');
  assert.match(change!.after,/Photo 1 \(\/media\/cms\//);assert.match(change!.after,/Backstage \(\/media\/cms\//);
  assert.doesNotMatch(change!.after,/\{"/);
});

test('the database rejects gallery references to another member\'s image, for contributors',async t=>{
  const [owner,alice,bob]=[91,92,93].map(uuid);
  const db=await migratedScratchDb([owner,alice,bob]);
  t.after(()=>db.close());
  for(const [id,role] of [[owner,'owner'],[alice,'contributor'],[bob,'contributor']]) await db.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);
  const ready=async(ownerId:string)=>{
    const row=await db.query<{id:string}>("insert into public.editorial_assets(owner_id,status,sha256,original_bytes,original_width,original_height,width,height,alt_text) values($1,'pending',$2,100,10,10,10,10,'Image') returning id",[ownerId,'a'.repeat(64)]);
    await db.query("update public.editorial_assets set status='ready',ready_at=now() where id=$1",[row.rows[0]!.id]);return row.rows[0]!.id;
  };
  const mine=await ready(alice),theirs=await ready(bob);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[alice,JSON.stringify({sub:alice,aal:'aal1'})]);
  await db.exec('set role authenticated');
  const save=(stable:string,images:string[])=>db.query('select public.save_editorial_content($1,$2,$3,$4)',['artist',stable,
    {id:stable,name:stable,aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[],gallery:images.map(id=>({image:cmsAssetBase(id),alt:'Alt'}))},0]);
  await save('own-gallery',[mine]);
  await assert.rejects(save('mixed-gallery',[mine,theirs]),/belongs to another team member/);
});

test('library images get a small grid copy and a full-size copy in the media manifest',async()=>{
  const {cmsManifestEntry,cmsThumbFile,cmsAssetFile,withCmsAssets}=await import('../src/lib/editorial/cms-assets');
  const id=uuid(55);
  const both=cmsManifestEntry({id,width:2400,height:1600,thumbWidth:800,thumbHeight:533});
  assert.deepEqual(both.variants.map(variant=>[variant.src,variant.width]),[[cmsThumbFile(id),800],[cmsAssetFile(id),2400]]);
  // Small originals and release-time placeholders keep a single variant.
  assert.equal(cmsManifestEntry({id,width:600,height:400,thumbWidth:600,thumbHeight:400}).variants.length,1);
  assert.equal(cmsManifestEntry({id,width:1,height:1}).variants.length,1);
  assert.equal((withCmsAssets({},[{id,width:2400,height:1600,thumbWidth:800,thumbHeight:533}])[cmsAssetBase(id)] as {variants:unknown[]}).variants.length,2);
});
