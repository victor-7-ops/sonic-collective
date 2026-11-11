import test from 'node:test';
import assert from 'node:assert/strict';
import {migratedScratchDb} from '../scripts/lib/scratch-db';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,editor,alice,bob]=[1,2,3,4].map(uuid);

test('library images can be archived by an editor or their uploader, never while in use, and never reused afterwards',async t=>{
  const db=await migratedScratchDb([owner,editor,alice,bob]);
  t.after(()=>db.close());
  for(const [id,role] of [[owner,'owner'],[editor,'editor'],[alice,'contributor'],[bob,'contributor']]) await db.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);
  const image=async(ownerId:string,status:'ready'|'pending'='ready')=>{
    await db.exec('reset role');
    const row=await db.query<{id:string}>("insert into public.editorial_assets(owner_id,status,sha256,original_bytes,original_width,original_height,width,height,alt_text) values($1,'pending',$2,100,10,10,10,10,'Image') returning id",[ownerId,'a'.repeat(64)]);
    if(status==='ready') await db.query("update public.editorial_assets set status='ready',ready_at=now() where id=$1",[row.rows[0]!.id]);
    return row.rows[0]!.id;
  };
  const as=async(id:string,aal='aal1')=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,aal})]);
    await db.exec('set role authenticated');
  };
  const archive=(id:string)=>db.query('select public.archive_editorial_asset($1)',[id]);
  const status=async(id:string)=>{await db.exec('reset role');return (await db.query<{status:string}>('select status from public.editorial_assets where id=$1',[id])).rows[0]!.status;};

  // Uploader or editor may archive an unused image; another contributor may not.
  const mine=await image(alice),theirs=await image(bob),spare=await image(alice);
  await as(bob);await assert.rejects(archive(mine),/uploader/);
  assert.equal(await status(mine),'ready');
  await as(alice);await archive(mine);assert.equal(await status(mine),'archived');
  await as(alice);await assert.rejects(archive(theirs),/uploader/);
  await as(editor);await archive(theirs);assert.equal(await status(theirs),'archived');
  await as(owner);await archive(spare);assert.equal(await status(spare),'archived');

  // Unknown, pending and already-archived images are refused.
  const pending=await image(alice,'pending');
  await as(owner);
  await assert.rejects(archive(uuid(999)),/not found/);
  await assert.rejects(archive(pending),/Only a ready image/);
  await assert.rejects(archive(mine),/Only a ready image/);

  // An archived image can no longer be referenced by new content.
  const save=(stable:string,path:string,version=0)=>db.query('select public.save_editorial_content($1,$2,$3,$4)',['artist',stable,{id:stable,name:stable,aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[],gallery:[{image:path,alt:'Alt'}]},version]);
  await as(editor);await assert.rejects(save('uses-archived',`/media/cms/${mine}`),/not ready/);

  // In use by a draft: refused, and allowed again after the reference is removed.
  const used=await image(alice);
  await as(alice);await save('has-gallery',`/media/cms/${used}`);
  await as(alice);await assert.rejects(archive(used),/used by current content/);
  await as(editor);await assert.rejects(archive(used),/used by current content/);
  await as(alice);
  await db.query('select public.save_editorial_content($1,$2,$3,$4)',['artist','has-gallery',{id:'has-gallery',name:'has-gallery',aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[]},1]);
  await archive(used);assert.equal(await status(used),'archived');

  // In use by an approved revision, even after the draft moved on.
  const approved=await image(alice);
  await as(alice);await save('approved-gallery',`/media/cms/${approved}`);
  const item=(await db.query<{id:string;draft_revision_id:string}>("select id,draft_revision_id from public.content_items where stable_id='approved-gallery'")).rows[0]!;
  await db.query("select public.review_editorial_content($1,$2,'submit')",[item.id,item.draft_revision_id]);
  await as(editor);await db.query("select public.review_editorial_content($1,$2,'approve')",[item.id,item.draft_revision_id]);
  await as(alice);
  await db.query('select public.save_editorial_content($1,$2,$3,$4)',['artist','approved-gallery',{id:'approved-gallery',name:'approved-gallery',aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[]},1]);
  await as(editor);await assert.rejects(archive(approved),/used by current content/);

  // Part of a prepared release: protected, because that release may be made live again.
  const released=await image(alice);
  await db.exec('reset role');
  await db.query("insert into public.editorial_releases(request_id,created_by,expected_map,snapshot) values($1,$2,'[]',$3)",[uuid(500),owner,JSON.stringify([{payload:{portrait:`/media/cms/${released}`}}])]);
  await as(editor);await assert.rejects(archive(released),/part of a prepared release/);
  assert.equal(await status(released),'ready');

  // Same authenticator rule as the other protected actions.
  const guarded=await image(owner);
  await db.exec('reset role');await db.query("insert into auth.mfa_factors values($1,'verified')",[owner]);
  await as(owner,'aal1');await assert.rejects(archive(guarded),/Multi-factor/);
  await as(owner,'aal2');await archive(guarded);assert.equal(await status(guarded),'archived');

  // Signed-out users cannot call it at all.
  await db.exec('reset role');await db.exec('set role anon');
  await assert.rejects(archive(guarded),/permission denied/);
});

test('refusals are explained in plain language',async()=>{
  const {assetArchiveError}=await import('../src/lib/editorial/asset-archive');
  assert.match(assetArchiveError({code:'23503',message:'This image is used by current content'}),/still used by current content or is part of a prepared release/);
  assert.match(assetArchiveError({code:'42501',message:'Multi-factor authentication required'}),/authenticator/);
  assert.match(assetArchiveError({code:'42501',message:'Only an editor or the uploader can archive this image'}),/editor or the person who uploaded/);
  assert.match(assetArchiveError({code:'22023',message:'Image not found'}),/not found or is not ready/);
  assert.match(assetArchiveError(null),/could not be archived/);
  assert.match(assetArchiveError({code:'XX000',message:'boom'}),/could not be archived/);
});
