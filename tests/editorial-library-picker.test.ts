import {test} from 'node:test';
import assert from 'node:assert/strict';
import {libraryPageSize,readyLibraryChoices,readyLibraryPaths} from '../src/lib/editorial/create';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rows=(from:number,count:number)=>Array.from({length:count},(_,i)=>({id:uuid(from+i),alt_text:`Photo ${from+i}`}));

function client(total:number,error:unknown=null) {
  const calls:{select:string;count?:string;range?:[number,number]}[]=[];
  const api={
    calls,
    from:()=>({select:(columns:string,options?:{count?:string})=>{
      const entry:{select:string;count?:string;range?:[number,number]}={select:columns,count:options?.count};calls.push(entry);
      const chain={eq:()=>chain,order:()=>chain,range:async(from:number,to:number)=>{
        entry.range=[from,to];
        const size=Math.max(0,Math.min(to,total-1)-from+1);
        return {data:error?null:rows(from,size),count:error?null:total,error};
      }};
      return chain;
    }}),
  };
  return api;
}

test('the library is shown one page at a time with a total',async()=>{
  const api=client(60);
  const first=await readyLibraryChoices(api as never);
  assert.equal(first.items.length,libraryPageSize);assert.equal(first.total,60);assert.equal(first.pages,3);assert.equal(first.page,1);
  assert.deepEqual(api.calls[0]!.range,[0,libraryPageSize-1]);assert.equal(api.calls[0]!.count,'exact');
  assert.equal(first.items[0]!.path,`/media/cms/${uuid(0)}`);assert.equal(first.items[0]!.alt,'Photo 0');
  const last=await readyLibraryChoices(client(60) as never,3);
  assert.equal(last.items.length,60-2*libraryPageSize);assert.equal(last.page,3);
});

test('bad page numbers fall back to the first page and failures show an empty library',async()=>{
  for(const bad of [0,-3,1.5,NaN,5000]) assert.equal((await readyLibraryChoices(client(10) as never,bad)).page,1,String(bad));
  const failed=await readyLibraryChoices(client(10,new Error('db')) as never);
  assert.deepEqual([failed.items.length,failed.total,failed.pages],[0,0,1]);
});

test('choice validation sees every library image, not just the page on screen',async()=>{
  const api=client(300);
  const paths=await readyLibraryPaths(api as never);
  assert.equal(paths.length,300);
  assert.deepEqual(api.calls[0]!.range,[0,999]);assert.equal(api.calls[0]!.select,'id');
  assert.equal(paths.at(-1),`/media/cms/${uuid(299)}`);
  assert.deepEqual(await readyLibraryPaths(client(5,new Error('db')) as never),[]);
});
