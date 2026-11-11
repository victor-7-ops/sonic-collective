import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {applyContentAction} from '../src/lib/editorial/actions';
import {loadReviewFeedback} from '../src/lib/editorial/comments';

test('requesting changes records the decision and its reason together, visible only to those who can see the item',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email varchar(255)); create table auth.mfa_factors(user_id uuid,status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
  `);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,migrations),'utf8'));
  const [editor,alice,bob]=[1,2,3].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  for(const id of [editor,alice,bob]) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@example.com`]);
  for(const [id,role] of [[editor,'editor'],[alice,'contributor'],[bob,'contributor']]) await db.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);
  const as=async(id:string)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,aal:'aal1'})]);
    await db.exec('set role authenticated');
  };
  const save=(name:string)=>db.query<{id:string}>('select public.save_editorial_content($1,$2,$3,$4) as id',['artist',name,{name},0]);
  const itemOf=async(stable:string)=>(await db.query<{id:string;review_state:string;draft_revision_id:string}>('select id,review_state,draft_revision_id from public.content_items where stable_id=$1',[stable])).rows[0]!;
  const request=(item:string,revision:string,body:string|null)=>db.query('select public.request_editorial_changes($1,$2,$3)',[item,revision,body]);

  await as(alice);await save('alice-art');
  await as(bob);await save('bob-art');
  const a=await(async()=>{await as(editor);return itemOf('alice-art');})();
  const b=await itemOf('bob-art');

  // A reason is mandatory, and a failed request leaves no half-applied decision.
  await assert.rejects(request(b.id,b.draft_revision_id,'   '),/reason of 1 to 2000/);
  await assert.rejects(request(b.id,b.draft_revision_id,null),/reason of 1 to 2000/);
  await assert.rejects(request(b.id,b.draft_revision_id,'x'.repeat(2001)),/reason of 1 to 2000|check/);
  await assert.rejects(request(a.id,b.draft_revision_id,'Wrong revision'),/Content changed/);
  assert.equal((await itemOf('bob-art')).review_state,'draft');
  assert.equal((await db.query('select * from public.editorial_review_comments')).rows.length,0);

  // Contributors cannot request changes, even on their own work.
  await as(alice);
  await assert.rejects(request(a.id,a.draft_revision_id,'Self review'),/Editor permission/);

  // An editor can; the state change and the reason arrive together.
  await as(editor);
  await request(a.id,a.draft_revision_id,'  Please add a biography.  ');
  assert.equal((await itemOf('alice-art')).review_state,'changes-requested');
  const stored=(await db.query<{body:string;author_id:string;action:string}>('select body,author_id,action from public.editorial_review_comments')).rows;
  assert.deepEqual(stored,[{body:'Please add a biography.',author_id:editor,action:'request-changes'}]);

  // Visibility follows item access: the owner and editors see it, another contributor does not.
  await as(alice);assert.equal((await db.query('select * from public.editorial_review_comments')).rows.length,1);
  await as(bob);assert.equal((await db.query('select * from public.editorial_review_comments')).rows.length,0);
  await assert.rejects(db.query("insert into public.editorial_review_comments(item_id,revision_id,author_id,action,body) values($1,$2,$3,'request-changes','forged')",[a.id,a.draft_revision_id,bob]),/permission denied/);

  // Feedback is immutable history.
  await db.exec('reset role');
  await assert.rejects(db.query("update public.editorial_review_comments set body='edited'"),/immutable/);
  await assert.rejects(db.query('delete from public.editorial_review_comments'),/immutable/);

  // The app loader reads the same rows through a client.
  const asClient=(rows:unknown[],versions:Record<string,number>)=>({from:(table:string)=>({select:()=>table==='editorial_review_comments'
    ?{eq:()=>({order:()=>({limit:async()=>({data:rows,error:null})})})}:{in:async()=>({data:Object.entries(versions).map(([id,version])=>({id,version})),error:null})}})}) as never;
  const feedback=await loadReviewFeedback(asClient([{id:'c1',created_at:'2026-11-11T03:00:00Z',body:'Fix it',revision_id:'r1'}],{r1:4}),a.id);
  assert.deepEqual(feedback,{error:false,items:[{id:'c1',createdAt:'2026-11-11T03:00:00Z',body:'Fix it',revision:4}]});
});

test('the review action requires a reason before calling the database',async()=>{
  const calls:string[]=[];
  const client={auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}},rpc:async(name:string)=>{calls.push(name);return {data:null,error:null};}} as never;
  const item={id:'11111111-1111-4111-8111-111111111111',stable_id:'a',archived_at:null,version:1} as never;
  const revision='22222222-2222-4222-8222-222222222222';
  const run=(form:Record<string,string>)=>applyContentAction(client,item,'artist',{id:'a',name:'A'},new URLSearchParams({action:'request-changes',revision,...form}));
  for(const comment of ['','   ','x'.repeat(2001)]) {
    const result=await run({comment});
    assert.ok('message' in result);assert.match(result.message,/Explain what needs to change/);
  }
  assert.deepEqual(calls,[]);
  assert.ok('redirect' in await run({comment:'Please fix the title.'}));
  assert.deepEqual(calls,['request_editorial_changes']);
  calls.length=0;
  assert.ok('redirect' in await run({action:'approve'}));
  assert.deepEqual(calls,['review_editorial_content']);
});
