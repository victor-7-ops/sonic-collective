import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyEntries,historyPage,loadRevisionHistory} from '../src/lib/editorial/history';

const row=(version:number,payload:Record<string,unknown>)=>({id:`id-${version}`,version,created_at:`2026-11-0${version}T00:00:00Z`,payload});

test('each revision shows readable changes against the previous revision',()=>{
  const {entries,hasMore}=historyEntries([row(3,{id:'a',name:'New',bio:'Hi'}),row(2,{id:'a',name:'Old'}),row(1,{id:'a',name:'Old'})]);
  assert.equal(hasMore,false);
  assert.deepEqual(entries.map(entry=>entry.version),[3,2,1]);
  assert.deepEqual(entries[0]!.changes.map(change=>[change.field,change.before,change.after]),[['Biography','Not set','Hi'],['Name','Old','New']]);
  assert.deepEqual(entries[1]!.changes,[]);
  assert.equal(entries[2]!.first,true);
});

test('the extra baseline row is not listed and signals another page',()=>{
  const rows=[row(4,{id:'a',name:'D'}),row(3,{id:'a',name:'C'}),row(2,{id:'a',name:'B'})];
  const {entries,hasMore}=historyEntries(rows,2);
  assert.equal(hasMore,true);
  assert.deepEqual(entries.map(entry=>entry.version),[4,3]);
  assert.equal(entries[1]!.changes[0]!.before,'B');
});

test('page parameter is bounded to positive integers',()=>{
  for(const [input,expected] of [[null,1],['0',1],['-2',1],['1.5',1],['abc',1],['2',2],['1001',1]] as const) assert.equal(historyPage(input),expected,String(input));
});

test('history loads one page plus a baseline row and reports query failures',async()=>{
  const seen:number[]=[];
  const client=(data:unknown[]|null,error:unknown=null)=>({from:()=>({select:()=>({eq:()=>({order:()=>({range:async(from:number,to:number)=>{seen.push(from,to);return {data,error};}})})})})}) as never;
  const ok=await loadRevisionHistory(client([row(1,{id:'a'})]),'item',3);
  assert.equal(ok.error,false);
  assert.deepEqual(seen,[40,60]);
  assert.equal((await loadRevisionHistory(client(null,new Error('x')),'item',1)).error,true);
});
