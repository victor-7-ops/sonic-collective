import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Tables} from '../src/lib/editorial/database.types';
import {applyContentAction} from '../src/lib/editorial/actions';

const id='11111111-1111-4111-8111-111111111111';
function backend(code:string|null,aal='aal2') {
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const client={
    auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal},error:null})}},
    rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:3,error:code?{code}:null};},
  } as unknown as SupabaseClient<Database>;
  return {client,calls};
}
const activeItem={id,stable_id:'sample-artist',version:2,archived_at:null} as Tables<'content_items'>;

test('archive and unarchive require AAL2 and send the expected version',async()=>{
  const mock=backend(null);
  const result=await applyContentAction(mock.client,activeItem,'artist',{},new URLSearchParams({action:'archive',version:'2'}));
  assert.ok('redirect' in result);
  assert.equal(result.redirect,`/admin/content/${id}/?archived=1`);
  assert.deepEqual(mock.calls[0],{name:'archive_editorial_content',args:{p_item_id:id,p_expected_version:2,p_archived:true}});
  const archived={...activeItem,version:3,archived_at:'2026-11-06T00:00:00Z'} as Tables<'content_items'>;
  const restored=await applyContentAction(mock.client,archived,'artist',{},new URLSearchParams({action:'unarchive',version:'3'}));
  assert.ok('redirect' in restored);
  assert.equal(restored.redirect,`/admin/content/${id}/?unarchived=1`);
  assert.equal(mock.calls[1].args.p_archived,false);
  const low=backend(null,'aal1');
  const denied=await applyContentAction(low.client,activeItem,'artist',{},new URLSearchParams({action:'archive',version:'2'}));
  assert.ok('message' in denied);assert.match(denied.message,/authenticator/);assert.equal(low.calls.length,0);
});

test('archive actions preserve conflict handling and archived items reject edits',async()=>{
  const stale=backend('40001');
  const conflict=await applyContentAction(stale.client,activeItem,'artist',{},new URLSearchParams({action:'archive',version:'2'}));
  assert.ok('message' in conflict);assert.equal(conflict.status,409);assert.equal(stale.calls.length,1);
  const archived={...activeItem,archived_at:'2026-11-06T00:00:00Z'} as Tables<'content_items'>;
  const denied=await applyContentAction(stale.client,archived,'artist',{},new URLSearchParams({action:'save',version:'2',name:'Changed'}));
  assert.ok('message' in denied);assert.match(denied.message,/read-only/);
});
