import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Tables} from '../src/lib/editorial/database.types';
import {applyContentAction} from '../src/lib/editorial/actions';
import {applyEditorialForm,editorialPickerOptions} from '../src/lib/editorial/forms';
import {catalog} from './fixtures';

const artist=catalog().artists[0];
const revision='11111111-1111-4111-8111-111111111111';
const item={id:revision,stable_id:artist.id} as Tables<'content_items'>;
function backend(code:string|null,aal='aal2') {
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const filters:Record<string,string>={};
  const query={select:()=>query,eq:(key:string,value:string)=>{filters[key]=value;return query;},maybeSingle:async()=>({data:{payload:artist},error:null})};
  const client={from:()=>query,auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal,nextLevel:'aal2'},error:null})}},rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {error:code?{code}:null};}} as unknown as SupabaseClient<Database>;
  return {client,calls,filters};
}
test('save conflict preserves submitted input and optimistic version',async()=>{
  const mock=backend('40001');
  const result=await applyContentAction(mock.client,item,'artist',artist,new URLSearchParams({action:'save',version:'4',name:'Changed',kind:artist.kind,focalPoint:artist.focalPoint,portraitLayout:artist.portraitLayout}));
  assert.ok('status' in result);
  assert.equal(result.status,409);assert.equal(result.payload.name,'Changed');
  assert.equal(mock.calls[0].args.p_expected_version,4);
});
test('restore binds revision to item and delegates optimistic save',async()=>{
  const mock=backend(null);
  const result=await applyContentAction(mock.client,item,'artist',artist,new URLSearchParams({action:'restore',version:'3',revision}));
  assert.ok('redirect' in result);
  assert.deepEqual(mock.filters,{id:revision,item_id:item.id});
  assert.equal(mock.calls[0].name,'save_editorial_content');
  assert.equal(mock.calls[0].args.p_expected_version,3);
});
test('review errors use stable codes and MFA state rather than provider prose',async()=>{
  const stale=backend('40001');
  const result=await applyContentAction(stale.client,item,'artist',artist,new URLSearchParams({action:'approve',revision}));
  assert.ok('status' in result);assert.equal(result.status,409);
  const low=backend(null,'aal1');
  const blocked=await applyContentAction(low.client,item,'artist',artist,new URLSearchParams({action:'approve',revision}));
  assert.ok('message' in blocked);assert.match(blocked.message,/authenticator/);assert.equal(low.calls.length,0);
});
test('RLS-filtered picker retains selected collaborators on a no-op submission',()=>{
  const selected=['visible','unassigned-collaborator'];
  const options=editorialPickerOptions(selected,[{id:'visible',label:'Visible artist'}]);
  assert.deepEqual(options.map(option=>option.id),selected);
  const form=new URLSearchParams();
  for(const id of selected)form.append('artistIds',options.find(option=>option.id===id)!.id);
  assert.deepEqual(applyEditorialForm('performance',catalog().performances[0],form).artistIds,selected);
  assert.equal(editorialPickerOptions(['hidden','hidden'],[]).length,1);
});
test('YouTube series choices preserve automatic, unclassified and explicit series overrides',()=>{
  const current={youtubeId:'AbCdEfGhIjK',approved:true,seriesId:null,thumbnailUrl:'https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg'};
  const makeForm=(seriesId:string)=>new URLSearchParams({seriesId});
  const inherited=applyEditorialForm('youtube-review',current,makeForm('__inherit__'));
  const unclassified=applyEditorialForm('youtube-review',{...current,seriesId:undefined},makeForm('__unclassified__'));
  const selected=applyEditorialForm('youtube-review',current,makeForm('covers'));
  assert.equal('seriesId' in inherited,false);
  assert.equal(unclassified.seriesId,null);
  assert.equal(selected.seriesId,'covers');
  for(const result of [inherited,unclassified,selected]) {
    assert.equal(result.youtubeId,current.youtubeId);
    assert.equal(result.approved,true);
    assert.equal(result.thumbnailUrl,current.thumbnailUrl);
  }
});
