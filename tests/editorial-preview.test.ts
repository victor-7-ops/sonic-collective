import {test} from 'node:test';
import assert from 'node:assert/strict';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import {loadPreviewArtistDrafts,previewCatalog} from '../src/lib/editorial/preview';

test('preview changes one saved record without mutating the published baseline',()=>{
  const artist=artists[0];
  const preview=previewCatalog('artist',artist.id,{...artist,name:'Private preview name'});
  assert.equal(preview.artists.find(row=>row.id===artist.id)?.name,'Private preview name');
  assert.equal(previewCatalog('artist',artist.id,artist).artists.find(row=>row.id===artist.id)?.name,artist.name);
});
test('preview includes a new artist profile without requiring a public appearance',()=>{
  const source=artists[0];
  const draft={...source,id:'private-preview-artist',name:'Private preview artist'};
  const preview=previewCatalog('artist',draft.id,draft);
  assert.equal(preview.artists.find(row=>row.id===draft.id)?.name,draft.name);
  assert.equal(artists.some(row=>row.id===draft.id),false);
});
test('preview includes an unapproved performance with its published artist dependencies',()=>{
  const published=performances[0];
  const draft={...published,approvedForSite:false};
  const preview=previewCatalog('performance',draft.id,draft);
  assert.equal(preview.performances.find(row=>row.id===draft.id)?.approvedForSite,false);
  for(const artistId of draft.artistIds) assert.ok(preview.artists.some(row=>row.id===artistId));
});
test('preview includes a new unapproved performance with an existing artist and media reference',()=>{
  const source=performances[0];
  const draft={...source,id:'private-preview-performance',youtubeId:'ZzPreview11',episode:undefined,approvedForSite:false,featuredOrder:999};
  const preview=previewCatalog('performance',draft.id,draft);
  assert.equal(preview.performances.find(row=>row.id===draft.id)?.approvedForSite,false);
  assert.deepEqual(preview.performances.find(row=>row.id===draft.id)?.artistIds,source.artistIds);
});
test('preview includes only explicitly supplied permitted artist drafts for new performance references',()=>{
  const source=performances[0];
  const artist={...artists[0],id:'private-draft-artist',name:'Private draft artist'};
  const performance={...source,id:'private-draft-performance',youtubeId:'Preview1234',artistIds:[artist.id],episode:undefined,approvedForSite:false,featuredOrder:999};
  assert.throws(()=>previewCatalog('performance',performance.id,performance),/unknown artist/);
  const preview=previewCatalog('performance',performance.id,performance,[{id:artist.id,payload:artist}]);
  assert.equal(preview.artists.find(row=>row.id===artist.id)?.name,artist.name);
  assert.deepEqual(preview.performances.find(row=>row.id===performance.id)?.artistIds,[artist.id]);
  assert.equal(artists.some(row=>row.id===artist.id),false);
});

test('preview dependency lookup is RLS-scoped, active-only, and binds draft revisions to their item',async()=>{
  const calls:unknown[]=[];
  const rows={
    content_items:[{id:'item-a',stable_id:'draft-a',draft_revision_id:'revision-a'},{id:'item-b',stable_id:'draft-b',draft_revision_id:'revision-b'}],
    content_revisions:[
      {id:'revision-a',item_id:'item-b',payload:{id:'wrong-item'}},
      {id:'revision-b',item_id:'item-b',payload:{id:'draft-b'}},
    ],
  };
  const client={from:(table:keyof typeof rows)=>{
    const query={select:(selection:string)=>{calls.push([table,'select',selection]);return query;},
      eq:(key:string,value:string)=>{calls.push([table,'eq',key,value]);return query;},
      is:(key:string,value:null)=>{calls.push([table,'is',key,value]);return query;},
      in:(key:string,values:string[])=>{calls.push([table,'in',key,values]);return query;},then:(resolve:(result:{data:unknown[];error:null})=>unknown)=>resolve({data:rows[table],error:null})};
    return query;
  }} as never;
  const result=await loadPreviewArtistDrafts(client,['draft-a','draft-b','draft-a']);
  assert.deepEqual(result.data,[{id:'draft-b',payload:{id:'draft-b'}}]);
  assert.equal(result.error,false);
  assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(['content_items','eq','kind','artist'])));
  assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(['content_items','is','archived_at',null])));
  assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(['content_items','in','stable_id',['draft-a','draft-b']])));
  assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(['content_revisions','in','item_id',['item-a','item-b']])));
});
test('preview rejects changed identity, broken references and unknown media',()=>{
  const performance=performances[0];
  assert.throws(()=>previewCatalog('performance',performance.id,{...performance,id:'different'}));
  assert.throws(()=>previewCatalog('performance',performance.id,{...performance,artistIds:['missing-artist']}));
  assert.throws(()=>previewCatalog('performance',performance.id,{...performance,thumbnail:'/media/missing'}));
  assert.throws(()=>previewCatalog('series','sessions',{}));
});
