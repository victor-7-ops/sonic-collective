import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, youtubeUrl, performanceUrl, artistUrl } from '../src/lib/urls.js';

test('canonical links require a known non-local origin and normalize paths',()=>{
  assert.equal(canonicalUrl('/sessions/one','https://music.example/'),'https://music.example/sessions/one/');
  assert.equal(canonicalUrl('/sessions/one','http://localhost:4321'),undefined);
  assert.equal(canonicalUrl('/sessions/one','not a url'),undefined);
});
test('generated route helpers preserve ids and YouTube links reject malformed video IDs',()=>{
  assert.equal(performanceUrl('a b'),'/sessions/a%20b/');assert.equal(artistUrl('rena'),'/artists/rena/');
  assert.equal(youtubeUrl('AbCdEfGhIjK'),'https://www.youtube.com/watch?v=AbCdEfGhIjK');assert.throws(()=>youtubeUrl('short'),/Invalid YouTube/);
});
