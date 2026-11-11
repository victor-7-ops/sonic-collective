import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyGalleryForm} from '../src/lib/editorial/gallery-form';
import {applyEditorialForm} from '../src/lib/editorial/forms';
import {mediaChoicesFrom} from '../src/lib/editorial/media-choices';
import {cmsAssetBase} from '../src/lib/editorial/cms-assets';

const lib=(n:number)=>cmsAssetBase(`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const choices=mediaChoicesFrom(['/media/artists/rena','/media/artists/blair','/media/performances/usseewa'],[lib(1),lib(2),lib(3)]);
const current={id:'a',name:'A',gallery:[{image:lib(1),alt:'One',caption:'First'},{image:lib(2),alt:'Two'},{image:'/media/artists/rena',alt:'Rena'}]};
const form=(fields:Record<string,string>,rows:{image:string;alt:string;caption?:string;position?:number;remove?:boolean}[]=[])=>{
  const params=new URLSearchParams({'gallery.present':'1',...fields});
  rows.forEach((row,index)=>{
    params.set(`gallery.${index}.image`,row.image);params.set(`gallery.${index}.alt`,row.alt);params.set(`gallery.${index}.caption`,row.caption??'');
    params.set(`gallery.${index}.position`,String(row.position??index+1));if(row.remove) params.set(`gallery.${index}.remove`,'1');
  });
  return params;
};
const unchanged=current.gallery.map(item=>({image:item.image,alt:item.alt,caption:'caption' in item?item.caption:''}));
const run=(params:URLSearchParams,kind:'artist'|'performance'='artist')=>{const payload:Record<string,unknown>={...current};applyGalleryForm(kind,payload,current,params,choices);return payload.gallery as {image:string;alt:string;caption?:string}[]|undefined;};

test('an unchanged gallery form keeps the gallery exactly as it was',()=>{
  assert.deepEqual(run(form({},unchanged)),current.gallery);
});

test('descriptions and captions can be edited, and an emptied caption is dropped',()=>{
  const rows=unchanged.map(row=>({...row}));rows[0]!.alt='  Renamed  ';rows[0]!.caption='';rows[1]!.caption='  New caption ';
  const result=run(form({},rows))!;
  assert.deepEqual(result[0],{image:lib(1),alt:'Renamed'});
  assert.deepEqual(result[1],{image:lib(2),alt:'Two',caption:'New caption'});
});

test('photos reorder by position, ties keep their current order, and removed ones disappear',()=>{
  const rows=unchanged.map((row,index)=>({...row,position:3-index}));
  assert.deepEqual(run(form({},rows))!.map(item=>item.alt),['Rena','Two','One']);
  assert.deepEqual(run(form({},unchanged.map(row=>({...row,position:5}))))!.map(item=>item.alt),['One','Two','Rena']);
  assert.deepEqual(run(form({},unchanged.map((row,index)=>({...row,remove:index===1}))))!.map(item=>item.alt),['One','Rena']);
  assert.equal(run(form({},unchanged.map(row=>({...row,remove:true})))),undefined);
});

test('a photo is added from the offered images with a description, at the end',()=>{
  const result=run(form({'gallery.add.image':lib(3),'gallery.add.alt':' Fresh shot ','gallery.add.caption':'Today'},unchanged))!;
  assert.deepEqual(result.at(-1),{image:lib(3),alt:'Fresh shot',caption:'Today'});
  assert.equal(result.length,4);
  assert.throws(()=>run(form({'gallery.add.image':lib(3)},unchanged)),/Describe the new photo/);
  assert.throws(()=>run(form({'gallery.add.image':lib(1),'gallery.add.alt':'x'},unchanged)),/already in the gallery/);
  for(const bad of [lib(99),'https://example.com/a.jpg','/media/cms/not-a-uuid','/media/artists/missing']) assert.throws(()=>run(form({'gallery.add.image':bad,'gallery.add.alt':'x'},unchanged)),/available images/,bad);
});

test('every kept photo needs a description, and rows that are not in the gallery are refused',()=>{
  const rows=unchanged.map(row=>({...row}));rows[2]!.alt='  ';
  assert.throws(()=>run(form({},rows)),/Describe photo 3/);
  assert.throws(()=>run(form({},[...unchanged,{image:lib(3),alt:'Smuggled'}])),/changed while you were editing/);
});

test('a gallery cannot exceed 24 photos',()=>{
  const full=Array.from({length:24},(_,i)=>({image:lib(100+i),alt:`P${i}`}));
  const crowded={...current,gallery:full};
  const big=mediaChoicesFrom([],[...full.map(item=>item.image),lib(200)]);
  const payload:Record<string,unknown>={...crowded};
  assert.throws(()=>applyGalleryForm('artist',payload,crowded,form({'gallery.add.image':lib(200),'gallery.add.alt':'25th'},full.map(item=>({image:item.image,alt:item.alt}))),big),/at most 24/);
  applyGalleryForm('artist',payload,crowded,form({},full.map(item=>({image:item.image,alt:item.alt}))),big);
  assert.equal((payload.gallery as unknown[]).length,24);
});

test('forms without the gallery section, and other content kinds, are left alone',()=>{
  const payload:Record<string,unknown>={...current};
  applyGalleryForm('artist',payload,current,new URLSearchParams({name:'A'}),choices);
  assert.deepEqual(payload.gallery,current.gallery);
  applyGalleryForm('series',payload,current,form({'gallery.add.image':lib(3),'gallery.add.alt':'x'}),choices);
  assert.deepEqual(payload.gallery,current.gallery);
  const perf=run(form({'gallery.add.image':'/media/performances/usseewa','gallery.add.alt':'Poster'},unchanged),'performance')!;
  assert.equal(perf.at(-1)!.image,'/media/performances/usseewa');
});

test('the editor form applies the gallery together with the other fields',()=>{
  const base={id:'a',name:'A',kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',gallery:current.gallery};
  const next=applyEditorialForm('artist',base,form({name:'A',kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait','gallery.add.image':lib(3),'gallery.add.alt':'New'},unchanged),choices);
  assert.equal((next.gallery as unknown[]).length,4);
  const cleared=applyEditorialForm('artist',base,form({name:'A',kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait'},unchanged.map(row=>({...row,remove:true}))),choices);
  assert.equal('gallery' in cleared,false);
});

test('several library photos can be added at once with their own descriptions',()=>{
  const rows=(entries:{image:string;alt:string;caption?:string;take?:boolean}[])=>{
    const params=form({},unchanged);
    entries.forEach((entry,index)=>{
      params.set(`gallery.add.${index}.image`,entry.image);params.set(`gallery.add.${index}.alt`,entry.alt);params.set(`gallery.add.${index}.caption`,entry.caption??'');
      if(entry.take!==false) params.set(`gallery.add.${index}.take`,'1');
    });
    return params;
  };
  const result=run(rows([{image:lib(3),alt:'Third',caption:'Cap'},{image:'/media/artists/blair',alt:'Blair'}]))!;
  assert.deepEqual(result.slice(-2),[{image:lib(3),alt:'Third',caption:'Cap'},{image:'/media/artists/blair',alt:'Blair'}]);
  // Unticked rows are ignored, even with no description.
  assert.equal(run(rows([{image:lib(3),alt:'',take:false}]))!.length,3);
  assert.throws(()=>run(rows([{image:lib(3),alt:' '}])),/Describe every new photo/);
  assert.throws(()=>run(rows([{image:lib(99),alt:'x'}])),/available images/);
  assert.throws(()=>run(rows([{image:lib(1),alt:'x'}])),/already in the gallery/);
  assert.throws(()=>run(rows([{image:lib(3),alt:'a'},{image:lib(3),alt:'b'}])),/already in the gallery/);
});
