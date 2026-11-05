import test from 'node:test';
import assert from 'node:assert/strict';
import { engagementFor } from '../src/lib/engagement';

test('engagement uses catalog IDs and fixed labels without transmitting search text or contact addresses',()=>{
  assert.equal(engagementFor('/sessions/?q=private+text'),null);
  assert.deepEqual(engagementFor('mailto:private@example.com?body=private'),{name:'Collaboration clicked',data:{}});
  assert.deepEqual(engagementFor('/artists/rena/'),{name:'Artist opened',data:{artistId:'rena'}});
  assert.deepEqual(engagementFor(null,'rena-inochi-no-namae'),{name:'Watch clicked',data:{performanceId:'rena-inochi-no-namae'}});
  assert.equal(engagementFor('/artists/'),null);
});
