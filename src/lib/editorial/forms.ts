import type { EditorialKind } from './content';
import {homepagePerformance,homepageTeaser} from './site-content';
import {applySiteSettingsForm} from './site-form';
import {applyArtworkChoice,type MediaChoices} from './media-choices';

export function editorialPickerOptions(selected:string[],options:{id:string;label:string}[]) {
  const known=new Set(options.map(option=>option.id));
  return [...options,...[...new Set(selected)].filter(id=>id&&!known.has(id)).map(id=>({id,label:`${id} (existing reference)`}))];
}

export type EditorialField = { key:string; label:string; type:'text'|'textarea'|'number'|'checkbox'|'lines'|'choice'; options?:string[]; required?:boolean };
export const editorialFields: Record<EditorialKind,EditorialField[]> = {
  artist:[
    {key:'name',label:'Artist name',type:'text',required:true},
    {key:'aliases',label:'Other names (one per line)',type:'lines'},
    {key:'kind',label:'Artist type',type:'choice',options:['solo','group']},
    {key:'bio',label:'Biography',type:'textarea'},
    {key:'portraitAlt',label:'Portrait description',type:'text'},
    {key:'focalPoint',label:'Portrait focal point',type:'text',required:true},
    {key:'portraitLayout',label:'Portrait layout',type:'choice',options:['portrait','landscape']},
  ],
  performance:[
    {key:'title',label:'Performance title',type:'text',required:true},
    {key:'originalTitle',label:'Original-script title',type:'text'},
    {key:'aliases',label:'Other titles (one per line)',type:'lines'},
    {key:'seriesId',label:'Series',type:'choice',options:['sessions','covers']},
    {key:'originalArtist',label:'Original artist',type:'text'},
    {key:'editorialNote',label:'Editorial note',type:'textarea'},
    {key:'thumbnailAlt',label:'Artwork description',type:'text',required:true},
    {key:'episode',label:'Confirmed episode number',type:'number'},
    {key:'featuredOrder',label:'Featured order',type:'number',required:true},
    {key:'approvedForSite',label:'Eligible for public site when published',type:'checkbox'},
  ],
  clip:[],
  series:[{key:'title',label:'Series title',type:'text',required:true},{key:'description',label:'Description',type:'textarea',required:true}],
  site:[],
  'youtube-review':[
    {key:'format',label:'Video format',type:'choice',options:['','full','short']},
    {key:'seriesId',label:'Series',type:'choice',options:['','sessions','covers']},
    {key:'fullYoutubeId',label:'Full performance (Shorts only)',type:'text'},
    {key:'excluded',label:'Exclude from the public catalog',type:'checkbox'},
  ],
};

export function applyEditorialForm(kind: EditorialKind, current:Record<string,unknown>, form:URLSearchParams, media?:MediaChoices):Record<string,unknown> {
  const payload={...current};
  for(const field of editorialFields[kind]) {
    const value=form.get(field.key)?.trim()??'';
    if(field.type==='checkbox') payload[field.key]=form.has(field.key);
    else if(field.type==='lines') payload[field.key]=value?value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean):[];
    else if(field.type==='number') {
      if(!value&&!field.required) delete payload[field.key];
      else payload[field.key]=value?Number(value):NaN;
    } else if(kind==='youtube-review'&&field.key==='seriesId') {
      if(value==='__inherit__') delete payload.seriesId;
      else if(value==='__unclassified__') payload.seriesId=null;
      else payload.seriesId=value;
    } else if(!value&&!field.required) delete payload[field.key];
    else payload[field.key]=value;
  }
  applyArtworkChoice(kind,payload,current,form,media);
  if(kind==='performance'||kind==='youtube-review') payload.artistIds=form.getAll('artistIds').filter(Boolean);
  if(kind==='site') {
    for(const key of ['spotlightPerformanceIds','featuredPerformanceIds','featuredCoverIds','featuredArtistIds']) if(form.has(key)) payload[key]=form.getAll(key).filter(Boolean);
    Object.assign(payload,applySiteSettingsForm(payload,form));
    const hero={...(payload.hero as Record<string,unknown>)};
    const selectedPerformance=form.get('hero.performanceId')?.trim()??'';
    if(form.has('hero.performanceId')&&selectedPerformance!==hero.performanceId) {
      const performance=homepagePerformance(selectedPerformance);
      if(!performance) throw new Error('Choose an existing eligible homepage performance.');
      hero.performanceId=performance.id;hero.poster=performance.thumbnail;
    }
    const selectedClip=form.get('hero.portraitClipId')?.trim()??'';
    if(form.has('hero.portraitClipId')&&selectedClip!==hero.portraitClipId) {
      if(!selectedClip) {
        delete hero.portraitClipId;delete hero.portraitPerformanceId;delete hero.portraitPoster;delete hero.portraitLoopSrc;
      } else {
        const clip=homepageTeaser(selectedClip);
        if(!clip) throw new Error('Choose an existing eligible portrait teaser.');
        hero.portraitClipId=clip.id;hero.portraitPerformanceId=clip.performanceId;hero.portraitPoster=clip.poster;hero.portraitLoopSrc=clip.src;
      }
    }
    payload.hero=hero;
  }
  return payload;
}
