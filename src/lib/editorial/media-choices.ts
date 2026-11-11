import type {EditorialKind} from './content';

/** Images an editor may pick: packaged site images plus ready media-library images the member can see. */
export type MediaChoices={artistMedia:readonly string[];performanceMedia:readonly string[]};
export type MediaOption={path:string;label:string};

export function mediaChoicesFrom(packaged:readonly string[],library:readonly string[]):MediaChoices {
  return {
    artistMedia:[...packaged.filter(path=>path.startsWith('/media/artists/')),...library],
    performanceMedia:[...packaged.filter(path=>path.startsWith('/media/performances/')),...library],
  };
}

/**
 * Applies the portrait (artist) or artwork (performance) selection. A changed value must be one of the offered
 * images; an unchanged value is always kept, so records that point at older images stay editable.
 */
export function applyArtworkChoice(kind:EditorialKind,payload:Record<string,unknown>,current:Record<string,unknown>,form:URLSearchParams,choices?:MediaChoices):void {
  const key=kind==='artist'?'portrait':kind==='performance'?'thumbnail':null;
  if(!key||!form.has(key)) return;
  const value=(form.get(key)??'').trim();
  const previous=typeof current[key]==='string'?current[key] as string:'';
  if(value===previous) return;
  if(value==='') {
    if(kind==='performance') throw new Error('Performance artwork is required. Choose an image.');
    delete payload.portrait;delete payload.portraitAlt;
    return;
  }
  const allowed=kind==='artist'?choices?.artistMedia:choices?.performanceMedia;
  if(!allowed?.includes(value)) throw new Error('Choose one of the available images.');
  if(kind==='artist'&&!(typeof payload.portraitAlt==='string'&&payload.portraitAlt.trim())) throw new Error('Describe the selected portrait before saving it.');
  payload[key]=value;
}
