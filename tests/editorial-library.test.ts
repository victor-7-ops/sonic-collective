import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorialLibraryPageSize,editorialLibraryWindow} from '../src/lib/editorial/library';

test('library pages use exact database counts and 25-row inclusive ranges',()=>{
  assert.deepEqual(editorialLibraryWindow(1,73),{page:1,pageCount:3,from:0,to:24});
  assert.deepEqual(editorialLibraryWindow(2,73),{page:2,pageCount:3,from:25,to:49});
  assert.deepEqual(editorialLibraryWindow(3,73),{page:3,pageCount:3,from:50,to:74});
  assert.equal(editorialLibraryWindow(50,73).page,3);
  assert.equal(editorialLibraryWindow(1,0).pageCount,1);
  assert.equal(editorialLibraryPageSize,25);
});
