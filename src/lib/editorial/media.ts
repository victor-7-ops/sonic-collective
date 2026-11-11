import {createHash,randomUUID} from 'node:crypto';
import sharp, {type Metadata} from 'sharp';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
import {editorialImageFormat} from './image-sniff';
export {editorialImageFormat};

export const editorialMediaMaxBytes=15*1024*1024;
const maxMultipartBytes=editorialMediaMaxBytes+32*1024;
const maxPixels=25_000_000;
const maxDimension=12_000;

export async function processEditorialImage(bytes:Uint8Array,altText:string,focalX=0.5,focalY=0.5) {
  if(bytes.byteLength===0||bytes.byteLength>editorialMediaMaxBytes)throw new Error('Image must be 15 MiB or smaller.');
  const alt=altText.trim();
  if(!alt||alt.length>500)throw new Error('Add an image description of 1–500 characters.');
  if(!Number.isFinite(focalX)||!Number.isFinite(focalY)||focalX<0||focalX>1||focalY<0||focalY>1)throw new Error('Choose a focal point between 0 and 1.');
  const format=editorialImageFormat(bytes);
  const input=sharp(bytes,{limitInputPixels:maxPixels,sequentialRead:true,failOn:'error'});
  let metadata:Metadata;
  try {metadata=await input.metadata();}
  catch {throw new Error('Image data could not be decoded.');}
  if(metadata.format!==format||!metadata.width||!metadata.height||metadata.width>maxDimension||metadata.height>maxDimension
    ||metadata.width*metadata.height>maxPixels||metadata.pages!==undefined&&metadata.pages>1)throw new Error('Image dimensions or format are not supported.');
  const convert=()=>sharp(bytes,{limitInputPixels:maxPixels,sequentialRead:true,failOn:'error'})
    .rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer({resolveWithObject:true});
  let converted:Awaited<ReturnType<typeof convert>>;
  try {
    converted=await convert();
  } catch {throw new Error('Image data could not be converted safely.');}
  return {
    originalFormat:format,
    sourceBytes:bytes,
    sha256:createHash('sha256').update(bytes).digest('hex'),
    originalBytes:bytes.byteLength,originalWidth:metadata.width,originalHeight:metadata.height,
    bytes:converted.data,width:converted.info.width,height:converted.info.height,
    altText:alt,focalX,focalY,
  };
}

export async function persistEditorialImage(admin:SupabaseClient<Database>|null,ownerId:string,image:Awaited<ReturnType<typeof processEditorialImage>>) {
  if(!admin)throw new Error('Private media uploads need the server-only Supabase credential.');
  const id=randomUUID();
  const inserted=await admin.from('editorial_assets').insert({
    id,owner_id:ownerId,status:'pending',sha256:image.sha256,original_bytes:image.originalBytes,
    original_width:image.originalWidth,original_height:image.originalHeight,width:image.width,height:image.height,
    alt_text:image.altText,focal_x:image.focalX,focal_y:image.focalY,
  }).select('original_path,derivative_path').single();
  if(inserted.error||!inserted.data?.original_path||!inserted.data.derivative_path)throw new Error('The private asset record could not be created.');
  const paths:[string,string]=[inserted.data.original_path,inserted.data.derivative_path];
  const bucket=admin.storage.from('editorial-media');
  try {
    const original=await bucket.upload(paths[0],image.sourceBytes,{contentType:`image/${image.originalFormat}`,upsert:false});
    if(original.error)throw new Error('original upload failed');
    const derivative=await bucket.upload(paths[1],image.bytes,{contentType:'image/webp',upsert:false});
    if(derivative.error)throw new Error('derivative upload failed');
    const ready=await admin.from('editorial_assets').update({status:'ready',ready_at:new Date().toISOString()}).eq('id',id).eq('status','pending').select('id').maybeSingle();
    if(!ready.error&&ready.data)return id;
    const status=await admin.from('editorial_assets').select('status').eq('id',id).maybeSingle();
    if(status.data?.status==='ready')return id;
    if(status.error)throw new Error('The private asset finalization state could not be verified.');
    throw new Error('The private asset could not be finalized.');
  } catch(error) {
    console.error('Image finalization failed',error);
    const status=await admin.from('editorial_assets').select('status').eq('id',id).maybeSingle();
    if(status.data?.status==='ready')return id;
    if(!status.error&&status.data?.status==='pending') {
      const removed=await bucket.remove(paths);
      if(removed.error)console.error('Stored files of a failed image could not be removed',removed.error);
      const marked=await admin.from('editorial_assets').update({status:'failed'}).eq('id',id).eq('status','pending').select('id').maybeSingle();
      if(marked.error)console.error('A failed image could not be marked failed; it stays pending',marked.error);
    }
    throw new Error('Image upload could not be finalized. The asset remains private and unavailable.');
  }
}

export async function readBoundedEditorialUpload(request:Request) {
  const contentType=request.headers.get('content-type')??'';
  if(!/^multipart\/form-data;\s*boundary=/i.test(contentType))throw new Error('Upload must use a multipart form.');
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maxMultipartBytes)throw new Error('Upload must be 15 MiB or smaller.');
  const reader=request.body?.getReader();
  if(!reader)throw new Error('Missing upload form.');
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true) {
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxMultipartBytes){await reader.cancel();throw new Error('Upload must be 15 MiB or smaller.');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  let form:FormData;
  try {form=await new Request(request.url,{method:'POST',headers:{'content-type':contentType},body}).formData();}
  catch {throw new Error('Upload form could not be decoded.');}
  const files=form.getAll('file');
  if(files.length!==1||!(files[0] instanceof File))throw new Error('Choose one image file.');
  const alt=form.get('altText');
  const focalX=Number(form.get('focalX')??0.5),focalY=Number(form.get('focalY')??0.5);
  if(typeof alt!=='string')throw new Error('Add an image description.');
  const fileBytes=new Uint8Array(await files[0].arrayBuffer());
  return processEditorialImage(fileBytes,alt,focalX,focalY);
}
