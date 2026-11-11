import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authDigest,checkAuthCoverage,exportAuthUsers,restoreAuthUsers,toAuthUser} from '../src/lib/editorial/auth-backup';
import {bundleFiles,decryptBackup,encryptBackup,unbundleFiles} from '../src/lib/editorial/backup-pack';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const raw=(n:number,extra:Record<string,unknown>={})=>({id:uuid(n),email:`user${n}@example.com`,created_at:'2026-11-01T00:00:00Z',email_confirmed_at:'2026-11-01T00:01:00Z',last_sign_in_at:null,banned_until:null,app_metadata:{providers:['email']},encrypted_password:'$2a$10$SECRETHASH',phone:'+100',user_metadata:{note:'private'},...extra});

test('accounts are exported without passwords, tokens or private metadata',()=>{
  const user=toAuthUser(raw(1))!;
  assert.deepEqual(Object.keys(user).sort(),['bannedUntil','confirmedAt','createdAt','email','id','lastSignInAt','providers']);
  assert.doesNotMatch(JSON.stringify(user),/SECRETHASH|\+100|private/);
  assert.equal(toAuthUser({id:'not-a-uuid'}),null);
  assert.equal(toAuthUser({email:'a@b.c'}),null);
});

test('every page of accounts is read, and a bad or missing page stops the backup',async()=>{
  const all=Array.from({length:5},(_,i)=>raw(i+1));
  const reader=async(page:number,perPage:number)=>({users:all.slice((page-1)*perPage,page*perPage)});
  const users=await exportAuthUsers(reader,2);
  assert.deepEqual(users.map(user=>user.id),all.map(item=>item.id as string));
  assert.deepEqual((await exportAuthUsers(async()=>({users:[]}),2)),[]);
  await assert.rejects(()=>exportAuthUsers(async()=>({users:[raw(1),{id:'broken'}]}),5),/no valid ID/);
  await assert.rejects(()=>exportAuthUsers(async()=>{throw new Error('api down');},2),/api down/);
  const exact=await exportAuthUsers(async(page,perPage)=>({users:page===1?all.slice(0,perPage):[]}),5);
  assert.equal(exact.length,5);
});

test('the digest ignores order, and coverage names accounts the CMS needs but the backup lacks',()=>{
  const users=[toAuthUser(raw(1))!,toAuthUser(raw(2))!];
  assert.equal(authDigest(users),authDigest([...users].reverse()));
  assert.notEqual(authDigest(users),authDigest([users[0]!,{...users[1]!,email:'other@example.com'}]));
  assert.deepEqual(checkAuthCoverage(users,[uuid(1),uuid(2),uuid(1)]),[]);
  assert.match(checkAuthCoverage(users,[uuid(1),uuid(9)]).join(' '),/1 account referenced by the CMS is missing/);
  assert.match(checkAuthCoverage(users,[uuid(8),uuid(9)]).join(' '),/2 accounts referenced by the CMS are missing/);
});

test('restore recreates accounts with original IDs, supports a dry run, and reports failures',async()=>{
  const users=[toAuthUser(raw(1))!,toAuthUser(raw(2,{email:null}))!,toAuthUser(raw(3,{email_confirmed_at:null}))!];
  const calls:Record<string,unknown>[]=[];
  const admin={auth:{admin:{createUser:async(attributes:Record<string,unknown>)=>{calls.push(attributes);return {error:attributes.id===uuid(3)?{message:'exists'}:null};}}}};
  assert.deepEqual(await restoreAuthUsers(admin,users,{dryRun:true}),{created:[uuid(1),uuid(3)],skipped:[uuid(2)],failed:[]});
  assert.equal(calls.length,0);
  const real=await restoreAuthUsers(admin,users);
  assert.deepEqual(real,{created:[uuid(1)],skipped:[uuid(2)],failed:[uuid(3)]});
  assert.deepEqual(calls[0],{id:uuid(1),email:'user1@example.com',email_confirm:true});
  assert.equal(calls[1]!.email_confirm,false);
});

const passphrase='correct horse battery staple 42';
test('an encrypted backup round-trips, and the wrong passphrase, damage or a short passphrase are refused',()=>{
  const plain=bundleFiles({'manifest.json':Buffer.from('{"a":1}').toString('base64'),'files/x/original':Buffer.from([0,1,2,255]).toString('base64')});
  const packed=encryptBackup(plain,passphrase);
  assert.notEqual(packed.toString('latin1').includes('manifest'),true);
  assert.equal(packed.subarray(0,4).toString(),'SCB1');
  assert.deepEqual(unbundleFiles(decryptBackup(packed,passphrase)),unbundleFiles(plain));
  assert.throws(()=>decryptBackup(packed,passphrase+'x'),/wrong passphrase or damaged/);
  const damaged=Buffer.from(packed);damaged[damaged.length-1]^=1;
  assert.throws(()=>decryptBackup(damaged,passphrase),/wrong passphrase or damaged/);
  const headerDamaged=Buffer.from(packed);headerDamaged[40]^=1;
  assert.throws(()=>decryptBackup(headerDamaged,passphrase),/wrong passphrase or damaged/);
  assert.throws(()=>decryptBackup(Buffer.from('not a backup at all, definitely not'),passphrase),/not an encrypted/);
  assert.throws(()=>encryptBackup(plain,'short'),/at least 20/);
  assert.notDeepEqual(encryptBackup(plain,passphrase),packed);
});

test('a bundle with unsafe paths or an unknown format is refused',()=>{
  for(const path of ['../escape','/etc/passwd','a/../../b','..\\win']) assert.throws(()=>unbundleFiles(Buffer.from(JSON.stringify({schemaVersion:1,files:{[path]:''}}))),/unsafe/,path);
  assert.throws(()=>unbundleFiles(Buffer.from(JSON.stringify({schemaVersion:2,files:{}}))),/Unsupported/);
  assert.throws(()=>unbundleFiles(Buffer.from('{}')),/Unsupported/);
});

test('every account column in the editorial tables is found when checking coverage',async()=>{
  const {referencedAccountIds}=await import('../src/lib/editorial/auth-backup');
  const data={
    team_members:[{user_id:uuid(1),role:'owner'}],
    content_items:[{id:uuid(50),owner_id:uuid(2)},{id:uuid(51),owner_id:null}],
    editorial_audit:[{actor_id:uuid(3),item_id:uuid(50)}],
    team_audit:[{actor_id:uuid(1),target_user_id:uuid(4),old_owner_id:uuid(5),new_owner_id:uuid(6)}],
    editorial_invitations:[{requested_by:uuid(1),auth_user_id:uuid(7)}],
    editorial_review_comments:[{author_id:uuid(8)}],editorial_live_releases:[{set_by:uuid(9)}],editorial_releases:[{created_by:uuid(10)}],editorial_assets:[{owner_id:uuid(11)}],
  };
  assert.deepEqual(referencedAccountIds(data as never).sort(),[1,2,3,4,5,6,7,8,9,10,11].map(uuid).sort());
});
