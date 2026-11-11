import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorialTeamError,listEditorialTeam} from '../src/lib/editorial/team';

const client=(level:string|null,rpc:()=>Promise<unknown>=async()=>({data:[],error:null}),assuranceError:unknown=null)=>{
  const calls:string[]=[];
  return {calls,client:{
    auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:level?{currentLevel:level}:null,error:assuranceError})}},
    rpc:async(name:string)=>{calls.push(name);return rpc();},
  } as never};
};

test('roster without MFA reports the authenticator requirement and skips the RPC',async()=>{
  const mock=client('aal1');
  const result=await listEditorialTeam(mock.client);
  assert.equal(result.members,null);
  assert.deepEqual(mock.calls,[]);
  assert.match(editorialTeamError(result.error).message,/authenticator/);
  assert.equal(editorialTeamError(result.error).status,403);
});

test('roster with MFA loads members from the RPC',async()=>{
  const rows=[{user_id:'u',email:'a@b.c',role:'owner',active:true,created_at:'2026-11-05T00:00:00Z'}];
  const mock=client('aal2',async()=>({data:rows,error:null}));
  const result=await listEditorialTeam(mock.client);
  assert.deepEqual(result.members,rows);assert.equal(result.error,null);
  assert.deepEqual(mock.calls,['list_editorial_members']);
});

test('an unreadable assurance level still lets the database decide',async()=>{
  const mock=client(null,async()=>({data:null,error:{code:'PT002'}}),new Error('x'));
  const result=await listEditorialTeam(mock.client);
  assert.deepEqual(mock.calls,['list_editorial_members']);
  assert.equal(editorialTeamError(result.error).status,403);
});
