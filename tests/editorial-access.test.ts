import test from 'node:test';
import assert from 'node:assert/strict';
import { isEditorialPath, isSameOriginMutation, privateHeaders, readEditorialForm } from '../src/lib/editorial/access';
import { parseEditorialPayload, seedSql } from '../src/lib/editorial/content';
import { catalog } from './fixtures';
import { applyEditorialForm } from '../src/lib/editorial/forms';
import { emailSession,emailLinkError } from '../src/lib/editorial/email-session';

test('editorial route matching uses path boundaries', () => {
  for (const path of ['/admin','/admin/login/','/auth/confirm/','/preview/a/','/api/editorial/save/']) assert.equal(isEditorialPath(path),true);
  for (const path of ['/','/administration/','/artists/','/previewed/']) assert.equal(isEditorialPath(path),false);
});
test('editorial forms reject cross-origin or missing origin', async () => {
  const req = (headers: Record<string,string>) => new Request('https://sonic.test/admin/login/',{method:'POST',headers,body:'a=b'});
  assert.equal(isSameOriginMutation(req({origin:'https://sonic.test'})),true);
  assert.equal(isSameOriginMutation(req({origin:'https://evil.test'})),false);
  assert.equal(isSameOriginMutation(req({})),false);
  assert.equal(isSameOriginMutation(req({origin:'https://sonic.test','sec-fetch-site':'cross-site'})),false);
  assert.equal(privateHeaders()['Cache-Control'],'private, no-store, max-age=0');
  assert.equal(privateHeaders()['X-Robots-Tag'],'noindex, nofollow');
  assert.equal(privateHeaders()['Referrer-Policy'],'same-origin');
  assert.equal(isSameOriginMutation(req({origin:'null','sec-fetch-site':'same-origin'})),false);
  const valid = new Request('https://sonic.test',{method:'POST',body:new URLSearchParams({email:'a+b@example.test'})});
  assert.equal((await readEditorialForm(valid)).get('email'),'a+b@example.test');
  await assert.rejects(readEditorialForm(new Request('https://sonic.test',{method:'POST',body:'x'})),/Unsupported/);
  await assert.rejects(readEditorialForm(new Request('https://sonic.test',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'x'.repeat(16385)})),/too large/);
});
test('editorial parser retains catalog validation and immutable identity', () => {
  const artist = catalog().artists[0];
  assert.deepEqual(parseEditorialPayload('artist',artist.id,artist),artist);
  assert.throws(()=>parseEditorialPayload('artist','different',artist),/cannot change/);
  assert.throws(()=>parseEditorialPayload('youtube-review','bad',{youtubeId:'bad'}));
  assert.throws(()=>parseEditorialPayload('site','other',catalog().site),/settings ID/);
  const sql=seedSql([{kind:'artist',stableId:artist.id,payload:{...artist,bio:"It's a real biography; $$ isn't SQL."}}]);
  assert.match(sql,/It''s a real biography/);
  assert.match(sql,/on conflict\(kind,stable_id\) do nothing/);
});

test('editorial forms preserve untouched metadata and ordered relationship selections',()=>{
  const performance=catalog().performances[0];
  const form=new URLSearchParams({title:'Changed',seriesId:performance.seriesId,thumbnailAlt:performance.thumbnailAlt,featuredOrder:'1',approvedForSite:'on'});
  form.append('artistIds','second');form.append('artistIds','first');
  const updated=applyEditorialForm('performance',performance,form);
  assert.equal(updated.youtubeId,performance.youtubeId);
  assert.equal(updated.thumbnail,performance.thumbnail);
  assert.deepEqual(updated.artistIds,['second','first']);
  assert.equal(updated.approvedForSite,true);
  assert.deepEqual(updated.aliases,[]);
  const original={...catalog().site};
  const site=applyEditorialForm('site',original,new URLSearchParams('spotlightPerformanceIds=b&spotlightPerformanceIds=a'));
  assert.deepEqual(site.spotlightPerformanceIds,['b','a']);
  assert.deepEqual(site.hero,original.hero);
});

test('email links require both bounded tokens and never use an arbitrary redirect',()=>{
  assert.deepEqual(emailSession('#access_token=abc&refresh_token=def&redirect=https://evil.test'),{access_token:'abc',refresh_token:'def'});
  assert.equal(emailSession('#access_token=abc'),null);
  assert.equal(emailSession('#error=expired'),null);
  assert.equal(emailSession(`access_token=${'x'.repeat(8193)}&refresh_token=def`),null);
  assert.match(emailLinkError('#error=access_denied&error_code=otp_expired')!,/expired or was already used/);
  assert.match(emailLinkError('#error=access_denied&error_description=untrusted')!,/could not be verified/);
  assert.equal(emailLinkError('#access_token=abc&refresh_token=def'),null);
});
