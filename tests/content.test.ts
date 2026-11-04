import test from 'node:test'; import assert from 'node:assert/strict';
import { catalog, manifest, exists } from './fixtures';
import { validateCatalog } from '../src/lib/validate-catalog';
const valid=()=>validateCatalog(catalog(),manifest(),exists);
test('accepts omitted optional metadata',()=>{const r=valid();assert.equal(r.ok,true,r.errors.join('; '));});
test('reports duplicate IDs before maps overwrite',()=>{const c=catalog();c.performances.push({...c.performances[0]});assert.match(validWith(c).errors.join(' '),/duplicate id/);});
test('reports missing artist and missing asset',()=>{const c=catalog();c.performances[0].artistIds=['ghost'];const r=validateCatalog(c,manifest(),p=>p!=='/media/a.webp');assert.match(r.errors.join(' '),/unknown artist ghost/);assert.match(r.errors.join(' '),/missing file \/media\/a.webp/);});
test('rejects malformed video IDs and unknown series',()=>{const c=catalog();c.performances[0].youtubeId='short';assert.equal(validWith(c).ok,false);const d=catalog();(d.performances[0] as any).seriesId='unknown';assert.match(validWith(d).errors.join(' '),/seriesId/);});
test('reports dangling clip and approved clip with draft parent',()=>{const c=catalog();c.clips[0].performanceId='missing';assert.match(validWith(c).errors.join(' '),/unknown performance/);const d=catalog();d.performances[0].approvedForSite=false;assert.match(validWith(d).errors.join(' '),/unapproved parent/);});
test('rejects draft homepage selection',()=>{const c=catalog();c.performances[0].approvedForSite=false;assert.match(validWith(c).errors.join(' '),/not approved/);});
function validWith(c:ReturnType<typeof catalog>){return validateCatalog(c,manifest(),exists);}
