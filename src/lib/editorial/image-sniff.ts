function pngIsComplete(bytes:Uint8Array) {
  if(bytes.length<20)return false;
  let offset=8;
  while(offset+12<=bytes.length) {
    const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);
    if(length>bytes.length-offset-12)return false;
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    offset+=length+12;
    if(type==='IEND')return length===0&&offset===bytes.length;
  }
  return false;
}

function jpegIsComplete(bytes:Uint8Array) {
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return false;
  let offset=2;
  while(offset<bytes.length) {
    if(bytes[offset++]!==0xff)return false;
    while(bytes[offset]===0xff)offset++;
    const marker=bytes[offset++];
    if(marker===undefined||marker===0||marker===0xd8)return false;
    if(marker===0xd9)return offset===bytes.length;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(offset+2>bytes.length)return false;
    const segmentLength=(bytes[offset]<<8)|bytes[offset+1];
    if(segmentLength<2||offset+segmentLength>bytes.length)return false;
    offset+=segmentLength;
    if(marker===0xda) {
      while(offset<bytes.length) {
        if(bytes[offset++]!==0xff)continue;
        const markerStart=offset-1;
        while(bytes[offset]===0xff)offset++;
        const scanMarker=bytes[offset];
        if(scanMarker===0||scanMarker===undefined||(scanMarker>=0xd0&&scanMarker<=0xd7)){offset++;continue;}
        offset=markerStart;
        break;
      }
    }
  }
  return false;
}

/** Format of a complete JPEG, PNG or WebP file; anything truncated, padded or unknown throws. */
export function editorialImageFormat(bytes:Uint8Array):'jpeg'|'png'|'webp' {
  if(bytes.length>=12&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP'
    &&new DataView(bytes.buffer,bytes.byteOffset+4,4).getUint32(0,true)+8===bytes.length)return 'webp';
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)&&pngIsComplete(bytes))return 'png';
  if(jpegIsComplete(bytes))return 'jpeg';
  throw new Error('Upload a complete JPEG, PNG, or WebP image.');
}
