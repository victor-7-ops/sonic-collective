import test from 'node:test';
import assert from 'node:assert/strict';
import {migratedScratchDb} from '../scripts/lib/scratch-db';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,editor,alice,bob]=[1,2,3,4].map(uuid);

test('a revision may reference only images that exist, are ready, and that its author may use',async t=>{
  const db=await migratedScratchDb([owner,editor,alice,bob]);
  t.after(()=>db.close());
  for(const [id,role] of [[owner,'owner'],[editor,'editor'],[alice,'contributor'],[bob,'contributor']]) await db.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);

  // Images: one ready image per contributor, one still pending, one archived.
  const image=async(ownerId:string)=>{
    const row=await db.query<{id:string}>("insert into public.editorial_assets(owner_id,status,sha256,original_bytes,original_width,original_height,width,height,alt_text) values($1,'pending',$2,100,10,10,10,10,'Image') returning id",[ownerId,'a'.repeat(64)]);
    return row.rows[0]!.id;
  };
  const ready=async(id:string)=>{await db.query("update public.editorial_assets set status='ready',ready_at=now() where id=$1",[id]);return id;};
  const aliceImage=await ready(await image(alice));
  const bobImage=await ready(await image(bob));
  const pending=await image(alice);
  const archived=await ready(await image(alice));
  await db.query("update public.editorial_assets set status='archived' where id=$1",[archived]);

  const as=async(id:string)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,aal:'aal1'})]);
    await db.exec('set role authenticated');
  };
  let counter=0;
  const save=(stable:string,portrait:string|null,version=0)=>db.query('select public.save_editorial_content($1,$2,$3,$4)',
    ['artist',stable,{id:stable,name:stable,aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[],...(portrait?{portrait,portraitAlt:'Alt'}:{})},version]);
  const ref=(id:string)=>`/media/cms/${id}`;
  const fresh=()=>`artist-${++counter}`;

  // Contributors: their own ready image is fine; another member's, a missing, a pending and an archived one are not.
  await as(alice);
  await save(fresh(),null);
  await save(fresh(),ref(aliceImage));
  await assert.rejects(save(fresh(),ref(bobImage)),/belongs to another team member/);
  await assert.rejects(save(fresh(),ref(uuid(999))),/does not exist/);
  await assert.rejects(save(fresh(),ref(pending)),/not ready/);
  await assert.rejects(save(fresh(),ref(archived)),/not ready/);

  // The other contributor cannot take it either, in either direction.
  await as(bob);
  await assert.rejects(save(fresh(),ref(aliceImage)),/belongs to another team member/);
  await save(fresh(),ref(bobImage));

  // Editors and owners may use any ready image, but not a missing or unready one.
  await as(editor);
  const editorArtist=fresh();
  await save(editorArtist,ref(bobImage));
  await assert.rejects(save(fresh(),ref(pending)),/not ready/);
  await as(owner);
  await save(fresh(),ref(aliceImage));

  // The check also covers later saves and references in any field, not just the portrait.
  await as(alice);
  const own=fresh();await save(own,ref(aliceImage));
  await assert.rejects(db.query('select public.save_editorial_content($1,$2,$3,$4)',['artist',own,{id:own,name:own,aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[],bio:`see ${ref(bobImage)}`},1]),/belongs to another team member/);

  // Nothing was half-saved by the rejected attempts.
  await db.exec('reset role');
  const stored=(await db.query<{n:string}>("select count(*) n from public.content_revisions r join public.content_items i on i.id=r.item_id where i.stable_id=$1",[own])).rows[0]!.n;
  assert.equal(Number(stored),1);

  // Internal contexts without a signed-in user (seeding, restore) are unaffected.
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false)");
  await db.exec(`insert into public.content_items(kind,stable_id) values('artist','seeded');`);
  const item=(await db.query<{id:string}>("select id from public.content_items where stable_id='seeded'")).rows[0]!.id;
  await db.query("insert into public.content_revisions(item_id,version,payload) values($1,1,$2)",[item,{id:'seeded',portrait:ref(uuid(998))}]);
});
