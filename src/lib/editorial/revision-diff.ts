export type RevisionChange={field:string;before:string;after:string};

const labels:Record<string,string>={
  about:'About copy',gallery:'Gallery',aliases:'Other names or titles',approvedForSite:'Public-site eligibility',artistIds:'Performing artists',bio:'Biography',channelUrl:'YouTube channel',clips:'Teaser clips',contactEmail:'Contact email',contactLabel:'Contact label',copyrightYear:'Copyright year',featuredArtistIds:'Featured artists',featuredCoverIds:'Featured covers',featuredOrder:'Featured order',featuredPerformanceIds:'Featured performances',footer:'Footer copy',focalPoint:'Portrait focal point',format:'Video format',hero:'Homepage hero and teaser',intro:'Introduction',kind:'Artist type',links:'Verified links',name:'Name',navigation:'Navigation labels',originalArtist:'Original artist',originalTitle:'Original title',performanceId:'Performance',performancesLabel:'Performances link',portrait:'Portrait',portraitAlt:'Portrait description',portraitLayout:'Portrait layout',portraitLoopSrc:'Teaser video',portraitPerformanceId:'Teaser performance',portraitPoster:'Teaser poster',seriesId:'Series',site:'Site configuration',socialUrls:'Social links',spotlightPerformanceIds:'Homepage spotlights',thumbnail:'Artwork',thumbnailAlt:'Artwork description',title:'Title',youtubeLinkText:'YouTube link text',youtubeLabel:'YouTube link',
};

function display(value:unknown):string {
  if(value===undefined) return 'Not set';
  if(value===null) return 'Unclassified';
  if(typeof value==='boolean') return value?'Yes':'No';
  if(Array.isArray(value)) return value.length?value.map(item=>typeof item==='string'?item
    :item&&typeof item==='object'&&'image' in item&&'alt' in item?`${String((item as {alt:unknown}).alt)} (${String((item as {image:unknown}).image)})`
    :JSON.stringify(item)).join(' · '):'None';
  if(typeof value==='object') return JSON.stringify(value);
  return String(value);
}

function flatten(value:unknown,path:string,result:Map<string,string>):void {
  if(value&&typeof value==='object'&&!Array.isArray(value)) {
    const entries=Object.entries(value as Record<string,unknown>).filter(([key])=>key!=='id').sort(([a],[b])=>a<b?-1:a>b?1:0);
    for(const [key,nested] of entries) flatten(nested,path?`${path}.${key}`:key,result);
    return;
  }
  result.set(path,display(value));
}

function fieldLabel(path:string):string {
  return path.split('.').map(part=>labels[part]??part.replace(/([a-z\d])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase())).join(' · ');
}

export function diffRevisionPayload(newer:unknown,older:unknown):RevisionChange[] {
  const next=new Map<string,string>(),previous=new Map<string,string>();
  flatten(newer,'',next);flatten(older,'',previous);
  return [...new Set([...next.keys(),...previous.keys()])].sort().filter(path=>next.get(path)!==previous.get(path)).map(path=>({field:fieldLabel(path),before:previous.get(path)??'Not set',after:next.get(path)??'Not set'}));
}
