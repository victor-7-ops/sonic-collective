import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPasswordRecovery } from '../src/lib/editorial/server';

test('recovery emails do not require a verifier cookie from the requesting browser',async(t)=>{
  const priorUrl=process.env.SUPABASE_URL;
  const priorKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL='https://recovery.example.test';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  t.after(()=>{
    if(priorUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=priorUrl;
    if(priorKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=priorKey;
  });
  let requested=false;
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input));
    assert.equal(url.pathname,'/auth/v1/recover');
    assert.equal(url.searchParams.get('redirect_to'),'http://127.0.0.1:4321/auth/landing/');
    const body=JSON.parse(String(init?.body));
    assert.equal(body.email,'owner@example.test');
    assert.equal(body.code_challenge??null,null);
    assert.equal(body.code_challenge_method??null,null);
    requested=true;
    return new Response('{}',{headers:{'Content-Type':'application/json'}});
  });
  const result=await sendPasswordRecovery('owner@example.test','http://127.0.0.1:4321/auth/landing/');
  assert.equal(result.error,null);
  assert.equal(requested,true);
});
