import type {EditorialKind} from './content';
import type {MediaChoices} from './media-choices';
import {maxGalleryImages} from '../schemas';

type Item={image:string;alt:string;caption?:string};

function readItems(value:unknown):Item[] {
  if(!Array.isArray(value)) return [];
  return value.flatMap(raw=>{
    const item=raw as {image?:unknown;alt?:unknown;caption?:unknown};
    return typeof item.image==='string'&&typeof item.alt==='string'?[{image:item.image,alt:item.alt,...(typeof item.caption==='string'&&item.caption?{caption:item.caption}:{})}]:[];
  });
}

/**
 * Applies the gallery section of the editor form to an artist or performance: edit descriptions and captions,
 * reorder by position, remove, and add one image at a time. Images already in the gallery stay valid;
 * newly added ones must be among the offered images. A form without the gallery section changes nothing.
 */
export function applyGalleryForm(kind:EditorialKind,payload:Record<string,unknown>,current:Record<string,unknown>,form:URLSearchParams,media?:MediaChoices):void {
  if(kind!=='artist'&&kind!=='performance') return;
  if(!form.has('gallery.present')) return;
  const existing=new Map(readItems(current.gallery).map(item=>[item.image,item]));
  const offered=new Set([...(media?.artistMedia??[]),...(media?.performanceMedia??[])]);

  const rows:{item:Item;position:number;order:number}[]=[];
  for(let index=0;form.has(`gallery.${index}.image`);index++) {
    const image=(form.get(`gallery.${index}.image`)??'').trim();
    if(!existing.has(image)) throw new Error('The gallery changed while you were editing. Reload the page and try again.');
    if(form.has(`gallery.${index}.remove`)) continue;
    const alt=(form.get(`gallery.${index}.alt`)??'').trim();
    if(!alt) throw new Error(`Describe photo ${index+1} before saving (alt text is required).`);
    const caption=(form.get(`gallery.${index}.caption`)??'').trim();
    const position=Number(form.get(`gallery.${index}.position`));
    rows.push({item:{image,alt,...(caption?{caption}:{})},position:Number.isFinite(position)?position:index+1,order:index});
  }
  rows.sort((a,b)=>a.position-b.position||a.order-b.order);
  const items=rows.map(row=>row.item);

  const addImage=(form.get('gallery.add.image')??'').trim();
  if(addImage) {
    if(items.some(item=>item.image===addImage)) throw new Error('That image is already in the gallery.');
    if(!offered.has(addImage)) throw new Error('Choose one of the available images.');
    const alt=(form.get('gallery.add.alt')??'').trim();
    if(!alt) throw new Error('Describe the new photo before adding it (alt text is required).');
    const caption=(form.get('gallery.add.caption')??'').trim();
    items.push({image:addImage,alt,...(caption?{caption}:{})});
  }
  if(items.length>maxGalleryImages) throw new Error(`A gallery can hold at most ${maxGalleryImages} photos. Remove one before adding another.`);
  if(items.length) payload.gallery=items; else delete payload.gallery;
}
