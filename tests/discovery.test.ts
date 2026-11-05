import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogItems, parseCatalogQuery } from '../src/lib/search.js';
import { hashVideos, makeSnapshot, importedVideoSchema, validateSnapshot } from '../src/lib/youtube-import.js';

const item=(id:string,source:'curated'|'youtube',publishedAt:string|undefined,searchText=id,seriesId:'sessions'|'covers'|null=null,featuredOrder?:number)=>({id,source,title:id,searchText,publishedAt,seriesId,featuredOrder,artistIds:[],youtubeId:'AbCdEfGhIjK',href:'/sessions/a/',image:{kind:'local' as const,base:'/x',alt:'x'},embeddable:true});
test('catalog searches actual upload titles and keeps series filters explicit',()=>{
  const items=[item('cover-a','curated','2026-01-01','japanese anime singer','covers',1),item('raw-title','youtube','2026-02-01','Yoru ni Kakeru YOASOBI','sessions')];
  assert.deepEqual(filterCatalogItems(items,parseCatalogQuery('?q=yoasobi')).map(v=>v.id),['raw-title']);
  assert.deepEqual(filterCatalogItems(items,parseCatalogQuery('?series=covers')).map(v=>v.id),['cover-a']);
});
test('featured stays curated-first, newest sorts dates first, and undated rows stay last',()=>{
  const items=[item('import-new','youtube','2026-03-01'),item('curated-late','curated','2026-01-01','x',null,2),item('curated-first','curated',undefined,'x',null,1),item('import-old','youtube','2026-02-01')];
  assert.deepEqual(filterCatalogItems(items,parseCatalogQuery('')).map(v=>v.id),['curated-first','curated-late','import-new','import-old']);
  assert.deepEqual(filterCatalogItems(items,parseCatalogQuery('?sort=newest')).map(v=>v.id),['import-new','import-old','curated-late','curated-first']);
});
test('snapshot hash ignores freshness timestamps and strict thumbnail host validation rejects arbitrary URLs',()=>{
  const video={youtubeId:'AbCdEfGhIjK',channelId:'channel',title:'Song',thumbnailUrl:'https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg',publishedAt:'2026-11-01T00:00:00Z',durationSeconds:60,seriesId:null,embeddable:true};
  const a=makeSnapshot([video],'channel',new Date('2026-11-01T00:00:00Z')),b=makeSnapshot([video],'channel',new Date('2026-11-02T00:00:00Z'));
  assert.equal(a.contentHash,b.contentHash);assert.equal(hashVideos([video]),a.contentHash);assert.equal(importedVideoSchema.safeParse({...video,thumbnailUrl:'https://example.com/a.jpg'}).success,false);
});
test('snapshot validation rejects duplicate video IDs even with a matching hash',()=>{
  const video={youtubeId:'AbCdEfGhIjK',channelId:'channel',title:'Song',thumbnailUrl:'https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg',publishedAt:'2026-11-01T00:00:00Z',durationSeconds:60,seriesId:null,embeddable:true};
  const snapshot=makeSnapshot([video],'channel');snapshot.videos.push(video);snapshot.contentHash=hashVideos(snapshot.videos);
  assert.throws(()=>validateSnapshot(snapshot),/duplicate YouTube IDs/);
});

test('format filters combine with search, preserve unknown uploads, and reject unknown query values',()=>{
  const items=[
    {...item('full','youtube',undefined,'Rena song'),format:'full' as const},
    {...item('short','youtube',undefined,'Rena excerpt'),format:'short' as const},
    item('unknown','youtube',undefined,'New upload'),
  ];
  assert.deepEqual(filterCatalogItems(items,parseCatalogQuery('format=short&q=rena')).map(item=>item.id),['short']);
  assert.deepEqual(filterCatalogItems(items,parseCatalogQuery('format=full')).map(item=>item.id),['full']);
  assert.deepEqual(filterCatalogItems(items,parseCatalogQuery('format=unreviewed')).map(item=>item.id),['unknown']);
  assert.equal(filterCatalogItems(items,parseCatalogQuery('format=invalid')).length,3);
});

test('reviewed format metadata rejects guessed enum values and malformed video IDs',async()=>{
  const {youtubeOverridesSchema}=await import('../src/lib/merge-catalog.js');
  assert.equal(youtubeOverridesSchema.safeParse([{youtubeId:'AbCdEfGhIjK',format:'short',artistIds:['rena']}]).success,true);
  assert.equal(youtubeOverridesSchema.safeParse([{youtubeId:'AbCdEfGhIjK',format:'maybe-short'}]).success,false);
  assert.equal(youtubeOverridesSchema.safeParse([{youtubeId:'bad',format:'full'}]).success,false);
});

test('reviewed Short links point to full videos and preserve known artist IDs',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {youtubeOverridesSchema}=await import('../src/lib/merge-catalog.js');
  const rows=youtubeOverridesSchema.parse(JSON.parse(await readFile(new URL('../src/data/youtube-overrides.json',import.meta.url),'utf8')));
  const artists=JSON.parse(await readFile(new URL('../src/data/artists.json',import.meta.url),'utf8')) as {id:string}[];
  assert.equal(new Set(rows.map(item=>item.youtubeId)).size,rows.length);
  for(const item of rows) {
    for(const id of item.artistIds??[]) assert.ok(artists.some(artist=>artist.id===id));
    if(item.fullYoutubeId) {
      assert.equal(item.format,'short');
      assert.equal(rows.find(target=>target.youtubeId===item.fullYoutubeId)?.format,'full');
      assert.notEqual(item.fullYoutubeId,item.youtubeId);
    }
  }
});
