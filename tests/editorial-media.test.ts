import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {editorialImageFormat,editorialMediaMaxBytes,persistEditorialImage,processEditorialImage} from '../src/lib/editorial/media';
import {handleEditorialMediaUpload} from '../src/pages/api/editorial/media/upload';

async function sample(format:'jpeg'|'png'|'webp') {
  return sharp({create:{width:8,height:6,channels:3,background:'#345678'}})[format]().toBuffer();
}

test('accepts complete JPEG, PNG, and WebP signatures and rejects unsupported or appended data',async()=>{
  const jpeg=await sample('jpeg');const png=await sample('png');const webp=await sample('webp');
  for(const [bytes,format] of [[jpeg,'jpeg'],[png,'png'],[webp,'webp']] as const)assert.equal(editorialImageFormat(bytes),format);
  assert.throws(()=>editorialImageFormat(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),/complete JPEG/);
  for(const bytes of [png,webp,jpeg])assert.throws(()=>editorialImageFormat(new Uint8Array([...bytes,60,104,116,109,108,62])),/complete JPEG/);
});

test('converts to metadata-stripped bounded WebP with checksum and editorial fields',async()=>{
  const source=await sharp({create:{width:40,height:20,channels:3,background:'#abcdef'}}).jpeg().withMetadata().toBuffer();
  const result=await processEditorialImage(source,'Artist portrait',0.3,0.7);
  const metadata=await sharp(result.bytes).metadata();
  assert.equal(metadata.format,'webp');
  assert.equal(metadata.exif,undefined);
  assert.equal(result.width,40);assert.equal(result.height,20);
  assert.equal(result.sha256.length,64);assert.equal(result.originalBytes,source.byteLength);
  assert.equal(result.altText,'Artist portrait');assert.equal(result.focalX,0.3);assert.equal(result.focalY,0.7);
});

test('rejects oversized, missing-alt, and invalid-focal-point inputs before decoding',async()=>{
  await assert.rejects(()=>processEditorialImage(new Uint8Array(editorialMediaMaxBytes+1),'Alt text'),/15 MiB/);
  const source=await sample('png');
  await assert.rejects(()=>processEditorialImage(source,'  '),/description/);
  await assert.rejects(()=>processEditorialImage(source,'Description',1.1,0.5),/focal point/);
});

function memberClient(userId:string|null) {
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:userId?{role:'contributor'}:null,error:null})};
  return {auth:{getUser:async()=>({data:{user:userId?{id:userId}:null},error:userId?null:{message:'no session'}})},from:()=>query} as never;
}

test('upload route returns 503 without a privileged client and never writes before authorization',async()=>{
  const headers={origin:'https://sonic.test'};
  const noKey=await handleEditorialMediaUpload(new Request('https://sonic.test/api/editorial/media/upload/',{method:'POST',headers}),memberClient('user-1'),()=>null);
  assert.equal(noKey.status,503);
  let adminLookups=0;
  const unauthorized=await handleEditorialMediaUpload(new Request('https://sonic.test/api/editorial/media/upload/',{method:'POST',headers}),memberClient(null),()=>{adminLookups++;return null;});
  assert.equal(unauthorized.status,401);assert.equal(adminLookups,0);
});

test('invalid upload bytes do not reach privileged asset or storage writes',async()=>{
  const form=new FormData();form.append('file',new Blob(['<svg/>'],{type:'image/svg+xml'}),'fake.png');form.set('altText','Invalid image');
  const request=new Request('https://sonic.test/api/editorial/media/upload/',{method:'POST',headers:{origin:'https://sonic.test'},body:form});
  let writes=0;
  const admin={from:()=>{writes++;throw new Error('unexpected database write');},storage:{from:()=>{writes++;throw new Error('unexpected storage write');}}} as never;
  const response=await handleEditorialMediaUpload(request,memberClient('user-1'),()=>admin);
  assert.equal(response.status,400);assert.equal(writes,0);
});

test('missing privileged persistence client cannot write an asset record',async()=>{
  const source=await sample('png');
  const image=await processEditorialImage(source,'Test image');
  await assert.rejects(()=>persistEditorialImage(null,'user-1',image),/server-only/);
});

test('trusted persistence writes pending metadata, private source and WebP before ready',async()=>{
  const image=await processEditorialImage(await sample('png'),'Test image');
  const calls:{table:string;op:string;value:unknown}[]=[];let status='pending';
  const admin={
    from:(table:string)=>({
      insert:(row:unknown)=>{calls.push({table,op:'insert',value:row});return {select:()=>({single:async()=>({data:{original_path:'originals/new-id/source',derivative_path:'derivatives/new-id.webp'},error:null})})};},
      update:(row:unknown)=>{calls.push({table,op:'update',value:row});return {eq:(_key:string,_value:string)=>({eq:(_key2:string,_value2:string)=>({select:()=>({maybeSingle:async()=>{if((row as {status:string}).status==='ready')status='ready';return {data:{id:'new-id'},error:null};}})})})};},
      select:()=>({eq:()=>({maybeSingle:async()=>({data:{status},error:null})})}),
    }),
    storage:{from:()=>({upload:async(path:string,bytes:Uint8Array,options:unknown)=>{calls.push({table:'storage',op:'upload',value:{path,bytes:bytes.byteLength,options}});return {error:null};},remove:async(paths:string[])=>{calls.push({table:'storage',op:'remove',value:paths});return {error:null};}})},
  } as never;
  const id=await persistEditorialImage(admin,'owner-id',image);
  assert.match(id,/^[a-f\d-]{36}$/i);
  assert.equal(calls[0].op,'insert');assert.equal((calls[0].value as {owner_id:string;status:string}).owner_id,'owner-id');
  assert.deepEqual(calls.slice(1).map(call=>call.op),['upload','upload','update']);
  assert.equal(status,'ready');
});

test('failed private writes clean only this UUID and leave a failed record',async()=>{
  const image=await processEditorialImage(await sample('png'),'Test image');
  let status='pending';let assetId='';let removed:string[]=[];
  const admin={
    from:()=>({
      insert:(row:{id:string})=>{assetId=row.id;return {select:()=>({single:async()=>({data:{original_path:`originals/${assetId}/source`,derivative_path:`derivatives/${assetId}.webp`},error:null})})};},
      update:(row:{status:string})=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>{if(row.status==='failed')status='failed';if(row.status==='ready')status='ready';return {data:{id:assetId},error:null};}})})})}),
      select:()=>({eq:()=>({maybeSingle:async()=>({data:{status},error:null})})}),
    }),
    storage:{from:()=>({upload:async(path:string)=>({error:path.endsWith('.webp')?{message:'failed'}:null}),remove:async(paths:string[])=>{removed=paths;return {error:null};}})},
  } as never;
  await assert.rejects(()=>persistEditorialImage(admin,'owner-id',image),/remains private/);
  assert.deepEqual(removed,[`originals/${assetId}/source`,`derivatives/${assetId}.webp`]);
  assert.equal(status,'failed');
});
