import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEditorialPayload,requestedEditorialCreateKind,saveNewEditorialDraft} from '../src/lib/editorial/create';

const choices={artistIds:['existing-artist'],artistMedia:['/media/artists/portrait'],performanceMedia:['/media/performances/artwork'],youtubeIds:['abcdefghijk']};

test('artist creation keeps stable ID and does not invent biography or portrait',()=>{
  const payload=createEditorialPayload('artist',new URLSearchParams({id:'new-artist',name:'New Artist',artistKind:'solo'}),choices);
  if(!('name' in payload)) throw new Error('Expected artist payload');
  assert.equal(payload.id,'new-artist');
  assert.equal(payload.name,'New Artist');
  assert.equal('bio' in payload,false);
  assert.equal('portrait' in payload,false);
});

test('performance creation accepts only existing artist, media and video choices',()=>{
  const form=new URLSearchParams({id:'new-song',title:'New Song',artistId:'existing-artist',seriesId:'sessions',youtubeId:'abcdefghijk',thumbnail:'/media/performances/artwork',thumbnailAlt:'Cover art'});
  const payload=createEditorialPayload('performance',form,choices);
  if(!('artistIds' in payload)) throw new Error('Expected performance payload');
  assert.equal(payload.id,'new-song');
  assert.deepEqual(payload.artistIds,['existing-artist']);
  assert.equal(payload.approvedForSite,false);
  assert.equal('publishedAt' in payload,false);
  assert.equal('durationSeconds' in payload,false);
  for(const [key,value] of [['artistId','other'],['thumbnail','https://example.com/image.jpg'],['youtubeId','not-a-video']] as const) {
    const invalid=new URLSearchParams(form);invalid.set(key,value);
    assert.throws(()=>createEditorialPayload('performance',invalid,choices));
  }
});

test('creation rejects unstable IDs and unsupported content kinds',()=>{
  assert.throws(()=>createEditorialPayload('artist',new URLSearchParams({id:'bad/id',name:'Someone',artistKind:'solo'}),choices));
  assert.throws(()=>createEditorialPayload('series',new URLSearchParams({id:'new'}),choices));
});

test('new-content type links select only the supported create forms',()=>{
  assert.equal(requestedEditorialCreateKind('performance'),'performance');
  assert.equal(requestedEditorialCreateKind('artist'),'artist');
  assert.equal(requestedEditorialCreateKind('unknown'),'artist');
});

test('saving starts at expected version zero and resolves the revision UUID to its item UUID',async()=>{
  const calls:unknown[]=[];
  const fake={
    rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:'revision-id',error:null};},
    from:(table:string)=>({select:(columns:string)=>({eq:(column:string,value:string)=>({maybeSingle:async()=>{calls.push([table,columns,column,value]);return {data:{item_id:'item-id'},error:null};}})})}),
  };
  const itemId=await saveNewEditorialDraft(fake as never,'artist','new-artist',{id:'new-artist'});
  assert.equal(itemId,'item-id');
  assert.deepEqual(calls[0],['save_editorial_content',{p_kind:'artist',p_stable_id:'new-artist',p_payload:{id:'new-artist'},p_expected_version:0}]);
  assert.deepEqual(calls[1],['content_revisions','item_id','id','revision-id']);
});
