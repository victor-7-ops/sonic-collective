import {test} from 'node:test';
import assert from 'node:assert/strict';
import {itemSearchFilter,matchingRevisionIds,searchTerm} from '../src/lib/editorial/library-search';

test('typed text becomes a safe, bounded search term',()=>{
  assert.equal(searchTerm('  Rena  '),'Rena');
  assert.equal(searchTerm('Daniel   Miguel'),'Daniel Miguel');
  // Characters that would change the meaning of a filter are neutralised.
  assert.equal(searchTerm('a,b'),'a b');
  assert.equal(searchTerm('x(y)"z"'),'x y z');
  assert.equal(searchTerm('50%_off\\'),'50\\%\\_off\\\\');
  assert.equal(searchTerm('x'.repeat(200)).length,80);
  assert.equal(searchTerm('   '),'');
  assert.equal(searchTerm(',()'),'');
});

test('an item matches by stable ID or by the name or title of its current draft or approved revision',()=>{
  assert.equal(itemSearchFilter('ussee',[]),'stable_id.ilike.*ussee*');
  assert.equal(itemSearchFilter('ussee',null),'stable_id.ilike.*ussee*');
  assert.equal(itemSearchFilter('rena',['r1','r2']),'stable_id.ilike.*rena*,draft_revision_id.in.(r1,r2),approved_revision_id.in.(r1,r2)');
});

function client(rows:{id:string}[]|null,error:unknown=null) {
  const calls:{table:string;filter?:string;limit?:number}[]=[];
  const api={calls,from:(table:string)=>({select:()=>{
    const entry:{table:string;filter?:string;limit?:number}={table};calls.push(entry);
    return {or:(filter:string)=>{entry.filter=filter;return {limit:async(count:number)=>{entry.limit=count;return {data:rows,error};}};}};
  }})};
  return api;
}

test('revisions are looked up by name and title in one bounded query',async()=>{
  const api=client([{id:'a'},{id:'b'}]);
  assert.deepEqual(await matchingRevisionIds(api as never,'ussee'),['a','b']);
  assert.equal(api.calls[0]!.table,'content_revisions');
  assert.equal(api.calls[0]!.filter,'payload->>name.ilike.*ussee*,payload->>title.ilike.*ussee*');
  assert.equal(api.calls[0]!.limit,300);
  const none=client([]);
  assert.deepEqual(await matchingRevisionIds(none as never,''),[]);
  assert.equal(none.calls.length,0);
});

test('a failed lookup falls back to ID-only search instead of hiding everything',async()=>{
  assert.equal(await matchingRevisionIds(client(null,new Error('db')) as never,'x'),null);
  assert.equal(itemSearchFilter('x',await matchingRevisionIds(client(null,new Error('db')) as never,'x')),'stable_id.ilike.*x*');
  assert.deepEqual(await matchingRevisionIds(client([]) as never,'nothing'),[]);
});
