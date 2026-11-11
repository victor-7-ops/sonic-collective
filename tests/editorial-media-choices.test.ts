import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyArtworkChoice,mediaChoicesFrom} from '../src/lib/editorial/media-choices';
import {applyEditorialForm} from '../src/lib/editorial/forms';
import {applyContentAction} from '../src/lib/editorial/actions';
import {cmsAssetBase} from '../src/lib/editorial/cms-assets';

const library=cmsAssetBase('3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b');
const choices=mediaChoicesFrom(['/media/artists/rena','/media/artists/blair','/media/performances/usseewa','/media/clips/x'],[library]);
const run=(kind:'artist'|'performance',current:Record<string,unknown>,fields:Record<string,string>,allowed=choices)=>{
  const payload={...current};applyArtworkChoice(kind,payload,current,new URLSearchParams(fields),allowed);return payload;
};

test('choices are packaged images of the right kind plus library images',()=>{
  assert.deepEqual(choices.artistMedia,['/media/artists/rena','/media/artists/blair',library]);
  assert.deepEqual(choices.performanceMedia,['/media/performances/usseewa',library]);
});

test('a portrait can be changed to an offered image, kept, or removed with its description',()=>{
  const artist={portrait:'/media/artists/rena',portraitAlt:'Rena on stage'};
  assert.equal(run('artist',artist,{portrait:'/media/artists/blair'}).portrait,'/media/artists/blair');
  assert.equal(run('artist',artist,{portrait:library}).portrait,library);
  assert.deepEqual(run('artist',artist,{portrait:'/media/artists/rena'}),artist);
  const removed=run('artist',artist,{portrait:''});
  assert.equal('portrait' in removed,false);assert.equal('portraitAlt' in removed,false);
  assert.deepEqual(run('artist',artist,{}),artist);
});

test('anything not offered is refused, and a portrait needs its description',()=>{
  const artist={portrait:'/media/artists/rena',portraitAlt:'Alt'};
  for(const bad of ['/media/performances/usseewa','https://example.com/x.jpg','/media/artists/missing','/media/cms/not-a-uuid','/media/artists/../x']) assert.throws(()=>run('artist',artist,{portrait:bad}),/available images/,bad);
  assert.throws(()=>run('artist',{},{portrait:'/media/artists/blair'}),/Describe the selected portrait/);
  assert.throws(()=>run('artist',{portraitAlt:'  '},{portrait:'/media/artists/blair'}),/Describe the selected portrait/);
  // No choices supplied at all: nothing new can be picked.
  assert.throws(()=>applyArtworkChoice('artist',{...artist},artist,new URLSearchParams({portrait:'/media/artists/blair'})),/available images/);
});

test('performance artwork is required and limited to performance images',()=>{
  const perf={thumbnail:'/media/performances/usseewa'};
  assert.equal(run('performance',perf,{thumbnail:library}).thumbnail,library);
  assert.throws(()=>run('performance',perf,{thumbnail:''}),/artwork is required/);
  assert.throws(()=>run('performance',perf,{thumbnail:'/media/artists/rena'}),/available images/);
  // A record that already points at an older, no-longer-offered image stays editable.
  const legacy={thumbnail:'/media/performances/retired'};
  assert.deepEqual(run('performance',legacy,{thumbnail:'/media/performances/retired'}),legacy);
});

test('the editor form applies the choice and leaves other kinds alone',()=>{
  const current={id:'a',name:'A',kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',portrait:'/media/artists/rena',portraitAlt:'Alt'};
  const form=new URLSearchParams({name:'A',kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',portraitAlt:'New alt',portrait:'/media/artists/blair'});
  const next=applyEditorialForm('artist',current,form,choices);
  assert.equal(next.portrait,'/media/artists/blair');assert.equal(next.portraitAlt,'New alt');
  assert.throws(()=>applyEditorialForm('artist',current,new URLSearchParams({...Object.fromEntries(form),portrait:'/media/artists/nope'}),choices),/available images/);
  assert.doesNotThrow(()=>applyEditorialForm('series',{id:'s',title:'T',description:'D'},new URLSearchParams({title:'T',description:'D',portrait:'/anything'}),choices));
});

test('saving refuses an unavailable image before reaching the database',async()=>{
  const calls:string[]=[];
  const client={rpc:async(name:string)=>{calls.push(name);return {data:'rev',error:null};}} as never;
  const item={id:'11111111-1111-4111-8111-111111111111',stable_id:'a',archived_at:null,version:1} as never;
  const current={id:'a',name:'A',aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[],portrait:'/media/artists/rena',portraitAlt:'Alt'};
  const form=(portrait:string)=>new URLSearchParams({action:'save',version:'1',name:'A',kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',portraitAlt:'Alt',portrait});
  const bad=await applyContentAction(client,item,'artist',current,form('/media/artists/nope'),{media:choices});
  assert.ok('message' in bad);assert.match(bad.message,/available images/);assert.deepEqual(calls,[]);
  assert.ok('redirect' in await applyContentAction(client,item,'artist',current,form(library),{media:choices}));
  assert.deepEqual(calls,['save_editorial_content']);
});

test('a refused save returns what was typed so the editor can restore it, without internal fields',async()=>{
  const {submittedValues}=await import('../src/lib/editorial/actions');
  assert.deepEqual(submittedValues(new URLSearchParams([['action','save'],['version','3'],['revision','r'],['requestId','q'],['name','Typed name'],['gallery.0.alt','Alt'],['artistIds','a'],['artistIds','b']])),
    [['name','Typed name'],['gallery.0.alt','Alt'],['artistIds','a'],['artistIds','b']]);
  const client={rpc:async()=>({data:'rev',error:null})} as never;
  const item={id:'11111111-1111-4111-8111-111111111111',stable_id:'a',archived_at:null,version:1} as never;
  const current={id:'a',name:'A',aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[]};
  const bad=await applyContentAction(client,item,'artist',current,new URLSearchParams({action:'save',version:'1',name:'My new name',kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',portrait:'/media/artists/nope'}),{media:choices});
  assert.ok('message' in bad);
  assert.ok(bad.submitted.some(([key,value])=>key==='name'&&value==='My new name'));
  assert.equal(bad.submitted.some(([key])=>key==='version'),false);
  // Only the editor form is restored: a refused review action returns nothing to restore.
  const review=await applyContentAction(client,item,'artist',current,new URLSearchParams({action:'request-changes',revision:'22222222-2222-4222-8222-222222222222',comment:''}));
  assert.ok('message' in review);assert.deepEqual(review.submitted,[]);
});
