import test from 'node:test'; import assert from 'node:assert/strict';
import { getRelated } from '../src/lib/related'; import { performances } from './fixtures';
test('related favors shared artists, then series, excludes self and deduplicates',()=>{const duplicate={...performances[1]};const got=getRelated(performances[0],[...performances,duplicate],3);assert.equal(got.some(x=>x.id==='p1'),false);assert.deepEqual(got.map(x=>x.id),['p2']);});
test('returns fewer than requested when the catalog is small',()=>{assert.equal(getRelated(performances[0],[performances[0]],3).length,0);});
